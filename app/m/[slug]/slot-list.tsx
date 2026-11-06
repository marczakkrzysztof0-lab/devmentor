"use client";

// Fallback sekcji terminów na /m/[slug] (spec #16 Q5, Z28; od #17 sekcja to formularz zapytania —
// `request-form.tsx`, a lista terminów jest jego częścią: DS `RequestForm` → `SlotList selectable`).
import { useSyncExternalStore } from "react";
import { SlotSectionMessage, SlotsSkeleton } from "./slot-section-states";

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
