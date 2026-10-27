// Środowisko testowe dla QA i testów integracyjnych (lekcja 12, skill om-prepare-test-env).
//
// Wywoływane przez wygenerowane entrypointy `.ai/scripts/test-env-up.{sh,ps1}` i `test-env-down.{sh,ps1}`.
// Cała logika jest tutaj (Node jest i tak wymagany przez projekt), a skrypty .sh/.ps1 są cienkie i natywne
// dla swojej powłoki — nie wołają siebie nawzajem.
//
//   node scripts/test-env.mjs up [--force] [--force-rebuild]   start albo ponowne użycie działającego środowiska
//   node scripts/test-env.mjs down                             zatrzymanie tego, co uruchomił `up`
//   node scripts/test-env.mjs status                           stan z deskryptora (bez zmian)
//
// Co robi `up` (kontrakt v2 skilla):
//   1. blokada `.ai/qa/test-env.lock` (mkdir atomowy, owner.json z PID; martwy właściciel → przejęcie);
//   2. ponowne użycie: deskryptor `running` + żywy PID nadzorcy + odpowiedź `/` + odpowiedź strony z bazy
//      (`/m/<slug seeda>` = 200) + świeżość (TTL i odcisk źródeł bez zmian) → wypisuje adres i kończy;
//   3. cache buildu: odcisk (ścieżka:rozmiar:mtime) wejść buildu; zgodny i jest `.next/BUILD_ID` → bez buildu,
//      inaczej `npm run build` (i `npm ci`, gdy brak node_modules);
//   4. baza: ISTNIEJĄCY Postgres z DATABASE_URL (lokalnie kontener `devmentor-db` z docker-compose, w CI
//      service `postgres:17`) + jednorazowy schemat `dm_migtest_<losowe>` z markerem i migracjami
//      (tests/db/harness.mjs — ten sam mechanizm co `npm run test:e2e`), zamiast testcontainers;
//   5. seed minimalnych danych funkcjami domeny (bez ręcznego SQL): opublikowana mentorka z oknami dostępności;
//   6. `next start` na wolnym porcie (127.0.0.1), czekanie na gotowość, deskryptor `.ai/qa/test-env.json`.
// Proces nadzorcy (`serve`) działa w tle: trzyma advisory lock schematu (harness nie usunie go jako
// „pozostałości”), serwer Next.js i sprząta schemat przy zatrzymaniu.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QA_DIR = path.join(ROOT, ".ai", "qa");
const DESCRIPTOR = path.join(QA_DIR, "test-env.json");
const CREDENTIALS_FILE = path.join(QA_DIR, "test-env.env");
const BUILD_CACHE = path.join(QA_DIR, "test-env-build-cache.json");
const LOCK_DIR = path.join(QA_DIR, "test-env.lock");
const LOG_FILE = path.join(QA_DIR, "test-env.log");
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

// --- zmienne projektu (jedyne miejsce do zmian) ---
const BUILD_INPUTS = ["app", "lib", "packages/ui/src", "proxy.ts", "next.config.ts", "package-lock.json", "package.json", "tsconfig.json", "public"];
const BUILD_ENV_VARS = ["NODE_ENV"];
const ARTIFACTS = [".next/BUILD_ID"];
const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "coverage", "storybook-static", ".cache"]);
const TTL_SECONDS = Number(process.env.TEST_ENV_CACHE_TTL_SECONDS ?? 3600);
const READY_TIMEOUT_MS = 90_000;
const LOCK_WAIT_MS = 5 * 60_000;
const SEED = Object.freeze({
  email: "mentorka.testowa@example.com",
  displayName: "Mentorka Testowa",
  slug: "mentorka-testowa",
  publicWorkUrl: "https://github.com/devmentor-test",
  description: "Konto testowe środowiska QA: upgrade Next.js 15 → 16, migracje PostgreSQL, przeglądy PR.",
  price25: "150",
  price50: "280",
  timeZone: "Europe/Warsaw",
  // pon–pt 18:00–20:00 czasu mentorki
  windows: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 18 * 60, endMinute: 20 * 60 })),
});

const log = (message) => console.log(`[test-env] ${message}`);

// ---------------------------------------------------------------- pomocnicze

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/**
 * Linia poleceń procesu (null, gdy nie da się jej odczytać). PID z deskryptora mógł zostać ponownie przydzielony
 * innemu procesowi — zanim go zabijemy albo uznamy środowisko za żywe, sprawdzamy, czy to nadal nasz proces.
 * @param {number} pid
 * @returns {string | null}
 */
