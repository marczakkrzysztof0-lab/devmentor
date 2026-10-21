// Odczyt dostępności mentora z bazy i terminy liczone w czasie żądania (spec #15, Architecture,
// API Contracts `isSlotOffered`, Implementation Plan krok 3).
//
// - Każda funkcja dostaje `db` (pg.Pool albo PoolClient) i id mentora od wywołującego (sesja albo
//   opublikowana strona) — nigdy z danych formularza. Zapytania zawsze zawężone do tego mentora.
// - Terminy są liczone przy każdym wywołaniu przez `listOpenSlots` (jedno źródło prawdy R06) i nigdy nie są
//   zapisywane ani cache'owane: zależą od `now`.
// - `isSlotOffered` to tylko wstępne sprawdzenie (pre-check) przy tworzeniu zapytania (#17). Atomowe
//   zajęcie terminu przy współbieżnych zapytaniach należy do #17 (blokada wiersza mentora w transakcji
//   zapytania) — ta funkcja niczego nie blokuje.
import { isSlotInList, listOpenSlots } from "./slots.mjs";

/**
 * @typedef {import("../db/pool.mjs").Queryable} Queryable
 * @typedef {import("./slots.mjs").AvailabilityWindow} AvailabilityWindow
 * @typedef {import("./slots.mjs").BusyInterval} BusyInterval
 * @typedef {import("./slots.mjs").OpenSlot} OpenSlot
 */

/**
 * Strefa i okna mentora. Nieznany mentor albo mentor bez zapisu → `{ timeZone: null, windows: [] }`.
 * Okna posortowane po dniu tygodnia, początku, końcu.
 * @param {{ db: Queryable, mentorId: string }} input
 * @returns {Promise<{ timeZone: string | null, windows: AvailabilityWindow[] }>}
 */
export async function loadAvailability({ db, mentorId }) {
  const { rows: mentorRows } = await db.query("select time_zone from mentors where id = $1", [mentorId]);
  const { rows } = await db.query(
    `select weekday, start_minute, end_minute
       from availability_windows
      where mentor_id = $1
      order by weekday, start_minute, end_minute`,
    [mentorId],
  );
  return {
    timeZone: mentorRows[0]?.time_zone ?? null,
    windows: rows.map((row) => ({
      weekday: Number(row.weekday),
      startMinute: Number(row.start_minute),
      endMinute: Number(row.end_minute),
    })),
  };
}

/**
 * Wolne terminy mentora (wynik `listOpenSlots` na danych z bazy), liczone w czasie żądania.
 * @param {{ db: Queryable, mentorId: string, now: Date | string | number, busy?: ReadonlyArray<BusyInterval> }} input
 * @returns {Promise<OpenSlot[]>}
 */
export async function listOpenSlotsForMentor({ db, mentorId, now, busy = [] }) {
  const { timeZone, windows } = await loadAvailability({ db, mentorId });
  return listOpenSlots({ windows, timeZone, now, busy });
}

/**
 * Czy dokładnie ten termin (ta sama chwila startu, ta sama długość) jest teraz oferowany przez mentora.
 * Wstępne sprawdzenie R06 po stronie serwera; atomowe zajęcie terminu robi #17 (nie ta funkcja).
 * @param {{
 *   db: Queryable,
 *   mentorId: string,
 *   startsAt: Date | string | number,
 *   lengthMinutes: number,
 *   now: Date | string | number,
 *   busy?: ReadonlyArray<BusyInterval>,
 * }} input
 * @returns {Promise<boolean>}
 */
export async function isSlotOffered({ db, mentorId, startsAt, lengthMinutes, now, busy = [] }) {
  const slots = await listOpenSlotsForMentor({ db, mentorId, now, busy });
  return isSlotInList(slots, { startsAt, lengthMinutes });
}

/**
 * Czy mentor ma zapisane jakiekolwiek okno (podstawa komunikatu „Nie masz dostępności”).
 * @param {{ db: Queryable, mentorId: string }} input
 * @returns {Promise<boolean>}
 */
export async function hasAvailabilityWindows({ db, mentorId }) {
  const { rows } = await db.query(
    "select exists (select 1 from availability_windows where mentor_id = $1) as has",
    [mentorId],
  );
  return rows[0].has === true;
}
