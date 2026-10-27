// Webhooki zwrotów i sporów (spec #24 krok 7): charge.refunded, refund.updated/failed, charge.dispute.created.
import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { withTransaction } from "../../lib/db/pool.mjs";
import { createPayment, openCheckout, syncCheckout } from "../../lib/payments/payments.mjs";
import { executeRefund, requestRefund } from "../../lib/payments/refunds.mjs";
import { verifyStripeEvent } from "../../lib/payments/stripe-client.mjs";
import { handleStripeWebhook } from "../../lib/payments/webhook.mjs";
import { CHECKOUT_REQUEST, makeDeps, paymentRow, TEST_CONFIG } from "../payments/helpers.mjs";
import { describeDb } from "./harness.mjs";

let seq = 0;
const event = (type, object, extra = {}) => ({ id: `evt_test_${Date.now()}_${++seq}`, object: "event", type, livemode: false, data: { object }, ...extra });

function signed(payloadObject, { secret = TEST_CONFIG.webhookSecret, timestamp } = {}) {
  const rawBody = JSON.stringify(payloadObject);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret, ...(timestamp ? { timestamp } : {}) });
  return { rawBody, signature };
}

const deliver = (ctx, payload, options) => handleStripeWebhook(signed(payload, options), ctx.deps, verifyStripeEvent);

async function openPayment(ctx) {
  const id = await withTransaction(ctx.deps.db, (tx) => createPayment(tx, { amountMinor: 15000, currency: "PLN" }, ctx.deps));
  await openCheckout(id, CHECKOUT_REQUEST, ctx.deps);
  return id;
}

