// Pełny zwrot płatności: outbox + dzierżawa (spec #24 Phase 2, Proposed Solution „Refund = outbox + lease”,
// „Never two refunds”; API Contracts `requestRefund`, `executeRefund`; Q6, Q7, Q10).
//
// - `requestRefund(tx, …)` zapisuje zamiar zwrotu w transakcji wywołującego (no-op, gdy już zlecony).
// - `executeRefund` (po commicie, opcjonalnie od razu; zawsze w zadaniu `payments.retryRefunds`):
//   1. ZAJĘCIE zatwierdzone przed wywołaniem Stripe: podbicie `refund_attempts` + dzierżawa 5 min (osobne
//      polecenie, autocommit). Zero wierszy → ktoś inny je ma (albo jeszcze nie pora) → koniec.
//   2. PRZEJĘCIE przed utworzeniem: lista zwrotów PaymentIntentu; każdy nie `failed`/`canceled` jest przejmowany.
//   3. UTWORZENIE z kluczem `refund:<paymentId>:<próba>` — ponowienia sieciowe SDK (maxNetworkRetries: 2,
//      timeout 20 s) używają tego samego klucza w obrębie próby; nowa próba = nowy klucz (Stripe nie powtórzy
//      zapamiętanego błędu).
//   4. ZAPIS wyniku strzeżony `WHERE refund_attempts = $próba AND refund_status = 'requested'`; dzierżawa czyszczona.
//      Pracownik, któremu dzierżawa wygasła, niczego nie zapisze.
//   5. Ostatni bezpiecznik: każdy zwrot jest pełny, a Stripe odmawia zwrotu ponad kwotę (`charge_already_refunded`
//      → sukces). Dwie nakładające się próby nie przeleją pieniędzy dwa razy.
// - Porażka: zostaje `requested`, kolejna próba po 1, 5, 15, 60 min, potem co godzinę; po 24 h od zlecenia →
//   `failed` + `refund.failed` + licznik w zdrowiu zadań (Q10). Płatność ze sporem → `failed` od razu, bez Stripe (Q7).
// - Zwrot `pending` u Stripe sprawdzany co godzinę (`pollPendingRefund`), bo webhook może nie dotrzeć.
import { withTransaction } from "../db/pool.mjs";
import { stripeErrorSummary } from "./errors.mjs";
import { emitPaymentEvent } from "./events.mjs";
import { clock, logger } from "./payments.mjs";

const MINUTE_MS = 60_000;
export const REFUND_LEASE_MINUTES = 5;
/** Odstępy kolejnych prób po porażce (min), potem co godzinę. */
export const REFUND_BACKOFF_MINUTES = Object.freeze([1, 5, 15, 60]);
export const REFUND_GIVE_UP_HOURS = 24;
/** Zwrot `pending` u Stripe sprawdzamy, gdy od ostatniej zmiany minęła godzina. */
export const PENDING_REFUND_POLL_MINUTES = 60;

/** @typedef {import("./payments.mjs").PaymentsDeps} PaymentsDeps */
/** @typedef {"mentor_declined" | "lapsed" | "mentee_cancelled" | "invalid_on_payment" | "external" | "mentor_no_show"} RefundReason */

/** Odstęp przed kolejną próbą po porażce próby nr `attempt` (1, 2, …). */
export function refundBackoffMinutes(attempt) {
  return REFUND_BACKOFF_MINUTES[Math.max(0, attempt - 1)] ?? 60;
}

/**
 * Zleca pełny zwrot opłaconej płatności w transakcji wywołującego. `already`, gdy zwrot już zlecony (w każdym stanie).
 * Rzuca, gdy płatność nie jest opłacona.
 * @param {import("../db/pool.mjs").Queryable} tx
 * @param {string} paymentId
 * @param {RefundReason} reason
 * @param {{ now?: () => Date }} [deps]
 * @returns {Promise<"requested" | "already">}
 */
export async function requestRefund(tx, paymentId, reason, deps = {}) {
  const now = deps.now ? deps.now() : new Date();
  const { rows } = await tx.query(
    `update payments
        set refund_status = 'requested', refund_reason = $2, refund_requested_at = $3,
            refund_next_attempt_at = $3, updated_at = $3
      where id = $1 and status = 'succeeded' and refund_status is null
      returning id`,
    [paymentId, reason, now],
  );
  if (rows[0]) return "requested";
  const { rows: current } = await tx.query("select status from payments where id = $1", [paymentId]);
  if (current[0]?.status !== "succeeded") throw new Error(`requestRefund: płatność ${paymentId} nie jest opłacona`);
  return "already";
}

/**
 * Zapis wyniku próby — strzeżony numerem próby; subskrybenci w tej samej transakcji.
 * @param {PaymentsDeps} deps
 * @param {string} paymentId
 * @param {number} attempt
 * @param {{ kind: "succeeded" | "pending" | "failed" | "retry", refundId?: string | null, error?: string | null }} result
 * @returns {Promise<boolean>} czy zapis się udał (false = dzierżawa przejęta przez nowszą próbę)
 */
