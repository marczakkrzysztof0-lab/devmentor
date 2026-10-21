// Zapis dostępności z bazą (spec #15, API Contracts `saveAvailability`, Implementation Plan krok 4, Edge Cases):
// round-trip, usunięcie okna usuwa jego terminy (AC negatywne), atomowa zamiana zestawu, limit 21 okien,
// strefa nieobsługiwana, brak sesji, zakres mentora A/B, podgląd, zmiana strefy z zachowaniem czasu ściennego,
// dwa równoległe zapisy. Czas zawsze jawny (`NOW`).
//
// NOW = środa 2026-10-21 10:00Z = 12:00 w Europe/Warsaw (CEST; zmiana czasu 25.10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { listOpenSlotsForMentor, loadAvailability } from "../../lib/availability/queries.mjs";
import {
  MAX_WINDOWS,
  MESSAGES,
  previewSlots,
  saveAvailability,
  saveAvailabilityForSession,
} from "../../lib/availability/save.mjs";
import { listOpenSlots } from "../../lib/availability/slots.mjs";
import { canonicalTimeZone, localDateParts } from "../../lib/availability/zone.mjs";
import { describeDb } from "./harness.mjs";

const NOW = new Date("2026-10-21T10:00:00.000Z");
const LATER = new Date("2026-10-21T11:00:00.000Z");
const ZONE = "Europe/Warsaw";

const TUESDAY = { weekday: 2, startMinute: 18 * 60, endMinute: 20 * 60 };
const THURSDAY = { weekday: 4, startMinute: 12 * 60, endMinute: 13 * 60 };

