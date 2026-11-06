// Subskrybenci zdarzeń płatności (spec #24 Q8, API Contracts „Subscriber events”).
//
// Jawna lista funkcji wołanych W TEJ SAMEJ transakcji co przejście stanu płatności — bez kolejki i bez szyny.
// Zdarzenia: `payment.succeeded`, `payment.expired`, `refund.succeeded`, `refund.failed`. Subskrybent, który
// rzuci, wycofuje przejście (webhook → 500, Stripe ponowi dostarczenie). Subskrybenci są wołani tylko przez
// wywołującego, który WYGRAŁ strzeżony UPDATE — każde przejście dociera do nich dokładnie raz.
//
// Lista dla aplikacji: `lib/payments/subscribers.mjs` (wypełnia #17). Moduły domenowe dostają ją przez `deps`,
// więc testy podają własną.

/**
 * @typedef {"payment.succeeded" | "payment.expired" | "refund.succeeded" | "refund.failed"} PaymentEventType
 * @typedef {{ type: PaymentEventType, paymentId: string, payment: Record<string, any> }} PaymentEvent
 * @typedef {(tx: import("pg").PoolClient, event: PaymentEvent, ctx: { now: Date }) => Promise<void>} PaymentSubscriber
 */

/**
 * Woła subskrybentów po kolei w transakcji `tx`. Wyjątek przerywa i wychodzi do wywołującego (rollback).
 * @param {ReadonlyArray<PaymentSubscriber> | undefined} subscribers
 * @param {import("pg").PoolClient} tx
 * @param {PaymentEvent} event
 * @param {Date} now
 */
export async function emitPaymentEvent(subscribers, tx, event, now) {
  for (const subscriber of subscribers ?? []) {
    await subscriber(tx, event, { now });
  }
}
