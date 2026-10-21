// Sprzątanie harnessu usuwa wyłącznie własne, porzucone schematy testowe (spec #23 Q7).
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  cleanupStaleTestSchemas,
  createTestSchema,
  describeDb,
  newTestSchemaName,
  quoteIdent,
  TEST_SCHEMA_MARKER,
} from "./harness.mjs";

describeDb(
  "harness: jednorazowy schemat i sprzątanie pozostałości",
  (db) => {
    async function schemaExists(name) {
      const { rowCount } = await db.query("select 1 from pg_namespace where nspname = $1", [name]);
      return rowCount === 1;
    }

    test("schemat testowy ma prefiks dm_migtest_, komentarz-marker i jest jedynym search_path", async () => {
      assert.match(db.schema, /^dm_migtest_[0-9a-f]{16}$/);
      const { rows } = await db.query(
        "select obj_description(oid, 'pg_namespace') as comment from pg_namespace where nspname = $1",
        [db.schema],
      );
      assert.equal(rows[0].comment, TEST_SCHEMA_MARKER);
      const { rows: path } = await db.query("show search_path");
      assert.equal(path[0].search_path, db.schema);
    });

    test("test_x i dm_migtest_ bez markera przetrwają, porzucony z markerem znika, działający zostaje", async () => {
      const foreign = "test_x";
      const unmarked = newTestSchemaName();
      const abandoned = newTestSchemaName();
      const foreignExisted = await schemaExists(foreign);

      // „Żywy” uczestnik, jak równolegle działający plik testowy (trzyma advisory lock swojego schematu).
      const live = await createTestSchema({ migrate: false, cleanupStale: false });
      const client = new pg.Client({ connectionString: db.databaseUrl });
      await client.connect();
      try {
        if (!foreignExisted) await client.query(`create schema ${quoteIdent(foreign)}`);
        await client.query(`create schema ${quoteIdent(unmarked)}`);
        await client.query(`create schema ${quoteIdent(abandoned)}`);
        await client.query(`comment on schema ${quoteIdent(abandoned)} is '${TEST_SCHEMA_MARKER}'`);
        await client.query(`create table ${quoteIdent(abandoned)}.leftover (id int)`);

        const dropped = await cleanupStaleTestSchemas(client);

        assert.ok(dropped.includes(abandoned), "porzucony schemat z markerem powinien zniknąć");
        assert.equal(await schemaExists(abandoned), false);
        assert.equal(await schemaExists(foreign), true, "test_x musi przetrwać");
        assert.equal(await schemaExists(unmarked), true, "dm_migtest_ bez markera musi przetrwać");
        assert.equal(await schemaExists(live.schema), true, "schemat działającego testu musi przetrwać");
        assert.equal(await schemaExists(db.schema), true, "własny schemat musi przetrwać");
        assert.equal(await schemaExists("public"), true);
        for (const name of [foreign, unmarked, live.schema, db.schema]) {
          assert.ok(!dropped.includes(name), `${name} nie powinien być usunięty`);
        }
      } finally {
        if (!foreignExisted) await client.query(`drop schema if exists ${quoteIdent(foreign)} cascade`);
        await client.query(`drop schema if exists ${quoteIdent(unmarked)} cascade`);
        await client.query(`drop schema if exists ${quoteIdent(abandoned)} cascade`);
        await client.end();
        await live.dispose();
      }
      assert.equal(await schemaExists(live.schema), false, "dispose() usuwa schemat");
    });
  },
  { migrate: false },
);
