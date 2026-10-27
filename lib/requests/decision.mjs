// Decyzja mentora: akceptacja i odrzucenie opłaconego zapytania (spec #18 Proposed Solution „Transitions”,
// „Refusal code from a fresh read”, „Refunds”; API Contracts `acceptRequest`, `declineRequest`).
//
// - Id mentora WYŁĄCZNIE z sesji (wywołujący bierze je z `getCurrentMentor()`), nigdy z danych klienta.
// - Jedno warunkowe `UPDATE … WHERE id AND mentor_id AND status = 'awaiting_mentor' AND slot_start > zegar`.
//   PostgreSQL po zwolnieniu blokady wiersza ponownie sprawdza `WHERE`, więc akceptacja, odrzucenie, anulowanie (#19)
//   i wygaśnięcie (`lapse.mjs`) wykluczają się bez blokad aplikacji — wygrywa pierwsze zatwierdzone przejście.
// - Zegar: bazy (`now()`), chyba że test wstrzyknie `deps.now` — ten sam zegar co w `lapseOverdue`.
// - Zero wierszy → ponowny odczyt PO `mentor_id` i klasyfikacja w kolejności: nie znaleziono (albo cudze, albo
//   nieopłacone) → `not_found`; status `cancelled` / `declined` / `lapsed` / `accepted` → jego kod; wciąż
//   `awaiting_mentor` po starcie terminu → `slot_started`. Stan się nie zmienia.
// - Odrzucenie: zamiar zwrotu `mentor_declined` (#24 `requestRefund`) i e-mail w TEJ SAMEJ transakcji; `executeRefund`
//   po commicie (błąd Stripe → zwrot zostaje `requested`, ponowi zadanie `payments.retryRefunds`).
// - E-maile do płacącego (`payments.payer_email`) przez outbox #17 — bez treści pytania; mentor nie widzi adresu.
import { withTransaction } from "../db/pool.mjs";
import { enqueueEmail } from "../email/outbox.mjs";
import { clock, logger } from "../payments/payments.mjs";
import { executeRefund, requestRefund } from "../payments/refunds.mjs";
import { formatAmount, formatWhen } from "./format.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Czy wartość ma kształt uuid (inaczej zapytanie do bazy rzuciłoby błąd typu). */
export const isUuid = (/** @type {unknown} */ value) => typeof value === "string" && UUID.test(value);

/** @typedef {"not_found" | "cancelled" | "declined" | "lapsed" | "already_accepted" | "already_declined" | "slot_started"} DecisionRefusal */
/** @typedef {"requested" | "succeeded" | "failed" | null} RefundView */
/**
 * @typedef {{ ok: true, requestId: string, paymentId: string, refund: "requested" | "already" | null }
 *   | { ok: false, code: DecisionRefusal, refundStatus?: RefundView }} DecisionOutcome
 */
/**
 * Zależności decyzji. `payments` — #24 (`executeRefund` po commicie); `null` = tylko zamiar zwrotu (zadanie dokończy).
 * `now` — wstrzyknięty zegar (testy); brak = zegar bazy dla strażnika i `new Date()` dla znaczników outboxu.
 * @typedef {{ db: import("pg").Pool, payments?: import("../payments/payments.mjs").PaymentsDeps | null, now?: () => Date }} DecisionDeps
 */

/** Stan zwrotu do pokazania: `pending` u Stripe to dla ludzi wciąż „w toku”. */
export const refundView = (/** @type {string | null | undefined} */ status) =>
  /** @type {RefundView} */ (status === "pending" ? "requested" : (status ?? null));

/**
 * Dane do e-maila o zapytaniu: płacący, kwota, termin w strefie mentora, nazwa mentora.
 * @param {import("pg").PoolClient} tx
 * @param {string} requestId
 */
export async function requestEmailContext(tx, requestId) {
  const { rows } = await tx.query(
    `select r.slot_start, r.length_minutes, p.payer_email, p.amount_minor, p.currency, m.time_zone, mp.display_name
       from requests r
       join payments p on p.id = r.payment_id
       join mentors m on m.id = r.mentor_id
       left join mentor_pages mp on mp.mentor_id = r.mentor_id
      where r.id = $1`,
    [requestId],
  );
  const row = rows[0];
  return {
    payerEmail: /** @type {string | null} */ (row.payer_email ?? null),
    params: {
      mentorName: row.display_name ?? "mentor",
      when: formatWhen(row.slot_start, row.time_zone),
      lengthMinutes: Number(row.length_minutes),
      amount: formatAmount(Number(row.amount_minor), row.currency),
    },
  };
}

/**
 * Kod odmowy z ponownego odczytu (po nieudanym `UPDATE`), zawsze w zakresie `mentor_id`.
 * @param {import("../db/pool.mjs").Queryable} tx
 * @param {"accept" | "decline"} kind
 * @param {{ mentorId: string, requestId: string }} ids
 * @returns {Promise<{ ok: false, code: DecisionRefusal, refundStatus?: RefundView }>}
 */