function commandLineOf(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === "linux") return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
    const result =
      process.platform === "win32"
        ? spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: "utf8", windowsHide: true })
        : spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    const line = result.status === 0 ? result.stdout.trim() : "";
    return line === "" ? null : line;
  } catch {
    return null;
  }
}

/** Nadzorca tego środowiska: `node scripts/test-env.mjs serve …`. */
const isSupervisor = (pid) => pidAlive(pid) && /test-env\.mjs\b.*\bserve\b/.test(commandLineOf(pid) ?? "");
/** Serwer tego środowiska: `next start … -p <port>`. */
const isAppServer = (pid, port) => pidAlive(pid) && new RegExp(String.raw`\bnext\b.*\bstart\b.*-p ${Number(port)}\b`).test(commandLineOf(pid) ?? "");

/** Zabija proces tylko wtedy, gdy nadal jest tym, za kogo uważa go deskryptor. */
function killIfOurs(pid, isOurs, label) {
  if (!pidAlive(pid)) return;
  if (!isOurs(pid)) {
    log(`PID ${pid} (${label}) nie należy już do tego środowiska — nie zabijam`);
    return;
  }
  killTree(pid);
}

function killTree(pid) {
  if (!pidAlive(pid)) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-pid, "SIGTERM"); // grupa procesów (nadzorca startuje jako lider grupy)
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // już nie żyje
      }
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function httpStatus(url, timeoutMs = 5000) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return response.status;
  } catch {
    return 0;
  }
}

/** Odcisk wejść buildu: posortowana lista `ścieżka:rozmiar:mtime` + zmienne kształtujące build → sha256. */
export function fingerprint(root = ROOT, inputs = BUILD_INPUTS) {
  const lines = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) return;
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      for (const name of readdirSync(abs)) if (!EXCLUDED_DIRS.has(name)) walk(path.posix.join(rel, name));
    } else {
      lines.push(`${rel}:${stat.size}:${Math.trunc(stat.mtimeMs)}`);
    }
  };
  for (const input of inputs) walk(input);
  lines.sort();
  for (const name of BUILD_ENV_VARS) lines.push(`env:${name}=${process.env[name] ?? ""}`);
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

function buildNeeded(force) {
  if (force) return "wymuszony (--force-rebuild)";
  const cache = readJson(BUILD_CACHE);
  if (!cache) return "brak cache buildu";
  if (cache.projectRoot !== ROOT) return "cache z innej kopii repo";
  if (cache.sourceFingerprint !== fingerprint()) return "zmienione źródła";
  for (const artifact of ARTIFACTS) if (!existsSync(path.join(ROOT, artifact))) return `brak ${artifact}`;
  return null;
}

