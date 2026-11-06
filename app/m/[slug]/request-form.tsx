"use client";

// Formularz zapytania opłaconego z góry na /m/[slug] (spec #17 UI/UX, F4; ekran s06 z formularzem).
//
// DS `RequestForm`: długość → termin (każda godzina z listy #16 to radio tego formularza — F4, bez osobnego
// „Zarezerwuj”) → imię → pytanie → „Zapłać {kwota} i wyślij pytanie”. Po `{ ok: true, checkoutUrl }` przeglądarka
// przechodzi do Stripe Checkout. `slot_taken` / `slot_not_offered` → `router.refresh()` odświeża listę terminów
// (serwer liczy je od nowa z zajętymi przedziałami), wpisane pytanie zostaje.
//
// Strefa widza jak w #16 (`useSyncExternalStore`, migawka serwera `null`): HTML z serwera i hydracja pokazują
// szkielet terminów (pola formularza są od razu), po hydracji — godziny w strefie przeglądarki (fallback UTC).
// Do klienta trafia tylko lista ISO terminów, publiczne ceny i slug (bez id mentora i okien).
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { RequestForm, type OpenSlot } from "@devmentor/ui/product";
import { startRequestAction } from "./actions";

const noSubscription = () => () => {};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export type RequestFormClientProps = {
  slug: string;
  slots: OpenSlot[];
  price25Minor: number;
  price50Minor: number;
  currency: string;
};

export function RequestFormClient({ slug, slots, price25Minor, price50Minor, currency }: RequestFormClientProps) {
  const router = useRouter();
  const zone = useSyncExternalStore(noSubscription, browserTimeZone, () => null);
  return (
    <RequestForm
      slug={slug}
      slots={slots}
      slotsState={zone === null ? "loading" : "ready"}
      timeZone={zone || undefined}
      price25Minor={price25Minor}
      price50Minor={price50Minor}
      currency={currency}
      action={startRequestAction}
      onRefreshSlots={() => router.refresh()}
    />
  );
}
