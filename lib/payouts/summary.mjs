// Buduje podsumowanie wypłat dla mentora (spec 2026-11-09, sekcja Rules 2–3 i ekran S10).
import { payoutAccountState, shouldAskForPayouts } from "./amounts.mjs";

/** Pobiera stan konta i należności jednego mentora.
 * @param {import("../db/pool.mjs").Queryable} db połączenie z bazą
 * @param {{ mentorId: string }} input identyfikator zalogowanego mentora
 * @returns {Promise<Record<string, any>>} dane podsumowania wypłat
 */
export async function getPayoutSummary(db, { mentorId }) {
  const page = await db.query(
    "select currency from mentor_pages where mentor_id = $1",
    [mentorId],
  );
  const currency = page.rows[0]?.currency ?? "PLN";
  const account = await db.query(
    "select * from mentor_payout_accounts where mentor_id = $1",
    [mentorId],
  );
  const { rows } = await db.query(
    `select r.id as request_id, r.length_minutes, r.slot_start, r.mentee_name,
            p.amount_minor, p.currency, p.commission_bps, po.status, po.id as payout_id,
            (p.refund_status is not null or p.refund_seen_at is not null) as has_refund
       from requests r
       join payments p on p.id = r.payment_id
       left join payouts po on po.request_id = r.id
      where r.mentor_id = $1
        and r.status in ('held', 'mentee_no_show')
        and p.status = 'succeeded'
        and p.currency = $2
        and ((p.refund_status is null and p.refund_seen_at is null) or po.status in ('cancelled', 'paid'))
      order by r.slot_start desc`,
    [mentorId, currency],
  );
  const items = rows.map((row) => ({
    requestId: row.request_id,
    menteeFirstName: String(row.mentee_name).split(/\s+/)[0],
    lengthMinutes: Number(row.length_minutes),
    slot: row.slot_start,
    shareMinor: Number(row.amount_minor) - Math.floor((Number(row.amount_minor) * Number(row.commission_bps)) / 10_000),
    currency: row.currency,
    status: row.status ?? "held_for_payout",
    owed: !row.has_refund,
  }));
  const accountState = account.rows[0]
    ? payoutAccountState({ ...account.rows[0], id: account.rows[0].stripe_account_id })
    : "none";
  const paidRequest = await db.query(
    `select exists (
       select 1 from requests r
       join payments p on p.id = r.payment_id
       where r.mentor_id = $1 and p.status = 'succeeded'
     ) as has_paid`,
    [mentorId],
  );
  const hasPaidRequest = Boolean(paidRequest.rows[0].has_paid);
  const paid = await db.query(
    "select coalesce(sum(amount_minor), 0)::bigint as total from payouts where mentor_id = $1 and currency = $2 and status = 'paid'",
    [mentorId, currency],
  );
  const heldMinor = items
    .filter((item) => item.currency === currency && item.owed && item.status !== "paid" && item.status !== "cancelled")
    .reduce((total, item) => total + item.shareMinor, 0);

  return {
    hasPaidRequest,
    accountState,
    detailsSubmitted: account.rows[0] ? Boolean(account.rows[0].details_submitted) : false,
    askForPayouts: shouldAskForPayouts({ hasPaidRequest, accountState }),
    heldMinor,
    paidMinor: Number(paid.rows[0].total),
    currency,
    items,
  };
}
