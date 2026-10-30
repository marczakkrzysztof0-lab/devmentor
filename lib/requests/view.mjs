// Odczyt zapytania po tokenie dla strony `/r/{token}` (spec #17 Token contract, API Contracts „Page /r/{token}”,
// UI/UX; Implementation Plan krok 8).
//
// - Zapytanie WYŁĄCZNIE po SHA-256 tokenu — nigdy po id z adresu ani formularza.
// - Token ważny do 30 dni po `slot_end`; później (albo nieznany / zły kształt) → `null` → 404 bez szczegółów.
// - Stan strony liczony z zapytania i płatności (`viewStatus`): płatność `pending` → „Czekamy na potwierdzenie
//   płatności”; `payment_failed` + płatność opłacona (zwrot `invalid_on_payment`) → „Płatność dotarła za późno”.
// - DTO dla strony: `requestId`, `paymentId` zostają na serwerze (strona ich nie wysyła do klienta).
import { hashToken, isLinkTokenShape } from "../auth/tokens.mjs";

export const TOKEN_VALID_DAYS_AFTER_SLOT = 30;

/**
 * @typedef {"payment_pending" | "payment_failed" | "late_payment" | "awaiting_mentor" | "accepted" | "declined" | "overdue" | "lapsed" | "cancelled" | "session_ended" | "held" | "mentee_no_show" | "mentor_no_show"} RequestViewStatus
 */

/**
 * Stan do pokazania (DS `RequestStatusView`) z zapytania i płatności.
 * `awaiting_mentor` z `slot_start <= now` → `overdue` („Termin minął — zwrot zostanie zlecony automatycznie”):
 * mentor nie może już decydować (#18), a zadanie wygaszania jeszcze nie zleciło zwrotu.
 * `accepted` z `slot_end <= now` → `session_ended` („Sesja zakończona — rozliczamy”): tylko stan pochodny, zanim
 * zadanie `sessions.settleEnded` (#21) zapisze wynik (`held` / `mentee_no_show` / `mentor_no_show`).
 * @param {{ status: string, paymentStatus: string, slotStart: Date | string, slotEnd?: Date | string, now: Date }} row
 * @returns {RequestViewStatus}
 */
export function viewStatus({ status, paymentStatus, slotStart, slotEnd, now }) {
  if (status === "awaiting_mentor" && new Date(slotStart).getTime() <= now.getTime()) return "overdue";
  if (status === "accepted" && slotEnd !== undefined && new Date(slotEnd).getTime() <= now.getTime()) return "session_ended";
  if (status === "awaiting_payment") return paymentStatus === "expired" ? "payment_failed" : "payment_pending";
  if (status === "payment_failed") return paymentStatus === "succeeded" ? "late_payment" : "payment_failed";
  return /** @type {RequestViewStatus} */ (status);
}

/**
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {unknown} token
 * @param {Date} now
 */
export async function getRequestByToken(db, token, now) {
  if (!isLinkTokenShape(token)) return null;
  const { rows } = await db.query(
    `select r.id, r.payment_id, r.status, r.length_minutes, r.slot_start, r.slot_end, r.question,
            p.status as payment_status, p.amount_minor, p.currency, p.refund_status,
            mp.slug as mentor_slug, mp.display_name as mentor_name
       from requests r
       join payments p on p.id = r.payment_id
       left join mentor_pages mp on mp.mentor_id = r.mentor_id
      where r.access_token_hash = $1
        and r.slot_end + make_interval(days => $3) > $2`,
    [hashToken(token), now, TOKEN_VALID_DAYS_AFTER_SLOT],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    requestId: /** @type {string} */ (row.id),
    paymentId: /** @type {string} */ (row.payment_id),
    status: viewStatus({ status: row.status, paymentStatus: row.payment_status, slotStart: row.slot_start, slotEnd: row.slot_end, now }),
    requestStatus: /** @type {string} */ (row.status),
    paymentStatus: /** @type {string} */ (row.payment_status),
    refundStatus: /** @type {"requested" | "pending" | "succeeded" | "failed" | null} */ (row.refund_status),
    lengthMinutes: /** @type {25 | 50} */ (Number(row.length_minutes)),
    slotStart: new Date(row.slot_start).toISOString(),
    slotEnd: new Date(row.slot_end).toISOString(),
    amountMinor: Number(row.amount_minor),
    currency: /** @type {string} */ (row.currency),
    question: /** @type {string} */ (row.question),
    mentorSlug: /** @type {string | null} */ (row.mentor_slug ?? null),
    mentorName: /** @type {string | null} */ (row.mentor_name ?? null),
  };
}

/**
 * Czy token wskazuje ważne zapytanie — lekkie sprawdzenie dla `proxy.ts` (status 404 przed renderem).
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {unknown} token
 * @param {Date} now
 */
export async function isValidRequestToken(db, token, now) {
  if (!isLinkTokenShape(token)) return false;
  const { rowCount } = await db.query(
    "select 1 from requests where access_token_hash = $1 and slot_end + make_interval(days => $3) > $2",
    [hashToken(token), now, TOKEN_VALID_DAYS_AFTER_SLOT],
  );
  return (rowCount ?? 0) > 0;
}
