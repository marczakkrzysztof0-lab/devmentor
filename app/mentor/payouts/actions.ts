"use server";

// Uruchamia onboarding wypłat mentora przez Stripe Connect (spec 2026-11-09, Rules 1–2).
import { startCurrentPayoutOnboarding } from "@/lib/payouts/server";

/** Rozpoczyna onboarding wypłat dla zalogowanego mentora.
 * @returns adres Stripe albo informacja o błędzie
 */
export async function startPayoutOnboardingAction(): Promise<{ ok: true; url: string } | { ok: false }> {
  const result = await startCurrentPayoutOnboarding();
  if (result.ok) return { ok: true, url: result.url };
  return { ok: false };
}
