// Migracje bazy DevMentora: `npm run db:migrate` (wszystkie oczekujące w górę)
// i `npm run db:rollback` (jedna w dół, tylko lokalnie / w testach).
// Jedyne wejście do node-pg-migrate: używają go skrypty npm, `npm run setup` i testy.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runner as pgMigrateRunner } from "node-pg-migrate";

// Ścieżki liczone od katalogu repozytorium, a nie od `process.cwd()`.
export const MIGRATIONS_DIR = fileURLToPath(new URL("../db/migrations", import.meta.url));
export const ENV_FILE = fileURLToPath(new URL("../.env.local", import.meta.url));

// Tabela historii migracji node-pg-migrate (domyślna nazwa narzędzia).
export const MIGRATIONS_TABLE = "pgmigrations";
// Bez limitu `pg` czeka na połączenie w nieskończoność (np. zły host).
export const CONNECTION_TIMEOUT_MS = 5000;

export const UNREACHABLE_MESSAGE =
  "Baza nie odpowiada pod DATABASE_URL — uruchom `docker compose up -d`";
export const MISSING_URL_MESSAGE =
  "Brak DATABASE_URL. Uzupełnij .env.local (wzór w .env.example) albo ustaw zmienną środowiskową.";

// Znany błąd z czytelnym komunikatem dla użytkownika (bez stack trace w CLI).
export class MigrateError extends Error {}

// Baza nieosiągalna: nie działa kontener, zły host/port albo baza jeszcze startuje.
export class DatabaseUnreachableError extends MigrateError {
  constructor(cause) {
    super(UNREACHABLE_MESSAGE, { cause });
  }
}

const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "57P03", // PostgreSQL: the database system is starting up
]);
const UNREACHABLE_MESSAGES = /connection terminated|timeout expired|connection timeout|connect ETIMEDOUT/i;

// Czy błąd (albo jego `cause` / `errors` z AggregateError) oznacza nieosiągalną bazę.
// Używany też przez testy z bazą (skip lokalnie) i przez krok migracji w setupie (ponowienia).
export function isDatabaseUnreachable(error, seen = new Set()) {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  if (error instanceof DatabaseUnreachableError) return true;
  if (typeof error.code === "string" && UNREACHABLE_CODES.has(error.code)) return true;
  if (typeof error.message === "string" && UNREACHABLE_MESSAGES.test(error.message)) return true;
  if (Array.isArray(error.errors) && error.errors.some((inner) => isDatabaseUnreachable(inner, seen))) {
    return true;
  }
  return isDatabaseUnreachable(error.cause, seen);
}

// Nazwa schematu trafia do `SET search_path TO "<schema>"`, więc dopuszczamy tylko proste identyfikatory.
const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

// Waliduje argumenty i buduje opcje dla runnera node-pg-migrate (funkcja czysta).
export function buildRunnerOptions({ databaseUrl, direction = "up", count, schema, logger } = {}) {
  if (typeof databaseUrl !== "string" || databaseUrl.trim() === "") {
    throw new MigrateError(MISSING_URL_MESSAGE);
  }
  if (direction !== "up" && direction !== "down") {
    throw new MigrateError(`Nieznany kierunek migracji „${direction}”. Dozwolone: up, down.`);
  }
  // Domyślnie: w górę wszystkie oczekujące, w dół jedna.
  const resolvedCount = count ?? (direction === "down" ? 1 : Infinity);
  if (!(resolvedCount === Infinity || (Number.isInteger(resolvedCount) && resolvedCount > 0))) {
    throw new MigrateError(
      `Liczba migracji musi być dodatnią liczbą całkowitą albo Infinity (podano: ${String(count)}).`,
    );
  }
  if (schema !== undefined && (typeof schema !== "string" || !SCHEMA_NAME.test(schema))) {
    throw new MigrateError(
      `Niepoprawna nazwa schematu „${String(schema)}”. Dozwolone: małe litery, cyfry i _, na początku litera lub _.`,
    );
  }

  return {
    databaseUrl: { connectionString: databaseUrl, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS },
    dir: MIGRATIONS_DIR,
    direction,
    count: resolvedCount,
    migrationsTable: MIGRATIONS_TABLE,
    // Ze `schema` narzędzie ustawia `search_path` na ten schemat i trzyma w nim `pgmigrations`.
    // Schematu nie tworzymy: testy zakładają go same (z komentarzem-markerem, spec #23 Q7).
    ...(schema === undefined ? {} : { schema, migrationsSchema: schema, createSchema: false }),
    checkOrder: true,
    // Każda migracja we własnej transakcji: nieudana nie zostaje w połowie, wcześniejsze zostają.
    singleTransaction: false,
    // Drugi równoległy proces czeka na advisory lock zamiast od razu padać.
    advisoryLockMode: "wait",
    logger,
  };
}

