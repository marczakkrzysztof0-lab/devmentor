// Zapis tygodniowej dostępności mentora (spec #15, API Contracts `saveAvailability`, Q2, Q5, Q7, Edge Cases;
// L6/Z7, L16/Z17, W4/Z26; mapowanie dni luki DS D8).
//
// Czysta logika domenowa bez Next.js: funkcje dostają `db` (pg.Pool albo PoolClient) i `now`, więc testy
// `node --test` sterują bazą i czasem. Wrapper server-only: `lib/availability/editor.ts`, server action:
// `app/mentor/availability/actions.ts`.
//
// Zasady:
// - Id mentora WYŁĄCZNIE od wywołującego (sesja). Z wejścia bierzemy tylko `timeZone` i `windows`
//   (z okien tylko `weekday`, `startMinute`, `endMinute`); inne klucze (np. `mentorId`) są pomijane.
// - Walidacja przed zapisem; jakikolwiek błąd → `{ ok: false, errors }` i NIC się nie zmienia.
//   Błędy w płaskiej mapie (jak `FieldErrors` w DS): `timeZone`, `windows` (cały zestaw, np. limit 21)
//   i `windows.<i>` (okno o indeksie i w wysłanej liście — UI pokazuje je przy wierszu, W4/Z26).
// - Zapis to atomowa zamiana całego zestawu w jednej transakcji: delete okien mentora → insert nowych →
//   update `mentors.time_zone` (nazwa kanoniczna) i `updated_at`. Brak osobnego kroku publikacji (Q5):
//   po zapisie okna od razu działają. Usunięcie okna nie dotyka istniejących zapytań (Q7, E02).
// - Blokady (Edge Cases: „saveAvailability does not take the mentor row lock that #17 uses”): NIE robimy
//   `select … from mentors for update`. Dwa równoległe zapisy tego samego mentora (dwie karty) serializuje
//   transakcyjna blokada doradcza (`pg_advisory_xact_lock`) na id mentora — inaczej oba delete mogłyby
//   minąć się z insertami drugiej transakcji i zostawić sumę obu zestawów. `update mentors` jest ostatnim
//   poleceniem transakcji, więc niejawna blokada wiersza z UPDATE trwa tylko do natychmiastowego COMMIT.
// - Zmiana strefy zachowuje czas ścienny okien (te same dni i minuty w nowej strefie) — Edge Cases.
import { withTransaction } from "../db/pool.mjs";
import { listOpenSlots, SLOT_GRID_MINUTES } from "./slots.mjs";
import { canonicalTimeZone } from "./zone.mjs";

/** Maksymalna liczba okien w tygodniu (L16, Z17). */
export const MAX_WINDOWS = 21;
/** Ile najbliższych godzin startu pokazuje podgląd po zapisie (DS `SlotPreview limit=10`). */
export const PREVIEW_LIMIT = 10;
const MINUTES_PER_DAY = 1440;

/** Przestrzeń kluczy blokad doradczych zapisu dostępności (pierwszy argument pg_advisory_xact_lock(int, int)). */
export const AVAILABILITY_LOCK_NAMESPACE = 15_0004;

/** Komunikaty błędów (po polsku, neutralne płciowo — C12, W2/Z24). */
export const MESSAGES = Object.freeze({
  timeZone: "Wybierz strefę czasową z listy",
  tooManyWindows: `Maksymalnie ${MAX_WINDOWS} okien w tygodniu`,
  windowsList: "Nie udało się odczytać okien — odśwież stronę i spróbuj ponownie",
  window: "Nieprawidłowe okno — usuń je i dodaj ponownie",
  weekday: "Nieprawidłowy dzień tygodnia",
  grid: "Godziny okna co 30 minut, od 00:00 do 24:00",
  endAfterStart: "Koniec okna musi być po jego początku",
});

/**
 * Okno w bazie i domenie: ISO dzień tygodnia (poniedziałek = 1) i minuty od północy w strefie mentora.
 * @typedef {import("./slots.mjs").AvailabilityWindow} AvailabilityWindow
 * @typedef {import("./slots.mjs").OpenSlot} OpenSlot
 * @typedef {import("../db/pool.mjs").Queryable} Queryable
 */

/**
 * Okno w kształcie DS `AvailabilityWindow`: dzień 0–6 (poniedziałek = 0), godziny „HH:MM”, koniec do „24:00”.
 * @typedef {{ weekday: number, start: string, end: string }} EditorWindow
 */

/**
 * Błędy zapisu: `timeZone`, `windows` (cały zestaw) i `windows.<i>` (okno o indeksie i).
 * @typedef {Partial<Record<string, string>>} AvailabilityErrors
 */

/**
 * @typedef {{ ok: true, preview: OpenSlot[] } | { ok: false, errors: AvailabilityErrors }} SaveAvailabilityResult
 * @typedef {{ ok: false, reason: "unauthorized" }} UnauthorizedResult
 */