async function writeAttemptResult(deps, paymentId, attempt, result) {
  const now = clock(deps);
  return withTransaction(deps.db, async (tx) => {
    let sql;
    /** @type {unknown[]} */
    let params;
    if (result.kind === "succeeded") {
      sql = `update payments set refund_status = 'succeeded', refunded_at = $3, stripe_refund_id = coalesce($4, stripe_refund_id),
                    refund_lease_until = null, refund_last_error = null, updated_at = $3`;
      params = [paymentId, attempt, now, result.refundId ?? null];
    } else if (result.kind === "pending") {
      sql = `update payments set refund_status = 'pending', stripe_refund_id = $4,
                    refund_lease_until = null, refund_last_error = null, updated_at = $3`;
      params = [paymentId, attempt, now, result.refundId];
    } else if (result.kind === "failed") {
      sql = `update payments set refund_status = 'failed', refund_lease_until = null, refund_last_error = $4, updated_at = $3`;
      params = [paymentId, attempt, now, result.error ?? null];
    } else {
      sql = `update payments set refund_next_attempt_at = $4, refund_lease_until = null, refund_last_error = $5, updated_at = $3`;
      params = [paymentId, attempt, now, new Date(now.getTime() + refundBackoffMinutes(attempt) * MINUTE_MS), result.error ?? null];
    }
    const { rows } = await tx.query(`${sql} where id = $1 and refund_attempts = $2 and refund_status = 'requested' returning *`, params);
    if (!rows[0]) return false;
    if (result.kind === "succeeded" || result.kind === "failed") {
      const type = result.kind === "succeeded" ? "refund.succeeded" : "refund.failed";
      await emitPaymentEvent(deps.subscribers, tx, { type, paymentId, payment: rows[0] }, now);
    }
    return true;
  });
}

/**
 * Wykonuje zleconą próbę zwrotu (zajęcie → przejęcie → utworzenie → strzeżony zapis).
 * @param {string} paymentId
 * @param {PaymentsDeps} deps
 * @returns {Promise<{ outcome: "not_claimed" | "succeeded" | "pending" | "failed" | "retry" | "lost_lease", attempt?: number }>}
 */
export async function executeRefund(paymentId, deps) {
  const now = clock(deps);
  const { rows } = await deps.db.query(
    `update payments
        set refund_attempts = refund_attempts + 1, refund_lease_until = $3, updated_at = $2
      where id = $1 and refund_status = 'requested' and refund_next_attempt_at <= $2
        and (refund_lease_until is null or refund_lease_until < $2)
      returning refund_attempts, stripe_payment_intent_id, disputed_at, refund_requested_at`,
    [paymentId, now, new Date(now.getTime() + REFUND_LEASE_MINUTES * MINUTE_MS)],
  );
  const claimed = rows[0];
  if (!claimed) return { outcome: "not_claimed" };
  const attempt = Number(claimed.refund_attempts);
  const write = async (/** @type {Parameters<typeof writeAttemptResult>[3]} */ result) =>
    (await writeAttemptResult(deps, paymentId, attempt, result)) ? { outcome: result.kind, attempt } : { outcome: /** @type {const} */ ("lost_lease"), attempt };

  if (claimed.disputed_at) {
    logger(deps).error(`[payments] zwrot ${paymentId}: spór (chargeback) — bez zwrotu w Stripe, obsługa ręczna`);
    return write({ kind: "failed", error: "disputed" });
  }

  const failure = async (/** @type {string} */ summary) => {
    const requestedAt = new Date(claimed.refund_requested_at).getTime();
    if (clock(deps).getTime() - requestedAt >= REFUND_GIVE_UP_HOURS * 60 * MINUTE_MS) {
      logger(deps).error(`[payments] zwrot ${paymentId} nie powiódł się przez ${REFUND_GIVE_UP_HOURS} h — failed (${summary})`);
      return write({ kind: "failed", error: summary });
    }
    logger(deps).warn(`[payments] zwrot ${paymentId}, próba ${attempt}: ${summary} — ponowienie`);
    return write({ kind: "retry", error: summary });
  };

  const paymentIntent = claimed.stripe_payment_intent_id;
  if (!paymentIntent) return failure("missing_payment_intent");

  let refund;
  try {
    const existing = await deps.stripe.refunds.list({ payment_intent: paymentIntent, limit: 100 });
    refund = (existing?.data ?? []).find((/** @type {any} */ r) => r.status !== "failed" && r.status !== "canceled");
    refund ??= await deps.stripe.refunds.create(
      { payment_intent: paymentIntent, metadata: { payment_id: paymentId } },
      { idempotencyKey: `refund:${paymentId}:${attempt}` },
    );
  } catch (error) {
    if (/** @type {{ code?: unknown }} */ (error)?.code === "charge_already_refunded") return write({ kind: "succeeded", refundId: null });
    return failure(stripeErrorSummary(error));
  }

  if (refund.status === "succeeded") return write({ kind: "succeeded", refundId: refund.id });
  if (refund.status === "pending" || refund.status === "requires_action") return write({ kind: "pending", refundId: refund.id });
  return failure(`refund_${refund.status ?? "unknown"}`);
}

