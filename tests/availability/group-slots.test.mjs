// Testy jednostkowe grupowania terminów po dniu widza (spec #16 Q7/F3, UI/UX; Phase 2 krok 5; zadanie 6.2).
// Ta sama funkcja, której używa DS `SlotList` (`@devmentor/ui/slots` = `packages/ui/src/lib/slot-days.mjs`).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { SLOTS_PER_DAY, groupSlotsByDay, resolveTimeZone } from "@devmentor/ui/slots";

/** NBSP z Intl → zwykła spacja (etykiety porównujemy jak tekst). */
const plain = (text) => text.replace(/[  ]/g, " ");
const NOW = new Date("2026-10-21T10:00:00Z"); // środa 21.10, 12:00 w Warszawie, 06:00 w Nowym Jorku

/** Termin `length` min startujący o `iso`. */
const slot = (iso, lengthMinutes = 25) => ({ startsAt: new Date(iso).toISOString(), lengthMinutes });

/** n terminów co 30 min od `iso`. */
const series = (iso, n, lengthMinutes = 25) =>
  Array.from({ length: n }, (_, i) => slot(new Date(Date.parse(iso) + i * 30 * 60_000).toISOString(), lengthMinutes));

describe("groupSlotsByDay — strefa widza", () => {
  // 23:30 Warszawa (czw 22.10) i 05:30 Warszawa (pt 23.10) = 17:30 i 23:30 w Nowym Jorku, oba w czw 22.10.
  const slots = [slot("2026-10-23T03:30:00Z"), slot("2026-10-22T21:30:00Z")];

  test("Europe/Warsaw: 23:30 to jeszcze czwartek, 05:30 to już piątek — dwa dni", () => {
    const { timeZone, fallback, days } = groupSlotsByDay(slots, { lengthMinutes: 25, timeZone: "Europe/Warsaw", now: NOW });
    assert.equal(timeZone, "Europe/Warsaw");
    assert.equal(fallback, false);
    assert.deepEqual(
      days.map((d) => [d.dayKey, d.dayLabel, d.times.map((t) => t.label)]),
      [
        ["2026-10-22", "jutro", ["23:30"]],
        ["2026-10-23", "pt. 23.10", ["05:30"]],
      ],
    );
  });

  test("America/New_York: ten sam termin 05:30 Warszawa przechodzi na poprzedni dzień (czw 23:30) — jeden dzień", () => {
    const { timeZone, fallback, days } = groupSlotsByDay(slots, { lengthMinutes: 25, timeZone: "America/New_York", now: NOW });
    assert.equal(timeZone, "America/New_York");
    assert.equal(fallback, false);
    assert.deepEqual(
      days.map((d) => [d.dayKey, d.dayLabel, d.times.map((t) => t.label)]),
      [["2026-10-22", "jutro", ["17:30", "23:30"]]],
    );
  });

  test("godzina ma datę w tekście (nie tylko przez grupowanie)", () => {
    const { days } = groupSlotsByDay(slots, { lengthMinutes: 25, timeZone: "Europe/Warsaw", now: NOW });
    assert.equal(plain(days[0].dayLabelFull), "jutro, czwartek 22.10");
    assert.equal(plain(days[0].times[0].fullLabel), "jutro, czwartek 22.10, 23:30");
    assert.equal(plain(days[1].times[0].fullLabel), "piątek 23.10, 05:30");
  });

  test("dziś i późniejsze dni: „dziś”, „czw. 22.10” przy innym „teraz”", () => {
    const { days } = groupSlotsByDay([slot("2026-10-21T16:00:00Z"), slot("2026-10-22T16:00:00Z")], {
      lengthMinutes: 25,
      timeZone: "Europe/Warsaw",
      now: new Date("2026-10-20T10:00:00Z"),
    });
    assert.deepEqual(days.map((d) => d.dayLabel), ["jutro", "czw. 22.10"]);
    const today = groupSlotsByDay([slot("2026-10-21T16:00:00Z")], { lengthMinutes: 25, timeZone: "Europe/Warsaw", now: NOW });
    assert.equal(today.days[0].dayLabel, "dziś");
  });
});

describe("groupSlotsByDay — „jutro” to następny dzień KALENDARZOWY (zmiana czasu), nie teraz + 24 h", () => {
  const labels = (slots, now) =>
    groupSlotsByDay(slots, { lengthMinutes: 25, timeZone: "Europe/Warsaw", now }).days.map((d) => d.dayLabel);

  test("jesień: sob. 24.10 23:30 → nd. 25.10 (dzień 25 h) to „jutro”, pon. 26.10 już nie", () => {
    const now = new Date("2026-10-24T21:30:00Z"); // 23:30 CEST
    // 11:00 i 23:30 CET w nd. 25.10; 11:00 CET w pon. 26.10.
    const slots = [slot("2026-10-25T10:00:00Z"), slot("2026-10-25T22:30:00Z"), slot("2026-10-26T10:00:00Z")];
    assert.deepEqual(labels(slots, now), ["jutro", "pon. 26.10"]);
  });

  test("jesień: nd. 25.10 00:30 — teraz + 24 h to nadal 25.10, a „jutro” to pon. 26.10", () => {
    const now = new Date("2026-10-24T22:30:00Z"); // 00:30 CEST w nd. 25.10; + 24 h = 23:30 CET tego samego dnia
    const slots = [slot("2026-10-25T20:00:00Z"), slot("2026-10-26T08:00:00Z")];
    assert.deepEqual(labels(slots, now), ["dziś", "jutro"]);
  });

  test("wiosna: sob. 28.03 23:30 → nd. 29.03 (dzień 23 h) to „jutro”, pon. 30.03 nie (teraz + 24 h trafia w 30.03)", () => {
    const now = new Date("2026-03-28T22:30:00Z"); // 23:30 CET; + 24 h = 00:30 CEST pon. 30.03
    const slots = [slot("2026-03-29T10:00:00Z"), slot("2026-03-30T08:00:00Z")];
    assert.deepEqual(labels(slots, now), ["jutro", "pon. 30.03"]);
    const { days } = groupSlotsByDay(slots, { lengthMinutes: 25, timeZone: "Europe/Warsaw", now });
    assert.equal(plain(days[0].dayLabelFull), "jutro, niedziela 29.03");
    assert.equal(plain(days[1].dayLabelFull), "poniedziałek 30.03");
  });

  test("przełom miesiąca i roku: 31.12 → 1.01 to „jutro”", () => {
    const now = new Date("2026-12-31T20:00:00Z"); // 21:00 CET
    assert.deepEqual(labels([slot("2027-01-01T09:00:00Z")], now), ["jutro"]);
  });
});

