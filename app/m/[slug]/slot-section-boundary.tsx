"use client";

// Granica błędu sekcji terminów na /m/[slug] (spec #16 Q5, Edge Cases „Slot loading fails”, krok 4).
//
// Komponent kliencki z konieczności: granice błędów Reacta działają tylko po stronie klienta. `catchError` z
// `next/error` (Next 16.3+, stabilne) zamiast własnej klasy — przepuszcza `notFound()`/`redirect()` i czyści stan
// przy nawigacji. Obejmuje WYŁĄCZNIE sekcję terminów: profil i ceny są poza nią, więc wyjątek ładowarki terminów
// (np. baza niedostępna) daje „Nie udało się wczytać terminów — odśwież stronę”, a profil i ceny zostają.
//
// Jak to działa przy strumieniowaniu: błąd komponentu serwerowego za <Suspense> trafia do ładunku RSC; HTML z
// serwera ma w tym miejscu fallback (szkielet), a po hydracji React rzuca błąd w tej granicy i pokazuje komunikat.
// Szczegóły błędu nie trafiają do przeglądarki (w produkcji Next przekazuje tylko `digest`) i nie są wyświetlane.
import { catchError } from "next/error";
import { SlotSectionMessage } from "./slot-section-states";

function SlotSectionError() {
  return <SlotSectionMessage kind="error" />;
}

export default catchError(SlotSectionError);