/**
 * Zwrot `pending` u Stripe: pobiera jego stan i stosuje (`succeeded` / `failed` → koniec + zdarzenie); wciąż
 * `pending` → tylko `updated_at` (następne sprawdzenie za godzinę).
 * @param {string} paymentId
 * @param {PaymentsDeps} deps
 * @returns {Promise<"succeeded" | "failed" | "pending" | "skipped">}
 */
export async function pollPendingRefund(paymentId, deps) {
  const { rows } = await deps.db.query("select stripe_refund_id from payments where id = $1 and refund_status = 'pending'", [paymentId]);
  const refundId = rows[0]?.stripe_refund_id;
  if (!refundId) return "skipped";
  let refund;
  try {
    refund = await deps.stripe.refunds.retrieve(refundId);
  } catch (error) {
    logger(deps).warn(`[payments] sprawdzenie zwrotu ${paymentId}: ${stripeErrorSummary(error)}`);
    return "skipped";
  }
  return applyRefundObject(paymentId, refund, deps);
}

/**
 * Stan obiektu zwrotu Stripe → płatność (zwrot musi być tym zapisanym; strzeżone `refund_status = 'pending'`).
 * @param {string} paymentId
 * @param {any} refund
 * @param {PaymentsDeps} deps
 * @param {import("pg").PoolClient} [existingTx] transakcja webhooka
 * @returns {Promise<"succeeded" | "failed" | "pending" | "skipped">}
 */
export async function applyRefundObject(paymentId, refund, deps, existingTx) {
  const now = clock(deps);
  const run = async (/** @type {import("pg").PoolClient} */ tx) => {
    if (refund.status === "succeeded" || refund.status === "failed" || refund.status === "canceled") {
      const succeeded = refund.status === "succeeded";
      const { rows } = await tx.query(
        `update payments
            set refund_status = $3, refunded_at = case when $3 = 'succeeded' then $4::timestamptz else null end,
                refund_last_error = case when $3 = 'failed' then $5 else refund_last_error end, updated_at = $4
          where id = $1 and refund_status = 'pending' and stripe_refund_id = $2
          returning *`,
        [paymentId, refund.id, succeeded ? "succeeded" : "failed", now, `refund_${refund.status}`],
      );
      if (!rows[0]) return /** @type {const} */ ("skipped");
      await emitPaymentEvent(deps.subscribers, tx, { type: succeeded ? "refund.succeeded" : "refund.failed", paymentId, payment: rows[0] }, now);
      return succeeded ? "succeeded" : "failed";
    }
    await tx.query("update payments set updated_at = $2 where id = $1 and refund_status = 'pending'", [paymentId, now]);
    return /** @type {const} */ ("pending");
  };
  return existingTx ? run(existingTx) : withTransaction(deps.db, run);
}

/**
 * Zadanie `payments.retryRefunds`: zlecone zwroty, których pora (paczka ≤ 50), potem zwroty `pending` starsze niż
 * godzina. Zatrzymuje się po przekroczeniu `deadline` (budżet czasu zadań).
 * @param {PaymentsDeps} deps
 * @param {{ limit?: number, deadline?: number }} [options]
 */
export async function retryRefunds(deps, { limit = 50, deadline = Infinity } = {}) {
  const now = clock(deps);
  const counts = { executed: 0, succeeded: 0, pending: 0, failed: 0, retry: 0, polled: 0 };
  const { rows: due } = await deps.db.query(
    `select id from payments
      where refund_status = 'requested' and refund_next_attempt_at <= $1
        and (refund_lease_until is null or refund_lease_until < $1)
      order by refund_next_attempt_at
      limit $2`,
    [now, limit],
  );
  for (const { id } of due) {
    if (Date.now() > deadline) break;
    const { outcome } = await executeRefund(id, deps);
    if (outcome === "not_claimed" || outcome === "lost_lease") continue;
    counts.executed += 1;
    counts[outcome] += 1;
  }
  const { rows: pending } = await deps.db.query(
    `select id from payments
      where refund_status = 'pending' and updated_at <= $1
      order by updated_at
      limit $2`,
    [new Date(now.getTime() - PENDING_REFUND_POLL_MINUTES * MINUTE_MS), limit],
  );
  for (const { id } of pending) {
    if (Date.now() > deadline) break;
    const result = await pollPendingRefund(id, deps);
    if (result === "skipped") continue;
    counts.polled += 1;
    if (result !== "pending") counts[result] += 1;
  }
  return counts;
}
