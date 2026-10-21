// Tygodniowa dostępność mentora (spec #15, Data Model „availability_windows”, „mentors — time_zone”, Q2;
// Implementation Plan krok 1; migracja 0004).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describeDb } from "./harness.mjs";

const unique = () => randomBytes(6).toString("hex");

// Oczekuje błędu PostgreSQL o danym kodzie (i opcjonalnie nazwie ograniczenia).
async function assertPgError(promise, code, constraint) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    if (constraint) assert.equal(error.constraint, constraint, error.message);
    return true;
  });
}

async function createMentor(db) {
  const { rows } = await db.query("insert into mentors (email) values ($1) returning *", [
    `mentor-${unique()}@example.com`,
  ]);
  return rows[0];
}

async function insertWindow(db, mentorId, { weekday = 1, start_minute = 540, end_minute = 600 } = {}) {
  const { rows } = await db.query(
    `insert into availability_windows (mentor_id, weekday, start_minute, end_minute)
     values ($1, $2, $3, $4) returning *`,
    [mentorId, weekday, start_minute, end_minute],
  );
  return rows[0];
}

async function countWindows(db, mentorId) {
  const { rows } = await db.query("select count(*)::int as n from availability_windows where mentor_id = $1", [
    mentorId,
  ]);
  return rows[0].n;
}

describeDb("schemat 0004: availability_windows i mentors.time_zone", (db) => {
  let mentor;

  test("time_zone mentora domyślnie null; strefa IANA zapisuje się", async () => {
    mentor = await createMentor(db);
    assert.equal(mentor.time_zone, null);
    const { rows } = await db.query("update mentors set time_zone = $2 where id = $1 returning time_zone", [
      mentor.id,
      "Europe/Warsaw",
    ]);
    assert.equal(rows[0].time_zone, "Europe/Warsaw");
  });

  test("time_zone: pusta albo z samych spacji jest odrzucana", async () => {
    for (const timeZone of ["", "   "]) {
      await assertPgError(
        db.query("update mentors set time_zone = $2 where id = $1", [mentor.id, timeZone]),
        "23514",
        "mentors_time_zone_not_blank",
      );
    }
  });

  test("poprawne okno: domyślne id i created_at", async () => {
    const window = await insertWindow(db, mentor.id);
    assert.match(window.id, /^[0-9a-f-]{36}$/);
    assert.ok(window.created_at instanceof Date);
    assert.equal(window.weekday, 1);
    assert.equal(window.start_minute, 540);
    assert.equal(window.end_minute, 600);
  });

  test("granice przyjmowane: 0–30, 1410–1440, cały dzień 0–1440, weekday 1 i 7", async () => {
    for (const fields of [
      { start_minute: 0, end_minute: 30 },
      { start_minute: 1410, end_minute: 1440 },
      { start_minute: 0, end_minute: 1440 },
      { weekday: 1 },
      { weekday: 7 },
    ]) {
      const window = await insertWindow(db, mentor.id, fields);
      for (const [column, value] of Object.entries(fields)) assert.equal(window[column], value);
    }
  });

  test("weekday 0 i 8 są odrzucane", async () => {
    for (const weekday of [0, 8, -1]) {
      await assertPgError(insertWindow(db, mentor.id, { weekday }), "23514", "availability_windows_weekday_range");
    }
  });

  test("start_minute poza siatką 30 minut lub poza zakresem jest odrzucany", async () => {
    for (const start_minute of [15, 45, 1425, -30]) {
      await assertPgError(
        insertWindow(db, mentor.id, { start_minute, end_minute: 1440 }),
        "23514",
        "availability_windows_start_minute_grid",
      );
    }
    // Start 1440 łamie też „koniec > początek” (koniec ≤ 1440) — PostgreSQL zgłasza jedno z dwóch ograniczeń.
    await assert.rejects(insertWindow(db, mentor.id, { start_minute: 1440, end_minute: 1440 }), (error) => {
      assert.equal(error.code, "23514", error.message);
      assert.ok(
        ["availability_windows_start_minute_grid", "availability_windows_end_after_start"].includes(error.constraint),
        error.message,
      );
      return true;
    });
  });

  test("end_minute poza siatką 30 minut lub poza zakresem jest odrzucany", async () => {
    for (const end_minute of [15, 45, 1425, 1470]) {
      await assertPgError(
        insertWindow(db, mentor.id, { start_minute: 0, end_minute }),
        "23514",
        "availability_windows_end_minute_grid",
      );
    }
  });

  test("koniec ≤ początek jest odrzucany (okna nie przechodzą przez północ)", async () => {
    for (const [start_minute, end_minute] of [
      [600, 600],
      [600, 540],
      [1410, 60],
    ]) {
      await assertPgError(
        insertWindow(db, mentor.id, { start_minute, end_minute }),
        "23514",
        "availability_windows_end_after_start",
      );
    }
  });

  test("brak wymaganych pól jest odrzucany (NOT NULL)", async () => {
    for (const column of ["weekday", "start_minute", "end_minute"]) {
      await assertPgError(insertWindow(db, mentor.id, { [column]: null }), "23502");
    }
    await assertPgError(insertWindow(db, null), "23502");
  });

  test("nieznany mentor jest odrzucany (klucz obcy)", async () => {
    await assertPgError(
      insertWindow(db, "00000000-0000-4000-8000-000000000000"),
      "23503",
      "availability_windows_mentor_id_fkey",
    );
  });

  test("nakładające się i identyczne okna tego samego dnia są dozwolone", async () => {
    const other = await createMentor(db);
    await insertWindow(db, other.id, { weekday: 3, start_minute: 540, end_minute: 720 });
    await insertWindow(db, other.id, { weekday: 3, start_minute: 600, end_minute: 660 });
    await insertWindow(db, other.id, { weekday: 3, start_minute: 540, end_minute: 720 });
    assert.equal(await countWindows(db, other.id), 3);
  });

  test("usunięcie mentora usuwa jego okna (ON DELETE CASCADE), cudze zostają", async () => {
    const doomed = await createMentor(db);
    const keeper = await createMentor(db);
    await insertWindow(db, doomed.id, { weekday: 2 });
    await insertWindow(db, doomed.id, { weekday: 5 });
    await insertWindow(db, keeper.id, { weekday: 2 });
    await db.query("delete from mentors where id = $1", [doomed.id]);
    assert.equal(await countWindows(db, doomed.id), 0);
    assert.equal(await countWindows(db, keeper.id), 1);
  });

  test("indeks po mentor_id istnieje", async () => {
    const { rows } = await db.query(
      "select indexdef from pg_indexes where schemaname = $1 and indexname = 'availability_windows_mentor_id_idx'",
      [db.schema],
    );
    assert.equal(rows.length, 1);
    assert.match(rows[0].indexdef, /\(mentor_id\)/);
  });
});
