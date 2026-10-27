// Zwrot: outbox + dzierżawa (spec #24 Phase 2, Implementation Plan krok 6 — gwarancje pieniędzy):
// porażka, ponowienie, idempotencja, współbieżność, przejęcie po awarii, 24 h, spór.
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { withTransaction } from "../../lib/db/pool.mjs";
import { createPayment, openCheckout, syncCheckout } from "../../lib/payments/payments.mjs";
import { executeRefund, requestRefund, retryRefunds } from "../../lib/payments/refunds.mjs";
import { processStripeEvent } from "../../lib/payments/webhook.mjs";
import { serverError, timeoutError } from "../payments/fake-stripe.mjs";
import { CHECKOUT_REQUEST, makeDeps, paymentRow } from "../payments/helpers.mjs";
import { describeDb } from "./harness.mjs";

/** Opłacona płatność (Checkout → „deweloper płaci” → syncCheckout). */
async function paidPayment(ctx) {
  const id = await withTransaction(ctx.deps.db, (tx) => createPayment(tx, { amountMinor: 15000, currency: "PLN" }, ctx.deps));
  await openCheckout(id, CHECKOUT_REQUEST, ctx.deps);
  const sessionId = (await paymentRow({ query: (t, p) => ctx.deps.db.query(t, p) }, id)).stripe_checkout_session_id;
  ctx.fake.completeSession(sessionId);
  await syncCheckout(id, sessionId, ctx.deps);
  return id;
}

const request = (ctx, id, reason = "mentor_declined") => withTransaction(ctx.deps.db, (tx) => requestRefund(tx, id, reason, ctx.deps));

