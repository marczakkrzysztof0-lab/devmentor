// Udostępnia dane wypłat i rozpoczęcie onboardingu w warstwie serwerowej (spec 2026-11-09, sekcja Rules 2).
import "server-only";
import { getCurrentMentor } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { getPaymentsDeps } from "@/lib/payments/server";
import { appBaseUrl } from "@/lib/mentor-page/editor";
import { startOnboarding, syncAccountFromStripe } from "./accounts.mjs";
import { getPayoutSummary } from "./summary.mjs";

type PayoutSummary = {
  hasPaidRequest: boolean;
  accountState: "none" | "pending" | "ready";
  detailsSubmitted: boolean;
  askForPayouts: boolean;
  heldMinor: number;
  paidMinor: number;
  currency: string;
  items: Array<{
    requestId: string;
    menteeFirstName: string;
    lengthMinutes: number;
    slot: Date | string;
    shareMinor: number;
    currency: string;
    status: string;
    owed: boolean;
  }>;
};

/** Wczytuje podsumowanie wypłat aktualnie zalogowanego mentora.
 * @returns dane wypłat albo null, gdy sesja nie wskazuje mentora
 */
export async function loadCurrentPayouts(): Promise<(PayoutSummary & { mentorId: string }) | null> {
  const mentor = await getCurrentMentor();
  if (!mentor) return null;

  try {
    await syncAccountFromStripe(mentor.mentorId, getPaymentsDeps());
  } catch {
    // Show the stored account state when Stripe is not configured.
  }
  const summary = await getPayoutSummary(getPool(), { mentorId: mentor.mentorId }) as PayoutSummary;
  return { ...summary, mentorId: mentor.mentorId };
}

/** Wczytuje dane promptu wypłat bez blokowania panelu mentora przy błędzie bazy.
 * @returns podsumowanie promptu albo null, gdy sesja lub odczyt są niedostępne
 */
export async function loadCurrentPayoutPrompt(): Promise<PayoutSummary | null> {
  const mentor = await getCurrentMentor();
  if (!mentor) return null;

  try {
    return await getPayoutSummary(getPool(), { mentorId: mentor.mentorId }) as PayoutSummary;
  } catch (error) {
    console.error(`[payouts] summary read failed: ${error instanceof Error ? error.name : "Error"}`);
    return null;
  }
}

/** Rozpoczyna onboarding wypłat aktualnie zalogowanego mentora.
 * @returns wynik utworzenia linku Stripe albo bezpieczny kod błędu
 */
export async function startCurrentPayoutOnboarding() {
  const mentor = await getCurrentMentor();
  if (!mentor) return { ok: false as const, code: "not_available" as const };

  const base = appBaseUrl();
  try {
    return await startOnboarding(
      {
        mentorId: mentor.mentorId,
        returnUrl: `${base}/mentor/payouts?stripe=return`,
        refreshUrl: `${base}/mentor/payouts?stripe=refresh`,
      },
      getPaymentsDeps(),
    );
  } catch {
    return { ok: false as const, code: "stripe_error" as const };
  }
}