/** @param {unknown} value */
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Błąd pojedynczego okna albo `null`.
 * @param {unknown} window
 * @returns {string | null}
 */
function windowError(window) {
  if (!isPlainObject(window)) return MESSAGES.window;
  const { weekday, startMinute, endMinute } = /** @type {Record<string, unknown>} */ (window);
  if (!Number.isInteger(weekday) || /** @type {number} */ (weekday) < 1 || /** @type {number} */ (weekday) > 7) {
    return MESSAGES.weekday;
  }
  const onGrid = (/** @type {unknown} */ minute) =>
    Number.isInteger(minute) &&
    /** @type {number} */ (minute) >= 0 &&
    /** @type {number} */ (minute) <= MINUTES_PER_DAY &&
    /** @type {number} */ (minute) % SLOT_GRID_MINUTES === 0;
  if (!onGrid(startMinute) || !onGrid(endMinute)) return MESSAGES.grid;
  if (/** @type {number} */ (endMinute) <= /** @type {number} */ (startMinute)) return MESSAGES.endAfterStart;
  return null;
}

/**
 * Walidacja wejścia zapisu (czysta). Nieznane klucze są pomijane; zwracane `values` zawierają tylko
 * kanoniczną strefę i okna z polami `weekday`, `startMinute`, `endMinute`.
 * Limit 21 okien sprawdzany przed oknami: przy przekroczeniu pojedyncze okna nie są oceniane.
 *
 * @param {unknown} input `{ timeZone, windows: [{ weekday, startMinute, endMinute }] }`
 * @returns {{ ok: true, values: { timeZone: string, windows: AvailabilityWindow[] } }
 *   | { ok: false, errors: AvailabilityErrors }}
 */
export function validateAvailabilityInput(input) {
  const source = isPlainObject(input) ? /** @type {Record<string, unknown>} */ (input) : {};
  /** @type {AvailabilityErrors} */
  const errors = {};

  const timeZone = canonicalTimeZone(Object.hasOwn(source, "timeZone") ? source.timeZone : undefined);
  if (timeZone === null) errors.timeZone = MESSAGES.timeZone;

  const rawWindows = Object.hasOwn(source, "windows") ? source.windows : undefined;
  /** @type {AvailabilityWindow[]} */
  const windows = [];
  if (!Array.isArray(rawWindows)) {
    errors.windows = MESSAGES.windowsList;
  } else if (rawWindows.length > MAX_WINDOWS) {
    errors.windows = MESSAGES.tooManyWindows;
  } else {
    rawWindows.forEach((window, index) => {
      const error = windowError(window);
      if (error) errors[`windows.${index}`] = error;
      else {
        const { weekday, startMinute, endMinute } = /** @type {AvailabilityWindow} */ (window);
        windows.push({ weekday, startMinute, endMinute });
      }
    });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values: { timeZone: /** @type {string} */ (timeZone), windows } };
}

/**
 * „HH:MM” (00:00–24:00) → minuty od północy albo `null`.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseTime(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

/**
 * Minuty od północy (0–1440) → „HH:MM”; 1440 → „24:00” (koniec okna, jak lista godzin w DS).
 * @param {number} minute
 * @returns {string}
 */
