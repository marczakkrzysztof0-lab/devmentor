// Testy jednostkowe silnika wolnych terminów (spec #15, Implementation Plan krok 2; P1/Z37) — bez bazy, stałe `now`.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  HORIZON_DAYS,
  MIN_NOTICE_MINUTES,
  SESSION_LENGTHS,
  SLOT_GRID_MINUTES,
  isSlotInList,
  listOpenSlots,
  mergeIntervals,
} from "../../lib/availability/slots.mjs";
import { localDateParts } from "../../lib/availability/zone.mjs";

const WARSAW = "Europe/Warsaw";
const NEW_YORK = "America/New_York";

/** „18:00” → 1080 */
const min = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
/** Okno: dzień ISO + „HH:MM”–„HH:MM”. */
const win = (weekday, start, end) => ({ weekday, startMinute: min(start), endMinute: min(end) });
/** Terminy jako „ISO/długość” — czytelne porównania. */
const keys = (slots) => slots.map((s) => `${s.startsAt}/${s.lengthMinutes}`);
/** Tylko terminy z danego lokalnego dnia (rok, miesiąc, dzień) w strefie. */
const onLocalDay = (slots, tz, year, month, day) =>
  slots.filter((s) => {
    const p = localDateParts(s.startsAt, tz);
    return p.year === year && p.month === month && p.day === day;
  });
