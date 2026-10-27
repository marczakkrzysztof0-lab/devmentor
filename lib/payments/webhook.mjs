// Webhook Stripe `POST /api/webhooks/stripe` — publiczny kontrakt (spec #24 API Contracts; krok 4 i 7).
//
// - Surowe ciało żądania (`request.text()`) + nagłówek `Stripe-Signature` weryfikowane funkcją SDK (domyślna
//   tolerancja 300 s). Zły / brak podpisu, stary znacznik czasu → 400, nic nie zapisane. `livemode: true` → 400.
// - Przetwarzanie w JEDNEJ transakcji, która najpierw wstawia id zdarzenia do `stripe_events`: powtórzone
//   zdarzenie → 200 bez ponownego przetwarzania; błąd bazy / subskrybenta → rollback, 500 (Stripe ponowi).
// - Obsługiwane: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`, `refund.updated`,
//   `refund.failed`, `charge.dispute.created`; pozostałe → 200, ignorowane.
// - Korelacja: Checkout po `metadata.payment_id` + zapisane id sesji + kwota/waluta; zwroty i spory po
//   `payment_intent` → `payments.stripe_payment_intent_id`, potem po id zwrotu. Nieznany / niepasujący obiekt →
//   log, 200, bez zmian (ponowne dostarczenie by tego nie naprawiło).
// - `charge.refunded` zamyka zwrot tylko, gdy `amount_refunded` = kwota płatności; częściowy / wielokrotny zwrot
//   z panelu Stripe → ostrzeżenie w logu, bez przejścia (obsługa ręczna, Q05).
import { withTransaction } from "../db/pool.mjs";
import { emitPaymentEvent } from "./events.mjs";
import { applySession, clock, getPayment, logger } from "./payments.mjs";
import { applyRefundObject } from "./refunds.mjs";

export const HANDLED_EVENT_TYPES = Object.freeze([
  "checkout.session.completed",
  "checkout.session.expired",
  "charge.refunded",
  "refund.updated",
  "refund.failed",
  "charge.dispute.created",
]);

/** @typedef {import("./payments.mjs").PaymentsDeps} PaymentsDeps */
/** @typedef {(rawBody: string, signature: string, secret: string) => any} VerifyEvent */

/**
 * Obsługa żądania webhooka (bez Next.js — trasa to cienki wrapper). Zwraca status i krótkie ciało JSON;
 * nigdy treści błędów ani danych z ładunku.
 * @param {{ rawBody: string, signature: string | null }} request
 * @param {PaymentsDeps} deps
 * @param {VerifyEvent} verifyEvent
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function handleStripeWebhook({ rawBody, signature }, deps, verifyEvent) {
  if (!signature) return { status: 400, body: { error: "missing_signature" } };
  let event;
  try {
    event = verifyEvent(rawBody, signature, deps.config.webhookSecret);
  } catch {
    logger(deps).warn("[payments] webhook: niepoprawny podpis — odrzucony");
    return { status: 400, body: { error: "invalid_signature" } };
  }
  if (event?.livemode === true) {
    logger(deps).error(`[payments] webhook: zdarzenie livemode ${event.id} odrzucone (tylko tryb testowy, Q5)`);
    return { status: 400, body: { error: "livemode_rejected" } };
  }
  try {
    const result = await processStripeEvent(event, deps);
    return { status: 200, body: { received: true, result } };
  } catch (error) {
    logger(deps).error(`[payments] webhook: przetwarzanie ${event?.id} (${event?.type}) nie powiodło się — Stripe ponowi`, error instanceof Error ? error.name : "");
    return { status: 500, body: { error: "processing_failed" } };
  }
}

/**
 * Przetwarza zweryfikowane zdarzenie w jednej transakcji (najpierw `stripe_events`).
 * @param {any} event
 * @param {PaymentsDeps} deps
 * @returns {Promise<"duplicate" | "ignored" | "noop" | "applied">}
 */
export async function processStripeEvent(event, deps) {
  const now = clock(deps);
  return withTransaction(deps.db, async (tx) => {
    const { rows } = await tx.query(
      "insert into stripe_events (event_id, type, received_at) values ($1, $2, $3) on conflict (event_id) do nothing returning event_id",
      [event.id, event.type, now],
    );
    if (!rows[0]) return "duplicate";
    const object = event.data?.object;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.expired":
        return onCheckoutSession(tx, deps, object);
      case "charge.refunded":
        return onChargeRefunded(tx, deps, object, now);
      case "refund.updated":
      case "refund.failed":
        return onRefund(tx, deps, object, now);
      case "charge.dispute.created":
        return onDispute(tx, deps, object, now);
      default:
        return "ignored";
    }
  });
}

/** @param {unknown} value */
const idOf = (value) => (typeof value === "string" ? value : /** @type {{ id?: string } | null} */ (value)?.id ?? null);

/**
 * @param {import("pg").PoolClient} tx
 * @param {string | null} paymentIntentId
 */
async function paymentByIntent(tx, paymentIntentId) {
  if (!paymentIntentId) return null;
  const { rows } = await tx.query("select * from payments where stripe_payment_intent_id = $1 for update", [paymentIntentId]);
  return rows[0] ?? null;
}

