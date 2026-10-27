// Opłata kartą przez Stripe Checkout (spec #24 Phase 1, Proposed Solution „Charge = two steps”, API Contracts).
//
// - `createPayment(tx, …)` wstawia `pending` w transakcji wywołującego; NIC o zapytaniu nie idzie do Stripe.
// - `openCheckout` (po commicie) tworzy sesję Checkout z kluczem idempotencji `checkout:<paymentId>`; parametry
//   sesji są deterministyczne (te same przy każdym ponowieniu), więc ponowienie po timeoucie odzyskuje sesję,
//   którą Stripe już utworzył. Błąd jednoznaczny (4xx ≠ 409/429) → `expired` + `CheckoutFailed{retryable:false}`;
//   niejednoznaczny → płatność zostaje `pending` + `CheckoutFailed{retryable:true}`.
// - Stany końcowe ustala Stripe: `pending → succeeded` (sesja `complete` + `paid`) i `pending → expired`
//   (sesja `expired` — dopiero gdy Stripe to potwierdzi). Oba przejścia strzeżone `WHERE status = 'pending'`;
//   subskrybenci (#17) wołani tylko przez wywołującego, który wygrał, w tej samej transakcji.
// - `syncCheckout` (strona powrotu) przyjmuje odpowiedź Stripe tylko dla sesji tej płatności (id sesji,
//   `metadata.payment_id`, kwota, waluta). `expireCheckout` (anulowanie, rekonsyliacja) prosi Stripe o
//   wygaszenie: Stripe odpowiada `expired` albo `complete` (płatność zdążyła przejść) — stosujemy jego odpowiedź.
//
// Zależności (`deps`) wstrzykiwane: `db` (pg.Pool), `stripe` (klient albo fałszywka w testach), `config`
// (`readPaymentsConfig`), `subscribers`, `now()`, `log`, opcjonalnie `resolveCheckoutRequest` (parametry
// powrotu do odtworzenia sesji przez `expireCheckout`, gdy jej id nie zdążyło się zapisać).
import { withTransaction } from "../db/pool.mjs";
import { CHECKOUT_TTL_MINUTES, STRIPE_MINIMUM_MINOR } from "./config.mjs";
import { CheckoutFailed, InvalidAmount, isDefinitiveStripeError, stripeErrorSummary } from "./errors.mjs";
import { emitPaymentEvent } from "./events.mjs";

const MINUTE_MS = 60_000;

/**
 * @typedef {import("../db/pool.mjs").Queryable} Queryable
 * @typedef {import("./config.mjs").PaymentsConfig} PaymentsConfig
 * @typedef {import("./events.mjs").PaymentSubscriber} PaymentSubscriber
 * @typedef {{ successUrl: string, cancelUrl: string, productName: string }} CheckoutRequest
 * @typedef {{ warn: (...args: any[]) => void, error: (...args: any[]) => void }} Logger
 * @typedef {object} PaymentsDeps
 * @property {import("pg").Pool} db
 * @property {any} stripe  klient Stripe (`checkout.sessions`, `refunds`) albo fałszywka
 * @property {PaymentsConfig} config
 * @property {ReadonlyArray<PaymentSubscriber>} [subscribers]
 * @property {() => Date} [now]
 * @property {Logger} [log]
 * @property {(db: Queryable, payment: PaymentRow) => Promise<CheckoutRequest | null>} [resolveCheckoutRequest]
 * @typedef {Record<string, any> & { id: string, status: "pending" | "succeeded" | "expired", amount_minor: number, currency: string }} PaymentRow
 */

/** @param {PaymentsDeps} deps */
export const clock = (deps) => (deps.now ? deps.now() : new Date());
/** @param {PaymentsDeps} deps @returns {Logger} */
export const logger = (deps) => deps.log ?? console;

/**
 * Płatność po id albo `null`.
 * @param {Queryable} db
 * @param {string} paymentId
 * @param {{ forUpdate?: boolean }} [options]
 * @returns {Promise<PaymentRow | null>}
 */
export async function getPayment(db, paymentId, { forUpdate = false } = {}) {
  const { rows } = await db.query(`select * from payments where id = $1${forUpdate ? " for update" : ""}`, [paymentId]);
  return rows[0] ? normalizeRow(rows[0]) : null;
}

/** `amount_minor` itd. jako liczby (pg zwraca integer jako number — dla pewności). */
function normalizeRow(row) {
  return { ...row, amount_minor: Number(row.amount_minor), commission_bps: Number(row.commission_bps), refund_attempts: Number(row.refund_attempts) };
}

