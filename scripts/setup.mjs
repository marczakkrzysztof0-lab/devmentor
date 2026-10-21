// Instalator DevMentora: `npm run setup`.
// Wykonuje kroki z sekcji „Szybki start” w README i pomija te, które są już zrobione.
import { spawnSync } from "node:child_process";
import { constants, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DOCKER_COMPOSE_TEMPLATE = `services:
  db:
    image: postgres:17
    container_name: devmentor-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: devmentor
      POSTGRES_PASSWORD: devmentor
      POSTGRES_DB: devmentor
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
`;

export const ENV_EXAMPLE_TEMPLATE = `# Baza danych
DATABASE_URL="postgresql://devmentor:devmentor@localhost:5432/devmentor"

# Adres aplikacji
NEXT_PUBLIC_APP_URL="http://localhost:3000"
`;

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

// Zwraca komunikat dla użytkownika, gdy Docker jest niedostępny, albo null.
export function dockerProblem(result) {
  if (result.error || result.status === null) {
    return "Nie znaleziono polecenia `docker`. Zainstaluj Docker Desktop i otwórz terminal ponownie.";
  }
  if (result.status !== 0) {
    return "Docker nie odpowiada. Uruchom Docker Desktop, poczekaj aż wystartuje i spróbuj ponownie.";
  }
  return null;
}

// Kroki jako { name, isDone(), run(log) }. Zależności (fs, polecenia, migracje, czekanie)
// są wstrzykiwane, żeby logikę dało się przetestować bez Dockera, bazy i dotykania dysku.
export function createSteps({
  cwd,
  exists,
  exec,
  writeFile,
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
      name: "Plik docker-compose.yml",
      isDone: () => exists(path("docker-compose.yml")),
      run: () => writeFile(path("docker-compose.yml"), DOCKER_COMPOSE_TEMPLATE),
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
          "Nie udało się uruchomić bazy. Sprawdź `docker compose logs db` (np. zajęty port 5432).",
        ),
    },
    {
      name: "Szablon .env.example",
      isDone: () => exists(path(".env.example")),
      run: () => writeFile(path(".env.example"), ENV_EXAMPLE_TEMPLATE),
    },
    {
      name: "Plik .env.local",
      isDone: () => exists(path(".env.local")),
      run: () => copyFile(path(".env.example"), path(".env.local")),
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
    writeFile: (file, content) => writeFileSync(file, content, { flag: "wx" }),
    copyFile: (from, to) => copyFileSync(from, to, constants.COPYFILE_EXCL),
  });
  process.exitCode = await runSteps(steps);
}
