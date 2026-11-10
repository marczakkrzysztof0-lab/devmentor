// Strona podsumowania wypłat mentora i stanu konfiguracji Stripe (spec 2026-11-09, ekran S10).
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Skeleton } from "@devmentor/ui";
import { AccessMessage, PageLayout } from "@devmentor/ui/product";
import { getCurrentMentor } from "@/lib/auth/session";
import { loadCurrentPayouts } from "@/lib/payouts/server";
import { startPayoutOnboardingAction } from "./actions";
import { signOutAction } from "../actions";
import { pendingDecisionCount } from "@/lib/requests/mentor-area";
import MentorPayoutsClient from "./MentorPayoutsClient";

type PayoutStatus = "held_for_payout" | "transferring" | "paid" | "failed" | "cancelled";

/** Renderuje stronę podsumowania wypłat mentora.
 * @param props parametry strony Next.js
 * @returns strona wypłat z granicą ładowania
 */
export default function PayoutsPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  return (
    <Suspense fallback={<PageLayout><Skeleton label="Wczytywanie wypłat" lines={6} /></PageLayout>}>
      <PayoutsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PayoutsContent({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  await connection();
  const mentor = await getCurrentMentor();
  if (!mentor) {
    return <PageLayout width="narrow"><AccessMessage kind="invitation-only" /></PageLayout>;
  }

  const data = await loadCurrentPayouts();
  if (!data?.hasPaidRequest && data?.accountState === "none") redirect("/mentor");
  const query = await searchParams;
  const setupStatus = data?.accountState === "ready"
    ? "ready"
    : data?.accountState === "pending" ? "pending" : "none";
  const sessions = (data?.items ?? []).map((item) => ({
    id: item.requestId,
    menteeName: item.menteeFirstName,
    lengthMinutes: item.lengthMinutes as 25 | 50,
    slotStart: new Date(item.slot).toISOString(),
    slotEnd: new Date(new Date(item.slot).getTime() + item.lengthMinutes * 60_000).toISOString(),
    amountMinor: item.shareMinor,
    payoutStatus: (item.status === "paid"
      ? "paid"
      : item.status === "cancelled"
        ? "cancelled"
        : item.status === "transferring"
          ? "transferring"
          : item.status === "failed" ? "failed" : "held_for_payout") as PayoutStatus,
  }));

  return (
    <MentorPayoutsClient
      hasPaidRequest={Boolean(data?.hasPaidRequest)}
      setupStatus={setupStatus}
      detailsSubmitted={Boolean(data?.detailsSubmitted)}
      owedMinor={data?.heldMinor ?? 0}
      paidOutMinor={data?.paidMinor ?? 0}
      currency={data?.currency ?? "PLN"}
      sessions={sessions}
      returnFrom={query.stripe === "return" ? "completed" : query.stripe === "refresh" ? "interrupted" : undefined}
      timeZone="Europe/Warsaw"
      now={new Date()}
      shareUrl=""
      onOpenStripe={startPayoutOnboardingAction}
      signOutAction={signOutAction}
      pendingCount={await pendingDecisionCount()}
    />
  );
}
