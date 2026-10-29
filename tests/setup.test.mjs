import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import * as dbMigrate from "../scripts/db-migrate.mjs";
import {
  createSteps,
  MIGRATE_ATTEMPTS,
  MIGRATE_RETRY_DELAY_MS,
  dockerProblem,
  hasRunningContainer,
  isCommandMissing,
  REQUIRED_FILES,
  runSteps,
} from "../scripts/setup.mjs";

const CWD = resolve("/repo");

const DATABASE_URL = "postgresql://devmentor:devmentor@localhost:5432/devmentor";

// Fałszywe środowisko: pliki w Set, polecenia z tablicy odpowiedzi, zapisane wywołania.
// `migrateResults`: kolejne wyniki fałszywego migrate() — tablica migracji albo błąd do rzucenia
// (ostatni element powtarza się przy kolejnych wywołaniach).
// Pliki z repozytorium (docker-compose.yml, .env.example) są w każdym klonie.
function fakeEnv({
  files = REQUIRED_FILES,
  dbRunning = false,
  dockerInfo = { status: 0 },
  migrateResults = [[]],
  attempts,
} = {}) {
  const fs = new Set(files.map((file) => resolve(CWD, file)));
  const commands = [];
  const written = [];
  const migrateCalls = [];
  const sleeps = [];
  const env = {
    cwd: CWD,
    exists: (path) => fs.has(path),
    exec: (command) => {
      commands.push(command);
      if (command === "docker info") return dockerInfo;
      if (command.startsWith("docker compose ps")) {
        return { status: 0, stdout: dbRunning ? "abc123\n" : "" };
      }
      if (command === "docker compose up -d db") dbRunning = true;
      if (command === "npm install") fs.add(resolve(CWD, "node_modules"));
      return { status: 0, stdout: "" };
    },
    copyFile: (_from, to) => {
      fs.add(to);
      written.push({ path: to });
    },
    readDatabaseUrl: (envFile) => {
      // Krok migracji czyta .env.local dopiero, gdy plik istnieje (po kroku .env.local).
      assert.ok(fs.has(envFile), "migracje przed utworzeniem .env.local");
      return DATABASE_URL;
    },
    // Prawdziwe isDatabaseUnreachable / summarize / komunikaty, fałszywe migrate (bez bazy).
    migrator: async () => ({
      ...dbMigrate,
      migrate: async (options) => {
        migrateCalls.push(options);
        const result = migrateResults[Math.min(migrateCalls.length, migrateResults.length) - 1];
        if (result instanceof Error) throw result;
        return result;
      },
    }),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...(attempts === undefined ? {} : { attempts }),
  };
  return { env, commands, written, migrateCalls, sleeps };
}

const refused = () => Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
const startingUp = () =>
  Object.assign(new Error("the database system is starting up"), { code: "57P03" });

const silent = () => {};

test("hasRunningContainer rozpoznaje pusty i niepusty wynik", () => {
  assert.equal(hasRunningContainer(""), false);
  assert.equal(hasRunningContainer("  \n"), false);
  assert.equal(hasRunningContainer(undefined), false);
  assert.equal(hasRunningContainer("abc123\n"), true);
});

test("dockerProblem: brak polecenia, wyłączony daemon, wszystko ok", () => {
  assert.match(dockerProblem({ error: new Error("ENOENT"), status: null }), /Zainstaluj Docker Desktop/);
  assert.match(dockerProblem({ status: 1, stderr: "error during connect" }), /Uruchom Docker Desktop/);
  assert.equal(dockerProblem({ status: 0 }), null);
});

