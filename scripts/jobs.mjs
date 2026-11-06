// Lokalny scheduler zadań okresowych: `npm run jobs` (spec #24 Q9 — „locally `npm run jobs` every 60 s”).
//
// Co 60 s wysyła `POST <adres aplikacji>/api/internal/jobs` z `Authorization: Bearer $CRON_SECRET` i wypisuje
// liczniki zadań. Adres: `--url` albo `NEXT_PUBLIC_APP_URL` (domyślnie http://localhost:3000). Zmienne z
// `.env.local`, jeśli plik istnieje (jak inne skrypty). Na hostingu ten skrypt NIE jest potrzebny — endpoint woła
// cron hostingu co 5 min.
//
// Użycie: npm run jobs [-- --once] [-- --url http://localhost:3000] [-- --interval 60]
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_FILE } from "./db-migrate.mjs";

export const DEFAULT_INTERVAL_SECONDS = 60;

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 */
export function parseJobsArgs(argv, env) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const base = (value("--url") ?? env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const interval = Number(value("--interval") ?? DEFAULT_INTERVAL_SECONDS);
  return {
    url: `${base}/api/internal/jobs`,
    once: argv.includes("--once"),
    intervalMs: (Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_INTERVAL_SECONDS) * 1000,
  };
}

/**
 * Jedno wywołanie endpointu zadań. Zwraca status i ciało (JSON albo tekst); sekretu nie wypisuje.
 * @param {{ url: string, secret: string, fetchImpl?: typeof fetch }} input
 */
export async function triggerJobs({ url, secret, fetchImpl = fetch }) {
  const response = await fetchImpl(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function main(argv) {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32) {
    console.error("Brak CRON_SECRET (co najmniej 32 znaki). Uzupełnij plik zmiennych (wzór w .env.example).");
    return 1;
  }
  const { url, once, intervalMs } = parseJobsArgs(argv, process.env);
  const tick = async () => {
    try {
      const { status, body } = await triggerJobs({ url, secret });
      console.log(`[jobs] ${new Date().toISOString()} ${status} ${typeof body === "string" ? body : JSON.stringify(body)}`);
      return status;
    } catch (error) {
      console.error(`[jobs] ${new Date().toISOString()} brak odpowiedzi z ${url}: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  };
  if (once) return (await tick()) === 200 ? 0 : 1;
  console.log(`[jobs] co ${intervalMs / 1000} s → ${url} (Ctrl+C kończy)`);
  await tick();
  setInterval(() => void tick(), intervalMs);
  return new Promise(() => {});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