describeDb("płatności: zwrot z dzierżawą (#24 krok 6)", (db) => {
  test("requestRefund: tylko opłacona; drugi raz → already; dwa zlecenia → jeden zwrot w Stripe", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    assert.equal(await request(ctx, id), "requested");
    assert.equal(await request(ctx, id, "lapsed"), "already");
    const row = await paymentRow(db, id);
    assert.equal(row.refund_status, "requested");
    assert.equal(row.refund_reason, "mentor_declined");
    assert.deepEqual(await executeRefund(id, ctx.deps), { outcome: "succeeded", attempt: 1 });
    assert.deepEqual(await executeRefund(id, ctx.deps), { outcome: "not_claimed" });
    assert.equal(ctx.fake.count("refunds.create"), 1);
    const done = await paymentRow(db, id);
    assert.equal(done.refund_status, "succeeded");
    assert.ok(done.stripe_refund_id.startsWith("re_test_"));
    assert.equal(done.refund_lease_until, null);
    assert.deepEqual(ctx.events.filter((e) => e.type === "refund.succeeded"), [{ type: "refund.succeeded", paymentId: id }]);

    const unpaid = await withTransaction(db.pool, (tx) => createPayment(tx, { amountMinor: 15000, currency: "PLN" }, ctx.deps));
    await assert.rejects(request(ctx, unpaid), /nie jest opłacona/);
  });

  test("Stripe 500, potem sukces → succeeded w próbie 2 z NOWYM kluczem idempotencji, po odczekaniu 1 min", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    await request(ctx, id);
    ctx.fake.fail("refunds.create", serverError());
    assert.equal((await executeRefund(id, ctx.deps)).outcome, "retry");
    const after = await paymentRow(db, id);
    assert.equal(after.refund_status, "requested");
    assert.match(after.refund_last_error, /^api_error http=500 request=req_fake_/);
    assert.equal(new Date(after.refund_next_attempt_at).getTime(), ctx.clock.now.getTime() + 60_000);
    assert.equal((await executeRefund(id, ctx.deps)).outcome, "not_claimed", "jeszcze nie pora");
    ctx.advance(1);
    assert.deepEqual(await executeRefund(id, ctx.deps), { outcome: "succeeded", attempt: 2 });
    const keys = ctx.fake.calls.filter((c) => c.method === "refunds.create").map((c) => c.options.idempotencyKey);
    assert.deepEqual(keys, [`refund:${id}:1`, `refund:${id}:2`]);
  });

  test("awaria po sukcesie w Stripe (przed zapisem) → po wygaśnięciu dzierżawy kolejna próba PRZEJMUJE zwrot, bez drugiego create", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    await request(ctx, id);
    // Próba 1: zajęcie zatwierdzone, Stripe utworzył zwrot, proces „padł” przed zapisem wyniku
    // (zostaje dzierżawa 5 min i `refund_status = 'requested'`).
    await db.query("update payments set refund_attempts = refund_attempts + 1, refund_lease_until = $2 where id = $1", [
      id,
      new Date(ctx.clock.now.getTime() + 5 * 60_000),
    ]);
    ctx.fake.fail("refunds.create", timeoutError(), { afterEffect: true });
    await ctx.deps.stripe.refunds
      .create({ payment_intent: (await paymentRow(db, id)).stripe_payment_intent_id, metadata: { payment_id: id } }, { idempotencyKey: `refund:${id}:1` })
      .catch(() => {});
    assert.equal((await executeRefund(id, ctx.deps)).outcome, "not_claimed", "dzierżawa jeszcze trwa");
    ctx.advance(6);
    assert.deepEqual(await executeRefund(id, ctx.deps), { outcome: "succeeded", attempt: 2 });
    assert.equal(ctx.fake.count("refunds.create"), 1, "zwrot przejęty, nie utworzony drugi raz");
    assert.equal(ctx.fake.refunds.size, 1);
  });

  test("dwóch pracowników na dwóch połączeniach → jedno create w Stripe", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    await request(ctx, id);
    ctx.fake.setDelay(50);
    const second = new pg.Pool({ connectionString: db.databaseUrl, options: `-c search_path=${db.schema}`, max: 2 });
    try {
      const [a, b] = await Promise.all([executeRefund(id, ctx.deps), executeRefund(id, { ...ctx.deps, db: second })]);
      assert.deepEqual([a.outcome, b.outcome].sort(), ["not_claimed", "succeeded"]);
    } finally {
      ctx.fake.setDelay(0);
      await second.end();
    }
    assert.equal(ctx.fake.count("refunds.create"), 1);
  });

  test("pracownik, któremu wygasła dzierżawa, nie nadpisze nowszej próby; Stripe odmawia drugiego zwrotu → sukces", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    await request(ctx, id);
    ctx.fake.setDelay(400);
    const slow = executeRefund(id, ctx.deps); // próba 1 — wolna (czeka na odpowiedź Stripe)
    while ((await paymentRow(db, id)).refund_attempts < 1) await new Promise((resolve) => setTimeout(resolve, 5));
    // Dzierżawa próby 1 „wygasa”: druga próba zajmuje wiersz.
    ctx.advance(6);
    ctx.fake.setDelay(0);
    const fast = await executeRefund(id, ctx.deps);
    const late = await slow;
    assert.equal(fast.attempt, 2);
    assert.ok(["succeeded", "lost_lease"].includes(late.outcome));
    const row = await paymentRow(db, id);
    assert.equal(row.refund_status, "succeeded");
    assert.equal(row.refund_attempts, 2);
    assert.equal(ctx.fake.refunds.size, 1, "pieniądze zwrócone raz");
  });

  test("charge_already_refunded → succeeded", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    const pi = (await paymentRow(db, id)).stripe_payment_intent_id;
    await ctx.deps.stripe.refunds.create({ payment_intent: pi, metadata: {} }, { idempotencyKey: "panel" });
    ctx.fake.refunds.forEach((r) => (r.status = "canceled")); // nie do przejęcia
    ctx.fake.refunds.forEach((r) => (r.amount = 15000));
    // Stripe liczy anulowany jako niezwrócony — wymuszamy odmowę jak przy pełnym zwrocie.
    ctx.fake.fail("refunds.create", () => Object.assign(new Error("x"), { statusCode: 400, code: "charge_already_refunded", type: "StripeInvalidRequestError" }));
    await request(ctx, id);
    assert.equal((await executeRefund(id, ctx.deps)).outcome, "succeeded");
    assert.equal((await paymentRow(db, id)).refund_status, "succeeded");
  });

  test("zwrot zlecony w transakcji webhooka wykonuje następne uruchomienie zadania", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    // Subskrybent na charge.dispute nie istnieje — symulujemy zlecenie w transakcji przetwarzania zdarzenia.
    await withTransaction(db.pool, async (tx) => {
      await tx.query("insert into stripe_events (event_id, type) values ($1, 'test')", [`evt_${id}`]);
      await requestRefund(tx, id, "invalid_on_payment", ctx.deps);
    });
    const counts = await retryRefunds(ctx.deps);
    assert.equal(counts.succeeded, 1);
    assert.equal((await paymentRow(db, id)).refund_status, "succeeded");
  });

  test("zwrot pending u Stripe → zamknięty sprawdzaniem po godzinie", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    await request(ctx, id);
    ctx.fake.setRefundStatus("pending");
    assert.equal((await executeRefund(id, ctx.deps)).outcome, "pending");
    const refundId = (await paymentRow(db, id)).stripe_refund_id;
    ctx.fake.setRefund(refundId, "succeeded");
    assert.equal((await retryRefunds(ctx.deps)).polled, 0, "przed upływem godziny nie sprawdzamy");
    ctx.advance(61);
    assert.equal((await retryRefunds(ctx.deps)).polled, 1);
    assert.equal((await paymentRow(db, id)).refund_status, "succeeded");
    assert.ok(ctx.events.some((e) => e.type === "refund.succeeded" && e.paymentId === id));
  });

  test("24 h porażek → failed + refund.failed + licznik w zdrowiu", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    await request(ctx, id);
    ctx.fake.fail("refunds.create", serverError(), { times: 100 });
    for (let i = 0; i < 40; i += 1) {
      await executeRefund(id, ctx.deps);
      ctx.advance(60);
      if ((await paymentRow(db, id)).refund_status === "failed") break;
    }
    const row = await paymentRow(db, id);
    assert.equal(row.refund_status, "failed");
    assert.ok(row.refund_last_error.startsWith("api_error"));
    assert.ok(!/fake stripe error/.test(row.refund_last_error), "bez treści komunikatu Stripe");
    assert.deepEqual(ctx.events.filter((e) => e.type === "refund.failed"), [{ type: "refund.failed", paymentId: id }]);
    const { rows } = await db.query("select count(*)::int as n from payments where refund_status = 'failed'");
    assert.ok(rows[0].n >= 1);
  });

  test("spór (chargeback) → failed od razu, bez wywołania Stripe", async () => {
    const ctx = makeDeps(db);
    const id = await paidPayment(ctx);
    const pi = (await paymentRow(db, id)).stripe_payment_intent_id;
    await processStripeEvent({ id: `evt_dispute_${id}`, type: "charge.dispute.created", livemode: false, data: { object: { id: "dp_1", payment_intent: pi } } }, ctx.deps);
    await request(ctx, id);
    const before = ctx.fake.calls.length;
    assert.equal((await executeRefund(id, ctx.deps)).outcome, "failed");
    assert.equal(ctx.fake.calls.length, before);
    const row = await paymentRow(db, id);
    assert.equal(row.refund_last_error, "disputed");
    assert.ok(row.disputed_at);
  });
});