/**
 * Nowa płatność `pending` w transakcji wywołującego. Waluta z listy `PAYMENT_CURRENCIES` i kwota ≥ minimum
 * Stripe dla waluty, inaczej `InvalidAmount`. `checkout_expires_at = now + CHECKOUT_TTL_MINUTES`.
 * @param {Queryable} tx
 * @param {{ amountMinor: number, currency: string }} input
 * @param {Pick<PaymentsDeps, "config" | "now">} deps
 * @returns {Promise<string>} id płatności
 */
export async function createPayment(tx, { amountMinor, currency }, deps) {
  const code = String(currency ?? "").toUpperCase();
  if (!deps.config.currencies.includes(code)) throw new InvalidAmount("currency_not_allowed");
  const minimum = /** @type {Record<string, number>} */ (STRIPE_MINIMUM_MINOR)[code];
  if (minimum === undefined) throw new InvalidAmount("currency_not_supported");
  if (!Number.isInteger(amountMinor) || amountMinor < minimum) throw new InvalidAmount("below_minimum");
  const now = deps.now ? deps.now() : new Date();
  // Pełne sekundy: Stripe przyjmuje `expires_at` w sekundach, a ponowienie musi wysłać identyczną wartość.
  const expiresAt = new Date(Math.ceil((now.getTime() + CHECKOUT_TTL_MINUTES * MINUTE_MS) / 1000) * 1000);
  const { rows } = await tx.query(
    `insert into payments (status, amount_minor, currency, commission_bps, checkout_expires_at, created_at, updated_at)
     values ('pending', $1, $2, $3, $4, $5, $5)
     returning id`,
    [amountMinor, code, deps.config.commissionBps, expiresAt, now],
  );
  return rows[0].id;
}

/**
 * Parametry sesji Checkout — wyłącznie z płatności i adresów powrotu (deterministyczne: ten sam klucz
 * idempotencji musi dostać te same parametry). Tylko karta, `mode: payment`, pobranie od razu (Q1, Q2).
 * @param {PaymentRow} payment
 * @param {CheckoutRequest} request
 */
export function checkoutSessionParams(payment, { successUrl, cancelUrl, productName }) {
  return {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: payment.currency.toLowerCase(),
          unit_amount: payment.amount_minor,
          product_data: { name: productName },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: Math.floor(new Date(payment.checkout_expires_at).getTime() / 1000),
    client_reference_id: payment.id,
    metadata: { payment_id: payment.id },
    payment_intent_data: { metadata: { payment_id: payment.id } },
  };
}

/** @param {PaymentRow} payment @param {CheckoutRequest} request @param {PaymentsDeps} deps */
function createSession(payment, request, deps) {
  return deps.stripe.checkout.sessions.create(checkoutSessionParams(payment, request), {
    idempotencyKey: `checkout:${payment.id}`,
  });
}

/**
 * Zapisuje id i URL sesji (strzeżone: tylko `pending` i tylko gdy nie ma innej sesji).
 * @param {Queryable} db @param {string} paymentId @param {{ id: string, url?: string | null }} session @param {Date} now
 */
async function storeSession(db, paymentId, session, now) {
  await db.query(
    `update payments
        set stripe_checkout_session_id = $2, stripe_checkout_url = $3, updated_at = $4
      where id = $1 and status = 'pending'
        and (stripe_checkout_session_id is null or stripe_checkout_session_id = $2)`,
    [paymentId, session.id, session.url ?? null, now],
  );
}

/**
 * `pending → succeeded` (strzeżone) i `payment.succeeded` dla subskrybentów — w transakcji `tx`.
 * @param {import("pg").PoolClient} tx
 * @param {PaymentsDeps} deps
 * @param {{ paymentId: string, paymentIntentId?: string | null, payerEmail?: string | null, sessionId?: string | null }} input
 * @returns {Promise<PaymentRow | null>} płatność po przejściu albo `null`, gdy przejście już było / niemożliwe
 */
export async function markSucceeded(tx, deps, { paymentId, paymentIntentId = null, payerEmail = null, sessionId = null }) {
  const now = clock(deps);
  const { rows } = await tx.query(
    `update payments
        set status = 'succeeded', succeeded_at = $2,
            stripe_payment_intent_id = coalesce($3, stripe_payment_intent_id),
            payer_email = coalesce($4, payer_email),
            stripe_checkout_session_id = coalesce(stripe_checkout_session_id, $5),
            updated_at = $2
      where id = $1 and status = 'pending'
      returning *`,
    [paymentId, now, paymentIntentId, payerEmail, sessionId],
  );
  if (!rows[0]) return null;
  const payment = normalizeRow(rows[0]);
  await emitPaymentEvent(deps.subscribers, tx, { type: "payment.succeeded", paymentId, payment }, now);
  return payment;
}

