// Pula `lib/db` i `withTransaction` (spec #14, Implementation Plan faza 1 krok 1).
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { closePool, createPool, getPool, MISSING_DATABASE_URL_MESSAGE, withTransaction } from "../../lib/db/pool.mjs";
import { describeDb } from "./harness.mjs";

const unique = () => randomBytes(6).toString("hex");

describe("getPool: leniwy singleton z DATABASE_URL (bez bazy)", () => {
  const original = process.env.DATABASE_URL;
  afterEach(async () => {
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  test("import modułu nie tworzy puli", () => {
    assert.equal(globalThis[Symbol.for("devmentor.db.pool")], undefined);
  });

  test("zwraca tę samą pulę przy kolejnych wywołaniach (bez łączenia z bazą)", () => {
    process.env.DATABASE_URL = "postgresql://nikt:nic@127.0.0.1:1/brak";
    const pool = getPool();
    assert.ok(pool instanceof pg.Pool);
    assert.equal(getPool(), pool);
    assert.equal(pool.totalCount, 0);
  });

  test("po closePool tworzy nową pulę", async () => {
    process.env.DATABASE_URL = "postgresql://nikt:nic@127.0.0.1:1/brak";
    const first = getPool();
    await closePool();
    assert.notEqual(getPool(), first);
  });

  test("brak DATABASE_URL → czytelny błąd", () => {
    delete process.env.DATABASE_URL;
    assert.throws(() => getPool(), { message: MISSING_DATABASE_URL_MESSAGE });
    assert.throws(() => createPool("  "), { message: MISSING_DATABASE_URL_MESSAGE });
  });
});

describeDb("withTransaction na prawdziwej bazie", (db) => {
  const emailsIn = async (emails) => {
    const { rows } = await db.query("select email from mentors where email = any($1::text[]) order by email", [emails]);
    return rows.map((row) => row.email);
  };

  test("pula: sukces → COMMIT, wynik zwrócony, klient wraca do puli", async () => {
    const email = `tx-ok-${unique()}@example.com`;
    const result = await withTransaction(db.pool, async (client) => {
      await client.query("insert into mentors (email) values ($1)", [email]);
      return "gotowe";
    });
    assert.equal(result, "gotowe");
    assert.deepEqual(await emailsIn([email]), [email]);
    assert.equal(db.pool.idleCount, db.pool.totalCount);
  });

  test("pula: wyjątek → ROLLBACK, ten sam błąd rzucony dalej", async () => {
    const email = `tx-fail-${unique()}@example.com`;
    const boom = new Error("celowy błąd");
    await assert.rejects(
      withTransaction(db.pool, async (client) => {
        await client.query("insert into mentors (email) values ($1)", [email]);
        throw boom;
      }),
      (error) => error === boom,
    );
    assert.deepEqual(await emailsIn([email]), []);
    assert.equal(db.pool.idleCount, db.pool.totalCount);
  });

  test("pula: błąd SQL w środku → ROLLBACK wcześniejszych zapytań", async () => {
    const email = `tx-sql-${unique()}@example.com`;
    await assert.rejects(
      withTransaction(db.pool, async (client) => {
        await client.query("insert into mentors (email) values ($1)", [email]);
        await client.query("insert into mentors (email) values ($1)", [email.toUpperCase()]);
      }),
      { code: "23505" },
    );
    assert.deepEqual(await emailsIn([email]), []);
  });

  test("klient: transakcja na podanym kliencie, bez zwalniania go", async () => {
    const ok = `tx-client-ok-${unique()}@example.com`;
    const fail = `tx-client-fail-${unique()}@example.com`;
    const client = await db.pool.connect();
    try {
      await withTransaction(client, async (tx) => {
        assert.equal(tx, client);
        await tx.query("insert into mentors (email) values ($1)", [ok]);
      });
      await assert.rejects(
        withTransaction(client, async (tx) => {
          await tx.query("insert into mentors (email) values ($1)", [fail]);
          throw new Error("celowy błąd");
        }),
        { message: "celowy błąd" },
      );
      // Klient nadal używalny i poza transakcją.
      const { rows } = await client.query("select now() = statement_timestamp() as outside");
      assert.equal(rows[0].outside, true);
    } finally {
      client.release();
    }
    assert.deepEqual(await emailsIn([ok, fail]), [ok]);
  });
});
