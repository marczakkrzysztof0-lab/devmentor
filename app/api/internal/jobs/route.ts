// /api/internal/jobs — zadania okresowe i ich zdrowie (spec #24 Q9, API Contracts).
//
// - POST: uruchamia zadania z rejestru (`lib/jobs/registry.mjs`) w budżecie 25 s; 200 z licznikami na zadanie.
// - GET: `job_runs` + `stale` + `failedRefunds` (cel monitora dostępności).
// - Oba: `Authorization: Bearer <CRON_SECRET>` porównany w stałym czasie → inaczej 401. `CRON_SECRET` krótszy niż
//   32 znaki albo brak → 503. POST bez konfiguracji płatności → 503.
import { isAuthorizedCronRequest, jobsHealth } from "@/lib/jobs/jobs.mjs";
import { JOB_NAMES } from "@/lib/jobs/registry.mjs";
import { runAllJobs } from "@/lib/jobs/server";
import { getPool } from "@/lib/db";
import { readCronSecret } from "@/lib/payments/config.mjs";
import { PaymentsUnavailable } from "@/lib/payments/errors.mjs";

/** `null` = autoryzacja OK; inaczej gotowa odpowiedź 401/503. */
function rejectUnauthorized(request: Request): Response | null {
  let secret: string;
  try {
    secret = readCronSecret(process.env);
  } catch {
    return Response.json({ error: "jobs_unavailable" }, { status: 503 });
  }
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: Request) {
  const rejected = rejectUnauthorized(request);
  if (rejected) return rejected;
  try {
    const results = await runAllJobs();
    return Response.json({ ok: true, results });
  } catch (error) {
    if (error instanceof PaymentsUnavailable) return Response.json({ error: "payments_unavailable" }, { status: 503 });
    throw error;
  }
}

export async function GET(request: Request) {
  const rejected = rejectUnauthorized(request);
  if (rejected) return rejected;
  return Response.json(await jobsHealth(getPool(), JOB_NAMES, new Date()));
}
