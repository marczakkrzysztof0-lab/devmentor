// /mentor — s03 bez sesji, s04 edytor strony z sesją (spec #14 Phase 2). Jedyna bramka to DAL
// (`loadMentorPageEditor()` → `getCurrentMentor()`); bez sesji: tylko komunikat „Dostęp tylko przez
// zaproszenie…”, bez formularza, bez danych, bez rejestracji. Odczyt sesji i strony za <Suspense>
// (cacheComponents) — granica obejmuje cały PageLayout, fallback ma własny PageLayout.
//
// Nawigacja (od E02 #18): „Zapytania” + licznik czekających na decyzję, „Strona”, „Dostępność”, „Wyloguj”
// (wcześniej E01 bez „Zapytania”: L7, L10, Z8, Z11).
//
// Baner „Nie masz dostępności — nikt nie może wybrać terminu” (#15 story 3), gdy mentor nie ma żadnego okna —
// także na szkicu przy pierwszej wizycie (L20, Z21). Kolejność w DOM: nagłówek → komunikaty o wypłatach i dostępności
// → panel linku → formularz (`MentorPageForm notice`).
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@devmentor/ui";
import {
  AccessMessage,
  MentorNav,
  MentorPageForm,
  NoAvailabilityNotice,
  PageLayout,
  PayoutSetupPrompt,
} from "@devmentor/ui/product";
import { PayoutsReadyLine } from "../../packages/ui/src/product/e04/PayoutSetupPrompt";
import { loadMentorPageEditor } from "@/lib/mentor-page/editor";
import { pendingDecisionCount } from "@/lib/requests/mentor-area";
import { saveMentorPageAction, signOutAction } from "./actions";
import { loadCurrentPayoutPrompt } from "@/lib/payouts/server";
import { startPayoutOnboardingAction } from "./payouts/actions";

export const metadata: Metadata = {
  title: "Twoja strona — DevMentor",
  robots: { index: false, follow: false },
};

export default function MentorPage() {
  // Granica <Suspense> obejmuje cały PageLayout (jak /invite i /sign-in): fallback i treść mają każde własny
  // <main>, więc nagłówek nigdy nie trafia poza landmark, także zanim strumień podmieni fallback.
  return (
    <Suspense
      fallback={
        <PageLayout>
          <Skeleton label="Wczytywanie" lines={6} className="max-w-text" />
        </PageLayout>
      }
    >
      <MentorArea />
    </Suspense>
  );
}

async function MentorArea() {
  // Stan sesji zależy od bieżącej chwili (wygaśnięcie) — zawsze w czasie żądania, nigdy w prefetchu/prerenderze.
  await connection();
  const editor = await loadMentorPageEditor();
  if (!editor) {
    return (
      <PageLayout width="narrow">
        <AccessMessage kind="invitation-only" />
      </PageLayout>
    );
  }
  const payoutSummary = await loadCurrentPayoutPrompt();
  return (
    <PageLayout nav={<MentorNav current="page" pendingCount={await pendingDecisionCount()} signOutAction={signOutAction} />}>
      <MentorPageForm
        initial={editor.initial}
        published={editor.published}
        slugIsPlaceholder={editor.slugIsPlaceholder}
        shareUrl={editor.shareUrl}
        baseUrl={editor.baseUrl}
        currencyLabel={editor.currencyLabel}
        notice={
          <>
            {payoutSummary?.askForPayouts ? <PayoutSetupPrompt action={startPayoutOnboardingAction} /> : null}
            {payoutSummary?.hasPaidRequest && payoutSummary.accountState === "ready" ? <PayoutsReadyLine /> : null}
            {!editor.hasWindows ? <NoAvailabilityNotice /> : null}
          </>
        }
        action={saveMentorPageAction}
      />
    </PageLayout>
  );
}
