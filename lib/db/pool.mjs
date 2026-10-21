// Pula połączeń z PostgreSQL dla kodu aplikacji (spec #14, Architecture: „lib/db pool”).
//
// - Moduły domenowe (`lib/**/*.mjs`) NIE sięgają po pulę same: dostają `db` (pg.Pool albo PoolClient)
//   jako parametr, więc testy `node --test` podają pulę jednorazowego schematu z tests/db/harness.mjs.
// - Kod aplikacji (przez `lib/db/index.ts`, `server-only`) bierze pulę z `getPool()`: tworzona leniwie
//   przy pierwszym zapytaniu, nigdy przy imporcie — `next build` nie potrzebuje bazy.
// - Singleton trzymany w `globalThis`, żeby HMR w `next dev` nie zostawiał osieroconych pul.
import pg from "pg";

/** Limit czasu nawiązania połączenia (jak w scripts/db-migrate.mjs); bez niego `pg` czeka w nieskończoność. */
export const CONNECTION_TIMEOUT_MS = 5000;

export const MISSING_DATABASE_URL_MESSAGE =
  "Brak DATABASE_URL. Uzupełnij .env.local (wzór w .env.example) albo ustaw zmienną środowiskową.";

const POOL_KEY = Symbol.for("devmentor.db.pool");

/**
 * Coś, na czym można wykonać zapytanie: pula albo klient (np. z `withTransaction`).
 * @typedef {import("pg").Pool | import("pg").PoolClient} Queryable
 */

/**
 * Tworzy nową pulę dla podanego adresu (bez singletonu; `getPool()` używa jej wewnętrznie).
 * Samo utworzenie puli nie łączy się z bazą.
 * @param {string} databaseUrl
 * @returns {import("pg").Pool}
 */
export function createPool(databaseUrl) {
  if (typeof databaseUrl !== "string" || databaseUrl.trim() === "") {
    throw new Error(MISSING_DATABASE_URL_MESSAGE);
  }
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  // Błąd bezczynnego połączenia (np. restart bazy) bez nasłuchu zabiłby proces serwera.
  pool.on("error", (error) => {
    console.error("[db] błąd bezczynnego połączenia z bazą:", error.message);
  });
  return pool;
}

/**
 * Wspólna pula aplikacji (singleton w `globalThis`), tworzona przy pierwszym wywołaniu z
 * `process.env.DATABASE_URL`. Rzuca, gdy zmiennej brak. Wywołuj w czasie żądania, nie na poziomie modułu.
 * @returns {import("pg").Pool}
 */
export function getPool() {
  /** @type {Record<symbol, import("pg").Pool | undefined>} */
  const store = /** @type {any} */ (globalThis);
  let pool = store[POOL_KEY];
  if (!pool) {
    pool = createPool(process.env.DATABASE_URL ?? "");
    store[POOL_KEY] = pool;
  }
  return pool;
}

/**
 * Zamyka wspólną pulę (jeśli istnieje) i zapomina ją — kolejne `getPool()` utworzy nową.
 * Dla skryptów i testów; serwer Next.js jej nie wywołuje.
 * @returns {Promise<void>}
 */
export async function closePool() {
  /** @type {Record<symbol, import("pg").Pool | undefined>} */
  const store = /** @type {any} */ (globalThis);
  const pool = store[POOL_KEY];
  store[POOL_KEY] = undefined;
  if (pool) await pool.end();
}

/**
 * Wykonuje `fn` w transakcji (BEGIN → COMMIT, przy wyjątku ROLLBACK i ponowne rzucenie błędu).
 * - `db` to pula: bierze z niej osobnego klienta i zawsze go zwalnia (połączenie zepsute przy
 *   nieudanym ROLLBACK jest niszczone, nie wraca do puli).
 * - `db` to klient (PoolClient / Client): używa go bez zwalniania; nie może być już w transakcji.
 * Wszystkie zapytania transakcji wykonuj na kliencie przekazanym do `fn`, nie na puli.
 * @template T
 * @param {Queryable} db
 * @param {(client: import("pg").PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(db, fn) {
  const ownsClient = db instanceof pg.Pool;
  const client = ownsClient ? await db.connect() : /** @type {import("pg").PoolClient} */ (db);
  /** @type {Error | undefined} */
  let brokenConnection;
  try {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        brokenConnection = /** @type {Error} */ (rollbackError);
      }
      throw error;
    }
  } finally {
    if (ownsClient) client.release(brokenConnection);
  }
}