// Realne wyniki spawnSync z `shell: true`, gdy binarki `docker` nie ma: bez `result.error`.
test("dockerProblem: brak binarki przy shell: true (sh 127, cmd 1 + stderr)", () => {
  const cases = [
    { status: 127, stderr: "/bin/sh: 1: docker: not found\n" },
    { status: 127, stderr: "bash: docker: command not found\n" },
    {
      status: 1,
      stderr: "'docker' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n",
    },
    {
      status: 1,
      stderr: "'docker' nie jest rozpoznawane jako polecenie wewnętrzne lub zewnętrzne,\r\nprogram wykonywalny lub plik wsadowy.\r\n",
    },
    { status: 9009, stderr: "" },
  ];
  for (const result of cases) {
    assert.equal(isCommandMissing(result), true, JSON.stringify(result));
    assert.match(dockerProblem(result), /Zainstaluj Docker Desktop/);
  }
  // Działający docker z wyłączonym daemonem to nie „brak polecenia”.
  const daemonDown = { status: 1, stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock." };
  assert.equal(isCommandMissing(daemonDown), false);
  assert.match(dockerProblem(daemonDown), /Uruchom Docker Desktop/);
});

test("brak binarki docker: .env.local utworzony, potem komunikat „Zainstaluj”", async () => {
  const { env, commands, written } = fakeEnv({
    files: [...REQUIRED_FILES, "node_modules"],
    dockerInfo: { status: 127, stderr: "/bin/sh: 1: docker: not found\n" },
  });
  const logs = [];
  const code = await runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 1);
  assert.deepEqual(written.map((w) => w.path), [resolve(CWD, ".env.local")]);
  assert.match(logs.at(-1), /^✖ Nie znaleziono polecenia `docker`/);
  assert.ok(!commands.includes("docker compose up -d db"));
});

test("brak pliku z repozytorium: komunikat z git checkout, bez Dockera", async () => {
  const { env, commands } = fakeEnv({ files: ["node_modules", ".env.example"] });
  const logs = [];
  const code = await runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 1);
  assert.equal(logs.at(-1), "✖ Brak pliku z repozytorium: docker-compose.yml. Przywróć: git checkout -- docker-compose.yml");
  assert.ok(!commands.some((command) => command.startsWith("docker")));
});

test("czysty klon: wszystkie kroki wykonane, kod 0", async () => {
  const { env, commands, written } = fakeEnv();
  const logs = [];
  const code = await runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 0);
  assert.ok(commands.includes("npm install"));
  assert.ok(commands.includes("docker compose up -d db"));
  assert.deepEqual(written.map((w) => w.path), [resolve(CWD, ".env.local")]);
  assert.match(logs.at(-1), /npm run dev/);
});

test("drugie uruchomienie niczego nie nadpisuje i nie restartuje bazy", async () => {
  const { env, commands, written } = fakeEnv({
    files: ["node_modules", "docker-compose.yml", ".env.example", ".env.local"],
    dbRunning: true,
  });
  const code = await runSteps(createSteps(env), silent);

  assert.equal(code, 0);
  assert.deepEqual(written, []);
  assert.ok(!commands.includes("npm install"));
  assert.ok(!commands.includes("docker compose up -d db"));
});

test("wyłączony Docker: .env.local już utworzony, czytelny komunikat i kod różny od 0", async () => {
  const { env, commands, written } = fakeEnv({
    files: [...REQUIRED_FILES, "node_modules"],
    dockerInfo: { status: 1, stderr: "error during connect" },
  });
  const logs = [];
  const code = await runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 1);
  assert.deepEqual(written.map((w) => w.path), [resolve(CWD, ".env.local")]);
  assert.match(logs.at(-1), /^✖ Docker nie odpowiada.*Uruchom Docker Desktop/);
  assert.ok(!commands.includes("docker compose up -d db"));
});

test("nieznany błąd nie jest połykany", async () => {
  const steps = [{ name: "x", isDone: () => false, run: () => { throw new TypeError("boom"); } }];
  await assert.rejects(runSteps(steps, silent), TypeError);
});