async function refusal(tx, kind, { mentorId, requestId }) {
  const { rows } = await tx.query(
    `select r.status, p.refund_status
       from requests r join payments p on p.id = r.payment_id
      where r.id = $1 and r.mentor_id = $2`,
    [requestId, mentorId],
  );
  const row = rows[0];
  if (!row || row.status === "awaiting_payment" || row.status === "payment_failed") return { ok: false, code: "not_found" };
  const refundStatus = refundView(row.refund_status);
  switch (row.status) {
    case "cancelled":
    case "lapsed":
      return { ok: false, code: row.status, refundStatus };
    case "declined":
      return { ok: false, code: kind === "accept" ? "declined" : "already_declined", refundStatus };
    case "accepted":
      return { ok: false, code: "already_accepted" };
    default:
      // Wciąż `awaiting_mentor` — przegrało tylko ze strażnikiem czasu.
      return { ok: false, code: "slot_started", refundStatus };
  }
}

/**
 * Przejście w transakcji wywołującego (testy wyścigów trzymają transakcję otwartą). Bez `executeRefund`.
 * @param {import("pg").PoolClient} tx
 * @param {"accept" | "decline"} kind
 * @param {{ mentorId: string, requestId: string }} ids
 * @param {{ now?: () => Date, stamp?: Date }} [options]  `now` — zegar strażnika (brak = baza); `stamp` — znaczniki zwrotu
 *   i outboxu (zegar modułu płatności, którym `executeRefund` zajmuje zwrot)
 * @returns {Promise<DecisionOutcome>}
 */
export async function decideInTx(tx, kind, { mentorId, requestId }, { now, stamp: refundStamp } = {}) {
  if (!isUuid(requestId) || !isUuid(mentorId)) return { ok: false, code: "not_found" };
  const at = now ? now() : null;
  const target = kind === "accept" ? "accepted" : "declined";
  const column = kind === "accept" ? "accepted_at" : "declined_at";
  const { rows } = await tx.query(
    `update requests
        set status = $4, ${column} = coalesce($3::timestamptz, now()), updated_at = coalesce($3::timestamptz, now())
      where id = $1 and mentor_id = $2 and status = 'awaiting_mentor' and slot_start > coalesce($3::timestamptz, now())
      returning id, payment_id`,
    [requestId, mentorId, at, target],
  );
  const updated = rows[0];
  if (!updated) return refusal(tx, kind, { mentorId, requestId });

  const stamp = refundStamp ?? at ?? new Date();
  /** @type {"requested" | "already" | null} */
  let refund = null;
  if (kind === "decline") refund = await requestRefund(tx, updated.payment_id, "mentor_declined", { now: () => stamp });
  const email = await requestEmailContext(tx, updated.id);
  if (email.payerEmail) {
    const { mentorName, when, lengthMinutes, amount } = email.params;
    await enqueueEmail(
      tx,
      kind === "accept"
        ? { to: email.payerEmail, template: "request_accepted", params: { mentorName, when, lengthMinutes } }
        : { to: email.payerEmail, template: "request_declined", params: { mentorName, when, amount } },
      { now: stamp },
    );
  }
  return { ok: true, requestId: updated.id, paymentId: updated.payment_id, refund };
}

/**
 * Zlecony zwrot wykonywany od razu po commicie; błąd nie zmienia wyniku (ponowi `payments.retryRefunds`).
 * @param {string} paymentId
 * @param {DecisionDeps["payments"]} payments
 */
export async function executeRefundAfterCommit(paymentId, payments) {
  if (!payments) return;
  try {
    await executeRefund(paymentId, payments);
  } catch (error) {
    logger(payments).warn(`[requests] zwrot ${paymentId} po commicie nie powiódł się: ${error instanceof Error ? error.name : "Error"} — ponowi zadanie`);
  }
}

/**
 * @param {"accept" | "decline"} kind
 * @param {{ mentorId: string, requestId: unknown }} ids
 * @param {DecisionDeps} deps
 * @returns {Promise<DecisionOutcome>}
 */
async function decide(kind, { mentorId, requestId }, deps) {
  if (!isUuid(requestId)) return { ok: false, code: "not_found" };
  const now = deps.now ?? (deps.payments?.now ? () => clock(/** @type {any} */ (deps.payments)) : undefined);
  // Jak w `lapse.mjs` i `cancel.mjs`: znaczniki zwrotu z zegara płatności, żeby `executeRefund` po commicie go zajął.
  const stamp = deps.payments ? clock(deps.payments) : undefined;
  const outcome = await withTransaction(deps.db, (tx) => decideInTx(tx, kind, { mentorId, requestId: /** @type {string} */ (requestId) }, { now, stamp }));
  if (outcome.ok && outcome.refund === "requested") await executeRefundAfterCommit(outcome.paymentId, deps.payments);
  return outcome;
}

/** `acceptRequest(requestId)` (#18): `awaiting_mentor` → `accepted`, e-mail `request_accepted`. */
export const acceptRequest = (/** @type {{ mentorId: string, requestId: unknown }} */ ids, /** @type {DecisionDeps} */ deps) => decide("accept", ids, deps);

/** `declineRequest(requestId)` (#18): → `declined`, zwrot `mentor_declined`, e-mail `request_declined`. */
export const declineRequest = (/** @type {{ mentorId: string, requestId: unknown }} */ ids, /** @type {DecisionDeps} */ deps) => decide("decline", ids, deps);
