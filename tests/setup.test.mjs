import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  createSteps,
  dockerProblem,
  ENV_EXAMPLE_TEMPLATE,
  hasRunningContainer,
  runSteps,
} from "../scripts/setup.mjs";

const CWD = resolve("/repo");

// Fałszywe środowisko: pliki w Set, polecenia z tablicy odpowiedzi, zapisane wywołania.
function fakeEnv({ files = [], dbRunning = false, dockerInfo = { status: 0 } } = {}) {
  const fs = new Set(files.map((file) => resolve(CWD, file)));
  const commands = [];
  const written = [];
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
    writeFile: (path, content) => {
      fs.add(path);
      written.push({ path, content });
    },
    copyFile: (_from, to) => {
      fs.add(to);
      written.push({ path: to });
    },
  };
  return { env, commands, written };
}

const silent = () => {};

test("hasRunningContainer rozpoznaje pusty i niepusty wynik", () => {
  assert.equal(hasRunningContainer(""), false);
  assert.equal(hasRunningContainer("  \n"), false);
  assert.equal(hasRunningContainer(undefined), false);
  assert.equal(hasRunningContainer("abc123\n"), true);
});

test("dockerProblem: brak polecenia, wyłączony daemon, wszystko ok", () => {
  assert.match(dockerProblem({ error: new Error("ENOENT"), status: null }), /Docker Desktop/);
  assert.match(dockerProblem({ status: 1 }), /Uruchom Docker Desktop/);
  assert.equal(dockerProblem({ status: 0 }), null);
});

test("czysty klon: wszystkie kroki wykonane, kod 0", () => {
  const { env, commands, written } = fakeEnv();
  const logs = [];
  const code = runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 0);
  assert.ok(commands.includes("npm install"));
  assert.ok(commands.includes("docker compose up -d db"));
  const paths = written.map((w) => w.path);
  assert.deepEqual(paths, [
    resolve(CWD, "docker-compose.yml"),
    resolve(CWD, ".env.example"),
    resolve(CWD, ".env.local"),
  ]);
  assert.equal(written[1].content, ENV_EXAMPLE_TEMPLATE);
  assert.match(logs.at(-1), /npm run dev/);
});

test("drugie uruchomienie niczego nie nadpisuje i nie restartuje bazy", () => {
  const { env, commands, written } = fakeEnv({
    files: ["node_modules", "docker-compose.yml", ".env.example", ".env.local"],
    dbRunning: true,
  });
  const code = runSteps(createSteps(env), silent);

  assert.equal(code, 0);
  assert.deepEqual(written, []);
  assert.ok(!commands.includes("npm install"));
  assert.ok(!commands.includes("docker compose up -d db"));
});

test("wyłączony Docker: czytelny komunikat i kod różny od 0", () => {
  const { env, commands } = fakeEnv({
    files: ["node_modules", "docker-compose.yml"],
    dockerInfo: { status: 1 },
  });
  const logs = [];
  const code = runSteps(createSteps(env), (line) => logs.push(line));

  assert.equal(code, 1);
  assert.match(logs.at(-1), /^✖ .*Docker Desktop/);
  assert.ok(!commands.includes("docker compose up -d db"));
});

test("nieznany błąd nie jest połykany", () => {
  const steps = [{ name: "x", isDone: () => false, run: () => { throw new TypeError("boom"); } }];
  assert.throws(() => runSteps(steps, silent), TypeError);
});
