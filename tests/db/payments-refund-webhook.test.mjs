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
    assert.equal((await deliver(ctx, event("refund.updated", { id: refundId, payment_intent: pi, status: "succeeded" }))).body.result, "applied");
    assert.equal((await paymentRow(db, id)).refund_status, "succeeded");
    assert.equal((await deliver(ctx, event("refund.updated", { id: refundId, payment_intent: pi, status: "pending" }))).body.result, "noop");
    assert.equal((await paymentRow(db, id)).refund_status, "succeeded");
    // Inny zwrot niż zapisany → pominięty.
    assert.equal((await deliver(ctx, event("refund.updated", { id: "re_other", payment_intent: pi, status: "failed" }))).body.result, "ignored");
  });

  test("refund.failed dla oczekującego zwrotu → failed + refund.failed", async () => {
    const ctx = makeDeps(db);
    const { id, pi } = await paid(ctx);
    await withTransaction(db.pool, (tx) => requestRefund(tx, id, "mentee_cancelled", ctx.deps));
    ctx.fake.setRefundStatus("pending");
    await executeRefund(id, ctx.deps);
    const refundId = (await paymentRow(db, id)).stripe_refund_id;
    assert.equal((await deliver(ctx, event("refund.failed", { id: refundId, payment_intent: pi, status: "failed" }))).body.result, "applied");
    assert.equal((await paymentRow(db, id)).refund_status, "failed");
    assert.ok(ctx.events.some((e) => e.type === "refund.failed" && e.paymentId === id));
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
