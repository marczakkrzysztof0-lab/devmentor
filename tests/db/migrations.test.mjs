// Migracje w górę i w dół na prawdziwej bazie (spec #23, Implementation Plan krok 2; spec #14 faza 1 krok 1;
// SDLC risk-high).
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDb } from "./harness.mjs";

const TABLES_0001 = ["invitations", "mentor_pages", "mentors"];
const TABLES_0002 = ["mentor_sessions", "mentor_sign_in_links"];
const ALL_MIGRATIONS = ["0001_mentors_invitations_pages", "0002_mentor_sign_in"];

const withHistory = (...tables) => [...tables, "pgmigrations"].sort();

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

    test("up wykonuje 0001 i 0002 i tworzy wszystkie tabele (i historię pgmigrations)", async () => {
      const applied = await db.migrate("up");
      assert.deepEqual(
        applied.map((m) => m.name),
        ALL_MIGRATIONS,
      );
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002));
    });

    test("migracja nie tworzy niczego w schemacie public", async () => {
      assert.deepEqual(await tablesIn(db, "public"), publicBefore);
    });

    test("ponowne up nie ma nic do zrobienia", async () => {
      assert.deepEqual(await db.migrate("up"), []);
    });

    test("down o jeden krok cofa tylko 0002: znikają mentor_sessions i mentor_sign_in_links", async () => {
      const reverted = await db.migrate("down", 1);
      assert.deepEqual(
        reverted.map((m) => m.name),
        ["0002_mentor_sign_in"],
      );
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001));
    });

    test("up po cofnięciu 0002 wykonuje tylko 0002", async () => {
      const applied = await db.migrate("up");
      assert.deepEqual(
        applied.map((m) => m.name),
        ["0002_mentor_sign_in"],
      );
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002));
    });

    test("down do zera usuwa wszystkie tabele", async () => {
      const reverted = await db.migrate("down", ALL_MIGRATIONS.length);
      assert.deepEqual(
        reverted.map((m) => m.name),
        [...ALL_MIGRATIONS].reverse(),
      );
      assert.deepEqual(await tablesIn(db, db.schema), ["pgmigrations"]);
      const { rows } = await db.query("select count(*)::int as n from pgmigrations");
      assert.equal(rows[0].n, 0);
    });

    test("ponowne up odtwarza schemat", async () => {
      await db.migrate("up");
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002));
      assert.deepEqual(await tablesIn(db, "public"), publicBefore);
    });
  },
  { migrate: false },
);