function run(command, args) {
  log(`$ ${command} ${args.join(" ")}`);
  // Windows: npm to npm.cmd — jedno polecenie przez powłokę (argumenty są stałe, nie z zewnątrz).
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].join(" "), { cwd: ROOT, stdio: "inherit", shell: true })
      : spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} zakończone kodem ${result.status}`);
}

// ---------------------------------------------------------------- blokada

async function acquireLock(source) {
  mkdirSync(QA_DIR, { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      writeJson(path.join(LOCK_DIR, "owner.json"), { pid: process.pid, source, acquiredAt: new Date().toISOString() });
      return () => rmSync(LOCK_DIR, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = readJson(path.join(LOCK_DIR, "owner.json"));
      if (!owner || !pidAlive(owner.pid)) {
        log("przejmuję porzuconą blokadę");
        rmSync(LOCK_DIR, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`Blokada zajęta przez PID ${owner.pid} dłużej niż ${LOCK_WAIT_MS / 1000} s.`);
      await sleep(1000);
    }
  }
}

// ---------------------------------------------------------------- ponowne użycie

/** @returns {Promise<string | null>} null = środowisko zdrowe i świeże; inaczej powód odrzucenia */
async function reuseProblem(descriptor) {
  if (!descriptor || descriptor.status !== "running") return "brak działającego środowiska";
  if (!isSupervisor(descriptor.app?.pid)) return "proces nadzorcy nie żyje (albo PID należy do innego procesu)";
  if ((await httpStatus(descriptor.baseUrl)) === 0 || (await httpStatus(descriptor.baseUrl)) >= 500) return "aplikacja nie odpowiada";
  // Głębsza próba: strona z danymi z bazy (seed). 200 = aplikacja widzi swój schemat.
  if ((await httpStatus(`${descriptor.baseUrl}/m/${SEED.slug}`)) !== 200) return "aplikacja nie widzi bazy (seed)";
  const age = (Date.now() - Date.parse(descriptor.startedAt)) / 1000;
  if (!(age <= TTL_SECONDS)) return `starsze niż TTL ${TTL_SECONDS} s`;
  if (descriptor.sourceFingerprint !== fingerprint()) return "źródła zmienione od startu";
  return null;
}

function printResult(descriptor, reused) {
  console.log(`TEST_ENV_STATUS=${descriptor.status}`);
  console.log(`TEST_ENV_BASE_URL=${descriptor.baseUrl}`);
  console.log(`TEST_ENV_DESCRIPTOR=.ai/qa/test-env.json`);
  console.log(`TEST_ENV_REUSED=${reused ? 1 : 0}`);
  console.log(`BROWSER_PROVIDER=${descriptor.browser?.provider ?? "playwright"}`);
  console.log(`BROWSER_INSTALLED=${descriptor.browser?.installed ? 1 : 0}`);
}

// ---------------------------------------------------------------- up / down

async function up(args) {
  const force = args.includes("--force");
  const forceRebuild = args.includes("--force-rebuild");
  const startScript = args.find((a) => a.startsWith("--start-script="))?.split("=")[1] ?? ".ai/scripts/test-env-up.sh";
  const stopScript = startScript.replace("test-env-up", "test-env-down");
  const started = Date.now();
  const release = await acquireLock("test-env up");
  try {
    const current = readJson(DESCRIPTOR);
    const problem = await reuseProblem(current);
    if (!problem && !force) {
      log(`ponowne użycie ${current.baseUrl} (runId ${current.runId})`);
      printResult(current, true);
      return 0;
    }
    if (current?.status === "running") {
      log(`nie używam ponownie: ${force ? "--force" : problem} → zatrzymuję poprzednie`);
      await down();
    }

    if (!existsSync(path.join(ROOT, "node_modules"))) run("npm", ["ci"]);
    const reason = buildNeeded(forceRebuild);
    if (reason) {
      log(`build potrzebny: ${reason}`);
      run("npm", ["run", "build"]);
      writeJson(BUILD_CACHE, {
        builtAt: new Date().toISOString(),
        sourceFingerprint: fingerprint(),
        projectRoot: ROOT,
        artifactPaths: ARTIFACTS,
      });
    } else {
      log("build z cache (odcisk źródeł bez zmian)");
    }

    const { databaseStatus } = await import("../tests/db/harness.mjs");
    if (!databaseStatus.reachable) {
      throw new Error(`${databaseStatus.reason} Lokalnie: Docker Desktop + \`docker compose up -d\` (kontener devmentor-db).`);
    }

    // Nadzorca w tle: schemat + seed + next start; pisze deskryptor, gdy wszystko gotowe.
    rmSync(DESCRIPTOR, { force: true });
    const out = openSync(LOG_FILE, "w");
    const supervisor = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve", `--start-script=${startScript}`, `--stop-script=${stopScript}`, `--fingerprint=${fingerprint()}`], {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", out, out],
      env: process.env,
      windowsHide: true,
    });
    supervisor.unref();
    closeSync(out);

    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const descriptor = readJson(DESCRIPTOR);
      if (descriptor?.status === "running") {
        descriptor.notes = `${descriptor.notes} Ostatni zimny start: ${Math.round((Date.now() - started) / 1000)} s (z buildem: ${reason ? "tak" : "nie"}).`;
        writeJson(DESCRIPTOR, descriptor);
        printResult(descriptor, false);
        return 0;
      }
      if (descriptor?.status === "failed" || !pidAlive(supervisor.pid)) {
        console.error(readFileSync(LOG_FILE, "utf8").split("\n").slice(-40).join("\n"));
        throw new Error("Nadzorca środowiska zakończył się przed gotowością (log: .ai/qa/test-env.log).");
      }
      await sleep(500);
    }
    killTree(supervisor.pid);
    throw new Error(`Środowisko nie wstało w ${READY_TIMEOUT_MS / 1000} s (log: .ai/qa/test-env.log).`);
  } finally {
    release();
  }
}