// Logger dla narzędzia: postęp (info) pomijamy — podsumowanie wypisuje wrapper;
// ostrzeżenia i błędy przekazujemy, poza zrzutem błędu połączenia (zamieniamy go na UNREACHABLE_MESSAGE).
export function createToolLogger(log) {
  const forward = (message) => {
    if (String(message).startsWith("could not connect to postgres")) return;
    log(String(message));
  };
  return { debug: () => {}, info: () => {}, warn: forward, error: forward };
}

/**
 * Uruchamia migracje z `db/migrations`.
 * @param {object} options
 * @param {string} options.databaseUrl adres bazy (DATABASE_URL)
 * @param {"up"|"down"} [options.direction] domyślnie "up"
 * @param {number} [options.count] dodatnia liczba całkowita albo Infinity; domyślnie up: wszystkie, down: 1
 * @param {string} [options.schema] schemat dla `search_path` i tabeli `pgmigrations` (testy: `dm_migtest_*`)
 * @param {Function} [options.runner] runner node-pg-migrate (wstrzykiwany w testach)
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<Array<{ name: string, path: string, timestamp: number }>>} wykonane migracje
 */
export async function migrate({
  databaseUrl,
  direction = "up",
  count,
  schema,
  runner = pgMigrateRunner,
  log = console.log,
} = {}) {
  const options = buildRunnerOptions({
    databaseUrl,
    direction,
    count,
    schema,
    logger: createToolLogger(log),
  });
  try {
    return await runner(options);
  } catch (error) {
    if (isDatabaseUnreachable(error)) throw new DatabaseUnreachableError(error);
    throw error;
  }
}

export const HELP_TEXT = `Migracje bazy DevMentora (node-pg-migrate, pliki db/migrations/*.sql).

Użycie:
  npm run db:migrate     wykonuje wszystkie oczekujące migracje (w górę)
  npm run db:rollback    cofa jedną, ostatnią migrację — TYLKO lokalnie / w testach,
                         nigdy na bazie z prawdziwymi danymi (tam: nowa migracja naprawcza)

Adres bazy: zmienna DATABASE_URL. Skrypt wczytuje .env.local, jeśli istnieje;
zmienna już ustawiona w środowisku ma pierwszeństwo przed plikiem.`;

// Argumenty CLI → { help: true } albo { direction }. Rzuca MigrateError przy nieznanych.
export function parseCliArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  if (argv.length !== 1 || (argv[0] !== "up" && argv[0] !== "down")) {
    throw new MigrateError(
      `Nieznane argumenty: ${argv.join(" ") || "(brak)"}. Użyj \`npm run db:migrate\` albo \`npm run db:rollback\` (--help).`,
    );
  }
  return { direction: argv[0] };
}

// Podsumowanie dla użytkownika po udanym uruchomieniu.
export function summarize(direction, migrations) {
  if (migrations.length === 0) {
    return direction === "up" ? "✔ Brak migracji do wykonania." : "✔ Brak migracji do cofnięcia.";
  }
  const verb = direction === "up" ? "Wykonano" : "Cofnięto";
  return `✔ ${verb} migracje: ${migrations.map((m) => m.name).join(", ")}`;
}

// Zwraca kod wyjścia: 0 przy sukcesie, 1 przy błędzie.
export async function runCli({ argv, env, loadEnv, migrateFn = migrate, log = console.log }) {
  try {
    const args = parseCliArgs(argv);
    if (args.help) {
      log(HELP_TEXT);
      return 0;
    }
    loadEnv();
    const migrations = await migrateFn({
      databaseUrl: env.DATABASE_URL,
      direction: args.direction,
      log,
    });
    log(summarize(args.direction, migrations));
    return 0;
  } catch (error) {
    if (error instanceof MigrateError) {
      log(`✖ ${error.message}`);
      return 1;
    }
    log(`✖ Migracja nie powiodła się: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    env: process.env,
    // Wartości już obecne w process.env nie są nadpisywane przez plik.
    loadEnv: () => {
      if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
    },
    log: (line) => console.log(line),
  });
}