export function formatTime(minute) {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Okna z edytora DS (dzień 0–6, poniedziałek = 0; „HH:MM”) → okna domeny (ISO 1–7; minuty). Luka DS D8.
 * Długość i kolejność listy zostają (indeks błędu = indeks wiersza w edytorze); niepoprawne wartości
 * zamieniają się w `null`, które `validateAvailabilityInput` zgłasza przy tym oknie. Nie-tablica wraca bez zmian.
 * @param {unknown} windows
 * @returns {unknown}
 */
export function fromEditorWindows(windows) {
  if (!Array.isArray(windows)) return windows;
  return windows.map((window) => {
    if (!isPlainObject(window)) return null;
    const { weekday, start, end } = /** @type {Record<string, unknown>} */ (window);
    const day = /** @type {number} */ (weekday);
    return {
      weekday: Number.isInteger(day) && day >= 0 && day <= 6 ? day + 1 : null,
      startMinute: parseTime(start),
      endMinute: parseTime(end),
    };
  });
}

/**
 * Okna domeny (ISO 1–7; minuty) → okna edytora DS (dzień 0–6; „HH:MM”, koniec 1440 = „24:00”). Luka DS D8.
 * @param {ReadonlyArray<AvailabilityWindow>} windows
 * @returns {EditorWindow[]}
 */
export function toEditorWindows(windows) {
  return windows.map(({ weekday, startMinute, endMinute }) => ({
    weekday: weekday - 1,
    start: formatTime(startMinute),
    end: formatTime(endMinute),
  }));
}

/**
 * Wejście z edytora DS (`{ timeZone, windows: EditorWindow[] }`) → wejście `saveAvailability`.
 * Bierze tylko `timeZone` i `windows`; reszta (np. `mentorId`) jest pomijana.
 * @param {unknown} input
 * @returns {{ timeZone: unknown, windows: unknown }}
 */
export function fromEditorInput(input) {
  const source = isPlainObject(input) ? /** @type {Record<string, unknown>} */ (input) : {};
  return {
    timeZone: Object.hasOwn(source, "timeZone") ? source.timeZone : undefined,
    windows: fromEditorWindows(Object.hasOwn(source, "windows") ? source.windows : undefined),
  };
}

/**
 * Podgląd: wszystkie terminy (obie długości) dla `limit` najbliższych godzin startu, w kolejności `listOpenSlots`.
 * Tak liczy DS `SlotPreview` (grupuje po `startsAt`, pokazuje 10 startów z „25 lub 50 min”).
 * @param {ReadonlyArray<OpenSlot>} slots posortowane jak z `listOpenSlots`
 * @param {number} [limit]
 * @returns {OpenSlot[]}
 */
export function previewSlots(slots, limit = PREVIEW_LIMIT) {
  /** @type {Set<string>} */
  const starts = new Set();
  /** @type {OpenSlot[]} */
  const preview = [];
  for (const slot of slots) {
    if (!starts.has(slot.startsAt)) {
      if (starts.size === limit) break;
      starts.add(slot.startsAt);
    }
    preview.push(slot);
  }
  return preview;
}

/**
 * @param {unknown} now
 * @returns {Date}
 */
function toDate(now) {
  const date = now === undefined ? new Date() : now instanceof Date ? now : new Date(/** @type {any} */ (now));
  if (Number.isNaN(date.getTime())) throw new TypeError("availability: niepoprawna data bieżąca (now).");
  return date;
}

/**
 * Zapis dostępności: walidacja, atomowa zamiana całego zestawu okien i strefy (patrz komentarz na górze).
 *
 * @param {object} options
 * @param {Queryable} options.db
 * @param {string} options.mentorId z sesji (jedyne źródło); wejście nie wskazuje mentora
 * @param {unknown} options.input `{ timeZone, windows: [{ weekday 1–7, startMinute, endMinute }] }`
 * @param {Date | string | number} [options.now]
 * @returns {Promise<SaveAvailabilityResult>}
 */
export async function saveAvailability({ db, mentorId, input, now }) {
  const at = toDate(now);
  const validation = validateAvailabilityInput(input);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const { timeZone, windows } = validation.values;

  await withTransaction(db, async (client) => {
    await client.query("select pg_advisory_xact_lock($1, hashtext($2))", [AVAILABILITY_LOCK_NAMESPACE, mentorId]);
    await client.query("delete from availability_windows where mentor_id = $1", [mentorId]);
    if (windows.length > 0) {
      await client.query(
        `insert into availability_windows (mentor_id, weekday, start_minute, end_minute, created_at)
         select $1, w.weekday, w.start_minute, w.end_minute, $5
           from unnest($2::smallint[], $3::smallint[], $4::smallint[]) as w(weekday, start_minute, end_minute)`,
        [
          mentorId,
          windows.map((w) => w.weekday),
          windows.map((w) => w.startMinute),
          windows.map((w) => w.endMinute),
          at,
        ],
      );
    }
    const { rowCount } = await client.query("update mentors set time_zone = $2, updated_at = $3 where id = $1", [
      mentorId,
      timeZone,
      at,
    ]);
    // Mentor z sesji zawsze istnieje; jego brak to błąd danych — rzucenie wycofuje całą transakcję.
    if (rowCount !== 1) throw new Error("availability: nie ma mentora o podanym id.");
  });

  return { ok: true, preview: previewSlots(listOpenSlots({ windows, timeZone, now: at })) };
}

/** @returns {UnauthorizedResult} świeży obiekt */
export function unauthorizedResult() {
  return { ok: false, reason: "unauthorized" };
}

/**
 * Zapis z perspektywy server action: bez aktywnej sesji (brak, wygasła, odwołana) → `unauthorized` i nic nie
 * jest zapisywane (baza nie jest nawet pytana; L6/Z7).
 *
 * @param {object} options
 * @param {Queryable} options.db
 * @param {{ mentorId: string } | null | undefined} options.mentor wynik `getCurrentMentor()`
 * @param {unknown} options.input
 * @param {Date | string | number} [options.now]
 * @returns {Promise<SaveAvailabilityResult | UnauthorizedResult>}
 */
export async function saveAvailabilityForSession({ db, mentor, input, now }) {
  if (!mentor || typeof mentor.mentorId !== "string" || mentor.mentorId === "") return unauthorizedResult();
  return saveAvailability({ db, mentorId: mentor.mentorId, input, now });
}
