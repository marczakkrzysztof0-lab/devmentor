// Silnik wolnych terminów (spec #15, Q2–Q4, Q6, Proposed Solution, API Contracts `listOpenSlots`).
//
// Czysty moduł (bez bazy): terminy są liczone, nigdy zapisywane. Jedno źródło prawdy dla R06 — z tej funkcji
// korzystają podgląd w edytorze (#15), publiczna strona (#16) i sprawdzenie przy tworzeniu zapytania (#17).
//
// Reguły (DST zgodnie ze spec #15):
// - Okna to czas ścienny w strefie mentora; dla każdej lokalnej daty w tej strefie okna z jej dnia tygodnia
//   łączymy w rozłączne przedziały (18:00–19:00 + 19:00–20:00 → 18:00–20:00; nakładające się też).
// - Kandydaci to lokalne pełne i wpół do (:00/:30) wewnątrz przedziału, przeliczone na UTC:
//   czas w luce wiosennej → brak terminu; czas powtórzony jesienią → pierwsze wystąpienie (bez duplikatów).
// - Termin mieści się, gdy start + rzeczywista długość (minuty upływu) ≤ koniec przedziału w UTC.
//   Koniec przedziału = pierwsza chwila, w której zegar pokazuje godzinę końca (`zonedWallTimeLowerBound`):
//   koniec powtórzony → pierwsze wystąpienie (ostrożnie: termin nie wychodzi poza to, co pokazuje zegar);
//   koniec w luce → moment przestawienia zegara.
// - start ≥ now + minNoticeMinutes (granica włącznie), start < now + horizonDays × 24 h (granica wyłączona),
//   brak części wspólnej z żadnym przedziałem `busy` (półotwarte [startsAt, endsAt); przyleganie nie koliduje).
// - Brak strefy (lub strefa nieobsługiwana) albo brak okien → [].
// Horyzont to 14 × 24 h upływu od `now`, nie 14 dób kalendarzowych: przy zmianie czasu w horyzoncie granica
// wypada o godzinę wcześniej/później na zegarze mentora (P1, Z37 — patrz testy).

import {
  canonicalTimeZone,
  DAY_MS,
  localDateParts,
  MINUTE_MS,
  toMs,
  zonedWallTimeLowerBound,
  zonedWallTimeToInstants,
} from "./zone.mjs";

/** Minimalne wyprzedzenie terminu — jedna stała dla wszystkich specyfikacji (Q4). */
export const MIN_NOTICE_MINUTES = 180;
/** Siatka startów w czasie lokalnym mentora (:00/:30). */
export const SLOT_GRID_MINUTES = 30;
/** Horyzont oferowania terminów w dniach (dobach po 24 h od `now`). */
export const HORIZON_DAYS = 14;
/** Długości sesji w minutach (R01). */
export const SESSION_LENGTHS = /** @type {const} */ ([25, 50]);

/**
 * @typedef {{ weekday: number, startMinute: number, endMinute: number }} AvailabilityWindow
 *   `weekday` ISO 1–7 (poniedziałek = 1), minuty od północy czasu lokalnego mentora (koniec ≤ 1440).
 * @typedef {{ startsAt: Date | string | number, endsAt: Date | string | number }} BusyInterval
 * @typedef {{ startsAt: string, lengthMinutes: 25 | 50 }} OpenSlot  `startsAt` — UTC ISO.
 */

/**
 * Łączy przedziały [start, end) w rozłączne, rosnąco; przylegające (koniec = początek) też się łączą.
 * @param {ReadonlyArray<{ start: number, end: number }>} intervals
 * @returns {Array<{ start: number, end: number }>}
 */
export function mergeIntervals(intervals) {
  const sorted = intervals.filter((i) => i.end > i.start).map((i) => ({ start: i.start, end: i.end }));
  sorted.sort((a, b) => a.start - b.start || a.end - b.end);
  /** @type {Array<{ start: number, end: number }>} */
  const merged = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push(interval);
  }
  return merged;
}

/** @param {AvailabilityWindow} w */
function isValidWindow(w) {
  return (
    w != null &&
    Number.isInteger(w.weekday) &&
    w.weekday >= 1 &&
    w.weekday <= 7 &&
    Number.isInteger(w.startMinute) &&
    Number.isInteger(w.endMinute) &&
    w.startMinute >= 0 &&
    w.endMinute <= 1440 &&
    w.endMinute > w.startMinute
  );
}

