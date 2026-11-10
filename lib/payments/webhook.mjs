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
// - `refund.updated` / `refund.failed` zmieniają stan tylko dla pełnego zwrotu tej płatności zleconego przez nas
//   (`isOurFullRefund`: kwota, waluta, id zwrotu u nas albo `metadata.payment_id`); inaczej log, 200, bez zmian.
import { withTransaction } from "../db/pool.mjs";
import { emitPaymentEvent } from "./events.mjs";
import { applySession, clock, getPayment, logger } from "./payments.mjs";
import { applyRefundObject } from "./refunds.mjs";
import { applyAccountObject } from "../payouts/accounts.mjs";
import { hasAnyRefund } from "../payouts/amounts.mjs";

export const HANDLED_EVENT_TYPES = Object.freeze([
  "checkout.session.completed",
  "checkout.session.expired",
  "charge.refunded",
  "refund.updated",
  "refund.failed",
  "charge.dispute.created",
  "account.updated",
  "transfer.created",
  "transfer.reversed",
  "transfer.updated",
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
    try {
      event = verifyEvent(rawBody, signature, deps.config.webhookSecret);
    } catch (firstError) {
      if (!deps.config.connectWebhookSecret) throw firstError;
      // Connect events use a separate signing secret on the same endpoint.
      event = verifyEvent(rawBody, signature, deps.config.connectWebhookSecret);
    }
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
      case "account.updated":
        return applyAccountObject(tx, object, now, { eventCreated: new Date(Number(event.created) * 1000) });
      case "transfer.created":
        return onTransferCreated(tx, deps, object, now);
      case "transfer.reversed":
      case "transfer.updated":
        return onTransferReversed(tx, deps, object, now, event.type);
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
  const { rows } = await tx.query(
    "select * from payments where stripe_payment_intent_id = $1 for update",
    [paymentIntentId],
  );
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
  if (hasAnyRefund({ charge })) {
    await tx.query(
      "update payments set refund_seen_at = coalesce(refund_seen_at, $2), updated_at = $2 where id = $1",
      [payment.id, now],
    );
    await onRefundSeen(tx, payment.id, deps, now);
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

/**
 * Czy obiekt zwrotu Stripe to PEŁNY zwrot TEJ płatności, zlecony przez nas: kwota = kwota płatności, ta sama waluta
 * i powiązanie — id zwrotu już zapisane u nas albo `metadata.payment_id` (ustawiane przy `refunds.create`).
 * @param {any} payment
 * @param {any} refund
 */
export function isOurFullRefund(payment, refund) {
  if (!refund || typeof refund !== "object") return false;
  if (Number(refund.amount) !== Number(payment.amount_minor)) return false;
  if (String(refund.currency ?? "").toUpperCase() !== payment.currency) return false;
  return payment.stripe_refund_id === refund.id || refund.metadata?.payment_id === payment.id;
}

/** @param {import("pg").PoolClient} tx @param {PaymentsDeps} deps @param {any} refund @param {Date} now */
async function onRefund(tx, deps, refund, now) {
  const payment = await paymentByIntent(tx, idOf(refund?.payment_intent));
  if (!payment) {
    logger(deps).warn(`[payments] webhook refund: nieznany PaymentIntent — pominięte`);
    return "ignored";
  }
  if (hasAnyRefund({ refunds: { data: refund ? [refund] : [] } })) {
    await tx.query(
      "update payments set refund_seen_at = coalesce(refund_seen_at, $2), updated_at = $2 where id = $1",
      [payment.id, now],
    );
    await onRefundSeen(tx, payment.id, deps, now);
  }
  if (payment.stripe_refund_id && payment.stripe_refund_id !== refund.id) {
    logger(deps).warn(`[payments] webhook refund: inny zwrot niż zapisany dla ${payment.id} — pominięte`);
    return "ignored";
  }
  if (!isOurFullRefund(payment, refund)) {
    // Zwrot częściowy, w innej walucie albo spoza aplikacji (np. z panelu Stripe, bez naszego id/metadanych):
    // bez przejścia, obsługa ręczna (Q05). Pełny zwrot z panelu zamyka `charge.refunded` (sprawdza `amount_refunded`).
    logger(deps).warn(`[payments] webhook refund: zwrot ${refund?.id} nie jest pełnym zwrotem tej płatności ${payment.id} — bez zmian`);
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

/** Applies payout cancellation or manual-review state after any refund is observed.
 * @param {import("pg").PoolClient} tx
 * @param {string} paymentId
 * @param {PaymentsDeps} deps
 * @param {Date} now
 * @returns {Promise<void>}
 */
async function onRefundSeen(tx, paymentId, deps, now) {
  await tx.query(
    `update payouts
        set status = 'cancelled', cancelled_at = $2, lease_until = null, updated_at = $2
      where payment_id = $1
        and (status = 'held_for_payout' or (status = 'failed' and attempts = 0))`,
    [paymentId, now],
  );
  const { rows } = await tx.query(
    `update payouts
        set manual_reason = 'refunded_after_payout', updated_at = $2
      where payment_id = $1 and status = 'paid' and manual_reason is null
      returning request_id`,
    [paymentId, now],
  );
  for (const row of rows) {
    (deps.log ?? console).error(`[payouts] manual review required: refunded_after_payout ${row.request_id}`);
  }
}
/** Adopts a transfer.created event into its matching claimed payout.
 * @param {import("pg").PoolClient} tx
 * @param {PaymentsDeps} deps
 * @param {any} transfer
 * @param {Date} now
 * @returns {Promise<"applied" | "noop">}
 */
async function onTransferCreated(tx, deps, transfer, now) {
  const payoutId = transfer?.metadata?.payout_id;
  if (!/^[0-9a-f-]{36}$/i.test(payoutId ?? "")) return "noop";
  const { rows } = await tx.query(
    `update payouts po
        set status = 'paid', stripe_transfer_id = $2, paid_at = $3, cancelled_at = null,
            lease_until = null, next_attempt_at = null,
            manual_reason = case
              when exists (
                select 1 from payments p
                 where p.id = po.payment_id
                   and (p.refund_status is not null or p.refund_seen_at is not null)
              ) then 'refunded_after_payout'
              else po.manual_reason
            end,
            updated_at = $3
      where po.id = $1 and po.stripe_transfer_id is null
        and (po.status in ('transferring', 'failed') or (po.status = 'cancelled' and po.attempts > 0))
        and po.amount_minor = $4 and lower(po.currency) = lower($5)
        and exists (
          select 1 from mentor_payout_accounts a
           where a.mentor_id = po.mentor_id and a.stripe_account_id = $6
        )
      returning po.request_id, po.manual_reason`,
    [payoutId, transfer.id, now, transfer.amount, transfer.currency, transfer.destination],
  );
  if (rows[0]?.manual_reason === "refunded_after_payout") {
    (deps.log ?? console).error(`[payouts] manual review required: refunded_after_payout ${rows[0].request_id}`);
  }
  return rows[0] ? "applied" : "noop";
}
/** Marks a reversed transfer for manual review.
 * @param {import("pg").PoolClient} tx
 * @param {PaymentsDeps} deps
 * @param {any} transfer
 * @param {Date} now
 * @param {string} eventType
 * @returns {Promise<"applied" | "noop">}
 */
async function onTransferReversed(tx, deps, transfer, now, eventType) {
  if (eventType === "transfer.updated" && Number(transfer?.amount_reversed ?? 0) <= 0) return "noop";
  const { rows } = await tx.query(
    `update payouts
        set manual_reason = 'transfer_reversed', updated_at = $2
      where stripe_transfer_id = $1 and manual_reason is null
      returning request_id`,
    [transfer?.id, now],
  );
  if (rows[0]) {
    (deps.log ?? console).error(`[payouts] manual review required: transfer_reversed ${rows[0].request_id}`);
  }
  return rows[0] ? "applied" : "noop";
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
