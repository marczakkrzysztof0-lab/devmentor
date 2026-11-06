// Płatności Stripe: ograniczenia schematu (spec #24, Data Model; migracja 0005).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describeDb } from "./harness.mjs";

const unique = () => randomBytes(6).toString("hex");

// Oczekuje błędu PostgreSQL o danym kodzie (i opcjonalnie nazwie ograniczenia).
async function assertPgError(promise, code, constraint) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    if (constraint) assert.equal(error.constraint, constraint, error.message);
    return true;
  });
}

// Wstawia płatność z domyślnymi poprawnymi wartościami; `overrides` nadpisuje kolumny.
async function insertPayment(db, overrides = {}) {
  const row = {
    status: "pending",
    amount_minor: 15000,
    currency: "PLN",
    commission_bps: 1000,
    checkout_expires_at: new Date(Date.now() + 33 * 60_000),
    ...overrides,
  };
  const columns = Object.keys(row);
  const { rows } = await db.query(
    `insert into payments (${columns.join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    columns.map((column) => row[column]),
  );
  return rows[0];
}

const succeeded = (extra = {}) => ({ status: "succeeded", succeeded_at: new Date(), ...extra });

describeDb("schemat 0005: payments, stripe_events, job_runs", (db) => {
  test("poprawna płatność pending ma wartości domyślne", async () => {
    const payment = await insertPayment(db);
    assert.equal(payment.status, "pending");
    assert.equal(payment.refund_attempts, 0);
    assert.equal(payment.refund_status, null);
    assert.equal(payment.succeeded_at, null);
  });

  test("opłacona płatność ze zleconym zwrotem (powód i chwila zlecenia) jest przyjmowana", async () => {
    const payment = await insertPayment(
      db,
      succeeded({ refund_status: "requested", refund_reason: "mentor_declined", refund_requested_at: new Date() }),
    );
    assert.equal(payment.refund_status, "requested");
  });

  test("zwrot na płatności niezakończonej sukcesem jest odrzucany", async () => {
    for (const status of ["pending", "expired"]) {
      await assertPgError(
        insertPayment(db, {
          status,
          expired_at: status === "expired" ? new Date() : null,
          refund_status: "requested",
          refund_reason: "lapsed",
          refund_requested_at: new Date(),
        }),
        "23514",
        "payments_refund_only_succeeded",
      );
    }
  });

  test("status succeeded bez succeeded_at jest odrzucany (i odwrotnie)", async () => {
    await assertPgError(insertPayment(db, { status: "succeeded" }), "23514", "payments_succeeded_has_time");
    await assertPgError(insertPayment(db, { status: "pending", succeeded_at: new Date() }), "23514", "payments_succeeded_has_time");
  });

  test("status expired wymaga expired_at", async () => {
    await assertPgError(insertPayment(db, { status: "expired" }), "23514", "payments_expired_has_time");
  });

  test("waluta musi mieć trzy wielkie litery (pln, PL, PLNN odrzucone)", async () => {
    for (const currency of ["pln", "PL", "PLNN", "P1N"]) {
      await assertPgError(insertPayment(db, { currency }), "23514", "payments_currency_format");
    }
  });

  test("kwota musi być dodatnia (0 i ujemna odrzucone)", async () => {
    for (const amount_minor of [0, -1]) {
      await assertPgError(insertPayment(db, { amount_minor }), "23514", "payments_amount_positive");
    }
  });

  test("prowizja 0 i 10000 przyjęte; -1 i 10001 odrzucone", async () => {
    await insertPayment(db, { commission_bps: 0 });
    await insertPayment(db, { commission_bps: 10000 });
    for (const commission_bps of [-1, 10001]) {
      await assertPgError(insertPayment(db, { commission_bps }), "23514", "payments_commission_bps_range");
    }
  });

  test("nieznany status płatności jest odrzucany", async () => {
    await assertPgError(insertPayment(db, { status: "refunded" }), "23514", "payments_status_known");
  });

  test("nieznany status zwrotu i nieznany powód zwrotu są odrzucane", async () => {
    await assertPgError(
      insertPayment(db, succeeded({ refund_status: "done", refund_reason: "lapsed", refund_requested_at: new Date() })),
      "23514",
      "payments_refund_status_known",
    );
    await assertPgError(
      insertPayment(db, succeeded({ refund_status: "requested", refund_reason: "bo_tak", refund_requested_at: new Date() })),
      "23514",
      "payments_refund_reason_known",
    );
  });

  test("refund_status bez powodu albo bez refund_requested_at jest odrzucany", async () => {
    await assertPgError(
      insertPayment(db, succeeded({ refund_status: "requested", refund_requested_at: new Date() })),
      "23514",
      "payments_refund_has_reason",
    );
    await assertPgError(
      insertPayment(db, succeeded({ refund_status: "requested", refund_reason: "lapsed" })),
      "23514",
      "payments_refund_has_reason",
    );
    // Powód bez statusu też.
    await assertPgError(insertPayment(db, succeeded({ refund_reason: "lapsed" })), "23514", "payments_refund_has_reason");
  });

  test("refund_status succeeded wymaga refunded_at", async () => {
    await assertPgError(
      insertPayment(db, succeeded({ refund_status: "succeeded", refund_reason: "lapsed", refund_requested_at: new Date() })),
      "23514",
      "payments_refunded_has_time",
    );
  });

  test("licznik prób zwrotu nie może być ujemny", async () => {
    await assertPgError(insertPayment(db, { refund_attempts: -1 }), "23514", "payments_refund_attempts_non_negative");
  });

  test("stripe_checkout_session_id jest unikalny (wiele NULL dozwolone)", async () => {
    const sessionId = `cs_test_${unique()}`;
    await insertPayment(db, { stripe_checkout_session_id: sessionId });
    await assertPgError(
      insertPayment(db, { stripe_checkout_session_id: sessionId }),
      "23505",
      "payments_stripe_checkout_session_id_key",
    );
    await insertPayment(db);
    await insertPayment(db);
  });

  test("stripe_payment_intent_id i stripe_refund_id są unikalne", async () => {
    const intent = `pi_${unique()}`;
    await insertPayment(db, { stripe_payment_intent_id: intent });
    await assertPgError(insertPayment(db, { stripe_payment_intent_id: intent }), "23505", "payments_stripe_payment_intent_id_key");
    const refund = `re_${unique()}`;
    const extra = { refund_status: "pending", refund_reason: "lapsed", refund_requested_at: new Date(), stripe_refund_id: refund };
    await insertPayment(db, succeeded(extra));
    await assertPgError(insertPayment(db, succeeded(extra)), "23505", "payments_stripe_refund_id_key");
  });

  test("stripe_events: powtórzony event_id jest odrzucany", async () => {
    const eventId = `evt_${unique()}`;
    await db.query("insert into stripe_events (event_id, type) values ($1, $2)", [eventId, "checkout.session.completed"]);
    await assertPgError(
      db.query("insert into stripe_events (event_id, type) values ($1, $2)", [eventId, "checkout.session.completed"]),
      "23505",
      "stripe_events_pkey",
    );
    const { rows } = await db.query("select received_at from stripe_events where event_id = $1", [eventId]);
    assert.ok(rows[0].received_at instanceof Date);
  });

  test("job_runs: nazwa zadania jest kluczem głównym", async () => {
    await db.query("insert into job_runs (name, last_run_at) values ('payments.reconcile', now())");
    await assertPgError(
      db.query("insert into job_runs (name, last_run_at) values ('payments.reconcile', now())"),
      "23505",
      "job_runs_pkey",
    );
  });
});
