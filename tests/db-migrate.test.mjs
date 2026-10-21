import { test } from "node:test";
import assert from "node:assert/strict";
import { basename, dirname } from "node:path";
import {
  buildRunnerOptions,
  CONNECTION_TIMEOUT_MS,
  createToolLogger,
  DatabaseUnreachableError,
  HELP_TEXT,
  isDatabaseUnreachable,
  migrate,
  MigrateError,
  MIGRATIONS_DIR,
  MIGRATIONS_TABLE,
  MISSING_URL_MESSAGE,
  parseCliArgs,
  runCli,
  summarize,
  UNREACHABLE_MESSAGE,
} from "../scripts/db-migrate.mjs";

const DB_URL = "postgresql://user:pass@localhost:5432/db";
const silent = () => {};

// Fałszywy runner: zapisuje opcje i zwraca podany wynik albo rzuca podany błąd.
function fakeRunner({ result = [], error } = {}) {
  const calls = [];
  const runner = async (options) => {
    calls.push(options);
    if (error) throw error;
    return result;
  };
  return { runner, calls };
}

function errorWithCode(code, message = code) {
  return Object.assign(new Error(message), { code });
}

test("katalog migracji to db/migrations w repozytorium, niezależnie od cwd", () => {
  assert.equal(basename(MIGRATIONS_DIR), "migrations");
  assert.equal(basename(dirname(MIGRATIONS_DIR)), "db");
});

