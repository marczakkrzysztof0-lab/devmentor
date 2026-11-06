// Lekcja 17 — deterministyczne sprawdzenie błędu, który wrócił mimo review: logika i testy zależne od daty.
//
// Historia: 0450bc5 („jutro” liczone jako now + 24 h, błąd przy zmianie czasu), 826e0bc / PR #49 (e2e szukało radia
// wyrażeniem `${date}.*${time}` — „1.11, 17:00” trafiało też w „11.11, 17:00”, gdy oba dni były w 14-dniowym oknie;
// test padał tylko w niektóre dni). Oba błędy przeszły review, bo zależały od dnia, w którym uruchomiono testy.
//
// Tu zegar jest zamrożony: dla wielu „teraz” (daty graniczne + przegląd dzień po dniu przez rok) liczymy terminy
// tym samym silnikiem co strona (`listOpenSlots` → `groupSlotsByDay`) i sprawdzamy:
//   1. wyrażenie z `tests/e2e/slot-names.mjs` (to, którego używa e2e) trafia w DOKŁADNIE jedno radio,
//   2. etykiety dnia: „dziś”/„jutro” to dzień kalendarzowy w strefie widza, data w nazwie = dzień terminu,
//      każda nazwa radia jest jednoznaczna.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { groupSlotsByDay } from "@devmentor/ui/slots";
import { listOpenSlots } from "../../lib/availability/slots.mjs";
import { slotDateTime, slotRadioNamePattern } from "../e2e/slot-names.mjs";

const MENTOR_ZONE = "Europe/Warsaw";
/** Jak w tests/e2e/public-slots.e2e.mjs: codziennie 18:00–20:00 czasu mentora. */
const DAILY_18_20 = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 18 * 60, endMinute: 20 * 60 }));
const VIEWER_ZONES = ["Europe/London", "Europe/Warsaw", "America/New_York"];

/** Daty graniczne: „teraz” (UTC) i dlaczego jest groźne. */
const BOUNDARIES = [
  ["2026-10-28T09:00:00Z", "28.10 rano: 11.11 jeszcze poza oknem 14 × 24 h"],
  ["2026-10-28T18:00:00Z", "28.10 wieczorem: 1.11 i 11.11 w jednym oknie (błąd z PR #49)"],
  ["2026-10-24T21:30:00Z", "PL: noc przed zmianą czasu 25.10 (dzień 25 h)"],
  ["2026-10-24T22:30:00Z", "PL: 00:30 CEST w dniu zmiany czasu"],
  ["2026-10-31T12:00:00Z", "USA: zmiana czasu 1.11 (różnica PL–NY 5 h ↔ 6 h)"],
  ["2026-10-31T22:30:00Z", "koniec miesiąca: 31.10 → „jutro” 1.11"],
  ["2026-11-30T22:30:00Z", "koniec miesiąca: 30.11 23:30 PL → 1.12"],
  ["2026-12-28T18:00:00Z", "koniec roku: 1.01 i 11.01 w jednym oknie"],
  ["2026-12-31T22:59:00Z", "sylwester 23:59 PL → „jutro” 1.01"],
  ["2027-02-26T10:00:00Z", "koniec lutego: 28.02 → 1.03, 1.03 i 11.03 w oknie"],
  ["2027-03-08T10:00:00Z", "USA: zmiana czasu 14.03 (PL–NY 6 h → 5 h)"],
  ["2027-03-27T22:30:00Z", "PL: noc przed zmianą czasu 28.03 (dzień 23 h)"],
  ["2027-03-28T00:30:00Z", "PL: 01:30 CET tuż przed przestawieniem zegara"],
];

/** Klucz dnia „2026-11-01” w strefie. */
const dayKey = (date, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const nextDay = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** Dni i nazwy radiów tak, jak pokazuje je DS `SlotList` (nazwa radia = `fullLabel`, widoczne godziny dnia). */
function shown(now, timeZone, lengthMinutes = 25) {
  const slots = listOpenSlots({ windows: DAILY_18_20, timeZone: MENTOR_ZONE, now });
  const { days } = groupSlotsByDay(slots, { lengthMinutes, timeZone, now });
  return { days, names: days.flatMap((d) => d.visible.map((t) => t.fullLabel)) };
}

/** Wszystkie problemy dla jednego „teraz” i jednej strefy widza (pusta lista = OK). */
function problems(now, timeZone) {
  const { days, names } = shown(now, timeZone);
  const out = [];
  if (names.length === 0) out.push("brak terminów (dane testu nie pokrywają przypadku)");
  if (new Set(names).size !== names.length) out.push(`powtórzona nazwa radia: ${JSON.stringify(names)}`);
  for (const name of names) {
    const parsed = slotDateTime(name);
    if (!parsed) {
      out.push(`nazwa bez daty i godziny: ${name}`);
      continue;
    }
    const pattern = slotRadioNamePattern(parsed.date, parsed.time);
    const hits = names.filter((n) => pattern.test(n));
    if (hits.length !== 1) out.push(`${pattern} dla „${name}” trafia w ${hits.length}: ${JSON.stringify(hits)}`);
  }
  const today = dayKey(now, timeZone);
  for (const day of days) {
    const [, month, date] = day.dayKey.split("-");
    const expected = day.dayKey === today ? "dziś" : day.dayKey === nextDay(today) ? "jutro" : null;
    if (expected && day.dayLabel !== expected) out.push(`${day.dayKey}: etykieta „${day.dayLabel}”, oczekiwano „${expected}”`);
    if (!expected && ["dziś", "jutro"].includes(day.dayLabel)) out.push(`${day.dayKey}: „${day.dayLabel}”, a to nie dziś ani jutro`);
    for (const time of day.times) {
      const parsed = slotDateTime(time.fullLabel);
      if (parsed && parsed.date !== `${Number(date)}.${month}`) out.push(`${time.fullLabel}: data ≠ dzień ${day.dayKey}`);
    }
  }
  return out;
}

describe("nazwy radiów godzin z zamrożonym zegarem — daty graniczne", () => {
  for (const [iso, why] of BOUNDARIES) {
    for (const timeZone of VIEWER_ZONES) {
      test(`${iso} (${why}), widz ${timeZone}`, () => {
        assert.deepEqual(problems(new Date(iso), timeZone), []);
      });
    }
  }
});

describe("nazwy radiów godzin z zamrożonym zegarem — każdy dzień od 1.10.2026 do 30.04.2027 (widz jak w e2e)", () => {
  // Pół roku dzień po dniu: obie zmiany czasu w PL i w USA, koniec roku i lutego. Widz Europe/London jak w
  // tests/e2e/public-slots.e2e.mjs; „teraz” 06:00 UTC (przed oknem 18:00–20:00 PL).
  test("widz Europe/London", () => {
    const found = [];
    for (let t = Date.parse("2026-10-01T06:00:00Z"); t <= Date.parse("2027-04-30T06:00:00Z"); t += 86_400_000) {
      const now = new Date(t);
      for (const p of problems(now, "Europe/London")) found.push(`${now.toISOString()}: ${p}`);
    }
    assert.deepEqual(found.slice(0, 10), [], `${found.length} problemów`);
  });
});
