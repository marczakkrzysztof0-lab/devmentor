// Migracja w górę i w dół na prawdziwej bazie (spec #23, Implementation Plan krok 2; SDLC risk-high).
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDb } from "./harness.mjs";

const TABLES = ["invitations", "mentor_pages", "mentors"];

async function tablesIn(db, schema) {
  const { rows } = await db.query(
    "select table_name from information_schema.tables where table_schema = $1 order by table_name",
    [schema],
  );
  return rows.map((row) => row.table_name);
}

describeDb(
  "migracje: up → down → up w jednorazowym schemacie",
  (db) => {
    let publicBefore;

    test("pusty schemat przed migracją", async () => {
      publicBefore = await tablesIn(db, "public");
      assert.deepEqual(await tablesIn(db, db.schema), []);
    });

    test("up tworzy mentors, invitations, mentor_pages (i historię pgmigrations)", async () => {
      const applied = await db.migrate("up");
      assert.deepEqual(
        applied.map((m) => m.name),
        ["0001_mentors_invitations_pages"],
      );
      const tables = await tablesIn(db, db.schema);
      assert.deepEqual(tables, [...TABLES, "pgmigrations"].sort());
    });

    test("migracja nie tworzy niczego w schemacie public", async () => {
      assert.deepEqual(await tablesIn(db, "public"), publicBefore);
    });

    test("ponowne up nie ma nic do zrobienia", async () => {
      assert.deepEqual(await db.migrate("up"), []);
    });

    test("down usuwa wszystkie trzy tabele", async () => {
      const reverted = await db.migrate("down");
      assert.deepEqual(
        reverted.map((m) => m.name),
        ["0001_mentors_invitations_pages"],
      );
      const tables = await tablesIn(db, db.schema);
      for (const table of TABLES) assert.ok(!tables.includes(table), `${table} nadal istnieje`);
      assert.deepEqual(tables, ["pgmigrations"]);
      const { rows } = await db.query("select count(*)::int as n from pgmigrations");
      assert.equal(rows[0].n, 0);
    });

    test("ponowne up odtwarza schemat", async () => {
      await db.migrate("up");
      assert.deepEqual(await tablesIn(db, db.schema), [...TABLES, "pgmigrations"].sort());
      assert.deepEqual(await tablesIn(db, "public"), publicBefore);
    });
  },
  { migrate: false },
);
