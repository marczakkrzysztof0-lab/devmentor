// /mentor/availability — s05 tygodniowa dostępność (spec #15), bez sesji s03 (Z15). Jedyna bramka to DAL
// (`loadAvailabilityEditor()` → `getCurrentMentor()`); bez sesji: tylko komunikat „Dostęp tylko przez
// zaproszenie…”, bez danych okien. Odczyt sesji i okien za <Suspense> (cacheComponents) — granica obejmuje
// cały PageLayout, fallback ma własny PageLayout (decyzja po review fazy 2).
//
// - Strefa: zapisana albo (pierwsza wizyta, `timeZone: null`) prefill z przeglądarki w DS, dopasowany do listy
//   serwera; brak/nieobsługiwana → Europe/Warsaw (Q2, Z16). Lista = nazwy, które serwer przyjmuje
//   (`timeZoneOptions()`: Intl.supportedValuesOf tego procesu + UTC).
// - Baner „Nie masz dostępności” i podgląd 10 najbliższych startów w strefie mentora rysuje `AvailabilityEditor`.
// - Nawigacja (od E02 #18): „Zapytania” + licznik, „Strona”, „Dostępność”, „Wyloguj” (E01 bez „Zapytania”: L7, L10, Z11).
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@devmentor/ui";
import { AccessMessage, AvailabilityEditor, MentorNav, PageLayout } from "@devmentor/ui/product";
import { loadAvailabilityEditor } from "@/lib/availability/editor";
import { timeZoneOptions } from "@/lib/availability/zone.mjs";
import { pendingDecisionCount } from "@/lib/requests/mentor-area";
import { signOutAction } from "../actions";
import { saveAvailabilityAction } from "./actions";

export const metadata: Metadata = {
  title: "Dostępność — DevMentor",
  robots: { index: false, follow: false },
};

export default function MentorAvailabilityPage() {
  return (
    <Suspense
      fallback={
        <PageLayout>
          <Skeleton label="Wczytywanie" lines={8} className="max-w-text" />
        </PageLayout>
      }
    >
      <AvailabilityArea />
    </Suspense>
  );
}

async function AvailabilityArea() {
  // Sesja i terminy zależą od bieżącej chwili — zawsze w czasie żądania, nigdy w prefetchu/prerenderze.
  await connection();
  const editor = await loadAvailabilityEditor();
  if (!editor) {
    return (
      <PageLayout width="narrow">
        <AccessMessage kind="invitation-only" />
      </PageLayout>
    );
  }
  return (
    <PageLayout
      nav={<MentorNav current="availability" pendingCount={await pendingDecisionCount()} signOutAction={signOutAction} />}
    >
      <AvailabilityEditor
        timeZone={editor.timeZone}
        zones={timeZoneOptions()}
        windows={editor.windows}
        preview={editor.preview}
        action={saveAvailabilityAction}
      />
    </PageLayout>
  );
}