/** @param {import("pg").PoolClient} tx @param {PaymentsDeps} deps @param {any} session */
async function onCheckoutSession(tx, deps, session) {
  const paymentId = session?.metadata?.payment_id;
  const payment = typeof paymentId === "string" && /^[0-9a-f-]{36}$/i.test(paymentId) ? await getPayment(tx, paymentId, { forUpdate: true }) : null;
  if (!payment) {
    logger(deps).warn(`[payments] webhook: sesja ${idOf(session)} bez znanej płatności — pominięta`);
    return "ignored";
  }
  if (payment.status !== "pending") return "noop";
  return (await applySession(tx, deps, payment, session)) ? "applied" : "noop";
}

/** @param {import("pg").PoolClient} tx @param {PaymentsDeps} deps @param {any} charge @param {Date} now */
async function onChargeRefunded(tx, deps, charge, now) {
  const payment = await paymentByIntent(tx, idOf(charge?.payment_intent));
  if (!payment) {
    logger(deps).warn(`[payments] webhook charge.refunded: nieznany PaymentIntent — pominięte`);
    return "ignored";
  }
  if (Number(charge.amount_refunded) !== Number(payment.amount_minor)) {
    logger(deps).warn(`[payments] webhook charge.refunded: zwrot częściowy/wielokrotny dla ${payment.id} — bez zmian (obsługa ręczna)`);
    return "ignored";
  }
  if (payment.refund_status === "succeeded" || payment.refund_status === "failed") return "noop";
  const refundId = idOf(charge.refunds?.data?.[0]);
  const external = payment.refund_status === null;
  const { rows } = await tx.query(
    `update payments
        set refund_status = 'succeeded', refunded_at = $2,
            refund_reason = coalesce(refund_reason, 'external'),
            refund_requested_at = coalesce(refund_requested_at, $2),
            stripe_refund_id = coalesce(stripe_refund_id, $3),
            refund_lease_until = null, updated_at = $2
      where id = $1 and status = 'succeeded'
        and (refund_status is null or refund_status in ('requested', 'pending'))
      returning *`,
    [payment.id, now, refundId],
  );
  if (!rows[0]) return "noop";
  if (external) logger(deps).warn(`[payments] zwrot ${payment.id} wykonany poza aplikacją (panel Stripe) — powód external`);
  await emitPaymentEvent(deps.subscribers, tx, { type: "refund.succeeded", paymentId: payment.id, payment: rows[0] }, now);
  return "applied";
}

/** @param {import("pg").PoolClient} tx @param {PaymentsDeps} deps @param {any} refund @param {Date} now */
async function onRefund(tx, deps, refund, now) {
  const payment = await paymentByIntent(tx, idOf(refund?.payment_intent));
  if (!payment) {
    logger(deps).warn(`[payments] webhook refund: nieznany PaymentIntent — pominięte`);
    return "ignored";
  }
  if (payment.stripe_refund_id && payment.stripe_refund_id !== refund.id) {
    logger(deps).warn(`[payments] webhook refund: inny zwrot niż zapisany dla ${payment.id} — pominięte`);
    return "ignored";
  }
  if (refund.status === "pending" || refund.status === "requires_action") {
    // Wynik próby jeszcze niezapisany (pracownik w trakcie) — zapisujemy oczekujący zwrot; zapis pracownika przegra.
    const { rows } = await tx.query(
      `update payments set refund_status = 'pending', stripe_refund_id = $2, refund_lease_until = null, updated_at = $3
        where id = $1 and refund_status = 'requested' returning id`,
      [payment.id, refund.id, now],
    );
    return rows[0] ? "applied" : "noop";
  }
  if (refund.status === "succeeded" && payment.refund_status === "requested") {
    const { rows } = await tx.query(
      `update payments set refund_status = 'succeeded', refunded_at = $3, stripe_refund_id = $2, refund_lease_until = null, updated_at = $3
        where id = $1 and refund_status = 'requested' returning *`,
      [payment.id, refund.id, now],
    );
    if (!rows[0]) return "noop";
    await emitPaymentEvent(deps.subscribers, tx, { type: "refund.succeeded", paymentId: payment.id, payment: rows[0] }, now);
    return "applied";
  }
  if (payment.refund_status !== "pending") return "noop";
  const result = await applyRefundObject(payment.id, refund, deps, tx);
  return result === "succeeded" || result === "failed" ? "applied" : "noop";
}

/** @param {import("pg").PoolClient} tx @param {PaymentsDeps} deps @param {any} dispute @param {Date} now */
async function onDispute(tx, deps, dispute, now) {
  const payment = await paymentByIntent(tx, idOf(dispute?.payment_intent));
  if (!payment) {
    logger(deps).warn(`[payments] webhook dispute: nieznany PaymentIntent — pominięte`);
    return "ignored";
  }
  const { rows } = await tx.query(
    "update payments set disputed_at = $2, updated_at = $2 where id = $1 and disputed_at is null returning id",
    [payment.id, now],
  );
  if (rows[0]) logger(deps).error(`[payments] spór (chargeback) dla płatności ${payment.id} — obsługa w panelu Stripe (Q7)`);
  return rows[0] ? "applied" : "noop";
}
