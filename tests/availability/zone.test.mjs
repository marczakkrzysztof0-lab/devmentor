// Testy jednostkowe stref czasowych (spec #15, Q2, Z16; zadanie 4.2) — bez bazy, stałe daty.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TIME_ZONE,
  canonicalTimeZone,
  isSupportedTimeZone,
  localDateParts,
  resolveMentorTimeZone,
  zonedWallTimeLowerBound,
  zonedWallTimeToInstants,
} from "../../lib/availability/zone.mjs";

const iso = (dates) => dates.map((d) => d.toISOString());

describe("isSupportedTimeZone / canonicalTimeZone", () => {
  test("strefy z listy Intl.supportedValuesOf są obsługiwane", () => {
    for (const tz of ["Europe/Warsaw", "America/New_York", "Europe/London", "Asia/Tokyo"]) {
      assert.equal(isSupportedTimeZone(tz), true, tz);
      assert.equal(canonicalTimeZone(tz), tz);
    }
  });

  test("UTC jest obsługiwane, choć nie ma go na liście Intl (decyzja 4.2)", () => {
    assert.equal(isSupportedTimeZone("UTC"), true);
    assert.equal(canonicalTimeZone("Etc/UTC"), "UTC");
  });

  test("aliasy (np. Europe/Kyiv z przeglądarki) sprowadzane do nazwy kanonicznej z listy", () => {
    const list = new Set(Intl.supportedValuesOf("timeZone"));
    for (const alias of ["Europe/Kyiv", "Europe/Kiev", "Asia/Kolkata", "Poland", "US/Eastern"]) {
      const canonical = canonicalTimeZone(alias);
      assert.ok(canonical && list.has(canonical), `${alias} → ${canonical}`);
    }
    assert.equal(canonicalTimeZone("Poland"), "Europe/Warsaw");
  });

  test("nieznane, puste, przesunięcia i nie-napisy są odrzucane", () => {
    for (const tz of [undefined, null, "", "   ", "Mars/Base", "+01:00", "Etc/GMT-2", 42]) {
      assert.equal(isSupportedTimeZone(tz), false, String(tz));
    }
  });
});

describe("resolveMentorTimeZone (Z16)", () => {
  test("brak lub nieobsługiwana strefa → Europe/Warsaw", () => {
    assert.equal(DEFAULT_TIME_ZONE, "Europe/Warsaw");
    for (const tz of [undefined, null, "", "Mars/Base"]) assert.equal(resolveMentorTimeZone(tz), "Europe/Warsaw");
  });

  test("obsługiwana strefa zostaje (w postaci kanonicznej)", () => {
    assert.equal(resolveMentorTimeZone("America/New_York"), "America/New_York");
    assert.equal(resolveMentorTimeZone("UTC"), "UTC");
    assert.equal(resolveMentorTimeZone("Europe/Kyiv"), canonicalTimeZone("Europe/Kyiv"));
  });
});

describe("localDateParts", () => {
  test("data, dzień tygodnia ISO i godzina w strefie", () => {
    // 2026-10-19 17:00 UTC = poniedziałek 19:00 w Warszawie (CEST).
    assert.deepEqual(localDateParts(new Date("2026-10-19T17:00:00Z"), "Europe/Warsaw"), {
      year: 2026, month: 10, day: 19, weekday: 1, hour: 19, minute: 0, second: 0,
    });
    // Niedziela = 7, północ = godzina 0 (nie 24).
    const sunday = localDateParts("2026-10-24T22:00:00Z", "Europe/Warsaw");
    assert.deepEqual([sunday.day, sunday.weekday, sunday.hour], [25, 7, 0]);
  });
});

describe("zonedWallTimeToInstants", () => {
  test("zwykły dzień → jedna chwila", () => {
    assert.deepEqual(iso(zonedWallTimeToInstants(2026, 10, 20, 18 * 60, "Europe/Warsaw")), ["2026-10-20T16:00:00.000Z"]);
    assert.deepEqual(iso(zonedWallTimeToInstants(2026, 1, 5, 18 * 60, "Europe/Warsaw")), ["2026-01-05T17:00:00.000Z"]);
  });

  test("luka wiosenna (Warszawa 2026-03-29 02:00–03:00) → brak chwil", () => {
    assert.deepEqual(zonedWallTimeToInstants(2026, 3, 29, 2 * 60, "Europe/Warsaw"), []);
    assert.deepEqual(zonedWallTimeToInstants(2026, 3, 29, 2 * 60 + 30, "Europe/Warsaw"), []);
    assert.deepEqual(iso(zonedWallTimeToInstants(2026, 3, 29, 3 * 60, "Europe/Warsaw")), ["2026-03-29T01:00:00.000Z"]);
  });

  test("czas powtórzony jesienią (Warszawa 2026-10-25 02:30) → 2 chwile rosnąco", () => {
    assert.deepEqual(iso(zonedWallTimeToInstants(2026, 10, 25, 2 * 60 + 30, "Europe/Warsaw")), [
      "2026-10-25T00:30:00.000Z",
      "2026-10-25T01:30:00.000Z",
    ]);
  });

  test("America/New_York: luka 2026-03-08 02:30, powtórzenie 2026-11-01 01:30", () => {
    assert.deepEqual(zonedWallTimeToInstants(2026, 3, 8, 2 * 60 + 30, "America/New_York"), []);
    assert.deepEqual(iso(zonedWallTimeToInstants(2026, 11, 1, 90, "America/New_York")), [
      "2026-11-01T05:30:00.000Z",
      "2026-11-01T06:30:00.000Z",
    ]);
  });

  test("minuta 1440 = północ następnego dnia", () => {
    assert.deepEqual(iso(zonedWallTimeToInstants(2026, 10, 20, 1440, "Europe/Warsaw")), ["2026-10-20T22:00:00.000Z"]);
  });
});

describe("zonedWallTimeLowerBound (koniec okna)", () => {
  test("koniec w luce → moment przestawienia zegara", () => {
    assert.equal(new Date(zonedWallTimeLowerBound(2026, 3, 29, 150, "Europe/Warsaw")).toISOString(), "2026-03-29T01:00:00.000Z");
  });

  test("koniec powtórzony → pierwsze wystąpienie", () => {
    assert.equal(new Date(zonedWallTimeLowerBound(2026, 10, 25, 150, "Europe/Warsaw")).toISOString(), "2026-10-25T00:30:00.000Z");
  });
});
