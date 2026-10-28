// /mentor/requests — lista zapytań mentora (spec #18 „Screens”; ekran S8 w Storybooku). Jedyna bramka to DAL
// (`loadMentorRequests()` → `getCurrentMentor()`); bez sesji: „Dostęp tylko przez zaproszenie…”, bez danych.
//
// - Grupy DS `RequestList`: „Czeka na decyzję” (wg terminu, także „Termin minął”), „Zaakceptowane”, „Zakończone”
//   (odrzucone, przeterminowane, anulowane — ostatnie 30 dni). Nigdy nieopłacone (#17).
// - Pusty stan: „Nie masz jeszcze zapytań — udostępnij swój link” z linkiem; błąd odczytu: „Nie udało się wczytać
//   zapytań — odśwież” (bez częściowych danych).
// - Licznik tylko w nawigacji (R01.6, P19). Odczyt w czasie żądania, za <Suspense> obejmującym cały PageLayout.
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@devmentor/ui";
import { AccessMessage, MentorNav, PageLayout, RequestList } from "@devmentor/ui/product";
import { loadMentorRequests } from "@/lib/requests/mentor-area";
import { signOutAction } from "../actions";

export const metadata: Metadata = {
  title: "Zapytania — DevMentor",
  robots: { index: false, follow: false },
};

export default function MentorRequestsPage() {
  return (
    <Suspense
      fallback={
        <PageLayout>
          <Skeleton label="Wczytywanie zapytań" lines={5} className="max-w-text" />
        </PageLayout>
      }
    >
      <RequestsArea />
    </Suspense>
  );
}

async function RequestsArea() {
  await connection();
  const data = await loadMentorRequests();
  if (!data) {
    return (
      <PageLayout width="narrow">
        <AccessMessage kind="invitation-only" />
      </PageLayout>
    );
  }
  return (
    <PageLayout nav={<MentorNav current="requests" pendingCount={data.pendingCount} signOutAction={signOutAction} />}>
      <h1 className="text-heading-page font-strong">Zapytania</h1>
      <RequestList requests={data.requests} state={data.state} timeZone={data.timeZone} now={data.now} shareUrl={data.shareUrl} />
    </PageLayout>
  );
}
