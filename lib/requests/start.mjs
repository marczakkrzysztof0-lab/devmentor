// `startRequest` — zapytanie opłacone z góry (spec #17 Proposed Solution „Form + action”, „Atomic hold”;
// API Contracts; Implementation Plan krok 4).
//
// Kolejność:
// 1. Walidacja wejścia (niezaufane dane z przeglądarki) → `field`.
// 2. Brak konfiguracji płatności → `payments_unavailable` (nic nie zapisane).
// 3. Powtórzony `submissionId`: zapytanie wciąż `awaiting_payment` z płatnością `pending` i tym samym terminem,
//    długością i kwotą → `openCheckout` dla TEJ płatności (zapisany URL albo odzyskanie tym samym kluczem #24).
//    Każde inne powtórzenie → `checkout_failed` (retryable: false) — przeglądarka zrobi nowe id.
// 4. JEDNA transakcja: `SELECT … FOR UPDATE` na wierszu `mentors` (serializuje wszystkie zajęcia terminów tego
//    mentora) → strona opublikowana → cena z bazy = cena pokazana (inaczej `price_changed` z nową ceną) → termin
//    oferowany (#15 `isSlotOffered`, inaczej `slot_not_offered`) i niezajęty (`heldRanges`, inaczej `slot_taken`)
//    → `createPayment` (#24) → zapytanie `awaiting_payment` → szkic e-maila potwierdzenia (adres przyjdzie ze Stripe).
// 5. Po commicie `openCheckout` (successUrl `/r/{token}?checkout=return&session_id={CHECKOUT_SESSION_ID}`,
//    cancelUrl `/r/{token}?checkout=cancel`) → `{ ok: true, checkoutUrl }`; przeglądarka przechodzi do Stripe.
//    `CheckoutFailed` → `checkout_failed` z flagą `retryable` (jednoznaczny błąd: płatność `expired`, subskrybent
//    zwolnił termin).
//
// Do Stripe nie trafia nic z zapytania (#24). Treść pytania nie trafia do e-maili ani logów.
import { generateToken, hashToken } from "../auth/tokens.mjs";
import { isSlotOffered } from "../availability/queries.mjs";
import { withTransaction } from "../db/pool.mjs";
import { enqueueEmail } from "../email/outbox.mjs";
import { getPublishedPageBySlug } from "../mentor-page/public.mjs";
import { CheckoutFailed, InvalidAmount } from "../payments/errors.mjs";
import { createPayment, openCheckout } from "../payments/payments.mjs";
import { formatAmount, formatWhen } from "./format.mjs";
import { heldRanges } from "./held.mjs";
import { checkoutRequestFor, requestPageUrl } from "./links.mjs";
import { validateStartRequest } from "./validate.mjs";

export const CONFIRMATION_TEMPLATE = "request_confirmation";

/**
 * @typedef {import("./validate.mjs").RequestFieldErrors} RequestFieldErrors
 * @typedef {| { ok: true, checkoutUrl: string }
 *   | { ok: false, code: "field", errors: RequestFieldErrors }
 *   | { ok: false, code: "slot_taken" | "slot_not_offered" | "page_unavailable" | "payments_unavailable" }
 *   | { ok: false, code: "price_changed", newAmountMinor: number }
 *   | { ok: false, code: "checkout_failed", retryable: boolean }} StartRequestResult
 * @typedef {object} StartRequestDeps
 * @property {import("pg").Pool} db
 * @property {import("../payments/payments.mjs").PaymentsDeps | null} payments  null = płatności niedostępne
 * @property {string} appUrl  adres aplikacji (linki /r/)
 * @property {() => Date} [now]
 */

/**
 * @param {unknown} rawInput
 * @param {StartRequestDeps} deps
 * @returns {Promise<StartRequestResult>}
 */
