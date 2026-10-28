// Uruchomienie zadań okresowych z aplikacji (trasa `/api/internal/jobs`) — tylko serwer.
// Kontekst zadań składany z konfiguracji środowiska; brak konfiguracji płatności → `PaymentsUnavailable` (503).
import "server-only";
import { getPool } from "@/lib/db";
import { transportFromEnv } from "@/lib/email/transport.mjs";
import { getPaymentsDeps } from "@/lib/payments/server";
import { runJobs } from "./jobs.mjs";
import { JOBS } from "./registry.mjs";

export async function runAllJobs() {
  const payments = getPaymentsDeps();
  return runJobs(JOBS, { db: getPool(), payments, email: { transport: transportFromEnv().transport } });
}
