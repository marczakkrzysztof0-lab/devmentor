// Zapytania w panelu mentora: lista, licznik i szczegóły (spec #18 Proposed Solution „Screens”; Implementation Plan krok 2).
//
// - Izolacja: każde zapytanie do bazy filtruje po `mentor_id` z sesji (nigdy z adresu ani formularza); cudze zapytanie
//   wygląda jak nieistniejące (`null`).
// - Nieopłacone (`awaiting_payment`, `payment_failed`) nigdy nie trafiają do mentora.
// - Nigdy nie wybieramy e-maila płacącego; pytanie tylko w szczegółach.
// - Kształt wyników zgodny z typami DS `MentorRequestItem` / `MentorRequestDetail` (packages/ui/src/product/e02/MentorRequests.tsx).
// - `now` przychodzi z zewnątrz (testy wstrzykują zegar).

/** Zakończone i zaakceptowane zapytania widać na liście przez 30 dni. */
export const MENTOR_LIST_DAYS = 30;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @typedef {"awaiting_mentor" | "overdue" | "accepted" | "declined" | "lapsed" | "cancelled" | "session_ended" | "held" | "mentee_no_show" | "mentor_no_show"} MentorRequestStatus
 * @typedef {{ id: string, menteeName: string, lengthMinutes: 25 | 50, slotStart: string, slotEnd: string, status: MentorRequestStatus }} MentorRequestItem
 * @typedef {MentorRequestItem & { question: string, amountMinor: number, currency: string, refundStatus: "requested" | "succeeded" | "failed" | null }} MentorRequestDetail
 */

/**
 * Stan do pokazania: `awaiting_mentor` po starcie terminu to `overdue` (nie da się już zdecydować); `accepted` po
 * końcu terminu to `session_ended` — do rozliczenia przez `sessions.settleEnded` (#21).
 * @param {Record<string, any>} row
 * @param {Date} now
 * @returns {MentorRequestStatus}
 */
function mentorStatus(row, now) {
  if (row.status === "awaiting_mentor" && new Date(row.slot_start).getTime() <= now.getTime()) return "overdue";
  if (row.status === "accepted" && new Date(row.slot_end).getTime() <= now.getTime()) return "session_ended";
  return row.status;
}

/** @param {Record<string, any>} row @param {Date} now @returns {MentorRequestItem} */
function toItem(row, now) {
  return {
    id: row.id,
    menteeName: row.mentee_name,
    lengthMinutes: Number(row.length_minutes) === 50 ? 50 : 25,
    slotStart: new Date(row.slot_start).toISOString(),
    slotEnd: new Date(row.slot_end).toISOString(),
    status: mentorStatus(row, now),
  };
}

/**
 * Lista zapytań mentora (kolejność wg terminu).
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {{ mentorId: string, now: Date }} input
 * @returns {Promise<MentorRequestItem[]>}
 */
export async function listMentorRequests(db, { mentorId, now }) {
  const { rows } = await db.query(
    `select id, mentee_name, length_minutes, slot_start, slot_end, status
       from requests
      where mentor_id = $1
        and (
          status = 'awaiting_mentor'
          or (status = 'accepted' and slot_end > $2::timestamptz - make_interval(days => $3))
          or (status in ('declined', 'lapsed', 'cancelled')
              and coalesce(declined_at, lapsed_at, cancelled_at) > $2::timestamptz - make_interval(days => $3))
          -- #21: rozliczone sesje przez 30 dni od rozliczenia (Q8).
          or (status in ('held', 'mentee_no_show', 'mentor_no_show') and settled_at > $2::timestamptz - make_interval(days => $3))
        )
      order by slot_start, id`,
    [mentorId, now, MENTOR_LIST_DAYS],
  );
  return rows.map((row) => toItem(row, now));
}

/**
 * Licznik na plakietkę: tylko `awaiting_mentor` z terminem w przyszłości (przeterminowanych nie da się już rozstrzygnąć).
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {{ mentorId: string, now: Date }} input
 * @returns {Promise<number>}
 */
export async function countAwaitingDecision(db, { mentorId, now }) {
  const { rows } = await db.query(
    "select count(*)::int as n from requests where mentor_id = $1 and status = 'awaiting_mentor' and slot_start > $2",
    [mentorId, now],
  );
  return Number(rows[0].n);
}

/**
 * Szczegóły zapytania mentora; `null` dla złego kształtu id, nieznanego, cudzego i nieopłaconego.
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {{ mentorId: string, requestId: unknown, now: Date }} input
 * @returns {Promise<MentorRequestDetail | null>}
 */
export async function getMentorRequest(db, { mentorId, requestId, now }) {
  // Kształt sprawdzamy przed zapytaniem, żeby Postgres nie rzucił błędu „invalid input syntax for type uuid”.
  if (typeof requestId !== "string" || !UUID_SHAPE.test(requestId)) return null;
  const { rows } = await db.query(
    `select r.id, r.mentee_name, r.length_minutes, r.slot_start, r.slot_end, r.status, r.question,
            p.amount_minor, p.currency, p.refund_status
       from requests r
       join payments p on p.id = r.payment_id
      where r.id = $1 and r.mentor_id = $2 and r.status not in ('awaiting_payment', 'payment_failed')`,
    [requestId, mentorId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...toItem(row, now),
    question: row.question,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    // Zwrot „w toku u Stripe” (`pending`) mentor widzi jak zlecony.
    refundStatus: row.refund_status === "pending" ? "requested" : (row.refund_status ?? null),
  };
}
