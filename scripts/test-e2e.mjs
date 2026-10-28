// Testy end-to-end (Playwright, Chromium) na zbudowanej aplikacji: `npm run test:e2e`.
//
// Wymaga gotowego buildu produkcyjnego (`npm run build`) i bazy z DATABASE_URL (.env.local albo zmienna).
// Kolejność:
//   1. sprawdza `.next/BUILD_ID` — bez buildu kończy się podpowiedzią „najpierw npm run build”;
//   2. sprawdza bazę — lokalnie brak bazy → pominięcie z komunikatem (kod 0), przy CI=true → błąd (kod 1);
//   3. tworzy jednorazowy schemat `dm_migtest_<losowe>` z komentarzem-markerem i migruje go
//      (te same zasady co tests/db/harness.mjs — pozostałości po przerwanych przebiegach sprząta harness);
//   4. uruchamia `next start -p <wolny port>` z DATABASE_URL tej samej bazy, ale z
//      `?options=-c search_path=<schemat>` — każde połączenie puli aplikacji widzi tylko schemat testowy
//      (sprawdzane przed startem przez `createPool` z lib/db/pool.mjs), oraz NEXT_PUBLIC_APP_URL;
//   5. czeka, aż serwer odpowie, i uruchamia `node --test` na plikach tests/e2e/*.e2e.mjs ze zmiennymi
//      E2E_BASE_URL, E2E_DATABASE_URL (z search_path), E2E_SCHEMA;
//   6. zawsze zatrzymuje serwer i usuwa schemat (także po błędzie i Ctrl+C).
// Płatności (#24, #17): obok aplikacji startuje lokalny fałszywy Stripe (`tests/e2e/fake-stripe-server.mjs`);
// aplikacja dostaje atrapy `sk_test_…` i `STRIPE_API_BASE_URL` na niego (tylko localhost), testy —
// `E2E_FAKE_STRIPE_URL`. Żadnych prawdziwych kluczy ani ruchu do Stripe.
//
// Przeglądarka: Chromium z cache Playwright (bez `playwright install`). Pod `next start` NODE_ENV=production,
// więc ciasteczko sesji ma flagę Secure — Chromium przyjmuje je na http://localhost.
//
// Użycie: npm run test:e2e [-- <ścieżki plików .e2e.mjs>]    pomoc: npm run test:e2e -- --help
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../lib/db/pool.mjs";
import { createTestSchema, databaseStatus, DATABASE_URL } from "../tests/db/harness.mjs";
import { fakeStripeEnv, startFakeStripeServer } from "../tests/e2e/fake-stripe-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_ID = path.join(ROOT, ".next", "BUILD_ID");
const E2E_DIR = path.join(ROOT, "tests", "e2e");
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const READY_TIMEOUT_MS = 60_000;
const isCi = process.env.CI === "true";
/** Nieudane usunięcie schematu testowego = niezerowy kod wyjścia (wyciek schematu ma być widoczny, nie tylko w logu). */
let schemaCleanupFailed = false;

export const HELP_TEXT = `Testy end-to-end (Playwright, Chromium) na buildzie produkcyjnym.

Użycie:
  npm run build
  npm run test:e2e                       wszystkie tests/e2e/*.e2e.mjs
  npm run test:e2e -- tests/e2e/x.e2e.mjs  wybrane pliki

Każdy przebieg ma własny, jednorazowy schemat bazy (dm_migtest_…), który na końcu jest usuwany.
Bez bazy: lokalnie testy są pomijane, przy CI=true kończą się błędem.`;

/** Wolny port TCP na localhost. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
      server.close(() => resolve(port));
    });
  });
}

/**
 * Adres bazy z `options=-c search_path=<schema>` (parametr rozumiany przez `pg` / libpq).
 * @param {string} databaseUrl
 * @param {string} schema
 */
export function withSearchPath(databaseUrl, schema) {
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

/** Zabija serwer razem z procesami potomnymi (Windows: taskkill /T). */
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

/**
 * Czeka, aż serwer odpowie na GET /. Przerywa, gdy proces serwera się zakończy.
 * @param {string} baseUrl
 * @param {import("node:child_process").ChildProcess} child
 */
async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Serwer Next.js zakończył się (kod ${child.exitCode}) przed startem.`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // jeszcze nie słucha
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Serwer Next.js nie odpowiedział w ${READY_TIMEOUT_MS / 1000} s (${baseUrl}).`);
}