describeDb("availability: saveAvailability (atomowa zamiana zestawu, limit, strefa, zakres mentora)", (db) => {
  const createMentor = async (timeZone = null) => {
    const { rows } = await db.query("insert into mentors (email, time_zone) values ($1, $2) returning id", [
      `mentor-${randomBytes(6).toString("hex")}@example.com`,
      timeZone,
    ]);
    return rows[0].id;
  };

  const save = (mentorId, input, now = NOW) => saveAvailability({ db: db.pool, mentorId, input, now });
  const load = (mentorId) => loadAvailability({ db: db.pool, mentorId });
  const mentorRow = async (mentorId) =>
    (await db.query("select time_zone, updated_at from mentors where id = $1", [mentorId])).rows[0];
  const windowRows = async (mentorId) =>
    (await db.query("select * from availability_windows where mentor_id = $1 order by weekday, start_minute", [mentorId]))
      .rows;

  /** Mentor z zapisanym zestawem wtorek 18–20 + czwartek 12–13 w Europe/Warsaw. */
  const mentorWithSet = async () => {
    const mentorId = await createMentor();
    const result = await save(mentorId, { timeZone: ZONE, windows: [TUESDAY, THURSDAY] });
    assert.equal(result.ok, true);
    return mentorId;
  };

  /** Stan mentora do porównania „nic się nie zmieniło” (okna z id i created_at, strefa, updated_at). */
  const snapshot = async (mentorId) => ({ mentor: await mentorRow(mentorId), windows: await windowRows(mentorId) });

  // ---------------------------------------------------------------- round-trip

  test("round-trip: zapis, potem loadAvailability zwraca te same okna i strefę; updated_at = now", async () => {
    const mentorId = await createMentor();
    const windows = [THURSDAY, TUESDAY, { weekday: 7, startMinute: 23 * 60, endMinute: 1440 }];
    const result = await save(mentorId, { timeZone: ZONE, windows });
    assert.equal(result.ok, true);
    assert.deepEqual(await load(mentorId), {
      timeZone: ZONE,
      windows: [TUESDAY, THURSDAY, { weekday: 7, startMinute: 1380, endMinute: 1440 }],
    });
    const row = await mentorRow(mentorId);
    assert.equal(row.updated_at.getTime(), NOW.getTime());
    for (const window of await windowRows(mentorId)) assert.equal(window.created_at.getTime(), NOW.getTime());
  });

  test("strefa zapisana w postaci kanonicznej (alias „Europe/Kyiv” → nazwa z listy Node)", async () => {
    const mentorId = await createMentor();
    const canonical = canonicalTimeZone("Europe/Kyiv");
    assert.ok(canonical === "UTC" || Intl.supportedValuesOf("timeZone").includes(canonical));
    const result = await save(mentorId, { timeZone: "Europe/Kyiv", windows: [TUESDAY] });
    assert.equal(result.ok, true);
    assert.equal((await load(mentorId)).timeZone, canonical);
  });

  test("pusty zestaw: zapisuje strefę, usuwa wszystkie okna, podgląd pusty", async () => {
    const mentorId = await mentorWithSet();
    const result = await save(mentorId, { timeZone: ZONE, windows: [] }, LATER);
    assert.deepEqual(result, { ok: true, preview: [] });
    assert.deepEqual(await load(mentorId), { timeZone: ZONE, windows: [] });
    assert.deepEqual(await listOpenSlotsForMentor({ db: db.pool, mentorId, now: LATER }), []);
  });

  test("nieznane klucze pomijane (okno z `id`, `mentorId` w wejściu)", async () => {
    const mentorId = await createMentor();
    const result = await save(mentorId, {
      timeZone: ZONE,
      windows: [{ ...TUESDAY, id: "00000000-0000-4000-8000-000000000000", mentorId: "x" }],
      mentorId: "x",
    });
    assert.equal(result.ok, true);
    assert.deepEqual((await load(mentorId)).windows, [TUESDAY]);
  });

  // ---------------------------------------------------------------- usunięcie okna (AC negatywne)

  test("zapis bez czwartku: żaden czwartkowy termin nie jest już oferowany, wtorki zostają", async () => {
    const mentorId = await mentorWithSet();
    const weekdays = async () =>
      new Set(
        (await listOpenSlotsForMentor({ db: db.pool, mentorId, now: LATER })).map(
          (slot) => localDateParts(slot.startsAt, ZONE).weekday,
        ),
      );
    assert.deepEqual(await weekdays(), new Set([2, 4]));

    const result = await save(mentorId, { timeZone: ZONE, windows: [TUESDAY] }, LATER);
    assert.equal(result.ok, true);
    assert.deepEqual(await weekdays(), new Set([2]));
    assert.ok(result.preview.every((slot) => localDateParts(slot.startsAt, ZONE).weekday === 2));
  });

  // ---------------------------------------------------------------- atomowość

  test("błędne okno w zestawie: błąd przy jego indeksie, nic się nie zmienia (stary zestaw nietknięty)", async () => {
    const mentorId = await mentorWithSet();
    const before = await snapshot(mentorId);
    const result = await save(
      mentorId,
      { timeZone: "America/New_York", windows: [TUESDAY, { weekday: 3, startMinute: 600, endMinute: 615 }] },
      LATER,
    );
    assert.deepEqual(result, { ok: false, errors: { "windows.1": MESSAGES.grid } });
    assert.deepEqual(await snapshot(mentorId), before);
  });

  test("21 okien: zapisane; 22 okna: błąd „Maksymalnie 21 okien w tygodniu”, stary zestaw nietknięty", async () => {
    const mentorId = await createMentor();
    const windowsOf = (count) =>
      Array.from({ length: count }, (_, i) => ({
        weekday: (i % 7) + 1,
        startMinute: Math.floor(i / 7) * 120,
        endMinute: Math.floor(i / 7) * 120 + 60,
      }));
    const ok = await save(mentorId, { timeZone: ZONE, windows: windowsOf(MAX_WINDOWS) });
    assert.equal(ok.ok, true);
    assert.equal((await windowRows(mentorId)).length, 21);

    const before = await snapshot(mentorId);
    const tooMany = await save(mentorId, { timeZone: ZONE, windows: windowsOf(MAX_WINDOWS + 1) }, LATER);
    assert.deepEqual(tooMany, { ok: false, errors: { windows: "Maksymalnie 21 okien w tygodniu" } });
    assert.deepEqual(await snapshot(mentorId), before);
  });

  test("strefa nieobsługiwana: błąd strefy, nic się nie zmienia", async () => {
    const mentorId = await mentorWithSet();
    const before = await snapshot(mentorId);
    for (const timeZone of ["Mars/Olympus", "+02:00", "", undefined]) {
      const result = await save(mentorId, { timeZone, windows: [TUESDAY] }, LATER);
      assert.deepEqual(result, { ok: false, errors: { timeZone: MESSAGES.timeZone } });
    }
    assert.deepEqual(await snapshot(mentorId), before);
  });

  test("nieznany mentor: błąd, transakcja wycofana — żadne okno nie zostaje", async () => {
    const mentorId = "00000000-0000-4000-8000-000000000000";
    await assert.rejects(save(mentorId, { timeZone: ZONE, windows: [] }), /nie ma mentora/);
    await assert.rejects(save(mentorId, { timeZone: ZONE, windows: [TUESDAY] }));
    assert.deepEqual(await windowRows(mentorId), []);
  });

  test("dwa równoległe zapisy tego samego mentora: wynik to dokładnie jeden z zestawów, nigdy suma", async () => {
    const mentorId = await mentorWithSet();
    const setA = [TUESDAY];
    const setB = [THURSDAY, { weekday: 5, startMinute: 600, endMinute: 660 }];
    const results = await Promise.all([
      save(mentorId, { timeZone: ZONE, windows: setA }, LATER),
      save(mentorId, { timeZone: ZONE, windows: setB }, LATER),
    ]);
    assert.ok(results.every((r) => r.ok));
    const { windows } = await load(mentorId);
    assert.ok(
      JSON.stringify(windows) === JSON.stringify(setA) || JSON.stringify(windows) === JSON.stringify(setB),
      `zestaw po równoległych zapisach: ${JSON.stringify(windows)}`,
    );
  });

  // ---------------------------------------------------------------- sesja i zakres mentora

  test("bez sesji: unauthorized, nic nie zapisane (baza nietknięta)", async () => {
    const mentorId = await mentorWithSet();
    const before = await snapshot(mentorId);
    for (const mentor of [null, undefined, { mentorId: "" }]) {
      const result = await saveAvailabilityForSession({
        db: db.pool,
        mentor,
        input: { timeZone: ZONE, windows: [], mentorId },
        now: LATER,
      });
      assert.deepEqual(result, { ok: false, reason: "unauthorized" });
    }
    assert.deepEqual(await snapshot(mentorId), before);
  });

  test("mentor A nie zapisze okien mentora B (mentorId B w wejściu ignorowane; B bez zmian)", async () => {
    const mentorA = await createMentor();
    const mentorB = await mentorWithSet();
    const beforeB = await snapshot(mentorB);
    const result = await saveAvailabilityForSession({
      db: db.pool,
      mentor: { mentorId: mentorA },
      input: { mentorId: mentorB, timeZone: "America/New_York", windows: [{ ...TUESDAY, mentorId: mentorB }] },
      now: LATER,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(await snapshot(mentorB), beforeB);
    assert.deepEqual(await load(mentorA), { timeZone: "America/New_York", windows: [TUESDAY] });
  });

  // ---------------------------------------------------------------- podgląd i zmiana strefy

  test("podgląd = 10 najbliższych godzin startu z listOpenSlots (obie długości, ta sama kolejność)", async () => {
    const mentorId = await createMentor();
    const windows = [TUESDAY, THURSDAY];
    const result = await save(mentorId, { timeZone: ZONE, windows });
    assert.equal(result.ok, true);
    const all = listOpenSlots({ windows, timeZone: ZONE, now: NOW });
    assert.deepEqual(result.preview, previewSlots(all, 10));
    assert.equal(new Set(result.preview.map((s) => s.startsAt)).size, 10);
    assert.deepEqual(result.preview, all.slice(0, result.preview.length));
    // Pierwszy termin: czwartek 22.10 12:00 czasu polskiego (CEST) = 10:00Z, obie długości.
    assert.deepEqual(result.preview.slice(0, 2), [
      { startsAt: "2026-10-22T10:00:00.000Z", lengthMinutes: 25 },
      { startsAt: "2026-10-22T10:00:00.000Z", lengthMinutes: 50 },
    ]);
  });

  test("zmiana strefy zachowuje czas ścienny okien (te same dni i minuty w nowej strefie)", async () => {
    const mentorId = await mentorWithSet();
    const { windows } = await load(mentorId);
    const result = await save(mentorId, { timeZone: "America/New_York", windows }, LATER);
    assert.equal(result.ok, true);
    assert.deepEqual(await load(mentorId), { timeZone: "America/New_York", windows: [TUESDAY, THURSDAY] });
    // Terminy w nowej strefie zaczynają się o tych samych godzinach zegara (czwartek 12:00 w Nowym Jorku).
    const first = result.preview[0];
    const local = localDateParts(first.startsAt, "America/New_York");
    assert.deepEqual([local.weekday, local.hour, local.minute], [4, 12, 0]);
  });
});
