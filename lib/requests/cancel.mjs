// Anulowanie zapytania przez dewelopera do chwili akceptacji (spec #19 Proposed Solution, API Contracts
// `cancelRequest(token)`; D05 / R11: pełny zwrot do akceptacji, po akceptacji nic).
//
// - Uprawnienie = link `/r/{token}` (#17 Token contract): zapytanie WYŁĄCZNIE po SHA-256 tokenu, ważnego do 30 dni
//   po terminie; nieznany / wygasły / zły kształt → `not_found` (strona 404).
// - Jeden warunkowy `UPDATE … WHERE access_token_hash AND status = 'awaiting_mentor'` — BEZ strażnika czasu
//   (anulowanie działa także po starcie terminu, zanim zadanie wygasi zapytanie; spec Q3). Akceptacja, odrzucenie
//   i wygaśnięcie (#18) strzegą tego samego wiersza tym samym statusem — wygrywa pierwsze zatwierdzone przejście.
// - Zamiar zwrotu `mentee_cancelled` w tej samej transakcji, `executeRefund` po commicie (błąd → ponowi #24).
//   `requestRefund` jest idempotentny per płatność, więc wyścig z odrzuceniem / wygaśnięciem daje jeden zwrot.
// - Bez e-maila o samym anulowaniu (Q4); deweloper dostanie e-mail o wykonanym / nieudanym zwrocie (#17).
// - Zero wierszy → ponowny odczyt po tokenie i odpowiedź ze stanem, który wygrał.
import { hashToken, isLinkTokenShape } from "../auth/tokens.mjs";
import { withTransaction } from "../db/pool.mjs";
import { clock } from "../payments/payments.mjs";
import { requestRefund } from "../payments/refunds.mjs";
import { executeRefundAfterCommit } from "./decision.mjs";
import { TOKEN_VALID_DAYS_AFTER_SLOT } from "./view.mjs";

/**
 * @typedef {{ ok: true, refund: "requested" }
 *   | { ok: false, reason: "already_refunding", status: "declined" | "lapsed" | "cancelled" }
 *   | { ok: false, reason: "accepted" | "not_paid" | "not_found" }} CancelResult
 */

/**
 * Anulowanie w transakcji wywołującego (testy wyścigów trzymają ją otwartą). Bez `executeRefund`.
 * @param {import("pg").PoolClient} tx
 * @param {unknown} token
 * @param {{ now?: () => Date, stamp?: Date }} [options]  `now` — zegar (testy); brak = zegar bazy
 * @returns {Promise<CancelResult & { paymentId?: string }>}
 */
export async function cancelByTokenInTx(tx, token, { now, stamp } = {}) {
  if (!isLinkTokenShape(token)) return { ok: false, reason: "not_found" };
  const hash = hashToken(/** @type {string} */ (token));
  const at = now ? now() : null;
  const { rows } = await tx.query(
    `update requests
        set status = 'cancelled', cancelled_at = coalesce($2::timestamptz, now()), updated_at = coalesce($2::timestamptz, now())
      where access_token_hash = $1 and status = 'awaiting_mentor'
        and slot_end + make_interval(days => $3) > coalesce($2::timestamptz, now())
      returning id, payment_id`,
    [hash, at, TOKEN_VALID_DAYS_AFTER_SLOT],
  );
  const cancelled = rows[0];
  if (cancelled) {
    const refundAt = stamp ?? at ?? new Date();
    await requestRefund(tx, cancelled.payment_id, "mentee_cancelled", { now: () => refundAt });
    return { ok: true, refund: "requested", paymentId: cancelled.payment_id };
  }
  const { rows: current } = await tx.query(
    `select status from requests
      where access_token_hash = $1 and slot_end + make_interval(days => $3) > coalesce($2::timestamptz, now())`,
    [hash, at, TOKEN_VALID_DAYS_AFTER_SLOT],
  );
  const status = current[0]?.status;
  if (!status) return { ok: false, reason: "not_found" };
  if (status === "accepted") return { ok: false, reason: "accepted" };
  if (status === "declined" || status === "lapsed" || status === "cancelled") return { ok: false, reason: "already_refunding", status };
  return { ok: false, reason: "not_paid" };
}

/**
 * `cancelRequest(token)` (#19).
 * @param {unknown} token
 * @param {{ db: import("pg").Pool, payments?: import("../payments/payments.mjs").PaymentsDeps | null, now?: () => Date }} deps
 * @returns {Promise<CancelResult>}
 */
export async function cancelByToken(token, deps) {
  const stamp = deps.payments ? clock(deps.payments) : undefined;
  const outcome = await withTransaction(deps.db, (tx) => cancelByTokenInTx(tx, token, { now: deps.now, stamp }));
  if (outcome.ok) {
    await executeRefundAfterCommit(/** @type {string} */ (outcome.paymentId), deps.payments);
    return { ok: true, refund: "requested" };
  }
  return outcome;
}
