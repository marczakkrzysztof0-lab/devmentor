// Zapytania dostępności z bazą (spec #15, API Contracts `isSlotOffered`, Implementation Plan krok 3):
// pusty wynik bez okien, mapowanie kolumn, zgodność z `listOpenSlots`, semantyka dokładnego dopasowania,
// zakres mentora A/B. Czas zawsze jawny (`NOW`).
//
// NOW = środa 2026-10-21 10:00Z = 12:00 w Europe/Warsaw (CEST, UTC+2; zmiana czasu 25.10).
// Okna mentora A: środa 12:00–14:00, czwartek 18:00–20:00 (+ nakładające się 19:00–20:00).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  hasAvailabilityWindows,
  isSlotOffered,
  listOpenSlotsForMentor,
  loadAvailability,
} from "../../lib/availability/queries.mjs";
import { listOpenSlots } from "../../lib/availability/slots.mjs";
import { describeDb } from "./harness.mjs";

const NOW = new Date("2026-10-21T10:00:00.000Z");
const ZONE = "Europe/Warsaw";

// Czwartek 22.10, 18:00 czasu polskiego (CEST).
const THU_18 = "2026-10-22T16:00:00.000Z";

describeDb("availability queries: okna, strefa, isSlotOffered", (db) => {
  const createMentor = async (timeZone = null) => {
    const { rows } = await db.query("insert into mentors (email, time_zone) values ($1, $2) returning id", [
      `mentor-${randomBytes(6).toString("hex")}@example.com`,
      timeZone,
    ]);
    return rows[0].id;
  };

  const insertWindows = async (mentorId, windows) => {
    for (const [weekday, start, end] of windows) {
      await db.query(
        "insert into availability_windows (mentor_id, weekday, start_minute, end_minute) values ($1, $2, $3, $4)",
        [mentorId, weekday, start, end],
      );
    }
  };

  /** Mentor A: strefa + okna wstawione celowo w innej kolejności niż wynik (test sortowania). */
  const mentorWithWindows = async () => {
    const mentorId = await createMentor(ZONE);
    await insertWindows(mentorId, [
      [4, 1140, 1200], // czwartek 19:00–20:00 (nakłada się na 18:00–20:00)
      [3, 720, 840], // środa 12:00–14:00
      [4, 1080, 1200], // czwartek 18:00–20:00
    ]);
    return mentorId;
  };

  const offered = (mentorId, startsAt, lengthMinutes, extra = {}) =>
    isSlotOffered({ db: db.pool, mentorId, startsAt, lengthMinutes, now: NOW, ...extra });

  // ---------------------------------------------------------------- bez okien

  test("mentor bez okien i bez strefy: puste okna, brak terminów, nic nie jest oferowane", async () => {
    const mentorId = await createMentor();
    assert.deepEqual(await loadAvailability({ db: db.pool, mentorId }), { timeZone: null, windows: [] });
    assert.deepEqual(await listOpenSlotsForMentor({ db: db.pool, mentorId, now: NOW }), []);
    assert.equal(await offered(mentorId, THU_18, 25), false);
    assert.equal(await hasAvailabilityWindows({ db: db.pool, mentorId }), false);
  });

  test("nieznany mentor: puste okna, brak terminów", async () => {
    const mentorId = "00000000-0000-4000-8000-000000000000";
    assert.deepEqual(await loadAvailability({ db: db.pool, mentorId }), { timeZone: null, windows: [] });
    assert.equal(await offered(mentorId, THU_18, 25), false);
    assert.equal(await hasAvailabilityWindows({ db: db.pool, mentorId }), false);
  });

  test("okna bez strefy (time_zone null): brak terminów", async () => {
    const mentorId = await createMentor();
    await insertWindows(mentorId, [[4, 1080, 1200]]);
    assert.deepEqual(await listOpenSlotsForMentor({ db: db.pool, mentorId, now: NOW }), []);
    assert.equal(await offered(mentorId, THU_18, 25), false);
    assert.equal(await hasAvailabilityWindows({ db: db.pool, mentorId }), true);
  });

  // ---------------------------------------------------------------- z oknami

  test("loadAvailability: kolumny → camelCase, sortowanie po dniu, początku, końcu", async () => {
    const mentorId = await mentorWithWindows();
    assert.deepEqual(await loadAvailability({ db: db.pool, mentorId }), {
      timeZone: ZONE,
      windows: [
        { weekday: 3, startMinute: 720, endMinute: 840 },
        { weekday: 4, startMinute: 1080, endMinute: 1200 },
        { weekday: 4, startMinute: 1140, endMinute: 1200 },
      ],
    });
    assert.equal(await hasAvailabilityWindows({ db: db.pool, mentorId }), true);
  });

  test("listOpenSlotsForMentor = listOpenSlots na tych samych danych (także z busy)", async () => {
    const mentorId = await mentorWithWindows();
    const { timeZone, windows } = await loadAvailability({ db: db.pool, mentorId });
    const busy = [{ startsAt: THU_18, endsAt: "2026-10-22T16:30:00.000Z" }];
    const fromDb = await listOpenSlotsForMentor({ db: db.pool, mentorId, now: NOW });
    assert.ok(fromDb.length > 0);
    assert.deepEqual(fromDb, listOpenSlots({ windows, timeZone, now: NOW }));
    assert.deepEqual(
      await listOpenSlotsForMentor({ db: db.pool, mentorId, now: NOW, busy }),
      listOpenSlots({ windows, timeZone, now: NOW, busy }),
    );
  });

  test("isSlotOffered: oferowany termin → true (obie długości, także zapis +02:00 i Date)", async () => {
    const mentorId = await mentorWithWindows();
    assert.equal(await offered(mentorId, THU_18, 25), true);
    assert.equal(await offered(mentorId, THU_18, 50), true);
    assert.equal(await offered(mentorId, "2026-10-22T18:00:00+02:00", 50), true);
    assert.equal(await offered(mentorId, new Date(THU_18), 25), true);
    // Ostatnie 30 minut okna: 25 minut się mieści.
    assert.equal(await offered(mentorId, "2026-10-22T17:30:00.000Z", 25), true);
    // Po zmianie czasu (CET, UTC+1): czwartek 29.10 18:00 lokalnie = 17:00Z, w horyzoncie.
    assert.equal(await offered(mentorId, "2026-10-29T17:00:00.000Z", 25), true);
  });

  test("isSlotOffered: false poza siatką, przy złej długości, w wyprzedzeniu, poza oknami, za horyzontem, przy kolizji", async () => {
    const mentorId = await mentorWithWindows();
    // Start poza siatką :00/:30.
    assert.equal(await offered(mentorId, "2026-10-22T16:15:00.000Z", 25), false);
    // 50 minut w ostatnich 30 minutach okna (19:30–20:20 wychodzi poza 20:00).
    assert.equal(await offered(mentorId, "2026-10-22T17:30:00.000Z", 50), false);
    // Długość spoza R01.
    assert.equal(await offered(mentorId, THU_18, 30), false);
    // W oknie, ale w wyprzedzeniu 3 h: środa 12:30 lokalnie = 10:30Z (< NOW + 180 min).
    assert.equal(await offered(mentorId, "2026-10-21T10:30:00.000Z", 25), false);
    // Poza oknami: czwartek 12:00 lokalnie.
    assert.equal(await offered(mentorId, "2026-10-22T10:00:00.000Z", 25), false);
    // Za horyzontem 14 dni: czwartek 5.11 18:00 CET = 17:00Z (> NOW + 14 × 24 h).
    assert.equal(await offered(mentorId, "2026-11-05T17:00:00.000Z", 25), false);
    // Kolizja z busy [16:00Z, 16:30Z); przylegający start 16:30Z dalej oferowany.
    const busy = [{ startsAt: THU_18, endsAt: "2026-10-22T16:30:00.000Z" }];
    assert.equal(await offered(mentorId, THU_18, 25, { busy }), false);
    assert.equal(await offered(mentorId, THU_18, 50, { busy }), false);
    assert.equal(await offered(mentorId, "2026-10-22T16:30:00.000Z", 25, { busy }), true);
    // Niepoprawna data startu.
    assert.equal(await offered(mentorId, "nie-data", 25), false);
  });

  test("granica wyprzedzenia: start = now + 3 h → true, 30 minut wcześniej → false", async () => {
    const mentorId = await mentorWithWindows();
    const now = new Date("2026-10-21T07:30:00.000Z"); // now + 3 h = 10:30Z = środa 12:30 lokalnie
    const check = (startsAt) => isSlotOffered({ db: db.pool, mentorId, startsAt, lengthMinutes: 25, now });
    assert.equal(await check("2026-10-21T10:30:00.000Z"), true);
    assert.equal(await check("2026-10-21T10:00:00.000Z"), false);
  });

  // ---------------------------------------------------------------- zakres A/B

  test("zakres: okna mentora A nie wpływają na terminy mentora B (i odwrotnie)", async () => {
    const mentorA = await mentorWithWindows();
    const mentorB = await createMentor(ZONE);
    assert.deepEqual(await loadAvailability({ db: db.pool, mentorId: mentorB }), { timeZone: ZONE, windows: [] });
    assert.deepEqual(await listOpenSlotsForMentor({ db: db.pool, mentorId: mentorB, now: NOW }), []);
    assert.equal(await offered(mentorB, THU_18, 25), false);
    assert.equal(await hasAvailabilityWindows({ db: db.pool, mentorId: mentorB }), false);

    // B dostaje własne okno (poniedziałek 9:00–10:00): dalej bez terminów A, a A bez terminów B.
    await insertWindows(mentorB, [[1, 540, 600]]);
    const ownWindows = [{ weekday: 1, startMinute: 540, endMinute: 600 }];
    assert.deepEqual(
      await listOpenSlotsForMentor({ db: db.pool, mentorId: mentorB, now: NOW }),
      listOpenSlots({ windows: ownWindows, timeZone: ZONE, now: NOW }),
    );
    assert.equal(await offered(mentorB, THU_18, 25), false);
    // Poniedziałek 26.10 9:00 CET = 08:00Z — oferowany przez B, nie przez A.
    assert.equal(await offered(mentorB, "2026-10-26T08:00:00.000Z", 50), true);
    assert.equal(await offered(mentorA, "2026-10-26T08:00:00.000Z", 50), false);
    assert.equal(await offered(mentorA, THU_18, 25), true);
  });
});
