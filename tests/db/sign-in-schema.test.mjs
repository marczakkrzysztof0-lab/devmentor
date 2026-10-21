// Ograniczenia tabel sesji i linków logowania (spec #14, Data Model; migracja 0002).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describeDb } from "./harness.mjs";

const unique = () => randomBytes(6).toString("hex");
const tokenHash = () => randomBytes(32).toString("hex");
const inHours = (hours) => new Date(Date.now() + hours * 3600 * 1000);

// Oczekuje błędu PostgreSQL o danym kodzie (i opcjonalnie nazwie ograniczenia).
async function assertPgError(promise, code, constraint) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    if (constraint) assert.equal(error.constraint, constraint, error.message);
    return true;
  });
}

const TABLES = {
  mentor_sessions: { hours: 30 * 24, uniqueKey: "mentor_sessions_token_hash_key", endedColumn: "revoked_at" },
  mentor_sign_in_links: { hours: 72, uniqueKey: "mentor_sign_in_links_token_hash_key", endedColumn: "used_at" },
};

describeDb("schemat 0002: mentor_sessions, mentor_sign_in_links", (db) => {
  async function createMentor() {
    const { rows } = await db.query("insert into mentors (email) values ($1) returning id", [
      `mentor-${unique()}@example.com`,
    ]);
    return rows[0].id;
  }

  /** Wstawia wiersz do `table`; pola domyślne można nadpisać (także na null). */
  async function insertRow(table, fields = {}) {
    const row = { token_hash: tokenHash(), expires_at: inHours(TABLES[table].hours), ...fields };
    if (!("mentor_id" in fields)) row.mentor_id = await createMentor();
    const { rows } = await db.query(
      `insert into ${table} (mentor_id, token_hash, expires_at) values ($1, $2, $3) returning *`,
      [row.mentor_id, row.token_hash, row.expires_at],
    );
    return rows[0];
  }

  for (const table of Object.keys(TABLES)) {
    test(`${table}: domyślne wartości (uuid, created_at, brak zużycia/odwołania)`, async () => {
      const row = await insertRow(table);
      assert.match(row.id, /^[0-9a-f-]{36}$/);
      assert.ok(row.created_at instanceof Date);
      assert.equal(row[TABLES[table].endedColumn], null);
    });

    test(`${table}: token_hash unikalny (także między mentorami)`, async () => {
      const hash = tokenHash();
      await insertRow(table, { token_hash: hash });
      await assertPgError(insertRow(table, { token_hash: hash }), "23505", TABLES[table].uniqueKey);
    });

    test(`${table}: mentor_id, token_hash i expires_at wymagane`, async () => {
      await assertPgError(insertRow(table, { mentor_id: null }), "23502");
      await assertPgError(insertRow(table, { token_hash: null }), "23502");
      await assertPgError(insertRow(table, { expires_at: null }), "23502");
    });

    test(`${table}: mentor_id musi wskazywać istniejącego mentora`, async () => {
      await assertPgError(
        insertRow(table, { mentor_id: "00000000-0000-4000-8000-000000000000" }),
        "23503",
        `${table}_mentor_id_fkey`,
      );
    });
  }

  test("usunięcie mentora usuwa jego sesje i linki logowania, cudzych nie rusza", async () => {
    const mentorId = await createMentor();
    const otherId = await createMentor();
    const ids = {};
    for (const table of Object.keys(TABLES)) {
      ids[table] = {
        own: [(await insertRow(table, { mentor_id: mentorId })).id, (await insertRow(table, { mentor_id: mentorId })).id],
        other: (await insertRow(table, { mentor_id: otherId })).id,
      };
    }

    await db.query("delete from mentors where id = $1", [mentorId]);

    for (const table of Object.keys(TABLES)) {
      const { rows } = await db.query(`select id from ${table} where id = any($1::uuid[])`, [
        [...ids[table].own, ids[table].other],
      ]);
      assert.deepEqual(
        rows.map((row) => row.id),
        [ids[table].other],
        `${table}: zostać ma tylko wiersz innego mentora`,
      );
    }
  });
});