/** Pliki testów: argumenty albo wszystkie tests/e2e/*.e2e.mjs. */
function testFiles(args) {
  if (args.length > 0) return args.map((file) => path.resolve(file));
  if (!existsSync(E2E_DIR)) return [];
  return readdirSync(E2E_DIR)
    .filter((name) => name.endsWith(".e2e.mjs"))
    .sort()
    .map((name) => path.join(E2E_DIR, name));
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP_TEXT);
    return 0;
  }
  if (!existsSync(BUILD_ID)) {
    console.error("Brak buildu produkcyjnego (.next) — najpierw npm run build, potem npm run test:e2e.");
    return 1;
  }
  if (!databaseStatus.reachable) {
    if (isCi) {
      console.error(`${databaseStatus.reason} (CI=true: testy e2e nie mogą być pominięte)`);
      return 1;
    }
    console.log(`Pominięto testy e2e: ${databaseStatus.reason}`);
    return 0;
  }
  const files = testFiles(argv);
  if (files.length === 0) {
    console.error("Brak plików tests/e2e/*.e2e.mjs.");
    return 1;
  }

  /** @type {Awaited<ReturnType<typeof createTestSchema>> | undefined} */
  let schemaHandle;
  /** @type {import("node:child_process").ChildProcess | undefined} */
  let server;
  /** @type {Awaited<ReturnType<typeof startFakeStripeServer>> | undefined} */
  let fakeStripe;
  const cleanup = async () => {
    killTree(server);
    await fakeStripe?.close().catch(() => {});
    await schemaHandle?.dispose().catch((error) => {
      schemaCleanupFailed = true;
      console.error("[e2e] nie udało się usunąć schematu:", error.message);
    });
  };
  const onSignal = () => {
    void cleanup().finally(() => process.exit(130));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    schemaHandle = await createTestSchema({ databaseUrl: DATABASE_URL });
    const appDatabaseUrl = withSearchPath(/** @type {string} */ (DATABASE_URL), schemaHandle.schema);

    // Pula aplikacji (lib/db/pool.mjs) musi widzieć schemat testowy — inaczej testy pisałyby do `public`.
    const probe = createPool(appDatabaseUrl);
    try {
      const { rows } = await probe.query("select current_schema() as schema");
      if (rows[0].schema !== schemaHandle.schema) {
        throw new Error(`Pula aplikacji widzi schemat „${rows[0].schema}”, a nie „${schemaHandle.schema}”.`);
      }
    } finally {
      await probe.end();
    }

    fakeStripe = await startFakeStripeServer();
    const port = await freePort();
    const baseUrl = `http://localhost:${port}`;
    console.log(`[e2e] schemat ${schemaHandle.schema}, serwer ${baseUrl}`);
    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
      cwd: ROOT,
      env: {
        ...process.env,
        ...fakeStripeEnv(fakeStripe.url),
        DATABASE_URL: appDatabaseUrl,
        NEXT_PUBLIC_APP_URL: baseUrl,
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let serverLog = "";
    const collect = (chunk) => {
      serverLog = (serverLog + chunk.toString()).slice(-20_000);
    };
    server.stdout.on("data", collect);
    server.stderr.on("data", collect);

    try {
      await waitForServer(baseUrl, server);
    } catch (error) {
      console.error(serverLog);
      throw error;
    }

    const run = spawn(process.execPath, ["--test", "--test-concurrency=1", ...files], {
      cwd: ROOT,
      env: {
        ...process.env,
        E2E_BASE_URL: baseUrl,
        E2E_DATABASE_URL: appDatabaseUrl,
        E2E_SCHEMA: schemaHandle.schema,
        E2E_FAKE_STRIPE_URL: fakeStripe.url,
      },
      stdio: "inherit",
    });
    const code = await new Promise((resolve) => run.on("exit", (exitCode) => resolve(exitCode ?? 1)));
    if (code !== 0 && serverLog.trim() !== "") {
      console.error("\n[e2e] ostatnie linie logu serwera:\n" + serverLog.split("\n").slice(-40).join("\n"));
    }
    return code;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await cleanup();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code === 0 && schemaCleanupFailed ? 1 : code),
    (error) => {
      console.error(`[e2e] ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    },
  );
}