describe("groupSlotsByDay — strefa nieznana → UTC z flagą", () => {
  for (const [label, timeZone] of [
    ["nieprawidłowa", "Mars/Olympus"],
    ["pusta", ""],
    ["brak", undefined],
    ["null", null],
  ]) {
    test(`${label} strefa → UTC, fallback: true`, () => {
      const { timeZone: used, fallback, days } = groupSlotsByDay([slot("2026-10-22T21:30:00Z")], { lengthMinutes: 25, timeZone, now: NOW });
      assert.equal(used, "UTC");
      assert.equal(fallback, true);
      assert.deepEqual(days.map((d) => [d.dayKey, d.times[0].label]), [["2026-10-22", "21:30"]]);
    });
  }

  test("resolveTimeZone: poprawna strefa bez flagi, zła → UTC", () => {
    assert.deepEqual(resolveTimeZone("Europe/London"), { timeZone: "Europe/London", fallback: false });
    assert.deepEqual(resolveTimeZone("Not/AZone"), { timeZone: "UTC", fallback: true });
  });
});

describe("groupSlotsByDay — F3: najwyżej 6 godzin na dzień, reszta w „Pokaż więcej (k)”", () => {
  // Fixture z kryterium F3: 10 terminów jednego dnia + 2 drugiego.
  const fixture = [...series("2026-10-22T10:00:00Z", 10), ...series("2026-10-23T16:00:00Z", 2)];

  test("10 + 2 → dwa dni; pierwszy: 6 widocznych i 4 ukryte, drugi: 2 i 0", () => {
    assert.equal(SLOTS_PER_DAY, 6);
    const { days } = groupSlotsByDay(fixture, { lengthMinutes: 25, timeZone: "Europe/Warsaw", now: NOW });
    assert.equal(days.length, 2);
    assert.deepEqual(
      days.map((d) => [d.times.length, d.visible.length, d.hiddenCount]),
      [
        [10, 6, 4],
        [2, 2, 0],
      ],
    );
    assert.deepEqual(days[0].visible.map((t) => t.label), ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"]);
    assert.deepEqual(days[0].visible, days[0].times.slice(0, 6), "widoczne = najwcześniejsze");
  });

  test("klucze i etykiety dni są unikalne; dni i godziny od najwcześniejszych (wejście w dowolnej kolejności)", () => {
    const shuffled = [...fixture].reverse();
    const { days } = groupSlotsByDay(shuffled, { lengthMinutes: 25, timeZone: "Europe/Warsaw", now: NOW });
    assert.equal(new Set(days.map((d) => d.dayKey)).size, days.length);
    assert.equal(new Set(days.map((d) => d.dayLabel)).size, days.length);
    assert.deepEqual(days.map((d) => d.dayKey), ["2026-10-22", "2026-10-23"]);
    for (const day of days) {
      const starts = day.times.map((t) => Date.parse(t.startsAt));
      assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
    }
  });

  test("maxPerDay można zmienić (np. bez limitu w trybie wyboru)", () => {
    const { days } = groupSlotsByDay(fixture, { lengthMinutes: 25, timeZone: "Europe/Warsaw", now: NOW, maxPerDay: Infinity });
    assert.deepEqual(days.map((d) => [d.visible.length, d.hiddenCount]), [
      [10, 0],
      [2, 0],
    ]);
  });
});

describe("groupSlotsByDay — filtr długości", () => {
  const slots = [slot("2026-10-22T16:00:00Z", 25), slot("2026-10-22T16:00:00Z", 50), slot("2026-10-22T17:30:00Z", 25), slot("2026-10-24T09:00:00Z", 25)];

  test("50 min: tylko terminy 50-minutowe; dzień bez nich znika", () => {
    const { days } = groupSlotsByDay(slots, { lengthMinutes: 50, timeZone: "Europe/Warsaw", now: NOW });
    assert.deepEqual(days.map((d) => [d.dayKey, d.times.map((t) => t.label)]), [["2026-10-22", ["18:00"]]]);
  });

  test("25 min: trzy terminy w dwóch dniach", () => {
    const { days } = groupSlotsByDay(slots, { lengthMinutes: 25, timeZone: "Europe/Warsaw", now: NOW });
    assert.deepEqual(days.map((d) => [d.dayKey, d.times.map((t) => t.label)]), [
      ["2026-10-22", ["18:00", "19:30"]],
      ["2026-10-24", ["11:00"]],
    ]);
  });

  test("brak terminów danej długości → pusta lista dni", () => {
    const { days } = groupSlotsByDay([slot("2026-10-22T16:00:00Z", 25)], { lengthMinutes: 50, timeZone: "Europe/Warsaw", now: NOW });
    assert.deepEqual(days, []);
  });
});