describeDb("płatności: webhooki zwrotów i sporów (#24 krok 7)", (db) => {
  async function paid(ctx) {
    const id = await openPayment(ctx);
    const sessionId = (await paymentRow(db, id)).stripe_checkout_session_id;
    ctx.fake.completeSession(sessionId);
    await syncCheckout(id, sessionId, ctx.deps);
    return { id, pi: (await paymentRow(db, id)).stripe_payment_intent_id };
  }

  test("charge.refunded (pełny) zamyka zlecony zwrot; częściowy → bez zmian", async () => {
    const ctx = makeDeps(db);
    const { id, pi } = await paid(ctx);
    await withTransaction(db.pool, (tx) => requestRefund(tx, id, "mentor_declined", ctx.deps));
    assert.equal((await deliver(ctx, event("charge.refunded", { id: "ch_1", payment_intent: pi, amount_refunded: 5000 }))).body.result, "ignored");
    assert.equal((await paymentRow(db, id)).refund_status, "requested");
    assert.equal((await deliver(ctx, event("charge.refunded", { id: "ch_1", payment_intent: pi, amount_refunded: 15000, refunds: { data: [{ id: "re_panel_1" }] } }))).body.result, "applied");
    const row = await paymentRow(db, id);
    assert.equal(row.refund_status, "succeeded");
    assert.equal(row.refund_reason, "mentor_declined");
    assert.equal(row.stripe_refund_id, "re_panel_1");
    assert.ok(ctx.events.some((e) => e.type === "refund.succeeded"));
  });

  test("zwrot z panelu Stripe (bez zlecenia) → succeeded, powód external, ostrzeżenie", async () => {
    const ctx = makeDeps(db);
    const { id, pi } = await paid(ctx);
    assert.equal((await deliver(ctx, event("charge.refunded", { id: "ch_2", payment_intent: pi, amount_refunded: 15000 }))).body.result, "applied");
    const row = await paymentRow(db, id);
    assert.equal(row.refund_status, "succeeded");
    assert.equal(row.refund_reason, "external");
    assert.ok(ctx.logs.some(([level, text]) => level === "warn" && text.includes("external")));
  });

  test("refund.updated(pending) po succeeded → bez zmian; refund.updated(succeeded) zamyka pending", async () => {
    const ctx = makeDeps(db);
    const { id, pi } = await paid(ctx);
    await withTransaction(db.pool, (tx) => requestRefund(tx, id, "lapsed", ctx.deps));
    ctx.fake.setRefundStatus("pending");
    await executeRefund(id, ctx.deps);
    const refundId = (await paymentRow(db, id)).stripe_refund_id;
    assert.equal((await deliver(ctx, event("refund.updated", { ...ctx.fake.refunds.get(refundId), status: "succeeded" }))).body.result, "applied");
    assert.equal((await paymentRow(db, id)).refund_status, "succeeded");
    assert.equal((await deliver(ctx, event("refund.updated", { ...ctx.fake.refunds.get(refundId), status: "pending" }))).body.result, "noop");
    assert.equal((await paymentRow(db, id)).refund_status, "succeeded");
    // Inny zwrot niż zapisany → pominięty.
    assert.equal((await deliver(ctx, event("refund.updated", { id: "re_other", payment_intent: pi, status: "failed" }))).body.result, "ignored");
  });

  test("refund.failed dla oczekującego zwrotu → failed + refund.failed", async () => {
    const ctx = makeDeps(db);
    const { id } = await paid(ctx);
    await withTransaction(db.pool, (tx) => requestRefund(tx, id, "mentee_cancelled", ctx.deps));
    ctx.fake.setRefundStatus("pending");
    await executeRefund(id, ctx.deps);
    const refundId = (await paymentRow(db, id)).stripe_refund_id;
    assert.equal((await deliver(ctx, event("refund.failed", { ...ctx.fake.refunds.get(refundId), status: "failed" }))).body.result, "applied");
    assert.equal((await paymentRow(db, id)).refund_status, "failed");
    assert.ok(ctx.events.some((e) => e.type === "refund.failed" && e.paymentId === id));
  });

  // ---- review Codexa (PR #40): powiązanie, kwota i waluta zwrotu; konflikt webhooka z pracownikiem trzymającym dzierżawę

  test("refund.updated(succeeded) częściowy, w innej walucie albo obcy (panel Stripe) → bez przejścia, log; zwrot częściowy blokuje automatyczny", async () => {
    const ctx = makeDeps(db);
    const { id, pi } = await paid(ctx);
    await withTransaction(db.pool, (tx) => requestRefund(tx, id, "mentor_declined", ctx.deps));
    const partial = ctx.fake.dashboardRefund(pi, 5000);
    const partialOurs = { ...partial, metadata: { payment_id: id } };
    const otherCurrency = { ...partial, amount: 15000, currency: "eur", metadata: { payment_id: id } };
    const foreignFull = { ...partial, amount: 15000 }; // pełna kwota, ale bez naszego id i metadanych
    for (const refund of [partial, partialOurs, otherCurrency, foreignFull]) {
      assert.equal((await deliver(ctx, event("refund.updated", refund))).body.result, "ignored", JSON.stringify(refund));
    }
    const row = await paymentRow(db, id);
    assert.equal(row.refund_status, "requested");
    assert.equal(row.stripe_refund_id, null);
    assert.ok(!ctx.events.some((e) => e.type === "refund.succeeded"));
    assert.ok(ctx.logs.some(([level, text]) => level === "warn" && text.includes("nie jest pełnym zwrotem")));
    // Zwrot częściowy w Stripe blokuje automatyczny pełny zwrot → failed (obsługa ręczna), bez create.
    assert.equal((await executeRefund(id, ctx.deps)).outcome, "failed");
    assert.equal(ctx.fake.count("refunds.create"), 0);
    assert.equal((await paymentRow(db, id)).refund_last_error, "partial_refund_exists");
  });

  test("refund.updated(succeeded) z zapisanym id, ale inną kwotą → bez przejścia", async () => {
    const ctx = makeDeps(db);
    const { id } = await paid(ctx);
    await withTransaction(db.pool, (tx) => requestRefund(tx, id, "lapsed", ctx.deps));
    ctx.fake.setRefundStatus("pending");
    await executeRefund(id, ctx.deps);
    const refundId = (await paymentRow(db, id)).stripe_refund_id;
    const wrong = { ...ctx.fake.refunds.get(refundId), status: "succeeded", amount: 100 };
    assert.equal((await deliver(ctx, event("refund.updated", wrong))).body.result, "ignored");
    assert.equal((await paymentRow(db, id)).refund_status, "pending");
  });

  test("webhook refund.updated(succeeded) w trakcie dzierżawy pracownika → jedno przejście, jedno zdarzenie, zapis pracownika przegrywa", async () => {
    const ctx = makeDeps(db);
    const { id } = await paid(ctx);
    await withTransaction(db.pool, (tx) => requestRefund(tx, id, "mentor_declined", ctx.deps));
    ctx.fake.setRefundStatus("pending");
    // Stripe utworzył zwrot; zanim pracownik zapisze wynik, przychodzi webhook „succeeded” tego zwrotu.
    ctx.fake.afterNext("refunds.create", async (refund) => {
      assert.ok((await paymentRow(db, id)).refund_lease_until, "pracownik trzyma dzierżawę");
      assert.equal((await deliver(ctx, event("refund.updated", { ...refund, status: "succeeded" }))).body.result, "applied");
    });
    assert.equal((await executeRefund(id, ctx.deps)).outcome, "lost_lease");
    const row = await paymentRow(db, id);
    assert.equal(row.refund_status, "succeeded");
    assert.equal(row.refund_lease_until, null);
    assert.ok(row.stripe_refund_id);
    assert.equal(ctx.events.filter((e) => e.type === "refund.succeeded").length, 1);
    assert.equal(ctx.fake.count("refunds.create"), 1);
  });

  test("webhook refund.updated(pending) w trakcie dzierżawy, potem refund.failed dostarczony dwa razy równolegle → failed raz; pracownik nie nadpisuje", async () => {
    const ctx = makeDeps(db);
    const { id } = await paid(ctx);
    await withTransaction(db.pool, (tx) => requestRefund(tx, id, "mentee_cancelled", ctx.deps));
    ctx.fake.setRefundStatus("succeeded"); // odpowiedź create mówi „succeeded”, ale webhook „pending” był pierwszy
    let refundId = "";
    ctx.fake.afterNext("refunds.create", async (refund) => {
      refundId = refund.id;
      assert.equal((await deliver(ctx, event("refund.updated", { ...refund, status: "pending" }))).body.result, "applied");
    });
    assert.equal((await executeRefund(id, ctx.deps)).outcome, "lost_lease");
    let row = await paymentRow(db, id);
    assert.equal(row.refund_status, "pending");
    assert.equal(row.stripe_refund_id, refundId);
    const payload = event("refund.failed", { ...ctx.fake.refunds.get(refundId), status: "failed" });
    const [a, b] = await Promise.all([deliver(ctx, payload), deliver(ctx, payload)]);
    assert.deepEqual([a.body.result, b.body.result].sort(), ["applied", "duplicate"]);
    row = await paymentRow(db, id);
    assert.equal(row.refund_status, "failed");
    assert.equal(ctx.events.filter((e) => e.type === "refund.failed").length, 1);
  });

  test("charge.dispute.created → tylko disputed_at", async () => {
    const ctx = makeDeps(db);
    const { id, pi } = await paid(ctx);
    assert.equal((await deliver(ctx, event("charge.dispute.created", { id: "dp_1", payment_intent: pi }))).body.result, "applied");
    const row = await paymentRow(db, id);
    assert.ok(row.disputed_at);
    assert.equal(row.status, "succeeded");
    assert.equal(row.refund_status, null);
    assert.equal((await deliver(ctx, event("charge.dispute.created", { id: "dp_1", payment_intent: pi }))).body.result, "noop");
  });
});
