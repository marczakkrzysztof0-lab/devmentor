// Migracje w górę i w dół na prawdziwej bazie (spec #23, Implementation Plan krok 2; spec #14 faza 1 krok 1
// i faza 2 krok 4; spec #15 krok 1; SDLC risk-high).
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDb } from "./harness.mjs";

const TABLES_0001 = ["invitations", "mentor_pages", "mentors"];
const TABLES_0002 = ["mentor_sessions", "mentor_sign_in_links"];
// 0003 nie tworzy tabel, tylko dodaje kolumny do mentor_pages.
const COLUMNS_0003 = ["currency", "price_25_minor", "price_50_minor"];
const TABLES_0004 = ["availability_windows"];
const ALL_MIGRATIONS = [
  "0001_mentors_invitations_pages",
  "0002_mentor_sign_in",
  "0003_mentor_page_prices",
  "0004_availability",
];

const withHistory = (...tables) => [...tables, "pgmigrations"].sort();

async function tablesIn(db, schema) {
  const { rows } = await db.query(
    "select table_name from information_schema.tables where table_schema = $1 order by table_name",
    [schema],
  );
  return rows.map((row) => row.table_name);
}

// Kolumny z 0003 obecne w mentor_pages (posortowane).
async function priceColumnsIn(db) {
  const { rows } = await db.query(
    `select column_name from information_schema.columns
      where table_schema = $1 and table_name = 'mentor_pages' and column_name = any($2)
      order by column_name`,
    [db.schema, COLUMNS_0003],
  );
  return rows.map((row) => row.column_name);
}

// Kolumna mentors.time_zone z 0004 (true, gdy istnieje).
async function hasTimeZoneColumn(db) {
  const { rows } = await db.query(
    `select 1 from information_schema.columns
      where table_schema = $1 and table_name = 'mentors' and column_name = 'time_zone'`,
    [db.schema],
  );
  return rows.length === 1;
}

describeDb(
  "migracje: up → down → up w jednorazowym schemacie",
  (db) => {
    let publicBefore;

    test("pusty schemat przed migracją", async () => {
      publicBefore = await tablesIn(db, "public");
      assert.deepEqual(await tablesIn(db, db.schema), []);
    });

    test("up wykonuje 0001–0004: wszystkie tabele (i historia pgmigrations), kolumny cen i strefa mentora", async () => {
      const applied = await db.migrate("up");
      assert.deepEqual(
        applied.map((m) => m.name),
        ALL_MIGRATIONS,
      );
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002, ...TABLES_0004));
      assert.deepEqual(await priceColumnsIn(db), COLUMNS_0003);
      assert.equal(await hasTimeZoneColumn(db), true);
    });

    test("migracja nie tworzy niczego w schemacie public", async () => {
      assert.deepEqual(await tablesIn(db, "public"), publicBefore);
    });

    test("ponowne up nie ma nic do zrobienia", async () => {
      assert.deepEqual(await db.migrate("up"), []);
    });

    test("down o jeden krok cofa tylko 0004: znikają availability_windows i mentors.time_zone, reszta zostaje", async () => {
      const reverted = await db.migrate("down", 1);
      assert.deepEqual(
        reverted.map((m) => m.name),
        ["0004_availability"],
      );
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002));
      assert.equal(await hasTimeZoneColumn(db), false);
      assert.deepEqual(await priceColumnsIn(db), COLUMNS_0003);
    });

    test("kolejny krok w dół cofa tylko 0003: znikają kolumny cen, tabele 0001 i 0002 zostają", async () => {
      const reverted = await db.migrate("down", 1);
      assert.deepEqual(
        reverted.map((m) => m.name),
        ["0003_mentor_page_prices"],
      );
      assert.deepEqual(await priceColumnsIn(db), []);
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002));
    });

    test("kolejny krok w dół cofa tylko 0002: znikają mentor_sessions i mentor_sign_in_links", async () => {
      const reverted = await db.migrate("down", 1);
      assert.deepEqual(
        reverted.map((m) => m.name),
        ["0002_mentor_sign_in"],
      );
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001));
    });

    test("up o jeden krok wykonuje tylko 0002 (bez kolumn cen)", async () => {
      const applied = await db.migrate("up", 1);
      assert.deepEqual(
        applied.map((m) => m.name),
        ["0002_mentor_sign_in"],
      );
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002));
      assert.deepEqual(await priceColumnsIn(db), []);
    });

    test("kolejne up o jeden krok wykonuje tylko 0003 (bez tabeli dostępności i strefy)", async () => {
      const applied = await db.migrate("up", 1);
      assert.deepEqual(
        applied.map((m) => m.name),
        ["0003_mentor_page_prices"],
      );
      assert.deepEqual(await priceColumnsIn(db), COLUMNS_0003);
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002));
      assert.equal(await hasTimeZoneColumn(db), false);
    });

    test("kolejne up wykonuje tylko 0004", async () => {
      const applied = await db.migrate("up");
      assert.deepEqual(
        applied.map((m) => m.name),
        ["0004_availability"],
      );
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002, ...TABLES_0004));
      assert.equal(await hasTimeZoneColumn(db), true);
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
      assert.deepEqual(await tablesIn(db, db.schema), withHistory(...TABLES_0001, ...TABLES_0002, ...TABLES_0004));
      assert.deepEqual(await priceColumnsIn(db), COLUMNS_0003);
      assert.equal(await hasTimeZoneColumn(db), true);
      assert.deepEqual(await tablesIn(db, "public"), publicBefore);
    });
  },
  { migrate: false },
);
