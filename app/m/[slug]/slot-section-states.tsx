// Stany sekcji terminów na /m/[slug], w których NIE pokazujemy godzin (spec #16 UI/UX, Edge Cases; ekran s06):
// wczytywanie, brak terminów, błąd wczytania, brak sieci. Czysty znacznik z DS (bez "use client") — używany przez
// stronę (serwer), fallback <Suspense>, granicę błędu i komponent kliencki listy.
//
// Nagłówek bez strefy widza: strefę drukujemy tylko nad listą godzin (D3 — „strefa nazwana raz nad listą”), a tu
// godzin nie ma. Ten sam układ co DS `SlotList` (sekcja z h2 `slots-heading`), żeby podmiana stanu nie przesuwała
// treści. Kompozycja odtworzona w Storybooku: `packages/ui/.storybook/screens.tsx` (`ShareProfileScreen`).
import type { ReactNode } from "react";
import { Skeleton, StateMessage } from "@devmentor/ui";
import { NETWORK_LOAD_MESSAGE } from "@devmentor/ui/product";

export const SLOTS_HEADING = "Najbliższe terminy";
export const SLOTS_EMPTY_MESSAGE = "Brak wolnych terminów w najbliższych 14 dniach";
export const SLOTS_ERROR_MESSAGE = "Nie udało się wczytać terminów — odśwież stronę";

function SlotSectionFrame({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby="slots-heading" aria-busy={busy || undefined} className="flex flex-col gap-in-group">
      <h2 id="slots-heading" className="text-heading-section font-strong">
        {SLOTS_HEADING}
      </h2>
      {children}
    </section>
  );
}

/** Wczytywanie terminów (fallback <Suspense> i chwila przed poznaniem strefy przeglądarki). */
export function SlotsSkeleton() {
  return (
    <SlotSectionFrame busy>
      <Skeleton label="Wczytywanie terminów" />
    </SlotSectionFrame>
  );
}

/**
 * Sekcja bez godzin: `empty` — mentor nie ma terminów (brak okien albo okna bez strefy, P2/Z38; #15 AC),
 * `error` — wczytanie się nie udało (granica błędu), `offline` — brak sieci podczas wczytywania (Z28, C6).
 */
export function SlotSectionMessage({ kind }: { kind: "empty" | "error" | "offline" }) {
  const title = kind === "empty" ? SLOTS_EMPTY_MESSAGE : kind === "error" ? SLOTS_ERROR_MESSAGE : NETWORK_LOAD_MESSAGE;
  return (
    <SlotSectionFrame>
      <StateMessage kind={kind === "empty" ? "empty" : "error"} titleAs="h3" title={title} className="py-0" />
    </SlotSectionFrame>
  );
}
