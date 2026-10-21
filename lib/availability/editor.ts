// Dostępność bieżącego mentora dla edytora `/mentor/availability` i jego server action (spec #15) — tylko serwer.
//
// - Id mentora wyłącznie z sesji (`getCurrentMentor()`); bez sesji: `null` / `unauthorized`, baza nietknięta
//   (L6/Z7, L14/Z15).
// - Logika i SQL: `lib/availability/save.mjs`, `lib/availability/queries.mjs` (testowane przez `node --test`).
// - Okna w kształcie DS `AvailabilityWindow` (dzień 0–6, poniedziałek = 0; „HH:MM”, koniec do „24:00”) —
//   mapowanie z/do ISO 1–7 i minut w `save.mjs` (luka DS D8).
import "server-only";
import { getCurrentMentor } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { loadAvailability } from "./queries.mjs";
import { listOpenSlots } from "./slots.mjs";
import {
  fromEditorInput,
  previewSlots,
  saveAvailabilityForSession,
  toEditorWindows,
  type AvailabilityErrors,
  type EditorWindow,
} from "./save.mjs";

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type SessionLength = 25 | 50;

/** Okno jak DS `AvailabilityWindow`. */
export type AvailabilityEditorWindow = { weekday: Weekday; start: string; end: string };
/** Termin jak DS `OpenSlot` (`startsAt` w UTC ISO). */
export type AvailabilityPreviewSlot = { startsAt: string; lengthMinutes: SessionLength };

/**
 * Wynik zapisu dla klienta (spec #15 API Contracts; `unauthorized` = L6/Z7). Przypisywalny do DS
 * `SaveAvailabilityResult` (`{ ok: true; preview } | { ok: false }`); `errors` i `reason` DS jeszcze nie
 * pokazuje (luka D5, część dostępności — zadanie 4.5). Klucze `errors`: `timeZone`, `windows` (cały zestaw,
 * np. „Maksymalnie 21 okien w tygodniu”), `windows.<i>` (okno o indeksie i w wysłanej liście).
 */
export type SaveAvailabilityActionResult =
  | { ok: true; preview: AvailabilityPreviewSlot[] }
  | { ok: false; errors: AvailabilityErrors }
  | { ok: false; reason: "unauthorized" };

/** Dane startowe edytora dostępności (dla `AvailabilityEditor`, zadanie 4.5). */
export type AvailabilityEditorData = {
  /** Zapisana strefa (kanoniczna) albo `null`, gdy mentor jeszcze nie zapisał dostępności (prefill z przeglądarki, Z16). */
  timeZone: string | null;
  windows: AvailabilityEditorWindow[];
  /** Najbliższe 10 godzin startu (obie długości), liczone teraz. */
  preview: AvailabilityPreviewSlot[];
  /** Czy mentor ma jakiekolwiek okno (baner „Nie masz dostępności”, story 3). */
  hasWindows: boolean;
};

const asEditorWindows = (windows: EditorWindow[]) => windows as AvailabilityEditorWindow[];
const asPreview = (slots: { startsAt: string; lengthMinutes: number }[]) => slots as AvailabilityPreviewSlot[];

/**
 * Dostępność zalogowanego mentora albo `null` bez sesji (wtedy strona pokazuje „Dostęp tylko przez
 * zaproszenie…”, bez danych okien — Z15). Odczyt żądania — wołaj za <Suspense>, po `connection()`.
 */
export async function loadAvailabilityEditor(): Promise<AvailabilityEditorData | null> {
  const mentor = await getCurrentMentor();
  if (!mentor) return null;
  const { timeZone, windows } = await loadAvailability({ db: getPool(), mentorId: mentor.mentorId });
  return {
    timeZone,
    windows: asEditorWindows(toEditorWindows(windows)),
    preview: asPreview(previewSlots(listOpenSlots({ windows, timeZone, now: new Date() }))),
    hasWindows: windows.length > 0,
  };
}

/**
 * Zapis dostępności bieżącego mentora (wołany z server action). Wejście to niezaufane dane od klienta
 * w kształcie DS (`{ timeZone, windows: AvailabilityWindow[] }`): brane są tylko `timeZone` i `windows`.
 */
export async function saveCurrentMentorAvailability(input: unknown): Promise<SaveAvailabilityActionResult> {
  const mentor = await getCurrentMentor();
  const result = await saveAvailabilityForSession({ db: getPool(), mentor, input: fromEditorInput(input) });
  if (result.ok) return { ok: true, preview: asPreview(result.preview) };
  return result;
}
