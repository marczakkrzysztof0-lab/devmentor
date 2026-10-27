// Jawna lista subskrybentów zdarzeń płatności aplikacji (spec #24 Q8). Wywoływani w transakcji przejścia
// (`lib/payments/events.mjs`). Kolejne historie dopisują tu swoich subskrybentów.
//
// `resolveCheckoutRequest` — skąd `expireCheckout` weźmie parametry powrotu (success/cancel URL, nazwa produktu),
// gdy id sesji nie zdążyło się zapisać i trzeba ją odtworzyć tym samym kluczem idempotencji. Właściciel płatności
// (#17) wie, jak je odtworzyć; `null` = nie da się (płatność zostaje `pending`, log błędu).

/** @type {ReadonlyArray<import("./events.mjs").PaymentSubscriber>} */
export const PAYMENT_SUBSCRIBERS = Object.freeze([]);

/** @type {((db: import("../db/pool.mjs").Queryable, payment: any) => Promise<import("./payments.mjs").CheckoutRequest | null>) | undefined} */
export const resolveCheckoutRequest = undefined;
