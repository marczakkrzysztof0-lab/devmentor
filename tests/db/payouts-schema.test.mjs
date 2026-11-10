import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDb } from "./harness.mjs";

describeDb("payouts schema 0009", (db) => {
  test("schema includes payout tables, refund marker and guarded constraints", async () => {
    const { rows } = await db.query(
      `select table_name
       from information_schema.tables
       where table_schema = $1 and table_name = any($2)
       order by table_name`,
      [db.schema, ["mentor_payout_accounts", "payouts"]],
    );
    assert.deepEqual(rows.map((row) => row.table_name), ["mentor_payout_accounts", "payouts"]);

    const refund = await db.query(
      `select 1
       from information_schema.columns
       where table_schema = $1 and table_name = 'payments' and column_name = 'refund_seen_at'`,
      [db.schema],
    );
    assert.equal(refund.rowCount, 1);

    const math = await db.query("select (500000::bigint - (500000::bigint * 9999 / 10000))::int share");
    assert.equal(math.rows[0].share, 50);

    const indexes = await db.query(
      `select indexname
       from pg_indexes
       where schemaname = $1 and indexname = any($2)`,
      [db.schema, ["payouts_open_idx", "payouts_transferring_idx", "payouts_mentor_idx"]],
    );
    assert.equal(indexes.rowCount, 3);
  });
});
