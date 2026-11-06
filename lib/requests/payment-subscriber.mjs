// Subskrybent zdarzeń płatności dla zapytań (spec #17 Proposed Solution „Payment subscriber”; #24 Q8;
// Implementation Plan krok 5). Wołany W TRANSAKCJI przejścia płatności; wyjątek wycofuje przejście.
//
// - `payment.succeeded`: blokada wiersza mentora (ta sama co w `startRequest`), potem:
//   zapytanie `awaiting_payment` i ŻADNE INNE trzymające zapytanie nie nachodzi na termin → `awaiting_mentor`,
//   `paid_at`; szkic potwierdzenia dostaje adres płacącego (`payer_email`) i staje się należny; e-mail do mentora.
//   Inaczej (zapytanie już `payment_failed` albo termin zajęty po upływie karencji) → `payment_failed`, zwrot
//   `invalid_on_payment` (#24 `requestRefund`), e-mail „płatność dotarła za późno”. Opłacony termin nigdy nie jest
//   sprzedany dwa razy.
// - `payment.expired` → `payment_failed`, szkic usunięty, termin wolny.
// - `refund.succeeded` / `refund.failed` → e-mail do dewelopera (obejmuje też #18, #19).
// Do e-maili nie trafia treść pytania; mentor nie dostaje adresu e-mail płacącego.
import { enqueueEmail } from "../email/outbox.mjs";
import { requestRefund } from "../payments/refunds.mjs";
import { formatAmount, formatClock, formatWhen } from "./format.mjs";
import { heldRanges } from "./held.mjs";
import { appBaseUrl, mentorRequestUrl } from "./links.mjs";
import { CONFIRMATION_TEMPLATE } from "./start.mjs";

/** @type {import("../payments/events.mjs").PaymentSubscriber} */
export async function requestPaymentSubscriber(tx, event, { now }) {
  const { rows } = await tx.query("select mentor_id from requests where payment_id = $1", [event.paymentId]);
  if (!rows[0]) return; // płatność bez zapytania (inny właściciel w przyszłości)
  // Kolejność blokad jak w `startRequest`: mentor, potem zapytanie (płatność jest już zablokowana przez przejście).
  const { rows: mentorRows } = await tx.query("select id, email, time_zone from mentors where id = $1 for update", [rows[0].mentor_id]);
  const mentor = mentorRows[0];
  const { rows: requestRows } = await tx.query("select * from requests where payment_id = $1 for update", [event.paymentId]);
  const request = requestRows[0];
  const payment = event.payment;
  const amount = formatAmount(Number(payment.amount_minor), payment.currency);
  const when = formatWhen(request.slot_start, mentor.time_zone);

  switch (event.type) {
    case "payment.succeeded": {
      const overlapping = await heldRanges(tx, { mentorId: request.mentor_id, from: request.slot_start, to: request.slot_end, now, excludeRequestId: request.id });
      if (request.status === "awaiting_payment" && overlapping.length === 0) {
        await tx.query("update requests set status = 'awaiting_mentor', paid_at = $2, updated_at = $2 where id = $1", [request.id, now]);
        await activateConfirmation(tx, request.id, payment.payer_email, now);
        await enqueueEmail(
          tx,
          {
            to: mentor.email,
            template: "mentor_new_request",
            params: {
              menteeName: request.mentee_name,
              lengthMinutes: Number(request.length_minutes),
              when,
              decideBy: formatClock(request.slot_start, mentor.time_zone),
              requestLink: mentorRequestUrl(appBaseUrl(), request.id),
            },
          },
          { now },
        );
        return;
      }
      if (request.status === "awaiting_payment") {
        await tx.query("update requests set status = 'payment_failed', updated_at = $2 where id = $1", [request.id, now]);
      }
      await requestRefund(tx, event.paymentId, "invalid_on_payment", { now: () => now });
      await lateConfirmation(tx, request.id, payment.payer_email, { amount, when }, now);
      return;
    }
    case "payment.expired": {
      if (request.status === "awaiting_payment") {
        await tx.query("update requests set status = 'payment_failed', updated_at = $2 where id = $1", [request.id, now]);
      }
      await tx.query("delete from outbound_emails where status = 'draft' and template = $2 and params ->> 'requestId' = $1", [request.id, CONFIRMATION_TEMPLATE]);
      return;
    }
    case "refund.succeeded":
    case "refund.failed": {
      if (!payment.payer_email) return;
      await enqueueEmail(
        tx,
        { to: payment.payer_email, template: event.type === "refund.succeeded" ? "refund_succeeded" : "refund_failed", params: { amount, when } },
        { now },
      );
      return;
    }
    default:
      return;
  }
}

/**
 * Szkic potwierdzenia → należny e-mail do płacącego. Bez adresu ze Stripe (nie powinno się zdarzyć) szkic jest
 * usuwany, żeby nie leżał z linkiem w bazie.
 * @param {import("pg").PoolClient} tx @param {string} requestId @param {string | null} payerEmail @param {Date} now
 */
async function activateConfirmation(tx, requestId, payerEmail, now) {
  if (!payerEmail) {
    await tx.query("delete from outbound_emails where status = 'draft' and template = $2 and params ->> 'requestId' = $1", [requestId, CONFIRMATION_TEMPLATE]);
    return;
  }
  await tx.query(
    `update outbound_emails set to_address = $3, status = 'due', next_attempt_at = $4
      where status = 'draft' and template = $2 and params ->> 'requestId' = $1`,
    [requestId, CONFIRMATION_TEMPLATE, payerEmail, now],
  );
}

/**
 * Płatność po czasie: szkic (z linkiem) zamienia się w e-mail „płatność dotarła za późno”; gdy szkicu już nie ma —
 * nowy e-mail bez linku.
 * @param {import("pg").PoolClient} tx @param {string} requestId @param {string | null} payerEmail
 * @param {{ amount: string, when: string }} params @param {Date} now
 */
async function lateConfirmation(tx, requestId, payerEmail, { amount, when }, now) {
  if (!payerEmail) {
    await tx.query("delete from outbound_emails where status = 'draft' and template = $2 and params ->> 'requestId' = $1", [requestId, CONFIRMATION_TEMPLATE]);
    return;
  }
  const { rows } = await tx.query(
    `update outbound_emails
        set to_address = $3, status = 'due', next_attempt_at = $4, template = 'request_late_payment',
            params = jsonb_build_object('requestUrl', params ->> 'requestUrl', 'amount', $5::text, 'when', $6::text)
      where status = 'draft' and template = $2 and params ->> 'requestId' = $1
      returning id`,
    [requestId, CONFIRMATION_TEMPLATE, payerEmail, now, amount, when],
  );
  if (!rows[0]) await enqueueEmail(tx, { to: payerEmail, template: "request_late_payment", params: { amount, when } }, { now });
}