export async function startRequest(rawInput, deps) {
  const validated = validateStartRequest(rawInput);
  if (!validated.ok) return { ok: false, code: "field", errors: validated.errors };
  const input = validated.value;
  if (!deps.payments) return { ok: false, code: "payments_unavailable" };
  const payments = deps.payments;
  const now = deps.now ? deps.now() : new Date();

  const repeated = await findBySubmission(deps.db, input.submissionId);
  if (repeated) return resumeRepeated(repeated, input, deps);

  const found = await getPublishedPageBySlug({ db: deps.db, slug: input.slug });
  if (!found) return { ok: false, code: "page_unavailable" };

  const token = generateToken();
  const requestUrl = requestPageUrl(deps.appUrl, token);
  /** @type {{ fail: StartRequestResult } | { paymentId: string } | { repeated: true }} */
  let created;
  try {
    created = await withTransaction(deps.db, async (tx) => {
      const { rows: mentorRows } = await tx.query("select id, time_zone from mentors where id = $1 for update", [found.mentorId]);
      if (!mentorRows[0]) return { fail: { ok: false, code: "page_unavailable" } };
      // Ta sama próba wysłana równolegle czekała na blokadę mentora — wznawiamy tę, która wygrała.
      if (await findBySubmission(tx, input.submissionId)) return { repeated: true };
      const page = await getPublishedPageBySlug({ db: tx, slug: input.slug });
      if (!page || page.mentorId !== found.mentorId) return { fail: { ok: false, code: "page_unavailable" } };

      const price = input.lengthMinutes === 25 ? page.page.price25Minor : page.page.price50Minor;
      if (input.expectedAmountMinor !== price) return { fail: { ok: false, code: "price_changed", newAmountMinor: price } };

      const slotStart = new Date(input.slotStart);
      const slotEnd = new Date(slotStart.getTime() + input.lengthMinutes * 60_000);
      const offered = await isSlotOffered({ db: tx, mentorId: found.mentorId, startsAt: slotStart, lengthMinutes: input.lengthMinutes, now });
      if (!offered) return { fail: { ok: false, code: "slot_not_offered" } };
      const held = await heldRanges(tx, { mentorId: found.mentorId, from: slotStart, to: slotEnd, now });
      if (held.length > 0) return { fail: { ok: false, code: "slot_taken" } };

      const paymentId = await createPayment(tx, { amountMinor: price, currency: page.page.currency }, { config: payments.config, now: () => now });
      const { rows } = await tx.query(
        `insert into requests (mentor_id, payment_id, status, length_minutes, slot_start, slot_end, mentee_name, question,
                               access_token_hash, submission_id, created_at, updated_at)
         values ($1, $2, 'awaiting_payment', $3, $4, $5, $6, $7, $8, $9, $10, $10)
         returning id`,
        [found.mentorId, paymentId, input.lengthMinutes, slotStart, slotEnd, input.menteeName, input.question, hashToken(token), input.submissionId, now],
      );
      // Szkic potwierdzenia: jedyne miejsce z linkiem /r/ (do wysłania, potem `params` zerowane) — także źródło
      // parametrów powrotu, gdy `expireCheckout` musi odtworzyć sesję (#24 `resolveCheckoutRequest`).
      await enqueueEmail(
        tx,
        {
          to: null,
          draft: true,
          template: CONFIRMATION_TEMPLATE,
          params: {
            requestId: rows[0].id,
            requestUrl,
            mentorName: page.page.displayName,
            when: formatWhen(slotStart, mentorRows[0].time_zone),
            lengthMinutes: input.lengthMinutes,
            amount: formatAmount(price, page.page.currency),
          },
        },
        { now },
      );
      return { paymentId };
    });
  } catch (error) {
    if (error instanceof InvalidAmount) return { ok: false, code: "payments_unavailable" };
    // Ta sama próba wysłana równolegle (podwójne kliknięcie, dwie karty) — wygrała druga; wznawiamy jej płatność.
    if (/** @type {{ code?: string, constraint?: string }} */ (error)?.code === "23505" && /** @type {any} */ (error).constraint === "requests_submission_id_key") {
      const winner = await findBySubmission(deps.db, input.submissionId);
      if (winner) return resumeRepeated(winner, input, deps);
    }
    throw error;
  }
  if ("fail" in created) return created.fail;
  if ("repeated" in created) {
    const winner = await findBySubmission(deps.db, input.submissionId);
    return winner ? resumeRepeated(winner, input, deps) : { ok: false, code: "checkout_failed", retryable: true };
  }
  return openForPayment(created.paymentId, checkoutRequestFor(requestUrl, input.lengthMinutes), payments);
}

/**
 * @param {string} paymentId
 * @param {import("../payments/payments.mjs").CheckoutRequest} request
 * @param {import("../payments/payments.mjs").PaymentsDeps} payments
 * @returns {Promise<StartRequestResult>}
 */
async function openForPayment(paymentId, request, payments) {
  try {
    const { url } = await openCheckout(paymentId, request, payments);
    return { ok: true, checkoutUrl: url };
  } catch (error) {
    if (error instanceof CheckoutFailed) return { ok: false, code: "checkout_failed", retryable: error.retryable };
    throw error;
  }
}

/** @param {import("../db/pool.mjs").Queryable} db @param {string} submissionId */
async function findBySubmission(db, submissionId) {
  const { rows } = await db.query(
    `select r.id, r.status, r.payment_id, r.length_minutes, r.slot_start, p.status as payment_status, p.amount_minor,
            (select e.params ->> 'requestUrl' from outbound_emails e
              where e.status = 'draft' and e.template = $2 and e.params ->> 'requestId' = r.id::text
              limit 1) as request_url
       from requests r join payments p on p.id = r.payment_id
      where r.submission_id = $1`,
    [submissionId, CONFIRMATION_TEMPLATE],
  );
  return rows[0] ?? null;
}

/**
 * Powtórzone wysłanie tej samej próby (#17 API Contracts).
 * @param {any} existing
 * @param {import("./validate.mjs").StartRequestInput} input
 * @param {StartRequestDeps} deps
 * @returns {Promise<StartRequestResult>}
 */
async function resumeRepeated(existing, input, deps) {
  const same =
    existing.status === "awaiting_payment" &&
    existing.payment_status === "pending" &&
    new Date(existing.slot_start).getTime() === Date.parse(input.slotStart) &&
    Number(existing.length_minutes) === input.lengthMinutes &&
    Number(existing.amount_minor) === input.expectedAmountMinor &&
    typeof existing.request_url === "string";
  if (!same || !deps.payments) return { ok: false, code: "checkout_failed", retryable: false };
  return openForPayment(existing.payment_id, checkoutRequestFor(existing.request_url, input.lengthMinutes), deps.payments);
}

/**
 * Parametry powrotu z Checkout dla płatności zapytania — dla `expireCheckout` (#24), gdy id sesji nie zdążyło się
 * zapisać. Źródło: szkic potwierdzenia (istnieje, dopóki płatność jest `pending`). Brak → `null`.
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {{ id: string }} payment
 * @returns {Promise<import("../payments/payments.mjs").CheckoutRequest | null>}
 */
export async function resolveRequestCheckout(db, payment) {
  const { rows } = await db.query(
    `select r.length_minutes, e.params ->> 'requestUrl' as request_url
       from requests r
       join outbound_emails e on e.status = 'draft' and e.template = $2 and e.params ->> 'requestId' = r.id::text
      where r.payment_id = $1
      limit 1`,
    [payment.id, CONFIRMATION_TEMPLATE],
  );
  const row = rows[0];
  if (!row?.request_url) return null;
  return checkoutRequestFor(row.request_url, Number(row.length_minutes));
}
