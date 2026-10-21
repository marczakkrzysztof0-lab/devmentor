"use server";
// Server action edytora /mentor/availability (spec #15 API Contracts `saveAvailability`). Akcja sama sprawdza
// sesję (`getCurrentMentor()` w `saveCurrentMentorAvailability`), bo server action jest osiągalna bezpośrednim
// POST-em (data-security.md); id mentora nigdy nie przychodzi z klienta.
import { refresh } from "next/cache";
import { saveCurrentMentorAvailability, type SaveAvailabilityActionResult } from "@/lib/availability/editor";

/**
 * `saveAvailability({ timeZone, windows })` w kształcie propa `action` komponentu DS `AvailabilityEditor`:
 * `(input: { timeZone: string; windows: AvailabilityWindow[] })` — okna z dniem 0–6 (poniedziałek = 0)
 * i godzinami „HH:MM” (koniec do „24:00”), nie FormData. Argument jest niezaufany: brane są tylko `timeZone`
 * i `windows`. Wynik: `{ ok: true, preview }` (10 najbliższych godzin startu) | `{ ok: false, errors }`
 * (`timeZone`, `windows` — np. „Maksymalnie 21 okien w tygodniu”, `windows.<i>`; nic nie zapisane) |
 * `{ ok: false, reason: "unauthorized" }` (brak / wygasła / odwołana sesja — nic nie zapisane; L6/Z7).
 */
export async function saveAvailabilityAction(input: unknown): Promise<SaveAvailabilityActionResult> {
  const result = await saveCurrentMentorAvailability(input);
  // Dostępność nie jest w cache (odczyt w czasie żądania), więc wystarcza `refresh()` (server-actions.md):
  // świeży RSC payload (podgląd, baner „Nie masz dostępności” na /mentor). Tylko po udanym zapisie.
  if (result.ok) refresh();
  return result;
}
