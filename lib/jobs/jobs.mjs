// Zadania okresowe (spec #24 Q9, API Contracts „POST/GET /api/internal/jobs”; krok 5).
//
// - Endpoint `POST /api/internal/jobs` z `Authorization: Bearer <CRON_SECRET>` (porównanie w stałym czasie)
//   uruchamia po kolei zadania z rejestru (`lib/jobs/registry.mjs`): `payments.reconcilePending`,
//   `payments.retryRefunds`, potem zadania kolejnych historii (#17 `email.sendDue`, #18 …). Każde zadanie jest
//   idempotentne, bierze paczki po 50 i mieści się we wspólnym budżecie 25 s. Woła go co 5 min dowolny cron hostingu;
//   lokalnie `npm run jobs` co 60 s.
// - Każde uruchomienie zapisuje `job_runs` (`last_run_at`, `last_error` — tylko nazwa błędu, bez treści).
// - `GET` (ta sama autoryzacja) = cel monitora: `job_runs`, `stale: true`, gdy któreś zadanie nie biegło od 30 min
//   (albo nigdy), i `failedRefunds` — zatrzymany scheduler albo utknięty zwrot po cichu łamią R09.
import { createHash, timingSafeEqual } from "node:crypto";

export const JOB_BUDGET_MS = 25_000;
export const JOB_BATCH_SIZE = 50;
export const JOB_STALE_MINUTES = 30;

/**
 * @typedef {{ name: string, run: (ctx: any, options: { limit: number, deadline: number }) => Promise<Record<string, unknown>> }} Job
 */

/**
 * Czy nagłówek `Authorization` to dokładnie `Bearer <secret>` — porównanie skrótów SHA-256 w stałym czasie
 * (bez wycieku długości ani prefiksu).
 * @param {string | null | undefined} authorization
 * @param {string} secret
 */
export function isAuthorizedCronRequest(authorization, secret) {
  if (typeof secret !== "string" || secret === "") return false;
  const given = createHash("sha256").update(String(authorization ?? ""), "utf8").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`, "utf8").digest();
  return timingSafeEqual(given, expected);
}

/**
 * Uruchamia zadania po kolei we wspólnym budżecie czasu; błąd jednego zadania nie zatrzymuje kolejnych.
 * @param {ReadonlyArray<Job>} jobs
 * @param {any} ctx  zależności zadań (`db`, `payments`, `email`…); `ctx.db` zapisuje `job_runs`
 * @param {{ budgetMs?: number, now?: () => Date, log?: { error: (...a: any[]) => void } }} [options]
 * @returns {Promise<Record<string, Record<string, unknown>>>}
 */
export async function runJobs(jobs, ctx, { budgetMs = JOB_BUDGET_MS, now = () => new Date(), log = console } = {}) {
  const deadline = Date.now() + budgetMs;
  /** @type {Record<string, Record<string, unknown>>} */
  const results = {};
  for (const job of jobs) {
    if (Date.now() > deadline) {
      results[job.name] = { skipped: "budget" };
      continue;
    }
    /** @type {string | null} */
    let lastError = null;
    try {
      results[job.name] = await job.run(ctx, { limit: JOB_BATCH_SIZE, deadline });
    } catch (error) {
      lastError = error instanceof Error ? error.name : "Error";
      results[job.name] = { error: lastError };
      log.error(`[jobs] zadanie ${job.name} nie powiodło się: ${lastError}`);
    }
    await ctx.db.query(
      `insert into job_runs (name, last_run_at, last_error) values ($1, $2, $3)
       on conflict (name) do update set last_run_at = excluded.last_run_at, last_error = excluded.last_error`,
      [job.name, now(), lastError],
    );
  }
  return results;
}

/**
 * Zdrowie zadań dla monitora.
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {ReadonlyArray<string>} jobNames  zadania, które MUSZĄ biegać
 * @param {Date} [now]
 */
export async function jobsHealth(db, jobNames, now = new Date()) {
  const { rows } = await db.query("select name, last_run_at, last_error from job_runs order by name");
  const staleBefore = now.getTime() - JOB_STALE_MINUTES * 60_000;
  const byName = new Map(rows.map((row) => [row.name, row]));
  const stale = jobNames.some((name) => {
    const row = byName.get(name);
    return !row || new Date(row.last_run_at).getTime() < staleBefore;
  });
  const { rows: failed } = await db.query("select count(*)::int as n from payments where refund_status = 'failed'");
  return {
    jobs: rows.map((row) => ({ name: row.name, lastRunAt: new Date(row.last_run_at).toISOString(), lastError: row.last_error })),
    stale,
    failedRefunds: failed[0].n,
  };
}