/**
 * `pending → expired` (strzeżone) i `payment.expired` — w transakcji `tx`. Wołać tylko, gdy Stripe potwierdził,
 * że sesji nie da się już opłacić (albo żadnej sesji nie utworzył).
 * @param {import("pg").PoolClient} tx
 * @param {PaymentsDeps} deps
 * @param {{ paymentId: string }} input
 * @returns {Promise<PaymentRow | null>}
 */
export async function markExpired(tx, deps, { paymentId }) {
  const now = clock(deps);
  const { rows } = await tx.query(
    `update payments set status = 'expired', expired_at = $2, updated_at = $2
      where id = $1 and status = 'pending'
      returning *`,
    [paymentId, now],
  );
  if (!rows[0]) return null;
  const payment = normalizeRow(rows[0]);
  await emitPaymentEvent(deps.subscribers, tx, { type: "payment.expired", paymentId, payment }, now);
  return payment;
}

/**
 * Czy sesja Stripe należy do tej płatności: `metadata.payment_id`, zapisane id sesji (jeśli jest), kwota, waluta.
 * @param {PaymentRow} payment
 * @param {any} session
 */
export function sessionMatchesPayment(payment, session) {
  if (!session || typeof session !== "object") return false;
  if (session.metadata?.payment_id !== payment.id) return false;
  if (payment.stripe_checkout_session_id && payment.stripe_checkout_session_id !== session.id) return false;
  if (session.amount_total !== payment.amount_minor) return false;
  return String(session.currency ?? "").toUpperCase() === payment.currency;
}

/**
 * Stosuje stan sesji Stripe do płatności (w transakcji): `complete` + `paid` → succeeded, `expired` → expired.
 * Sesja niepasująca do płatności → log, bez zmian.
 * @param {import("pg").PoolClient} tx
 * @param {PaymentsDeps} deps
 * @param {PaymentRow} payment
 * @param {any} session
 * @returns {Promise<PaymentRow | null>} płatność po przejściu albo `null`
 */
export async function applySession(tx, deps, payment, session) {
  if (!sessionMatchesPayment(payment, session)) {
    logger(deps).warn(`[payments] sesja Checkout nie pasuje do płatności ${payment.id} — pominięta`);
    return null;
  }
  if (session.status === "complete" && session.payment_status === "paid") {
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    const payerEmail = session.customer_details?.email ?? session.customer_email ?? null;
    return markSucceeded(tx, deps, { paymentId: payment.id, paymentIntentId, payerEmail, sessionId: session.id });
  }
  if (session.status === "expired") return markExpired(tx, deps, { paymentId: payment.id });
  return null;
}

/**
 * Otwiera Checkout dla płatności `pending` (po commicie transakcji, która ją utworzyła) i zwraca URL Stripe.
 * Zapisany URL otwartej, niewygasłej płatności → zwracany bez wywołania Stripe.
 * @param {string} paymentId
 * @param {CheckoutRequest} request
 * @param {PaymentsDeps} deps
 * @returns {Promise<{ url: string }>}
 */
export async function openCheckout(paymentId, request, deps) {
  const now = clock(deps);
  const payment = await getPayment(deps.db, paymentId);
  if (!payment) throw new CheckoutFailed({ retryable: false, code: "unknown_payment" });
  if (payment.status !== "pending") throw new CheckoutFailed({ retryable: false, code: `payment_${payment.status}` });
  if (new Date(payment.checkout_expires_at).getTime() <= now.getTime()) {
    // Czas sesji minął: niech Stripe potwierdzi (wygaszenie albo „opłacone”); nowej sesji dla tej płatności nie ma.
    await expireCheckout(paymentId, deps).catch((error) => logger(deps).warn(`[payments] expireCheckout ${paymentId}: ${stripeErrorSummary(error)}`));
    throw new CheckoutFailed({ retryable: false, code: "checkout_expired" });
  }
  if (payment.stripe_checkout_url) return { url: payment.stripe_checkout_url };

  let session;
  try {
    session = await createSession(payment, request, deps);
  } catch (error) {
    const summary = stripeErrorSummary(error);
    if (isDefinitiveStripeError(error)) {
      logger(deps).warn(`[payments] Checkout odrzucony dla ${paymentId}: ${summary}`);
      await withTransaction(deps.db, (tx) => markExpired(tx, deps, { paymentId }));
      throw new CheckoutFailed({ retryable: false, code: summary });
    }
    logger(deps).warn(`[payments] Checkout niepewny dla ${paymentId} (płatność zostaje pending): ${summary}`);
    throw new CheckoutFailed({ retryable: true, code: summary });
  }

  if (session.status && session.status !== "open") {
    // Klucz idempotencji zwrócił sesję zakończoną (opłaconą albo wygasłą) — stosujemy jej stan.
    await withTransaction(deps.db, async (tx) => {
      const locked = await getPayment(tx, paymentId, { forUpdate: true });
      if (locked) await applySession(tx, deps, locked, session);
    });
    throw new CheckoutFailed({ retryable: false, code: `session_${session.status}` });
  }
  await storeSession(deps.db, paymentId, session, now);
  return { url: session.url };
}