async function down() {
  const descriptor = readJson(DESCRIPTOR);
  if (!descriptor || descriptor.status === "stopped") {
    log("nic do zatrzymania");
    return 0;
  }
  if (!descriptor.startedByThisRepo) {
    log("środowisko nie zostało uruchomione przez ten skrypt — nie ruszam");
    return 0;
  }
  killIfOurs(descriptor.app?.pid, isSupervisor, "nadzorca");
  killIfOurs(descriptor.app?.serverPid, (pid) => isAppServer(pid, descriptor.app?.port), "next start");
  let exitCode = 0;
  // Na Windows taskkill /F nie pozwala nadzorcy posprzątać — usuwamy jego schemat (tylko ten z deskryptora).
  const schema = descriptor.services?.[0]?.schema;
  if (schema && /^dm_migtest_[0-9a-f]{16}$/.test(schema)) {
    const { DATABASE_URL, TEST_SCHEMA_MARKER, quoteIdent } = await import("../tests/db/harness.mjs");
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: DATABASE_URL });
    client.on("error", () => {});
    try {
      await client.connect();
      const { rows } = await client.query("select obj_description(oid, 'pg_namespace') as marker from pg_namespace where nspname = $1", [schema]);
      if (rows[0]?.marker === TEST_SCHEMA_MARKER) await client.query(`drop schema if exists ${quoteIdent(schema)} cascade`);
    } catch (error) {
      exitCode = 1;
      log(`schematu ${schema} nie udało się usunąć (${error.message}) — posprząta go harness testów; kod wyjścia 1`);
    } finally {
      await client.end().catch(() => {});
    }
  }
  descriptor.status = "stopped";
  descriptor.stoppedAt = new Date().toISOString();
  writeJson(DESCRIPTOR, descriptor);
  rmSync(CREDENTIALS_FILE, { force: true });
  log(`zatrzymano (runId ${descriptor.runId})`);
  return exitCode;
}

// ---------------------------------------------------------------- nadzorca (proces w tle)

async function seed(db, appUrl) {
  const { createInvitation } = await import("./mentor-links.mjs");
  const { acceptInvitation } = await import("../lib/auth/mentor-auth.mjs");
  const { saveMentorPage } = await import("../lib/mentor-page/mentor-page.mjs");
  const { saveAvailability } = await import("../lib/availability/save.mjs");
  const { url } = await createInvitation({ db, email: SEED.email, appUrl });
  const accepted = await acceptInvitation({ db, token: url.split("/").pop() });
  if (!accepted.ok) throw new Error("seed: nie udało się przyjąć zaproszenia");
  const { rows } = await db.query("select id from mentors where email = $1", [SEED.email]);
  const mentorId = rows[0].id;
  const page = await saveMentorPage({
    db,
    mentorId,
    appUrl,
    publish: true,
    input: { displayName: SEED.displayName, publicWorkUrl: SEED.publicWorkUrl, description: SEED.description, price25: SEED.price25, price50: SEED.price50, slug: SEED.slug },
  });
  if (!page.ok) throw new Error(`seed: publikacja strony nie przeszła (${JSON.stringify(page.errors ?? page.reason)})`);
  const availability = await saveAvailability({ db, mentorId, input: { timeZone: SEED.timeZone, windows: SEED.windows } });
  if (!availability.ok) throw new Error(`seed: zapis dostępności nie przeszedł (${JSON.stringify(availability.errors)})`);
  // Sesja z przyjęcia zaproszenia nie jest nikomu potrzebna — logowanie przez `mentor:sign-in-link`.
  await db.query("update mentor_sessions set revoked_at = now() where mentor_id = $1", [mentorId]);
}

