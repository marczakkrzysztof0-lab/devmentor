// Outbox e-maili (spec #17 krok 6): zapis w transakcji wywołującego, jedna wysyłka, zerowanie params,
// ponowienia i porażka po 24 h, szkic nie jest wysyłany.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withTransaction } from "../../lib/db/pool.mjs";
import { enqueueEmail, sendDue } from "../../lib/email/outbox.mjs";
import { createMemoryTransport } from "../../lib/email/transport.mjs";
import { describeDb } from "./harness.mjs";

const PARAMS = { amount: "150 zł", when: "śr. 28.10.2026, 12:30 (Europe/Warsaw)" };
const quiet = { warn: () => {}, error: () => {} };

describeDb("e-mail: outbox (#17 krok 6)", (db) => {
  test("e-mail w transakcji wycofanej znika razem z nią", async () => {
    const now = new Date();
    await assert.rejects(
      withTransaction(db.pool, async (tx) => {
        await enqueueEmail(tx, { to: "rollback@example.com", template: "refund_succeeded", params: PARAMS }, { now });
        throw new Error("wycofaj");
      }),
    );
    assert.equal((await db.query("select count(*)::int as n from outbound_emails where to_address = 'rollback@example.com'")).rows[0].n, 0);
  });

  test("sendDue wysyła raz i zeruje params; szkic nie jest wysyłany", async () => {
    const now = new Date();
    const id = await enqueueEmail(db, { to: "raz@example.com", template: "refund_succeeded", params: PARAMS }, { now });
    await enqueueEmail(db, { to: null, draft: true, template: "request_confirmation", params: { requestUrl: "http://x/r/t" } }, { now });
    const transport = createMemoryTransport();
    const first = await sendDue(db.pool, { transport, now: () => now, log: quiet }, { ids: [id] });
    const second = await sendDue(db.pool, { transport, now: () => now, log: quiet }, { ids: [id] });
    assert.deepEqual(first, { sent: 1, retry: 0, failed: 0 });
    assert.deepEqual(second, { sent: 0, retry: 0, failed: 0 });
    assert.equal(transport.messages.length, 1);
    assert.equal(transport.messages[0].to, "raz@example.com");
    assert.match(transport.messages[0].subject, /Zwrot 150 zł wykonany/);
    const { rows } = await db.query("select status, params, sent_at from outbound_emails where id = $1", [id]);
    assert.equal(rows[0].status, "sent");
    assert.equal(rows[0].params, null);
    assert.ok(rows[0].sent_at);
    const all = await sendDue(db.pool, { transport, now: () => now, log: quiet });
    assert.equal(all.sent, 0, "szkic bez adresata nie wychodzi");
  });

  test("porażka transportu → ponowienie z odstępem; po 24 h → failed, params wyzerowane, tylko kod błędu", async () => {
    let now = new Date();
    const id = await enqueueEmail(db, { to: "pada@example.com", template: "refund_failed", params: PARAMS }, { now });
    const transport = {
      async send() {
        throw Object.assign(new Error("treść odpowiedzi serwera z danymi"), { code: "ECONNREFUSED" });
      },
    };
    assert.equal((await sendDue(db.pool, { transport, now: () => now, log: quiet }, { ids: [id] })).retry, 1);
    let row = (await db.query("select * from outbound_emails where id = $1", [id])).rows[0];
    assert.equal(row.status, "due");
    assert.equal(row.last_error, "ECONNREFUSED");
    assert.equal(new Date(row.next_attempt_at).getTime(), now.getTime() + 60_000);
    assert.equal((await sendDue(db.pool, { transport, now: () => now, log: quiet }, { ids: [id] })).retry, 0, "jeszcze nie pora");
    now = new Date(now.getTime() + 24 * 3_600_000 + 1000);
    assert.equal((await sendDue(db.pool, { transport, now: () => now, log: quiet }, { ids: [id] })).failed, 1);
    row = (await db.query("select * from outbound_emails where id = $1", [id])).rows[0];
    assert.equal(row.status, "failed");
    assert.equal(row.params, null);
    assert.ok(!row.last_error.includes("treść"));
  });
});
