// Instalator DevMentora: `npm run setup`.
// Wykonuje kroki z sekcji „Szybki start” w README i pomija te, które są już zrobione.
import { spawnSync } from "node:child_process";
import { constants, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Pliki konfiguracji są w repozytorium (jedno źródło prawdy, bez kopii w README i w skrypcie).
// Instalator tylko sprawdza, że są na miejscu, i tworzy z szablonu lokalny `.env.local`.
export const REQUIRED_FILES = ["docker-compose.yml", ".env.example"];

export class SetupError extends Error {}

// Ponawianie połączenia w kroku migracji: świeżo uruchomiony kontener nie przyjmuje
// połączeń od razu (ECONNREFUSED / „the database system is starting up”).
export const MIGRATE_ATTEMPTS = 10;
export const MIGRATE_RETRY_DELAY_MS = 1000;

// Moduł migracji ładowany leniwie: importuje node-pg-migrate, którego na czystym klonie
// nie ma, dopóki pierwszy krok (npm install) się nie wykona.
const loadMigrator = () => import("./db-migrate.mjs");
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// `docker compose ps -q` wypisuje identyfikatory kontenerów, po jednym w linii.
export function hasRunningContainer(stdout) {
  return String(stdout ?? "").trim().length > 0;
}

// Przy `shell: true` brak binarki nie ustawia `result.error`: sh zwraca kod 127, a cmd kod 1
// (lub 9009) z komunikatem na stderr — po angielsku albo w języku systemu (np. polskim).
const COMMAND_NOT_FOUND =
  /is not recognized as an internal or external command|nie jest rozpoznawan[ey] jako polecenie|command not found|docker: not found/i;

export function isCommandMissing(result) {
  if (result.error || result.status === null || result.status === 127 || result.status === 9009) return true;
  return result.status !== 0 && COMMAND_NOT_FOUND.test(String(result.stderr ?? ""));
}

// Zwraca komunikat dla użytkownika, gdy Docker jest niedostępny, albo null.
export function dockerProblem(result) {
  if (isCommandMissing(result)) {
    return "Nie znaleziono polecenia `docker`. Zainstaluj Docker Desktop i otwórz terminal ponownie.";
  }
  if (result.status !== 0) {
    return "Docker nie odpowiada. Uruchom Docker Desktop, poczekaj aż wystartuje i spróbuj ponownie.";
  }
  return null;
}

// Kroki jako { name, isDone(), run(log) }. Kolejność: najpierw wszystko, co nie wymaga Dockera
// (zależności, pliki), potem baza i migracje. Zależności (fs, polecenia, migracje, czekanie)
// są wstrzykiwane, żeby logikę dało się przetestować bez Dockera, bazy i dotykania dysku.
export function createSteps({
  cwd,
  exists,
  exec,
  copyFile,
  readDatabaseUrl = defaultReadDatabaseUrl,
  migrator = loadMigrator,
  sleep = wait,
  attempts = MIGRATE_ATTEMPTS,
  retryDelayMs = MIGRATE_RETRY_DELAY_MS,
}) {
  const path = (file) => resolve(cwd, file);
  const ensureDocker = () => {
    const problem = dockerProblem(exec("docker info"));
    if (problem) throw new SetupError(problem);
  };
  const mustSucceed = (command, message) => {
    if (exec(command, { inherit: true }).status !== 0) throw new SetupError(message);
  };

  return [
    {
      name: "Instalacja zależności (npm install)",
      isDone: () => exists(path("node_modules")),
      run: () => mustSucceed("npm install", "`npm install` zakończył się błędem."),
    },
    {
      name: "Pliki konfiguracji z repozytorium (docker-compose.yml, .env.example)",
      isDone: () => REQUIRED_FILES.every((file) => exists(path(file))),
      run: () => {
        const list = REQUIRED_FILES.filter((file) => !exists(path(file))).join(" ");
        throw new SetupError(`Brak pliku z repozytorium: ${list}. Przywróć: git checkout -- ${list}`);
      },
    },
    {
      name: "Plik .env.local",
      isDone: () => exists(path(".env.local")),
      run: () => copyFile(path(".env.example"), path(".env.local")),
    },
    {
      name: "Baza danych (docker compose up -d db)",
      isDone: () => {
        ensureDocker();
        const result = exec("docker compose ps --status running -q db");
        return result.status === 0 && hasRunningContainer(result.stdout);
      },
      run: () =>
        mustSucceed(
          "docker compose up -d db",
          "Nie udało się uruchomić bazy. Sprawdź `docker compose logs db` (np. zajęty port 5432)" +
            " i `docker ps -a` (kontener `devmentor-db` z innego klonu repozytorium blokuje nazwę).",
        ),
    },
    {
      // Zawsze uruchamiany: narzędzie pomija wykonane już migracje, więc krok jest idempotentny.
      name: "Migracje bazy (db:migrate)",
      isDone: () => false,
      run: async (log) => {
        const { migrate, isDatabaseUnreachable, summarize, UNREACHABLE_MESSAGE } = await migrator();
        const databaseUrl = readDatabaseUrl(path(".env.local"));
        for (let attempt = 1; ; attempt++) {
          try {
            const migrations = await migrate({ databaseUrl, direction: "up", log });
            log(summarize("up", migrations));
            return;
          } catch (error) {
            if (!isDatabaseUnreachable(error)) {
              const reason = error instanceof Error ? error.message : String(error);
              throw new SetupError(`Migracja nie powiodła się: ${reason}`, { cause: error });
            }
            if (attempt >= attempts) {
              throw new SetupError(`${UNREACHABLE_MESSAGE} i ponów \`npm run setup\`.`, { cause: error });
            }
            log(`  … baza jeszcze nie odpowiada, ponawiam (próba ${attempt + 1}/${attempts})`);
            await sleep(retryDelayMs);
          }
        }
      },
    },
  ];
}

// DATABASE_URL z .env.local; zmienna już ustawiona w środowisku ma pierwszeństwo (jak w db:migrate).
function defaultReadDatabaseUrl(envFile) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return process.env.DATABASE_URL;
}

// Zwraca kod wyjścia: 0 przy sukcesie, 1 przy znanym błędzie.
export async function runSteps(steps, log = console.log) {
  try {
    for (const step of steps) {
      if (step.isDone()) {
        log(`✔ ${step.name}: już zrobione, pomijam`);
        continue;
      }
      log(`→ ${step.name}`);
      await step.run(log);
      log(`✔ ${step.name}`);
    }
  } catch (error) {
    if (error instanceof SetupError) {
      log(`✖ ${error.message}`);
      return 1;
    }
    throw error;
  }
  log("\nGotowe. Uruchom `npm run dev` i otwórz http://localhost:3000");
  return 0;
}

function exec(command, { inherit = false } = {}) {
  return spawnSync(command, {
    shell: true,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const steps = createSteps({
    cwd: process.cwd(),
    exists: existsSync,
    exec,
    copyFile: (from, to) => copyFileSync(from, to, constants.COPYFILE_EXCL),
  });
  process.exitCode = await runSteps(steps);
}
