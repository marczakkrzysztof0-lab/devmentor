// Wspólny harness testów z bazą (spec #23 Q7). To nie jest plik testowy (*.test.mjs).
//
// Każdy plik testowy dostaje własny, jednorazowy schemat `dm_migtest_<losowe hex>` z komentarzem-markerem
// w bazie spod DATABASE_URL, migruje go przez `migrate({ schema })` z scripts/db-migrate.mjs, zapytania
// wykonuje z `search_path` ustawionym na ten schemat i na końcu go usuwa. Schematy `public` i obce nie są
// ruszane. Pliki uruchamiane równolegle przez `node --test` nie przeszkadzają sobie: każdy ma swój schemat,
// a sprzątanie pozostałości usuwa tylko schematy, których właściciel już nie żyje (advisory lock).
//
// Brak bazy: lokalnie testy są pomijane (skip) z komunikatem, przy CI=true — padają.
//
// Użycie:
//   import { describeDb } from "./harness.mjs";
//   describeDb("strony mentorów", (db) => {
//     test("…", async () => {
//       const { rows } = await db.query("select 1 as x");
//     });
//   });
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import {
  CONNECTION_TIMEOUT_MS,
  ENV_FILE,
  isDatabaseUnreachable,
  migrate,
  UNREACHABLE_MESSAGE,
} from "../../scripts/db-migrate.mjs";

export const TEST_SCHEMA_PREFIX = "dm_migtest_";
export const TEST_SCHEMA_MARKER = "devmentor-migration-test";
// Przestrzeń kluczy advisory locków harnessu (pierwszy argument pg_advisory_lock(int, int)).
export const TEST_SCHEMA_LOCK_NAMESPACE = 23_0001;

const isCi = process.env.CI === "true";

/**
 * Adres bazy dla testów: zmienna DATABASE_URL, a gdy jej brak — wartość z .env.local (jeśli plik istnieje).
 * @returns {string | undefined}
 */