test("migrate up: runner dostaje katalog, tabelę historii, wszystkie migracje i adres z timeoutem", async () => {
  const { runner, calls } = fakeRunner({ result: [{ name: "0001_x" }] });
  const result = await migrate({ databaseUrl: DB_URL, runner, log: silent });

  assert.deepEqual(result, [{ name: "0001_x" }]);
  assert.equal(calls.length, 1);
  const options = calls[0];
  assert.equal(options.dir, MIGRATIONS_DIR);
  assert.equal(options.direction, "up");
  assert.equal(options.count, Infinity);
  assert.equal(options.migrationsTable, MIGRATIONS_TABLE);
  assert.equal(options.migrationsTable, "pgmigrations");
  assert.deepEqual(options.databaseUrl, {
    connectionString: DB_URL,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  assert.equal(options.checkOrder, true);
  assert.equal(options.singleTransaction, false);
  assert.equal(options.advisoryLockMode, "wait");
  assert.equal(options.schema, undefined);
  assert.equal(options.migrationsSchema, undefined);
});

test("migrate down: domyślnie cofa jedną migrację, count można podać", async () => {
  const { runner, calls } = fakeRunner();
  await migrate({ databaseUrl: DB_URL, direction: "down", runner, log: silent });
  await migrate({ databaseUrl: DB_URL, direction: "down", count: 3, runner, log: silent });
  await migrate({ databaseUrl: DB_URL, direction: "up", count: 2, runner, log: silent });

  assert.deepEqual(
    calls.map((o) => [o.direction, o.count]),
    [
      ["down", 1],
      ["down", 3],
      ["up", 2],
    ],
  );
});

test("schema: search_path i tabela pgmigrations w tym schemacie, bez zakładania schematu", async () => {
  const { runner, calls } = fakeRunner();
  await migrate({ databaseUrl: DB_URL, schema: "dm_migtest_abc123", runner, log: silent });

  assert.equal(calls[0].schema, "dm_migtest_abc123");
  assert.equal(calls[0].migrationsSchema, "dm_migtest_abc123");
  assert.equal(calls[0].createSchema, false);
});

test("walidacja: brak DATABASE_URL", async () => {
  const { runner, calls } = fakeRunner();
  for (const databaseUrl of [undefined, "", "   "]) {
    await assert.rejects(migrate({ databaseUrl, runner, log: silent }), (error) => {
      assert.ok(error instanceof MigrateError);
      assert.equal(error.message, MISSING_URL_MESSAGE);
      return true;
    });
  }
  assert.equal(calls.length, 0);
});

test("walidacja: kierunek tylko up/down", () => {
  for (const direction of ["sideways", "UP", "", null]) {
    assert.throws(
      () => buildRunnerOptions({ databaseUrl: DB_URL, direction }),
      (error) => error instanceof MigrateError && /Dozwolone: up, down/.test(error.message),
    );
  }
});

test("walidacja: count dodatni całkowity albo Infinity", () => {
  for (const count of [0, -1, 1.5, NaN, "2", -Infinity]) {
    assert.throws(
      () => buildRunnerOptions({ databaseUrl: DB_URL, count }),
      (error) => error instanceof MigrateError && /dodatnią liczbą całkowitą/.test(error.message),
      `count=${String(count)}`,
    );
  }
  assert.equal(buildRunnerOptions({ databaseUrl: DB_URL, count: Infinity }).count, Infinity);
  assert.equal(buildRunnerOptions({ databaseUrl: DB_URL, count: 5 }).count, 5);
});

test("walidacja: nazwa schematu to prosty identyfikator", () => {
  for (const schema of ["", "Public", 'x"; drop schema public; --', "1abc", "a-b", 42]) {
    assert.throws(
      () => buildRunnerOptions({ databaseUrl: DB_URL, schema }),
      (error) => error instanceof MigrateError && /Niepoprawna nazwa schematu/.test(error.message),
      `schema=${String(schema)}`,
    );
  }
});

test("isDatabaseUnreachable rozpoznaje błędy połączenia, także zagnieżdżone", () => {
  const unreachable = [
    errorWithCode("ECONNREFUSED"),
    errorWithCode("ENOTFOUND"),
    errorWithCode("ETIMEDOUT"),
    errorWithCode("57P03", "the database system is starting up"),
    new Error("timeout expired"),
    new Error("Connection terminated unexpectedly"),
    new Error("Connection terminated due to connection timeout"),
    new AggregateError([errorWithCode("ECONNREFUSED")], ""),
    new Error("wrapper", { cause: errorWithCode("ECONNREFUSED") }),
    new DatabaseUnreachableError(new Error("x")),
  ];
  for (const error of unreachable) {
    assert.equal(isDatabaseUnreachable(error), true, error.message || error.code);
  }

  const other = [
    errorWithCode("28P01", 'password authentication failed for user "devmentor"'),
    errorWithCode("42601", "syntax error at or near"),
    new Error("Not run migration 0002 is preceding already run migration 0003"),
    null,
    undefined,
    "ECONNREFUSED",
  ];
  for (const error of other) {
    assert.equal(isDatabaseUnreachable(error), false, String(error?.message ?? error));
  }
});

test("isDatabaseUnreachable nie zapętla się na cyklicznym cause", () => {
  const error = new Error("a");
  error.cause = error;
  assert.equal(isDatabaseUnreachable(error), false);
});

test("migrate zamienia błąd połączenia na DatabaseUnreachableError z komunikatem ze specyfikacji", async () => {
  const cause = errorWithCode("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432");
  const { runner } = fakeRunner({ error: cause });

  await assert.rejects(migrate({ databaseUrl: DB_URL, runner, log: silent }), (error) => {
    assert.ok(error instanceof DatabaseUnreachableError);
    assert.ok(error instanceof MigrateError);
    assert.equal(
      error.message,
      "Baza nie odpowiada pod DATABASE_URL — uruchom `docker compose up -d`",
    );
    assert.equal(error.message, UNREACHABLE_MESSAGE);
    assert.equal(error.cause, cause);
    return true;
  });
});

test("migrate przepuszcza inne błędy bez zmian (np. błąd SQL w migracji)", async () => {
  const sqlError = errorWithCode("42601", "syntax error");
  const { runner } = fakeRunner({ error: sqlError });
  await assert.rejects(migrate({ databaseUrl: DB_URL, runner, log: silent }), (error) => error === sqlError);
});

test("logger narzędzia: pomija postęp i zrzut błędu połączenia, przekazuje ostrzeżenia", () => {
  const lines = [];
  const logger = createToolLogger((line) => lines.push(line));
  logger.info("> Migrating files:");
  logger.debug("SELECT 1");
  logger.error("could not connect to postgres: Error: connect ECONNREFUSED");
  logger.warn("#> WARNING: This migration is not wrapped in a transaction! <");
  logger.error("Error executing: ...");
  assert.deepEqual(lines, [
    "#> WARNING: This migration is not wrapped in a transaction! <",
    "Error executing: ...",
  ]);
});

test("parseCliArgs: up, down, --help, błędne argumenty", () => {
  assert.deepEqual(parseCliArgs(["up"]), { direction: "up" });
  assert.deepEqual(parseCliArgs(["down"]), { direction: "down" });
  assert.deepEqual(parseCliArgs(["--help"]), { help: true });
  assert.deepEqual(parseCliArgs(["up", "--help"]), { help: true });
  assert.deepEqual(parseCliArgs(["-h"]), { help: true });
  for (const argv of [[], ["sideways"], ["up", "down"], ["up", "extra"]]) {
    assert.throws(() => parseCliArgs(argv), MigrateError, argv.join(" "));
  }
});

test("pomoc opisuje oba polecenia i oznacza db:rollback jako tylko lokalne/testowe", () => {
  assert.match(HELP_TEXT, /npm run db:migrate/);
  assert.match(HELP_TEXT, /npm run db:rollback/);
  assert.match(HELP_TEXT, /TYLKO lokalnie \/ w testach/);
  assert.match(HELP_TEXT, /\.env\.local/);
});

test("summarize: brak migracji i lista wykonanych", () => {
  assert.match(summarize("up", []), /Brak migracji do wykonania/);
  assert.match(summarize("down", []), /Brak migracji do cofnięcia/);
  assert.equal(summarize("up", [{ name: "0001_a" }, { name: "0002_b" }]), "✔ Wykonano migracje: 0001_a, 0002_b");
  assert.equal(summarize("down", [{ name: "0002_b" }]), "✔ Cofnięto migracje: 0002_b");
});

test("runCli: db:migrate wczytuje env, migruje w górę, kod 0", async () => {
  const env = {};
  const calls = [];
  const logs = [];
  const code = await runCli({
    argv: ["up"],
    env,
    loadEnv: () => {
      env.DATABASE_URL = DB_URL;
    },
    migrateFn: async (options) => {
      calls.push(options);
      return [];
    },
    log: (line) => logs.push(line),
  });
  assert.equal(code, 0);
  assert.equal(calls[0].databaseUrl, DB_URL);
  assert.equal(calls[0].direction, "up");
  assert.equal(calls[0].count, undefined);
  assert.match(logs.at(-1), /Brak migracji do wykonania/);
});

test("runCli: db:rollback przekazuje kierunek down (count domyślny = 1 w migrate)", async () => {
  const calls = [];
  const code = await runCli({
    argv: ["down"],
    env: { DATABASE_URL: DB_URL },
    loadEnv: silent,
    migrateFn: async (options) => {
      calls.push(options);
      return [{ name: "0001_a" }];
    },
    log: silent,
  });
  assert.equal(code, 0);
  assert.equal(calls[0].direction, "down");
});

test("runCli: --help nie łączy się z bazą i nie wczytuje env", async () => {
  let touched = false;
  const logs = [];
  const code = await runCli({
    argv: ["--help"],
    env: {},
    loadEnv: () => {
      touched = true;
    },
    migrateFn: async () => {
      touched = true;
      return [];
    },
    log: (line) => logs.push(line),
  });
  assert.equal(code, 0);
  assert.equal(touched, false);
  assert.equal(logs[0], HELP_TEXT);
});

test("runCli: nieosiągalna baza → kod 1 i sam komunikat, bez stack trace", async () => {
  const logs = [];
  const code = await runCli({
    argv: ["up"],
    env: { DATABASE_URL: DB_URL },
    loadEnv: silent,
    migrateFn: (options) =>
      migrate({ ...options, runner: fakeRunner({ error: errorWithCode("ECONNREFUSED") }).runner }),
    log: (line) => logs.push(line),
  });
  assert.equal(code, 1);
  assert.deepEqual(logs, [`✖ ${UNREACHABLE_MESSAGE}`]);
});

test("runCli: brak DATABASE_URL i nieznany błąd → kod 1 z czytelnym komunikatem", async () => {
  const logs = [];
  const missing = await runCli({
    argv: ["up"],
    env: {},
    loadEnv: silent,
    migrateFn: (options) => migrate({ ...options, runner: fakeRunner().runner }),
    log: (line) => logs.push(line),
  });
  assert.equal(missing, 1);
  assert.equal(logs.at(-1), `✖ ${MISSING_URL_MESSAGE}`);

  const failed = await runCli({
    argv: ["up"],
    env: { DATABASE_URL: DB_URL },
    loadEnv: silent,
    migrateFn: async () => {
      throw new Error("syntax error at or near \"tabel\"");
    },
    log: (line) => logs.push(line),
  });
  assert.equal(failed, 1);
  assert.equal(logs.at(-1), '✖ Migracja nie powiodła się: syntax error at or near "tabel"');
});
