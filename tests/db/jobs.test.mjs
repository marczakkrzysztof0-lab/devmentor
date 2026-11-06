// Zadania okresowe, zdrowie i rekonsyliacja (spec #24 krok 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { withTransaction } from "../../lib/db/pool.mjs";
import { isAuthorizedCronRequest, jobsHealth, runJobs } from "../../lib/jobs/jobs.mjs";
import { createPayment, openCheckout } from "../../lib/payments/payments.mjs";
import { reconcilePending } from "../../lib/payments/reconcile.mjs";
import { CHECKOUT_REQUEST, makeDeps, paymentRow } from "../payments/helpers.mjs";
import { describeDb } from "./harness.mjs";

const SECRET = "x".repeat(40);

test("autoryzacja zadań: tylko dokładnie `Bearer <CRON_SECRET>`", () => {
  assert.equal(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(isAuthorizedCronRequest(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(isAuthorizedCronRequest(SECRET, SECRET), false);
  assert.equal(isAuthorizedCronRequest(null, SECRET), false);
  assert.equal(isAuthorizedCronRequest("Bearer ", ""), false);
});

describeDb("zadania okresowe i rekonsyliacja (#24 krok 5)", (db) => {
  test("runJobs: zapisuje job_runs, błąd jednego zadania nie zatrzymuje kolejnych (tylko nazwa błędu)", async () => {
    const at = new Date("2026-10-27T10:00:00Z");
    const jobs = [
      { name: "a.ok", run: async () => ({ done: 1 }) },
      {
        name: "b.fails",
        run: async () => {
          throw new TypeError("sekretna treść");
        },
      },
      { name: "c.ok", run: async () => ({ done: 2 }) },
    ];
    const results = await runJobs(jobs, { db }, { now: () => at, log: { error: () => {} } });
    assert.deepEqual(results, { "a.ok": { done: 1 }, "b.fails": { error: "TypeError" }, "c.ok": { done: 2 } });
    const { rows } = await db.query("select name, last_error from job_runs order by name");
    assert.deepEqual(rows, [
      { name: "a.ok", last_error: null },
      { name: "b.fails", last_error: "TypeError" },
      { name: "c.ok", last_error: null },
    ]);
  });

  test("zdrowie: stale po 30 min albo gdy zadanie nigdy nie biegło; failedRefunds", async () => {
    const at = new Date("2026-10-27T10:00:00Z");
    await runJobs([{ name: "h.one", run: async () => ({}) }], { db }, { now: () => at });
    assert.equal((await jobsHealth(db, ["h.one"], new Date(at.getTime() + 29 * 60_000))).stale, false);
    assert.equal((await jobsHealth(db, ["h.one"], new Date(at.getTime() + 31 * 60_000))).stale, true);
    assert.equal((await jobsHealth(db, ["h.one", "h.never"], at)).stale, true);
    const health = await jobsHealth(db, ["h.one"], at);
    assert.equal(typeof health.failedRefunds, "number");
    assert.ok(health.jobs.some((j) => j.name === "h.one" && j.lastRunAt === at.toISOString()));
  });

  test("rekonsyliacja: zaległa płatność → expired przez Stripe albo succeeded, gdy Stripe mówi „complete”; świeża nietknięta", async () => {
    const ctx = makeDeps(db);
    const make = () => withTransaction(db.pool, (tx) => createPayment(tx, { amountMinor: 15000, currency: "PLN" }, ctx.deps));
    const abandoned = await make();
    await openCheckout(abandoned, CHECKOUT_REQUEST, ctx.deps);
    const paidLate = await make();
    await openCheckout(paidLate, CHECKOUT_REQUEST, ctx.deps);
    ctx.fake.completeSession((await paymentRow(db, paidLate)).stripe_checkout_session_id);
    ctx.advance(33 + 2);
    const fresh = await make();
    const counts = await reconcilePending(ctx.deps);
    assert.equal(counts.expired, 1);
    assert.equal(counts.succeeded, 1);
    assert.equal((await paymentRow(db, abandoned)).status, "expired");
    assert.equal((await paymentRow(db, paidLate)).status, "succeeded");
    assert.equal((await paymentRow(db, fresh)).status, "pending");
  });
});