/**
 * Strona powrotu (`?checkout=return&session_id=…`): pyta Stripe o sesję i stosuje odpowiedź — tylko jeśli
 * `sessionId` to sesja tej płatności (obca sesja → log, bez zmian). Błąd Stripe → bez zmian (strona pokaże
 * „Czekamy na potwierdzenie płatności”). Zwraca aktualną płatność.
 * @param {string} paymentId
 * @param {string} sessionId
 * @param {PaymentsDeps} deps
 * @returns {Promise<PaymentRow | null>}
 */
export async function syncCheckout(paymentId, sessionId, deps) {
  const payment = await getPayment(deps.db, paymentId);
  if (!payment || payment.status !== "pending") return payment;
  if (typeof sessionId !== "string" || sessionId === "" || (payment.stripe_checkout_session_id && payment.stripe_checkout_session_id !== sessionId)) {
    logger(deps).warn(`[payments] syncCheckout: obca sesja dla płatności ${paymentId} — pominięta`);
    return payment;
  }
  let session;
  try {
    session = await deps.stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    logger(deps).warn(`[payments] syncCheckout ${paymentId}: ${stripeErrorSummary(error)}`);
    return payment;
  }
  await withTransaction(deps.db, async (tx) => {
    const locked = await getPayment(tx, paymentId, { forUpdate: true });
    if (locked?.status === "pending") await applySession(tx, deps, locked, session);
  });
  return getPayment(deps.db, paymentId);
}

/**
 * Prosi Stripe o wygaszenie sesji płatności i stosuje jego odpowiedź: `expired` → expired, `complete` (opłacone
 * tuż przed) → succeeded. Brak zapisanej sesji → odtworzenie z kluczem `checkout:<id>` (zwraca sesję, którą Stripe
 * już utworzył; odmowa jednoznaczna = Stripe nie ma sesji → expired). Błąd niejednoznaczny → bez zmian
 * (spróbuje następne uruchomienie rekonsyliacji). Zwraca aktualną płatność.
 * @param {string} paymentId
 * @param {PaymentsDeps} deps
 * @returns {Promise<PaymentRow | null>}
 */
export async function expireCheckout(paymentId, deps) {
  const now = clock(deps);
  const payment = await getPayment(deps.db, paymentId);
  if (!payment || payment.status !== "pending") return payment;
  let sessionId = payment.stripe_checkout_session_id;

  if (!sessionId) {
    const request = deps.resolveCheckoutRequest ? await deps.resolveCheckoutRequest(deps.db, payment) : null;
    if (!request) {
      logger(deps).error(`[payments] expireCheckout ${paymentId}: brak parametrów do odtworzenia sesji — płatność zostaje pending`);
      return payment;
    }
    let created;
    try {
      created = await createSession(payment, request, deps);
    } catch (error) {
      if (isDefinitiveStripeError(error)) {
        // Stripe nie ma sesji pod tym kluczem i nie utworzy jej (np. czas minął) — nic nie mogło zostać opłacone.
        await withTransaction(deps.db, (tx) => markExpired(tx, deps, { paymentId }));
      } else {
        logger(deps).warn(`[payments] expireCheckout ${paymentId} (odtworzenie): ${stripeErrorSummary(error)}`);
      }
      return getPayment(deps.db, paymentId);
    }
    await storeSession(deps.db, paymentId, created, now);
    sessionId = created.id;
    if (created.status && created.status !== "open") {
      await withTransaction(deps.db, async (tx) => {
        const locked = await getPayment(tx, paymentId, { forUpdate: true });
        if (locked) await applySession(tx, deps, locked, created);
      });
      return getPayment(deps.db, paymentId);
    }
  }

  let session;
  try {
    session = await deps.stripe.checkout.sessions.expire(sessionId);
  } catch (error) {
    // Sesja już zakończona (opłacona albo wygasła) — Stripe odmawia wygaszenia; pytamy o jej stan.
    try {
      session = await deps.stripe.checkout.sessions.retrieve(sessionId);
    } catch (retrieveError) {
      logger(deps).warn(`[payments] expireCheckout ${paymentId}: ${stripeErrorSummary(error)} / ${stripeErrorSummary(retrieveError)}`);
      return getPayment(deps.db, paymentId);
    }
  }
  await withTransaction(deps.db, async (tx) => {
    const locked = await getPayment(tx, paymentId, { forUpdate: true });
    if (locked?.status === "pending") await applySession(tx, deps, locked, session);
  });
  return getPayment(deps.db, paymentId);
}
