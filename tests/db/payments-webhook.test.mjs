// Webhook Stripe (spec #24 krok 4): podpis (prawdziwa weryfikacja SDK, `generateTestHeaderString`),
// deduplikacja, korelacja zdarzeń Checkout, błąd subskrybenta.
import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { withTransaction } from "../../lib/db/pool.mjs";
import { createPayment, openCheckout } from "../../lib/payments/payments.mjs";
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

const countEvents = async (db) => (await db.query("select count(*)::int as n from stripe_events")).rows[0].n;

describeDb("płatności: webhook Stripe (#24 krok 4, 7)", (db) => {
  test("zły podpis, brak podpisu, stary znacznik czasu → 400, nic nie zapisane", async () => {
    const ctx = makeDeps(db);
    const before = await countEvents(db);
    const payload = event("checkout.session.completed", { id: "cs_x" });
    assert.equal((await deliver(ctx, payload, { secret: "whsec_PLACEHOLDER_other" })).status, 400);
    assert.equal((await handleStripeWebhook({ rawBody: JSON.stringify(payload), signature: null }, ctx.deps, verifyStripeEvent)).status, 400);
    assert.equal((await deliver(ctx, payload, { timestamp: Math.floor(Date.now() / 1000) - 600 })).status, 400);
    // Podpis poprawny, ale ciało zmienione po podpisaniu.
    const good = signed(payload);
    assert.equal((await handleStripeWebhook({ rawBody: good.rawBody.replace("cs_x", "cs_y"), signature: good.signature }, ctx.deps, verifyStripeEvent)).status, 400);
    assert.equal(await countEvents(db), before);
  });

  test("livemode → 400 i log", async () => {
    const ctx = makeDeps(db);
    const result = await deliver(ctx, event("checkout.session.completed", { id: "cs_live" }, { livemode: true }));
    assert.equal(result.status, 400);
    assert.ok(ctx.logs.some(([level, text]) => level === "error" && text.includes("livemode")));
  });

  test("checkout.session.completed → succeeded; to samo zdarzenie drugi raz → przetworzone raz; expired po completed → bez zmian", async () => {
    const ctx = makeDeps(db);
    const id = await openPayment(ctx);
    const sessionId = (await paymentRow(db, id)).stripe_checkout_session_id;
    const session = ctx.fake.completeSession(sessionId, { email: "ola@example.com" });
    const payload = event("checkout.session.completed", session);
    assert.deepEqual(await deliver(ctx, payload), { status: 200, body: { received: true, result: "applied" } });
    assert.deepEqual(await deliver(ctx, payload), { status: 200, body: { received: true, result: "duplicate" } });
    const row = await paymentRow(db, id);
    assert.equal(row.status, "succeeded");
    assert.equal(row.payer_email, "ola@example.com");
    const expired = { ...session, status: "expired" };
    assert.equal((await deliver(ctx, event("checkout.session.expired", expired))).body.result, "noop");
    assert.equal((await paymentRow(db, id)).status, "succeeded");
    assert.deepEqual(ctx.events, [{ type: "payment.succeeded", paymentId: id }]);
  });

  test("checkout.session.expired → expired; nieznana płatność i niezgodna kwota → 200 bez zmian", async () => {
    const ctx = makeDeps(db);
    const id = await openPayment(ctx);
    const sessionId = (await paymentRow(db, id)).stripe_checkout_session_id;
    const mismatched = { ...ctx.fake.sessions.get(sessionId), status: "complete", payment_status: "paid", amount_total: 1 };
    assert.equal((await deliver(ctx, event("checkout.session.completed", mismatched))).body.result, "noop");
    assert.equal((await paymentRow(db, id)).status, "pending");
    const unknown = { id: "cs_unknown", metadata: { payment_id: "00000000-0000-4000-8000-000000000000" }, status: "complete" };
    assert.deepEqual(await deliver(ctx, event("checkout.session.completed", unknown)), { status: 200, body: { received: true, result: "ignored" } });
    const session = ctx.fake.expireSession(sessionId);
    assert.equal((await deliver(ctx, event("checkout.session.expired", session))).body.result, "applied");
    assert.equal((await paymentRow(db, id)).status, "expired");
  });

  test("nieobsługiwany typ → 200, zignorowany", async () => {
    const ctx = makeDeps(db);
    assert.deepEqual(await deliver(ctx, event("customer.created", { id: "cus_1" })), { status: 200, body: { received: true, result: "ignored" } });
  });

  test("subskrybent rzuca → 500, bez wiersza stripe_events; ponowne dostarczenie po naprawie działa", async () => {
    let broken = true;
    const ctx = makeDeps(db, {
      subscribers: [
        async () => {
          if (broken) throw new Error("awaria subskrybenta");
        },
      ],
    });
    const id = await openPayment(ctx);
    const session = ctx.fake.completeSession((await paymentRow(db, id)).stripe_checkout_session_id);
    const payload = event("checkout.session.completed", session);
    assert.equal((await deliver(ctx, payload)).status, 500);
    assert.equal((await db.query("select 1 from stripe_events where event_id = $1", [payload.id])).rowCount, 0);
    assert.equal((await paymentRow(db, id)).status, "pending");
    broken = false;
    assert.equal((await deliver(ctx, payload)).body.result, "applied");
    assert.equal((await paymentRow(db, id)).status, "succeeded");
  });
});
