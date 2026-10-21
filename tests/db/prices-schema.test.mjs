// Ceny i waluta strony mentora (spec #14, Data Model „mentor_pages — new columns”, Q2, Q3; migracja 0003).
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

const CONTENT = {
  display_name: "Ala Kowalska",
  public_work_url: "https://github.com/ala",
  description: "Pomagam w code review i architekturze frontendu.",
};
const PRICES = { price_25_minor: 15000, price_50_minor: 28000 };

async function createMentor(db) {
  const { rows } = await db.query("insert into mentors (email) values ($1) returning id", [
    `mentor-${unique()}@example.com`,
  ]);
  return rows[0].id;
}

// Wstawia stronę tylko z podanymi kolumnami (działa też przed 0003, gdy kolumn cen nie ma).
async function insertPage(db, fields = {}) {
  const page = { mentor_id: await createMentor(db), slug: `m-${unique()}`, ...fields };
  const columns = Object.keys(page);
  const { rows } = await db.query(
    `insert into mentor_pages (${columns.join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    Object.values(page),
  );
  return rows[0];
}

async function priceColumns(db) {
  const { rows } = await db.query(
    `select column_name from information_schema.columns
      where table_schema = $1 and table_name = 'mentor_pages'
        and column_name in ('price_25_minor', 'price_50_minor', 'currency')
      order by column_name`,
    [db.schema],
  );
  return rows.map((row) => row.column_name);
}

describeDb("schemat 0003: ceny i waluta mentor_pages", (db) => {
  test("szkic: ceny null, waluta domyślnie PLN", async () => {
    const page = await insertPage(db);
    assert.equal(page.price_25_minor, null);
    assert.equal(page.price_50_minor, null);
    assert.equal(page.currency, "PLN");
  });

  test("publikacja z treścią i obiema cenami przechodzi", async () => {
    const page = await insertPage(db, { ...CONTENT, ...PRICES, published_at: new Date() });
    assert.equal(page.price_25_minor, 15000);
    assert.equal(page.price_50_minor, 28000);
    assert.ok(page.published_at instanceof Date);
  });

  test("Q3: publikacja bez którejkolwiek ceny jest odrzucana", async () => {
    for (const missing of [["price_25_minor"], ["price_50_minor"], ["price_25_minor", "price_50_minor"]]) {
      const prices = { ...PRICES };
      for (const column of missing) prices[column] = null;
      await assertPgError(
        insertPage(db, { ...CONTENT, ...prices, published_at: new Date() }),
        "23514",
        "published_requires_content",
      );
    }
  });

  test("Q3: szkicu z cenami nie da się opublikować bez ceny, a opublikowanej strony — pozbawić ceny", async () => {
    const draft = await insertPage(db, { ...CONTENT, price_25_minor: 15000 });
    await assertPgError(
      db.query("update mentor_pages set published_at = now() where id = $1", [draft.id]),
      "23514",
      "published_requires_content",
    );
    const published = await insertPage(db, { ...CONTENT, ...PRICES, published_at: new Date() });
    await assertPgError(
      db.query("update mentor_pages set price_50_minor = null where id = $1", [published.id]),
      "23514",
      "published_requires_content",
    );
  });

  test("treść nadal wymagana przy publikacji (reguła R03 z 0001 zachowana)", async () => {
    for (const missing of Object.keys(CONTENT)) {
      await assertPgError(
        insertPage(db, { ...CONTENT, ...PRICES, [missing]: "  ", published_at: new Date() }),
        "23514",
        "published_requires_content",
      );
    }
  });

  test("cena 0 lub ujemna jest odrzucana (także w szkicu)", async () => {
    for (const [column, constraint] of [
      ["price_25_minor", "mentor_pages_price_25_minor_positive"],
      ["price_50_minor", "mentor_pages_price_50_minor_positive"],
    ]) {
      for (const value of [0, -1, -15000]) {
        await assertPgError(insertPage(db, { [column]: value }), "23514", constraint);
      }
    }
  });

  test("cena 1 grosz jest przyjmowana (baza pilnuje tylko > 0)", async () => {
    const page = await insertPage(db, { price_25_minor: 1, price_50_minor: 1 });
    assert.equal(page.price_25_minor, 1);
  });

  test("waluta: kod ISO z 3 wielkich liter; małe litery, 2 i 4 znaki oraz null są odrzucane", async () => {
    assert.equal((await insertPage(db, { currency: "EUR" })).currency, "EUR");
    for (const currency of ["pln", "Pln", "PLNX", "PL", "", "PL1"]) {
      await assertPgError(insertPage(db, { currency }), "23514", "mentor_pages_currency_format");
    }
    await assertPgError(insertPage(db, { currency: null }), "23502");
  });
});

describeDb(
  "migracja 0003: strażnik opublikowanych stron i cofnięcie",
  (db) => {
    test("strażnik przerywa 0003, gdy istnieje opublikowana strona; nic nie zostaje zmienione", async () => {
      const applied = await db.migrate("up", 2);
      assert.deepEqual(
        applied.map((m) => m.name),
        ["0001_mentors_invitations_pages", "0002_mentor_sign_in"],
      );
      const page = await insertPage(db, { ...CONTENT, published_at: new Date() });

      await assert.rejects(db.migrate("up"), (error) => {
        // Błąd z bloku DO $$ … $$ (dowód, że node-pg-migrate nie przetwarza $$ ani {} w pliku SQL).
        const messages = [error, error.cause].filter(Boolean).map((e) => String(e.message)).join(" | ");
        assert.match(messages, /0003_mentor_page_prices: istnieją opublikowane strony mentorów/, messages);
        return true;
      });

      const { rows } = await db.query("select name from pgmigrations order by id");
      assert.deepEqual(
        rows.map((row) => row.name),
        ["0001_mentors_invitations_pages", "0002_mentor_sign_in"],
      );
      assert.deepEqual(await priceColumns(db), []);
      const { rows: pages } = await db.query("select published_at from mentor_pages where id = $1", [page.id]);
      assert.ok(pages[0].published_at instanceof Date);
    });

    test("bez opublikowanych stron 0003 przechodzi", async () => {
      await db.query("update mentor_pages set published_at = null");
      const applied = await db.migrate("up", 1);
      assert.deepEqual(
        applied.map((m) => m.name),
        ["0003_mentor_page_prices"],
      );
      assert.deepEqual(await priceColumns(db), ["currency", "price_25_minor", "price_50_minor"]);
    });

    test("down 0003 przywraca regułę z 0001: publikacja z treścią bez cen znów przechodzi", async () => {
      await insertPage(db, { ...CONTENT, ...PRICES, published_at: new Date() });
      const reverted = await db.migrate("down", 1);
      assert.deepEqual(
        reverted.map((m) => m.name),
        ["0003_mentor_page_prices"],
      );
      assert.deepEqual(await priceColumns(db), []);

      const page = await insertPage(db, { ...CONTENT, published_at: new Date() });
      assert.ok(page.published_at instanceof Date);
      // Reguła treści z 0001 nadal działa.
      await assertPgError(
        insertPage(db, { ...CONTENT, description: " ", published_at: new Date() }),
        "23514",
        "published_requires_content",
      );
      const { rows } = await db.query(
        `select pg_get_constraintdef(c.oid) as def
           from pg_constraint c join pg_namespace n on n.oid = c.connamespace
          where n.nspname = $1 and c.conname = 'published_requires_content'`,
        [db.schema],
      );
      assert.equal(rows.length, 1);
      assert.doesNotMatch(rows[0].def, /price/);
    });
  },
  { migrate: false },
);
