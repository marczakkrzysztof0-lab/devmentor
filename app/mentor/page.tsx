// /mentor — s03 bez sesji, s04 edytor strony z sesją (spec #14 Phase 2). Jedyna bramka to DAL
// (`loadMentorPageEditor()` → `getCurrentMentor()`); bez sesji: tylko komunikat „Dostęp tylko przez
// zaproszenie…”, bez formularza, bez danych, bez rejestracji. Odczyt sesji i strony za <Suspense>
// (cacheComponents) — granica obejmuje cały PageLayout, fallback ma własny PageLayout.
//
// Nawigacja E01 (L7, L10, Z8, Z11): bez „Zapytania” i bez licznika. „Dostępność” dojdzie razem ze stroną
// /mentor/availability (#15, faza 4) — do tego czasu tylko „Strona” i „Wyloguj”. Bez wzmianki o wypłatach (Z36).
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@devmentor/ui";
import { AccessMessage, MentorNav, MentorPageForm, PageLayout } from "@devmentor/ui/product";
import { loadMentorPageEditor } from "@/lib/mentor-page/editor";
import { saveMentorPageAction, signOutAction } from "./actions";

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
  return (
    <PageLayout nav={<MentorNav current="page" sections={["page"]} signOutAction={signOutAction} />}>
      <MentorPageForm
        initial={editor.initial}
        published={editor.published}
        slugIsPlaceholder={editor.slugIsPlaceholder}
        shareUrl={editor.shareUrl}
        baseUrl={editor.baseUrl}
        currencyLabel={editor.currencyLabel}
        action={saveMentorPageAction}
      />
    </PageLayout>
  );
}
