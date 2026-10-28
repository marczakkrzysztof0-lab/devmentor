// Opłata kartą przez Stripe Checkout (spec #24 Phase 1, Implementation Plan krok 3) — fałszywy Stripe, prawdziwa baza.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withTransaction } from "../../lib/db/pool.mjs";
import { CheckoutFailed, InvalidAmount } from "../../lib/payments/errors.mjs";
import { createPayment, expireCheckout, openCheckout, syncCheckout } from "../../lib/payments/payments.mjs";
import { invalidRequestError, timeoutError } from "../payments/fake-stripe.mjs";
import { CHECKOUT_REQUEST, makeDeps, paymentRow } from "../payments/helpers.mjs";
import { describeDb } from "./harness.mjs";

const QUESTION = "Jak przenieść cache z pages routera do app routera bez psucia testów?";

async function newPayment(ctx, amountMinor = 15000) {
  return withTransaction(ctx.deps.db, (tx) => createPayment(tx, { amountMinor, currency: "PLN" }, ctx.deps));
}

describeDb("płatności: opłata przez Checkout (#24 krok 3)", (db) => {
  test("createPayment: pending, migawka prowizji, czas wygaśnięcia; zła waluta i kwota poniżej minimum → InvalidAmount", async () => {
    const ctx = makeDeps(db);
    const id = await newPayment(ctx);
    const row = await paymentRow(db, id);
    assert.equal(row.status, "pending");
    assert.equal(row.amount_minor, 15000);
    assert.equal(row.currency, "PLN");
    assert.equal(row.commission_bps, 1000);
    assert.equal(new Date(row.checkout_expires_at).getTime(), ctx.clock.now.getTime() + 33 * 60_000);
    await assert.rejects(withTransaction(db.pool, (tx) => createPayment(tx, { amountMinor: 15000, currency: "EUR" }, ctx.deps)), InvalidAmount);
    await assert.rejects(withTransaction(db.pool, (tx) => createPayment(tx, { amountMinor: 199, currency: "PLN" }, ctx.deps)), InvalidAmount);
    const lower = await withTransaction(db.pool, (tx) => createPayment(tx, { amountMinor: 200, currency: "pln" }, ctx.deps));
    assert.equal((await paymentRow(db, lower)).currency, "PLN");
  });

  test("openCheckout: do Stripe nie trafia nic o zapytaniu; ponowne otwarcie bez drugiego wywołania Stripe", async () => {
    const ctx = makeDeps(db);
    const id = await newPayment(ctx);
    const first = await openCheckout(id, CHECKOUT_REQUEST, ctx.deps);
    const again = await openCheckout(id, CHECKOUT_REQUEST, ctx.deps);
    assert.equal(again.url, first.url);
    assert.equal(ctx.fake.count("checkout.sessions.create"), 1);
    const call = ctx.fake.calls.find((c) => c.method === "checkout.sessions.create");
    assert.equal(call.options.idempotencyKey, `checkout:${id}`);
    assert.deepEqual(call.params.metadata, { payment_id: id });
    assert.deepEqual(call.params.payment_method_types, ["card"]);
    assert.equal(call.params.line_items[0].price_data.currency, "pln");
    assert.equal(call.params.line_items[0].price_data.unit_amount, 15000);
    assert.ok(!JSON.stringify(call.params).includes(QUESTION.slice(0, 20)));
    const row = await paymentRow(db, id);
    assert.ok(row.stripe_checkout_session_id.startsWith("cs_test_"));
    assert.equal(row.stripe_checkout_url, first.url);
  });

  test("openCheckout: błąd jednoznaczny → expired + payment.expired, CheckoutFailed bez ponowienia", async () => {
    const ctx = makeDeps(db);
    const id = await newPayment(ctx);
    ctx.fake.fail("checkout.sessions.create", invalidRequestError());
    await assert.rejects(openCheckout(id, CHECKOUT_REQUEST, ctx.deps), (error) => error instanceof CheckoutFailed && error.retryable === false);
    assert.equal((await paymentRow(db, id)).status, "expired");
    assert.deepEqual(ctx.events, [{ type: "payment.expired", paymentId: id }]);
  });

  test("openCheckout: timeout po utworzeniu sesji → pending, ponowienie odzyskuje TĘ SAMĄ sesję", async () => {
    const ctx = makeDeps(db);
    const id = await newPayment(ctx);
    ctx.fake.fail("checkout.sessions.create", timeoutError(), { afterEffect: true });
    await assert.rejects(openCheckout(id, CHECKOUT_REQUEST, ctx.deps), (error) => error instanceof CheckoutFailed && error.retryable === true);
    const pending = await paymentRow(db, id);
    assert.equal(pending.status, "pending");
    assert.equal(pending.stripe_checkout_session_id, null);
    const retried = await openCheckout(id, CHECKOUT_REQUEST, ctx.deps);
    assert.equal(ctx.fake.sessions.size, 1);
    const [sessionId] = ctx.fake.sessions.keys();
    assert.equal((await paymentRow(db, id)).stripe_checkout_session_id, sessionId);
    assert.ok(retried.url.includes(sessionId));
    assert.deepEqual(ctx.events, []);
  });

  test("syncCheckout: obca sesja i niezgodna kwota → bez zmian; dwa razy → jedno przejście", async () => {
    const ctx = makeDeps(db);
    const id = await newPayment(ctx);
    await openCheckout(id, CHECKOUT_REQUEST, ctx.deps);
    const sessionId = (await paymentRow(db, id)).stripe_checkout_session_id;

    // Obca sesja (inna płatność), nawet opłacona → ignorowana.
    const other = await newPayment(ctx);
    await openCheckout(other, CHECKOUT_REQUEST, ctx.deps);
    const otherSession = (await paymentRow(db, other)).stripe_checkout_session_id;
    ctx.fake.completeSession(otherSession);
    assert.equal((await syncCheckout(id, otherSession, ctx.deps)).status, "pending");

    // Niezgodna kwota (sesja zmieniona po stronie Stripe) → bez zmian.
    ctx.fake.completeSession(sessionId);
    ctx.fake.sessions.get(sessionId).amount_total = 100;
    assert.equal((await syncCheckout(id, sessionId, ctx.deps)).status, "pending");
    ctx.fake.sessions.get(sessionId).amount_total = 15000;

    const [a, b] = await Promise.all([syncCheckout(id, sessionId, ctx.deps), syncCheckout(id, sessionId, ctx.deps)]);
    assert.equal(a.status, "succeeded");
    assert.equal(b.status, "succeeded");
    const row = await paymentRow(db, id);
    assert.equal(row.payer_email, "kuba@example.com");
    assert.ok(row.stripe_payment_intent_id.startsWith("pi_test_"));
    assert.deepEqual(ctx.events.filter((e) => e.paymentId === id), [{ type: "payment.succeeded", paymentId: id }]);
  });

  test("expireCheckout: sesja otwarta → expired; sesja opłacona tuż przed → succeeded (Stripe decyduje)", async () => {
    const ctx = makeDeps(db);
    const open = await newPayment(ctx);
    await openCheckout(open, CHECKOUT_REQUEST, ctx.deps);
    assert.equal((await expireCheckout(open, ctx.deps)).status, "expired");

    const paid = await newPayment(ctx);
    await openCheckout(paid, CHECKOUT_REQUEST, ctx.deps);
    ctx.fake.completeSession((await paymentRow(db, paid)).stripe_checkout_session_id);
    assert.equal((await expireCheckout(paid, ctx.deps)).status, "succeeded");
    assert.deepEqual(ctx.events, [
      { type: "payment.expired", paymentId: open },
      { type: "payment.succeeded", paymentId: paid },
    ]);
    // Stan końcowy się nie zmienia.
    assert.equal((await expireCheckout(paid, ctx.deps)).status, "succeeded");
  });

  test("expireCheckout bez zapisanej sesji: odtworzenie kluczem checkout:<id>, potem wygaszenie; odmowa jednoznaczna → expired", async () => {
    const ctx = makeDeps(db);
    const id = await newPayment(ctx);
    ctx.fake.fail("checkout.sessions.create", timeoutError(), { afterEffect: true });
    await assert.rejects(openCheckout(id, CHECKOUT_REQUEST, ctx.deps), CheckoutFailed);
    assert.equal((await expireCheckout(id, ctx.deps)).status, "expired");
    assert.equal(ctx.fake.sessions.size, 1, "odzyskana ta sama sesja, nie nowa");
    assert.equal([...ctx.fake.sessions.values()][0].status, "expired");

    const never = await newPayment(ctx);
    ctx.fake.fail("checkout.sessions.create", invalidRequestError());
    assert.equal((await expireCheckout(never, ctx.deps)).status, "expired");

    // Bez parametrów do odtworzenia → płatność zostaje pending (błąd w logu).
    const orphan = await newPayment(ctx);
    const noResolver = { ...ctx.deps, resolveCheckoutRequest: async () => null };
    assert.equal((await expireCheckout(orphan, noResolver)).status, "pending");
    assert.ok(ctx.logs.some(([level]) => level === "error"));
  });

  test("openCheckout po czasie sesji → Stripe potwierdza wygaśnięcie, CheckoutFailed", async () => {
    const ctx = makeDeps(db);
    const id = await newPayment(ctx);
    await openCheckout(id, CHECKOUT_REQUEST, ctx.deps);
    ctx.advance(34);
    await assert.rejects(openCheckout(id, CHECKOUT_REQUEST, ctx.deps), (error) => error instanceof CheckoutFailed && !error.retryable);
    assert.equal((await paymentRow(db, id)).status, "expired");
  });

  test("subskrybent rzuca → przejście wycofane, płatność dalej pending", async () => {
    const ctx = makeDeps(db, {
      subscribers: [
        async () => {
          throw new Error("subskrybent nie działa");
        },
      ],
    });
    const id = await newPayment(ctx);
    await openCheckout(id, CHECKOUT_REQUEST, ctx.deps);
    const sessionId = (await paymentRow(db, id)).stripe_checkout_session_id;
    ctx.fake.completeSession(sessionId);
    await assert.rejects(syncCheckout(id, sessionId, ctx.deps), /subskrybent/);
    assert.equal((await paymentRow(db, id)).status, "pending");
  });
});