/** „18:00/25” w czasie lokalnym. */
const localKeys = (slots, tz) =>
  slots.map((s) => {
    const p = localDateParts(s.startsAt, tz);
    return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}/${s.lengthMinutes}`;
  });

// Poniedziałek 2026-10-19 19:00 w Warszawie (CEST) — „now” ze spec (P1, Z37; historia 4).
const MONDAY_19_WARSAW = "2026-10-19T17:00:00Z";

describe("stałe (Q4)", () => {
  test("wartości kontraktu", () => {
    assert.equal(MIN_NOTICE_MINUTES, 180);
    assert.equal(SLOT_GRID_MINUTES, 30);
    assert.equal(HORIZON_DAYS, 14);
    assert.deepEqual([...SESSION_LENGTHS], [25, 50]);
  });
});

describe("mergeIntervals", () => {
  test("łączy przylegające i nakładające się, sortuje, pomija puste", () => {
    assert.deepEqual(
      mergeIntervals([
        { start: 1140, end: 1200 },
        { start: 1080, end: 1140 },
        { start: 720, end: 780 },
        { start: 730, end: 750 },
        { start: 900, end: 900 },
      ]),
      [
        { start: 720, end: 780 },
        { start: 1080, end: 1200 },
      ],
    );
    assert.deepEqual(mergeIntervals([]), []);
  });

  test("nie modyfikuje wejścia", () => {
    const input = [{ start: 0, end: 60 }, { start: 30, end: 90 }];
    mergeIntervals(input);
    assert.deepEqual(input, [{ start: 0, end: 60 }, { start: 30, end: 90 }]);
  });
});

describe("listOpenSlots — długości w oknie", () => {
  test("okno 2-godzinne 18:00–20:00: 25 o 18:00–19:30, 50 o 18:00–19:00, bez 50 o 19:30", () => {
    const slots = listOpenSlots({ windows: [win(2, "18:00", "20:00")], timeZone: WARSAW, now: MONDAY_19_WARSAW });
    assert.deepEqual(localKeys(onLocalDay(slots, WARSAW, 2026, 10, 20), WARSAW), [
      "18:00/25", "18:00/50", "18:30/25", "18:30/50", "19:00/25", "19:00/50", "19:30/25",
    ]);
    assert.deepEqual(keys(onLocalDay(slots, WARSAW, 2026, 10, 20)).slice(0, 2), [
      "2026-10-20T16:00:00.000Z/25",
      "2026-10-20T16:00:00.000Z/50",
    ]);
  });

  test("okno 30-minutowe → tylko 25 min", () => {
    const slots = listOpenSlots({ windows: [win(4, "12:00", "12:30")], timeZone: WARSAW, now: MONDAY_19_WARSAW });
    assert.deepEqual(localKeys(slots, WARSAW), ["12:00/25", "12:00/25"]); // czw. 22.10 i 29.10
    assert.ok(slots.every((s) => s.lengthMinutes === 25));
  });

  test("okno do 24:00 (koniec 1440)", () => {
    const slots = listOpenSlots({ windows: [win(2, "23:00", "24:00")], timeZone: WARSAW, now: MONDAY_19_WARSAW });
    assert.deepEqual(localKeys(onLocalDay(slots, WARSAW, 2026, 10, 20), WARSAW), ["23:00/25", "23:00/50", "23:30/25"]);
  });

  test("wynik posortowany po startsAt, potem po długości; dwa tygodnie tego samego okna", () => {
    const slots = listOpenSlots({ windows: [win(4, "12:00", "13:00"), win(2, "18:00", "20:00")], timeZone: WARSAW, now: MONDAY_19_WARSAW });
    const sorted = [...slots].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.lengthMinutes - b.lengthMinutes);
    assert.deepEqual(slots, sorted);
    assert.equal(slots.length, 2 * 7 + 2 * 3); // 2 wtorki × 7 + 2 czwartki × 3
  });
});

describe("listOpenSlots — R06: nic poza oknami", () => {
  test("każdy termin zaczyna się i kończy w oknie swojego dnia tygodnia", () => {
    const windows = [win(2, "18:00", "20:00"), win(4, "12:00", "13:00")];
    const slots = listOpenSlots({ windows, timeZone: WARSAW, now: MONDAY_19_WARSAW });
    assert.ok(slots.length > 0);
    for (const slot of slots) {
      const p = localDateParts(slot.startsAt, WARSAW);
      const start = p.hour * 60 + p.minute;
      const inside = windows.some(
        (w) => w.weekday === p.weekday && start >= w.startMinute && start + slot.lengthMinutes <= w.endMinute,
      );
      assert.ok(inside, `${slot.startsAt}/${slot.lengthMinutes}`);
      assert.equal(p.minute % 30, 0);
    }
  });
});

describe("listOpenSlots — łączenie okien (Q6)", () => {
  test("przylegające 18:00–19:00 + 19:00–20:00 dają 50 min o 18:30", () => {
    const merged = listOpenSlots({ windows: [win(2, "18:00", "19:00"), win(2, "19:00", "20:00")], timeZone: WARSAW, now: MONDAY_19_WARSAW });
    const single = listOpenSlots({ windows: [win(2, "18:00", "20:00")], timeZone: WARSAW, now: MONDAY_19_WARSAW });
    assert.ok(localKeys(onLocalDay(merged, WARSAW, 2026, 10, 20), WARSAW).includes("18:30/50"));
    assert.deepEqual(merged, single);
  });

  test("nakładające się okna bez duplikatów", () => {
    const windows = [win(2, "18:00", "19:30"), win(2, "19:00", "20:00"), win(2, "18:30", "19:00"), win(2, "18:00", "20:00")];
    const slots = listOpenSlots({ windows, timeZone: WARSAW, now: MONDAY_19_WARSAW });
    assert.deepEqual(slots, listOpenSlots({ windows: [win(2, "18:00", "20:00")], timeZone: WARSAW, now: MONDAY_19_WARSAW }));
    assert.equal(new Set(keys(slots)).size, slots.length);
  });
});

describe("listOpenSlots — minimalne wyprzedzenie (180 min)", () => {
  test("termin dokładnie w now + 180 min jest oferowany, wcześniejsze nie", () => {
    // Wtorek 20.10 15:00 Warszawa → granica 18:00.
    const slots = listOpenSlots({ windows: [win(2, "17:00", "20:00")], timeZone: WARSAW, now: "2026-10-20T13:00:00Z" });
    const today = localKeys(onLocalDay(slots, WARSAW, 2026, 10, 20), WARSAW);
    assert.equal(today[0], "18:00/25");
    assert.ok(!today.some((k) => k.startsWith("17:")));
  });

  test("sekundę po granicy termin 18:00 znika", () => {
    const slots = listOpenSlots({ windows: [win(2, "17:00", "20:00")], timeZone: WARSAW, now: "2026-10-20T13:00:01Z" });
    assert.equal(localKeys(onLocalDay(slots, WARSAW, 2026, 10, 20), WARSAW)[0], "18:30/25");
  });

  test("nic nie zaczyna się przed now + MIN_NOTICE_MINUTES", () => {
    const all = [1, 2, 3, 4, 5, 6, 7].map((d) => win(d, "00:00", "24:00"));
    const slots = listOpenSlots({ windows: all, timeZone: WARSAW, now: MONDAY_19_WARSAW });
    const earliest = Date.parse(MONDAY_19_WARSAW) + MIN_NOTICE_MINUTES * 60_000;
    assert.ok(slots.every((s) => Date.parse(s.startsAt) >= earliest));
    assert.equal(slots[0].startsAt, new Date(earliest).toISOString()); // 22:00 Warszawa
  });
});

describe("listOpenSlots — horyzont 14 dni", () => {
  test("termin dokładnie w now + 14 dni nie jest oferowany", () => {
    // Wtorek 6.10 18:00 CEST; granica = wtorek 20.10 18:00 CEST (bez zmiany czasu po drodze).
    const now = "2026-10-06T16:00:00Z";
    const slots = listOpenSlots({ windows: [win(2, "18:00", "20:00")], timeZone: WARSAW, now });
    assert.deepEqual(onLocalDay(slots, WARSAW, 2026, 10, 20), []);
    assert.ok(keys(slots).includes("2026-10-13T16:00:00.000Z/25"));
    assert.ok(slots.every((s) => Date.parse(s.startsAt) < Date.parse(now) + 14 * 86_400_000));
  });

  test("minutę wcześniej termin w now + 14 dni − 1 min jest oferowany", () => {
    const slots = listOpenSlots({ windows: [win(2, "18:00", "20:00")], timeZone: WARSAW, now: "2026-10-06T16:01:00Z" });
    // now + 180 min wyklucza 6.10; 20.10 18:00 (16:00Z) < granica 16:01Z.
    assert.deepEqual(localKeys(onLocalDay(slots, WARSAW, 2026, 10, 20), WARSAW), ["18:00/25", "18:00/50"]);
  });

  test("P1/Z37: now = pn 19.10 19:00 Warszawa → ostatni oferowany dzień to 2.11", () => {
    const all = [1, 2, 3, 4, 5, 6, 7].map((d) => win(d, "08:00", "22:00"));
    const slots = listOpenSlots({ windows: all, timeZone: WARSAW, now: MONDAY_19_WARSAW });
    const days = [...new Set(slots.map((s) => {
      const p = localDateParts(s.startsAt, WARSAW);
      return `${p.day}.${p.month}`;
    }))];
    assert.equal(days[0], "20.10"); // 19.10: wyprzedzenie sięga 22:00, końca okna
    assert.equal(days.at(-1), "2.11");
    assert.equal(days.length, 14);
    // 25.10 kończy się czas letni, więc now + 14 × 24 h = 2.11 18:00 CET (17:00 UTC), nie 19:00:
    // 2.11 17:30 jest ostatnim terminem, 18:00 (dokładnie granica) już nie.
    assert.deepEqual(keys(slots).slice(-2), ["2026-11-02T16:30:00.000Z/25", "2026-11-02T16:30:00.000Z/50"]);
    assert.ok(!localKeys(onLocalDay(slots, WARSAW, 2026, 11, 2), WARSAW).includes("18:00/25"));
  });
});

describe("listOpenSlots — zmiana czasu (DST)", () => {
  test("Warszawa 2026-03-29: okno 01:30–03:30 nie oferuje 02:00 ani 02:30 (luka)", () => {
    const slots = listOpenSlots({ windows: [win(7, "01:30", "03:30")], timeZone: WARSAW, now: "2026-03-23T12:00:00Z" });
    const day = onLocalDay(slots, WARSAW, 2026, 3, 29);
    assert.deepEqual(localKeys(day, WARSAW), ["01:30/25", "01:30/50", "03:00/25"]);
    assert.deepEqual(keys(day), [
      "2026-03-29T00:30:00.000Z/25",
      "2026-03-29T00:30:00.000Z/50", // 50 min upływu: 01:30 CET → 03:20 CEST, przed końcem 03:30
      "2026-03-29T01:00:00.000Z/25",
    ]);
  });

  test("Warszawa 2026-10-25: 02:00–03:00 dwa razy → pierwsze wystąpienie, bez duplikatów", () => {
    const slots = listOpenSlots({ windows: [win(7, "01:30", "03:30")], timeZone: WARSAW, now: "2026-10-19T12:00:00Z" });
    const day = onLocalDay(slots, WARSAW, 2026, 10, 25);
    assert.deepEqual(keys(day), [
      "2026-10-24T23:30:00.000Z/25", "2026-10-24T23:30:00.000Z/50",
      "2026-10-25T00:00:00.000Z/25", "2026-10-25T00:00:00.000Z/50", // 02:00 CEST (pierwsze)
      "2026-10-25T00:30:00.000Z/25", "2026-10-25T00:30:00.000Z/50", // 02:30 CEST (pierwsze)
      "2026-10-25T02:00:00.000Z/25", // 03:00 CET; 50 min skończyłoby się po 03:30 CET
    ]);
    assert.equal(new Set(keys(slots)).size, slots.length);
  });

  test("America/New_York 2026-03-08: luka 02:00–03:00", () => {
    const slots = listOpenSlots({ windows: [win(7, "01:00", "04:00")], timeZone: NEW_YORK, now: "2026-03-02T12:00:00Z" });
    const day = onLocalDay(slots, NEW_YORK, 2026, 3, 8);
    assert.deepEqual(localKeys(day, NEW_YORK), [
      "01:00/25", "01:00/50", "01:30/25", "01:30/50", "03:00/25", "03:00/50", "03:30/25",
    ]);
    assert.equal(day[0].startsAt, "2026-03-08T06:00:00.000Z"); // EST
    assert.equal(day.at(-1).startsAt, "2026-03-08T07:30:00.000Z"); // EDT
  });

  test("America/New_York 2026-11-01: 01:00–02:00 dwa razy → pierwsze wystąpienie", () => {
    const slots = listOpenSlots({ windows: [win(7, "00:00", "03:00")], timeZone: NEW_YORK, now: "2026-10-27T12:00:00Z" });
    const day = onLocalDay(slots, NEW_YORK, 2026, 11, 1);
    assert.deepEqual(keys(day), [
      "2026-11-01T04:00:00.000Z/25", "2026-11-01T04:00:00.000Z/50",
      "2026-11-01T04:30:00.000Z/25", "2026-11-01T04:30:00.000Z/50",
      "2026-11-01T05:00:00.000Z/25", "2026-11-01T05:00:00.000Z/50", // 01:00 EDT
      "2026-11-01T05:30:00.000Z/25", "2026-11-01T05:30:00.000Z/50", // 01:30 EDT
      "2026-11-01T07:00:00.000Z/25", "2026-11-01T07:00:00.000Z/50", // 02:00 EST
      "2026-11-01T07:30:00.000Z/25",
    ]);
  });

  test("okno wieczorne zostaje o 18:00 lokalnie po zmianie czasu", () => {
    const slots = listOpenSlots({ windows: [win(2, "18:00", "18:30")], timeZone: WARSAW, now: MONDAY_19_WARSAW });
    assert.deepEqual(keys(slots), ["2026-10-20T16:00:00.000Z/25", "2026-10-27T17:00:00.000Z/25"]);
  });
});

describe("listOpenSlots — busy", () => {
  const windows = [win(2, "18:00", "20:00")];
  const tuesday = (slots) => localKeys(onLocalDay(slots, WARSAW, 2026, 10, 20), WARSAW);

  test("zajęty przedział usuwa nakładające się terminy obu długości", () => {
    const busy = [{ startsAt: "2026-10-20T16:30:00Z", endsAt: "2026-10-20T16:55:00Z" }]; // 18:30–18:55
    const slots = listOpenSlots({ windows, timeZone: WARSAW, now: MONDAY_19_WARSAW, busy });
    assert.deepEqual(tuesday(slots), ["18:00/25", "19:00/25", "19:00/50", "19:30/25"]);
  });

  test("przyleganie (koniec = początek) nie koliduje", () => {
    const busy = [{ startsAt: new Date("2026-10-20T16:25:00Z"), endsAt: new Date("2026-10-20T16:30:00Z") }]; // 18:25–18:30
    const slots = listOpenSlots({ windows, timeZone: WARSAW, now: MONDAY_19_WARSAW, busy });
    assert.deepEqual(tuesday(slots), ["18:00/25", "18:30/25", "18:30/50", "19:00/25", "19:00/50", "19:30/25"]);
  });
});

describe("listOpenSlots — brak danych → []", () => {
  test("brak okien", () => {
    assert.deepEqual(listOpenSlots({ windows: [], timeZone: WARSAW, now: MONDAY_19_WARSAW }), []);
    assert.deepEqual(listOpenSlots({ windows: undefined, timeZone: WARSAW, now: MONDAY_19_WARSAW }), []);
  });

  test("brak strefy (lub nieobsługiwana)", () => {
    for (const timeZone of [null, undefined, "", "Mars/Base"]) {
      assert.deepEqual(listOpenSlots({ windows: [win(2, "18:00", "20:00")], timeZone, now: MONDAY_19_WARSAW }), []);
    }
  });
});

describe("historia 4: widz w Londynie", () => {
  test("pn 19:00 Warszawa: wt 18:00 Warszawa oferowane = 17:00 w Londynie; nic w ciągu 3 h", () => {
    const slots = listOpenSlots({ windows: [win(2, "18:00", "20:00"), win(1, "20:00", "23:00")], timeZone: WARSAW, now: MONDAY_19_WARSAW });
    assert.ok(isSlotInList(slots, { startsAt: "2026-10-20T16:00:00Z", lengthMinutes: 25 }));
    const london = localDateParts("2026-10-20T16:00:00Z", "Europe/London");
    assert.deepEqual([london.weekday, london.hour, london.minute], [2, 17, 0]);
    // Poniedziałkowe okno 20:00–23:00: tylko starty od 22:00 (now + 3 h).
    assert.deepEqual(localKeys(onLocalDay(slots, WARSAW, 2026, 10, 19), WARSAW), ["22:00/25", "22:00/50", "22:30/25"]);
  });
});

describe("isSlotInList (podstawa isSlotOffered)", () => {
  const slots = [
    { startsAt: "2026-10-20T16:00:00.000Z", lengthMinutes: 25 },
    { startsAt: "2026-10-20T16:00:00.000Z", lengthMinutes: 50 },
    { startsAt: "2026-10-20T17:30:00.000Z", lengthMinutes: 25 },
  ];

  test("dokładne dopasowanie chwili i długości (forma zapisu ISO bez znaczenia)", () => {
    assert.equal(isSlotInList(slots, { startsAt: "2026-10-20T16:00:00.000Z", lengthMinutes: 50 }), true);
    assert.equal(isSlotInList(slots, { startsAt: "2026-10-20T18:00:00+02:00", lengthMinutes: 25 }), true);
    assert.equal(isSlotInList(slots, { startsAt: new Date("2026-10-20T17:30:00Z"), lengthMinutes: 25 }), true);
  });

  test("inna długość, inna chwila lub zła data → false", () => {
    assert.equal(isSlotInList(slots, { startsAt: "2026-10-20T17:30:00.000Z", lengthMinutes: 50 }), false);
    assert.equal(isSlotInList(slots, { startsAt: "2026-10-20T16:01:00.000Z", lengthMinutes: 25 }), false);
    assert.equal(isSlotInList(slots, { startsAt: "nie-data", lengthMinutes: 25 }), false);
    assert.equal(isSlotInList([], { startsAt: "2026-10-20T16:00:00.000Z", lengthMinutes: 25 }), false);
  });
});