/**
 * Wolne terminy mentora w horyzoncie, posortowane po `startsAt`, potem po długości.
 * @param {{
 *   windows: ReadonlyArray<AvailabilityWindow> | null | undefined,
 *   timeZone: string | null | undefined,
 *   now: Date | string | number,
 *   horizonDays?: number,
 *   minNoticeMinutes?: number,
 *   busy?: ReadonlyArray<BusyInterval>,
 * }} input
 * @returns {OpenSlot[]}
 */
export function listOpenSlots({
  windows,
  timeZone,
  now,
  horizonDays = HORIZON_DAYS,
  minNoticeMinutes = MIN_NOTICE_MINUTES,
  busy = [],
}) {
  const zone = canonicalTimeZone(timeZone);
  const valid = (windows ?? []).filter(isValidWindow);
  if (!zone || valid.length === 0) return [];

  const nowMs = toMs(now);
  const earliest = nowMs + minNoticeMinutes * MINUTE_MS;
  const horizonEnd = nowMs + horizonDays * DAY_MS;
  const busyMs = busy.map((b) => ({ start: toMs(b.startsAt), end: toMs(b.endsAt) }));

  /** @type {Map<number, Array<{ start: number, end: number }>>} */
  const byWeekday = new Map();
  for (const w of valid) {
    const list = byWeekday.get(w.weekday) ?? [];
    list.push({ start: w.startMinute, end: w.endMinute });
    byWeekday.set(w.weekday, list);
  }
  for (const [weekday, list] of byWeekday) byWeekday.set(weekday, mergeIntervals(list));

  // Lokalne daty w strefie mentora od dnia `now` do dnia granicy horyzontu (włącznie).
  const first = localDateParts(nowMs, zone);
  const last = localDateParts(horizonEnd, zone);
  const lastDate = Date.UTC(last.year, last.month - 1, last.day);

  /** @type {Array<{ ms: number, lengthMinutes: 25 | 50 }>} */
  const found = [];
  const seen = new Set();
  for (let date = Date.UTC(first.year, first.month - 1, first.day); date <= lastDate; date += DAY_MS) {
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const weekday = ((d.getUTCDay() + 6) % 7) + 1;
    for (const interval of byWeekday.get(weekday) ?? []) {
      const endMs = zonedWallTimeLowerBound(year, month, day, interval.end, zone);
      const firstCandidate = Math.ceil(interval.start / SLOT_GRID_MINUTES) * SLOT_GRID_MINUTES;
      for (let minute = firstCandidate; minute < interval.end; minute += SLOT_GRID_MINUTES) {
        const instants = zonedWallTimeToInstants(year, month, day, minute, zone);
        if (instants.length === 0) continue; // luka wiosenna: ten czas nie istnieje
        const startMs = instants[0].getTime(); // czas powtórzony: pierwsze wystąpienie
        if (startMs < earliest || startMs >= horizonEnd) continue;
        for (const lengthMinutes of SESSION_LENGTHS) {
          const slotEnd = startMs + lengthMinutes * MINUTE_MS;
          if (slotEnd > endMs) continue;
          if (busyMs.some((b) => startMs < b.end && b.start < slotEnd)) continue;
          const key = `${startMs}/${lengthMinutes}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ ms: startMs, lengthMinutes });
        }
      }
    }
  }

  found.sort((a, b) => a.ms - b.ms || a.lengthMinutes - b.lengthMinutes);
  return found.map((s) => ({ startsAt: new Date(s.ms).toISOString(), lengthMinutes: s.lengthMinutes }));
}

/**
 * Czy dokładnie ten termin (ta sama chwila startu i ta sama długość) jest na liście — podstawa `isSlotOffered` (#17).
 * Chwile porównujemy jako instanty, więc „…T16:00:00Z” i „…T16:00:00.000Z” to ten sam start.
 * @param {ReadonlyArray<{ startsAt: string, lengthMinutes: number }>} slots
 * @param {{ startsAt: Date | string | number, lengthMinutes: number }} slot
 */
export function isSlotInList(slots, slot) {
  let ms;
  try {
    ms = toMs(slot.startsAt);
  } catch {
    return false;
  }
  return slots.some((s) => s.lengthMinutes === slot.lengthMinutes && Date.parse(s.startsAt) === ms);
}
