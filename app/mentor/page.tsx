// /mentor — s03 bez sesji, s04 (powłoka edytora) z sesją (spec #14 Phase 1). Jedyna bramka to
// `getCurrentMentor()` (DAL); bez sesji: tylko komunikat „Dostęp tylko przez zaproszenie…”, bez formularza,
// bez danych, bez rejestracji. Odczyt sesji za <Suspense> (cacheComponents).
//
// Nawigacja E01 (L7, L10, Z8, Z11): bez „Zapytania” i bez licznika. „Dostępność” dojdzie razem ze stroną
// /mentor/availability (#15, faza 4) — do tego czasu tylko „Strona” i „Wyloguj”.
// Formularz strony (MentorPageForm) dochodzi w fazie 3 (#14 Phase 2).
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Spinner, StateMessage } from "@devmentor/ui";
import { AccessMessage, MentorNav, PageLayout } from "@devmentor/ui/product";
import { getCurrentMentor } from "@/lib/auth/session";
import { signOutAction } from "./actions";

export const metadata: Metadata = {
  title: "Twoja strona — DevMentor",
  robots: { index: false, follow: false },
};

export default function MentorPage() {
  return (
    <Suspense
      fallback={
        <PageLayout width="narrow">
          <Spinner label="Wczytywanie" />
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
  const mentor = await getCurrentMentor();
  if (!mentor) {
    return (
      <PageLayout width="narrow">
        <AccessMessage kind="invitation-only" />
      </PageLayout>
    );
  }
  return (
    <PageLayout nav={<MentorNav current="page" sections={["page"]} signOutAction={signOutAction} />}>
      <section aria-labelledby="editor-title" className="flex max-w-text flex-col gap-between-groups">
        <h1 id="editor-title" className="text-heading-page font-strong">
          Twoja strona
        </h1>
        <StateMessage kind="empty" title="Formularz strony jest w przygotowaniu">
          Tu uzupełnisz imię i nazwisko, link do publicznej pracy, opis doświadczenia i ceny, a potem
          opublikujesz stronę.
        </StateMessage>
      </section>
    </PageLayout>
  );
}