export function resolveDatabaseUrl() {
  if (!process.env.DATABASE_URL && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  return process.env.DATABASE_URL || undefined;
}

export const DATABASE_URL = resolveDatabaseUrl();

/**
 * Sprawdza, czy baza odpowiada.
 * @param {string | undefined} databaseUrl
 * @returns {Promise<{ reachable: true } | { reachable: false, reason: string, error?: unknown }>}
 */
export async function probeDatabase(databaseUrl) {
  if (!databaseUrl) return { reachable: false, reason: `Brak DATABASE_URL. ${UNREACHABLE_MESSAGE}` };
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
  // Błąd połączenia zgłaszany też zdarzeniem — bez nasłuchu proces by padł.
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("select 1");
    return { reachable: true };
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { reachable: false, reason: UNREACHABLE_MESSAGE, error };
    // Inny błąd (np. złe hasło) to nie „brak bazy” — ma być widoczny, nie pomijany.
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

// Sprawdzane raz na plik testowy (każdy plik to osobny proces node --test).
export const databaseStatus = await probeDatabase(DATABASE_URL);

/**
 * Opcje dla `describe`/`test`: lokalnie bez bazy → `{ skip: komunikat }`; w CI i z bazą → `{}`
 * (w CI brak bazy zgłasza hook `before` w `describeDb`, więc testy padają zamiast znikać).
 * @returns {{ skip?: string }}
 */
export function dbTestOptions() {
  if (databaseStatus.reachable || isCi) return {};
  return { skip: databaseStatus.reason };
}

/** Rzuca, gdy baza nie odpowiada (w CI zamienia brak bazy w porażkę testu). */
export function assertDatabaseReachable() {
  if (!databaseStatus.reachable) {
    throw new Error(`${databaseStatus.reason}${isCi ? " (CI=true: testy z bazą nie mogą być pominięte)" : ""}`, {
      cause: databaseStatus.error,
    });
  }
}

/** @returns {string} nowa nazwa jednorazowego schematu, np. `dm_migtest_3f9a…` */
export function newTestSchemaName() {
  return `${TEST_SCHEMA_PREFIX}${randomBytes(8).toString("hex")}`;
}

// Cudzysłów dla identyfikatora (nazwy schematów są i tak walidowane / generowane przez nas).
export function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

/**
 * Usuwa pozostałości po przerwanych przebiegach testów: TYLKO schematy z prefiksem `dm_migtest_`
 * ORAZ komentarzem-markerem, których nikt nie trzyma (advisory lock właściciela zwolniony, bo jego
 * proces już nie żyje). Inne schematy (`public`, `test_x`, `dm_migtest_*` bez markera) nie są ruszane.
 * @param {pg.ClientBase | pg.Pool} client połączenie z bazą (dowolny search_path)
 * @returns {Promise<string[]>} nazwy usuniętych schematów
 */
export async function cleanupStaleTestSchemas(client) {
  const { rows } = await client.query(
    `select n.nspname as name
       from pg_namespace n
      where left(n.nspname, length($1)) = $1
        and obj_description(n.oid, 'pg_namespace') = $2
      order by n.nspname`,
    [TEST_SCHEMA_PREFIX, TEST_SCHEMA_MARKER],
  );
  const dropped = [];
  for (const { name } of rows) {
    // Lock na czas sprawdzenia i usunięcia: działający właściciel trzyma go, więc go pomijamy.
    const { rows: lock } = await client.query(
      "select pg_try_advisory_lock($1, hashtext($2)) as locked",
      [TEST_SCHEMA_LOCK_NAMESPACE, name],
    );
    if (!lock[0].locked) continue;
    try {
      await client.query(`drop schema if exists ${quoteIdent(name)} cascade`);
      dropped.push(name);
    } finally {
      await client.query("select pg_advisory_unlock($1, hashtext($2))", [TEST_SCHEMA_LOCK_NAMESPACE, name]);
    }
  }
  return dropped;
}

/**
 * Tworzy jednorazowy schemat testowy z markerem i (domyślnie) migruje go do najnowszej wersji.
 * Zwraca uchwyt; po teście wywołaj `dispose()`.
 * @param {object} [options]
 * @param {string} [options.databaseUrl]
 * @param {boolean} [options.migrate] czy wykonać wszystkie migracje w górę (domyślnie true)
 * @param {boolean} [options.cleanupStale] czy najpierw posprzątać pozostałości (domyślnie true)
 */
export async function createTestSchema({ databaseUrl = DATABASE_URL, migrate: runUp = true, cleanupStale = true } = {}) {
  const schema = newTestSchemaName();
  // Osobne połączenie trzyma advisory lock przez cały czas życia schematu (ochrona przed cudzym sprzątaniem).
  const lockClient = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
  lockClient.on("error", () => {});
  await lockClient.connect();
  /** @type {pg.Pool | undefined} */
  let pool;
  try {
    await lockClient.query("select pg_advisory_lock($1, hashtext($2))", [TEST_SCHEMA_LOCK_NAMESPACE, schema]);
    if (cleanupStale) await cleanupStaleTestSchemas(lockClient);
    await lockClient.query(`create schema ${quoteIdent(schema)}`);
    await lockClient.query(`comment on schema ${quoteIdent(schema)} is '${TEST_SCHEMA_MARKER}'`);

    pool = new pg.Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      // Każde połączenie z puli widzi tylko schemat testowy (plus pg_catalog).
      options: `-c search_path=${schema}`,
      max: 5,
    });
    pool.on("error", () => {});

    const handle = {
      schema,
      databaseUrl,
      pool,
      /** Zapytanie w schemacie testowym (parametryzowane jak w `pg`). */
      query: (text, params) => pool.query(text, params),
      /** Migracje w tym schemacie, np. `migrate("down", 1)`. Zwraca wykonane migracje. */
      migrate: (direction = "up", count) =>
        migrate({ databaseUrl, direction, count, schema, log: () => {} }),
      /** Usuwa schemat i zamyka połączenia. Bezpieczne do wielokrotnego wywołania. */
      dispose: async () => {
        if (handle.disposed) return;
        handle.disposed = true;
        await pool.end().catch(() => {});
        try {
          await lockClient.query(`drop schema if exists ${quoteIdent(schema)} cascade`);
        } finally {
          await lockClient.end().catch(() => {});
        }
      },
      disposed: false,
    };
    if (runUp) await handle.migrate("up");
    return handle;
  } catch (error) {
    await pool?.end().catch(() => {});
    await lockClient.query(`drop schema if exists ${quoteIdent(schema)} cascade`).catch(() => {});
    await lockClient.end().catch(() => {});
    throw error;
  }
}

/**
 * `describe` z jednorazowym, zmigrowanym schematem na cały blok. Callback dostaje obiekt `db`, którego
 * pola (`schema`, `pool`, `query`, `migrate`, `databaseUrl`) są gotowe w testach (po hooku `before`).
 * Lokalnie bez bazy blok jest pomijany z komunikatem; przy CI=true jego testy padają.
 * @param {string} name
 * @param {(db: any) => void} fn
 * @param {{ migrate?: boolean }} [options] `migrate: false` — pusty schemat (np. test migracji)
 */
export function describeDb(name, fn, { migrate: runUp = true } = {}) {
  /** @type {any} */
  const db = {
    query: (text, params) => db.handle.query(text, params),
    migrate: (direction, count) => db.handle.migrate(direction, count),
  };
  const { skip } = dbTestOptions();
  if (skip) {
    // Pominięty `describe` nie trafia do licznika „skipped”, więc rejestrujemy jeden pominięty test
    // z komunikatem — w podsumowaniu `npm test` widać wtedy „skipped N”.
    return describe(name, () => {
      test("wymaga bazy danych", { skip }, () => {});
    });
  }
  return describe(name, () => {
    before(async () => {
      assertDatabaseReachable();
      db.handle = await createTestSchema({ migrate: runUp });
      db.schema = db.handle.schema;
      db.pool = db.handle.pool;
      db.databaseUrl = db.handle.databaseUrl;
    });
    after(async () => {
      await db.handle?.dispose();
    });
    fn(db);
  });
}

/**
 * Wykonuje `fn` w transakcji, którą zawsze wycofuje — przydatne, by sprawdzić błąd ograniczenia
 * bez zostawiania danych w schemacie.
 * @template T
 * @param {pg.Pool} pool
 * @param {(client: pg.PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function inRolledBackTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}
