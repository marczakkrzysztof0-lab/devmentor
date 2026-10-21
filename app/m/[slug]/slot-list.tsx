"use client";

// Lista wolnych terminów na /m/[slug] w strefie WIDZA (spec #16 Proposed Solution, story 1–2; ekran s06).
//
// Komponent kliencki z konieczności: strefę widza zna tylko przeglądarka, a przełącznik 25/50 zmienia listę bez
// sieci (Z28 — po wczytaniu strony zmiana długości nie wysyła żadnego żądania). Dostaje WYŁĄCZNIE listę
// `{ startsAt: UTC ISO, lengthMinutes }` i publiczne ceny — bez id mentora, okien i strefy mentora.
//
// Hydracja: serwer nie zna strefy widza, więc godziny (i nagłówek ze strefą) NIE są renderowane na serwerze.
// `useSyncExternalStore` z migawką serwera `null`: HTML z serwera i pierwszy render przy hydracji pokazują ten sam
// szkielet „Wczytywanie terminów”, a zaraz po hydracji React renderuje listę w strefie przeglądarki — bez
// niezgodności hydracji, bez `suppressHydrationWarning` i bez chwilowego pokazania złych godzin (np. w UTC).
// Brak strefy w przeglądarce albo strefa, której nie obsługuje formatter → UTC z etykietą „UTC” (DS `SlotList`
// przez `resolveTimeZone`).
//
// Reguła E1 (Z1/F3): żadna godzina nie jest kontrolką — `SlotList selectable={false}` renderuje tekst (bez `a` i
// `button`). Przełącznik długości to grupa radiowa (DS `LengthToggle`, role="radio"). Grupowanie po dniu z
// „Pokaż więcej (k)” i strzałki w przełączniku — zadanie 6.2.
import { useState, useSyncExternalStore } from "react";
import { LengthToggle, SlotList, type OpenSlot, type SessionLength } from "@devmentor/ui/product";
import { SlotSectionMessage, SlotsSkeleton } from "./slot-section-states";

const noSubscription = () => () => {};

/** Strefa przeglądarki; "" gdy brak albo `Intl` rzuca (wtedy `SlotList` pokaże UTC). */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export type SlotListClientProps = {
  slots: OpenSlot[];
  price25Minor: number;
  price50Minor: number;
  currency: string;
};

export function SlotListClient({ slots, price25Minor, price50Minor, currency }: SlotListClientProps) {
  const [length, setLength] = useState<SessionLength>(25);
  // Serwer i hydracja: `null` (strefa nieznana) → szkielet; po hydracji: strefa przeglądarki.
  const zone = useSyncExternalStore(noSubscription, browserTimeZone, () => null);

  return (
    <div className="flex flex-col gap-between-groups">
      <LengthToggle
        price25Minor={price25Minor}
        price50Minor={price50Minor}
        currency={currency}
        value={length}
        onValueChange={setLength}
      />
      {zone === null ? <SlotsSkeleton /> : <SlotList slots={slots} length={length} timeZone={zone || undefined} selectable={false} />}
    </div>
  );
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Fallback <Suspense> sekcji terminów: szkielet, a gdy przeglądarka straci sieć zanim terminy dotrą (strumień
 * się urwał) — komunikat braku sieci w SAMEJ sekcji terminów (Z28, C6). Profil i ceny są poza tą sekcją i zostają.
 * Serwer i hydracja zakładają „online” (ten sam HTML).
 */
export function SlotsLoading() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  return online ? <SlotsSkeleton /> : <SlotSectionMessage kind="offline" />;
}