async function serve(args) {
  const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? "";
  const { createTestSchema, DATABASE_URL } = await import("../tests/db/harness.mjs");
  const { withSearchPath } = await import("./test-e2e.mjs");
  /** @type {Awaited<ReturnType<typeof createTestSchema>> | undefined} */
  let schemaHandle;
  /** @type {import("node:child_process").ChildProcess | undefined} */
  let server;
  let stopping = false;
  const stop = async (code) => {
    if (stopping) return;
    stopping = true;
    if (server && server.exitCode === null) killTree(server.pid);
    await schemaHandle?.dispose().catch(() => {});
    const descriptor = readJson(DESCRIPTOR);
    if (descriptor && descriptor.app?.pid === process.pid) {
      descriptor.status = code === 0 ? "stopped" : "failed";
      writeJson(DESCRIPTOR, descriptor);
    }
    process.exit(code);
  };
  process.on("SIGINT", () => void stop(0));
  process.on("SIGTERM", () => void stop(0));

  try {
    schemaHandle = await createTestSchema({ databaseUrl: DATABASE_URL });
    const appDatabaseUrl = withSearchPath(/** @type {string} */ (DATABASE_URL), schemaHandle.schema);
    const port = await freePort();
    const baseUrl = `http://localhost:${port}`;
    await seed(schemaHandle.pool, baseUrl);
    log(`schemat ${schemaHandle.schema}, seed gotowy, start ${baseUrl}`);

    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: appDatabaseUrl, NEXT_PUBLIC_APP_URL: baseUrl, NODE_ENV: "production" },
      stdio: "inherit",
      windowsHide: true,
    });
    server.on("exit", (code) => {
      log(`serwer Next.js zakończył się (kod ${code})`);
      void stop(stopping ? 0 : 1);
    });

    const deadline = Date.now() + READY_TIMEOUT_MS;
    while ((await httpStatus(`${baseUrl}/m/${SEED.slug}`)) !== 200) {
      if (Date.now() > deadline) throw new Error(`serwer nie odpowiedział w ${READY_TIMEOUT_MS / 1000} s`);
      await sleep(300);
    }

    const playwrightVersion = readJson(path.join(ROOT, "node_modules", "playwright", "package.json"))?.version ?? "unknown";
    writeJson(DESCRIPTOR, {
      version: 1,
      runId: `${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString("hex")}`,
      status: "running",
      mode: "ephemeral",
      baseUrl,
      startedByThisRepo: true,
      startScript: arg("start-script"),
      stopScript: arg("stop-script"),
      app: { startCommand: "next start -H 127.0.0.1 -p <wolny port>", port, healthPath: `/m/${SEED.slug}`, pid: process.pid, serverPid: server.pid },
      services: [
        {
          type: "postgres",
          host: new URL(/** @type {string} */ (DATABASE_URL)).hostname,
          port: Number(new URL(/** @type {string} */ (DATABASE_URL)).port || 5432),
          container: "devmentor-db (istniejący, z docker-compose) / service postgres:17 w CI",
          schema: schemaHandle.schema,
          env: { DATABASE_URL: "<DATABASE_URL procesu up> + ?options=-c search_path=<schema>" },
        },
      ],
      credentials: [],
      seed: { mentorEmail: SEED.email, publishedSlug: SEED.slug, publicUrl: `${baseUrl}/m/${SEED.slug}`, timeZone: SEED.timeZone, windows: "pon–pt 18:00–20:00" },
      browser: {
        provider: "playwright",
        installed: existsSync(path.join(ROOT, "node_modules", "playwright")),
        command: "node --test (import { chromium } from \"playwright\")",
        version: playwrightVersion,
        descriptor: ".ai/browsers/playwright.md",
        notes: "Chromium z cache Playwright; lokalnie bez `playwright install` (nic nie pobieramy).",
      },
      playwright: { runner: "playwright", installed: true, config: "", browsers: ["chromium"] },
      testRunner: { name: "playwright", config: "scripts/test-e2e.mjs (node --test tests/e2e/*.e2e.mjs)" },
      platform: process.platform === "win32" ? "win32" : process.platform,
      startedAt: new Date().toISOString(),
      sourceFingerprint: arg("fingerprint"),
      notes:
        "Logowanie mentorki z seeda: DATABASE_URL=<adres z search_path schematu> npm run mentor:sign-in-link -- " +
        `${SEED.email} (link jednorazowy). Testy e2e repo (\`npm run test:e2e\`) startują WŁASNY serwer i schemat — ` +
        "to środowisko służy eksploracji UI i QA. Zatrzymanie: skrypt test-env-down.",
    });
    log(`gotowe: ${baseUrl}`);
  } catch (error) {
    console.error(`[test-env] ${error instanceof Error ? error.stack : error}`);
    writeJson(DESCRIPTOR, { version: 1, status: "failed", app: { pid: process.pid }, notes: String(error) });
    await stop(1);
  }
}

// ---------------------------------------------------------------- CLI

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = "up", ...args] = process.argv.slice(2);
  const commands = {
    up: () => up(args),
    down: () => down(),
    serve: () => serve(args),
    status: async () => {
      const descriptor = readJson(DESCRIPTOR);
      if (!descriptor) {
        console.log("TEST_ENV_STATUS=none");
        return 0;
      }
      const problem = await reuseProblem(descriptor);
      printResult({ ...descriptor, status: problem ? "stale" : descriptor.status }, false);
      if (problem) log(problem);
      return problem ? 1 : 0;
    },
  };
  if (!Object.hasOwn(commands, command)) {
    console.error("Użycie: node scripts/test-env.mjs up [--force] [--force-rebuild] | down | status");
    process.exit(2);
  }
  if (command !== "serve") {
    commands[command]().then(
      (code) => process.exit(code),
      (error) => {
        console.error(`[test-env] ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      },
    );
  } else {
    void commands.serve();
  }
}