test("kolejność: pliki przed bazą, migracje ostatnie, z DATABASE_URL z pliku", async () => {
  const { env, migrateCalls } = fakeEnv({ migrateResults: [[{ name: "0001_mentors_invitations_pages" }]] });
  const steps = createSteps(env);
  const logs = [];
  const code = await runSteps(steps, (line) => logs.push(line));

  assert.equal(code, 0);
  assert.equal(steps.at(-1).name, "Migracje bazy (db:migrate)");
  assert.deepEqual(
    steps.map((step) => step.name),
    [
      "Instalacja zależności (npm install)",
      "Pliki konfiguracji z repozytorium (docker-compose.yml, .env.example)",
      "Plik .env.local",
      "Baza danych (docker compose up -d db)",
      "Migracje bazy (db:migrate)",
    ],
  );
  assert.equal(migrateCalls.length, 1);
  assert.equal(migrateCalls[0].databaseUrl, DATABASE_URL);
  assert.equal(migrateCalls[0].direction, "up");
  assert.ok(logs.includes("✔ Wykonano migracje: 0001_mentors_invitations_pages"));
  assert.match(logs.at(-1), /npm run dev/);
});

test("migracje uruchamiają się, nawet gdy wszystko inne jest zrobione", async () => {
  const { env, migrateCalls } = fakeEnv({
    files: ["node_modules", "docker-compose.yml", ".env.example", ".env.local"],
    dbRunning: true,
  });
  const logs = [];
  const code = await runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 0);
  assert.equal(migrateCalls.length, 1);
  assert.ok(logs.includes("✔ Brak migracji do wykonania."));
  assert.ok(!logs.some((line) => line.startsWith("✔ Migracje bazy (db:migrate): już zrobione")));
});

test("baza jeszcze startuje: ponawia połączenie i kończy sukcesem", async () => {
  const { env, migrateCalls, sleeps } = fakeEnv({
    files: ["node_modules", "docker-compose.yml", ".env.example", ".env.local"],
    dbRunning: true,
    migrateResults: [refused(), startingUp(), new dbMigrate.DatabaseUnreachableError(refused()), []],
  });
  const logs = [];
  const code = await runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 0);
  assert.equal(migrateCalls.length, 4);
  assert.deepEqual(sleeps, [MIGRATE_RETRY_DELAY_MS, MIGRATE_RETRY_DELAY_MS, MIGRATE_RETRY_DELAY_MS]);
  assert.equal(logs.filter((line) => line.includes("ponawiam")).length, 3);
  assert.match(logs.at(-1), /npm run dev/);
});

test("baza nie odpowiada po wszystkich próbach: polski komunikat i kod 1", async () => {
  const { env, migrateCalls, sleeps } = fakeEnv({
    files: ["node_modules", "docker-compose.yml", ".env.example", ".env.local"],
    dbRunning: true,
    migrateResults: [new dbMigrate.DatabaseUnreachableError(refused())],
  });
  const logs = [];
  const code = await runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 1);
  assert.equal(migrateCalls.length, MIGRATE_ATTEMPTS);
  assert.equal(sleeps.length, MIGRATE_ATTEMPTS - 1);
  assert.equal(
    logs.at(-1),
    "✖ Baza nie odpowiada pod DATABASE_URL — uruchom `docker compose up -d` i ponów `npm run setup`.",
  );
  assert.ok(!logs.some((line) => /npm run dev/.test(line)));
});

test("liczbę prób da się zmienić (wstrzykiwana)", async () => {
  const { env, migrateCalls } = fakeEnv({
    files: ["node_modules", "docker-compose.yml", ".env.example", ".env.local"],
    dbRunning: true,
    migrateResults: [refused()],
    attempts: 3,
  });
  assert.equal(await runSteps(createSteps(env), silent), 1);
  assert.equal(migrateCalls.length, 3);
});

test("błąd migracji inny niż brak połączenia: bez ponawiania, komunikat i kod 1", async () => {
  const sqlError = Object.assign(new Error('relation "mentors" already exists'), { code: "42P07" });
  const { env, migrateCalls, sleeps } = fakeEnv({
    files: ["node_modules", "docker-compose.yml", ".env.example", ".env.local"],
    dbRunning: true,
    migrateResults: [sqlError, []],
  });
  const logs = [];
  const code = await runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 1);
  assert.equal(migrateCalls.length, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(logs.at(-1), '✖ Migracja nie powiodła się: relation "mentors" already exists');
});
