// Zajęte przedziały mentora (spec #17 Q3, Proposed Solution „Hold rule”; Implementation Plan krok 3).
//
// Zapytanie trzyma swój termin, gdy jest `awaiting_mentor` albo `accepted`, albo `awaiting_payment`, póki jego
// płatność jest `pending` i `now < checkout_expires_at + 10 min`. #24 zapisuje `expired` dopiero, gdy Stripe
// potwierdzi, a rekonsyliacja biegnie minutę po `checkout_expires_at` — 10 min to siatka bezpieczeństwa, nie
// normalna ścieżka. Przedziały półotwarte [start, end) — przyleganie nie koliduje (jak w #15).
//
// Samo zapytanie NIE blokuje — atomowość daje blokada wiersza `mentors` w transakcji wywołującego (`startRequest`,
// subskrybent płatności).

export const HOLD_GRACE_MINUTES = 10;

/**
 * Zajęte przedziały mentora nachodzące na [from, to).
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {{ mentorId: string, from: Date | string, to: Date | string, now: Date, excludeRequestId?: string | null }} input
 * @returns {Promise<Array<{ startsAt: Date, endsAt: Date }>>}
 */
export async function heldRanges(db, { mentorId, from, to, now, excludeRequestId = null }) {
  const { rows } = await db.query(
    `select r.slot_start, r.slot_end
       from requests r
       join payments p on p.id = r.payment_id
      where r.mentor_id = $1
        and r.slot_start < $3 and r.slot_end > $2
        and ($5::uuid is null or r.id <> $5::uuid)
        and (
          r.status in ('awaiting_mentor', 'accepted')
          or (r.status = 'awaiting_payment' and p.status = 'pending'
              and $4 < p.checkout_expires_at + make_interval(mins => $6))
        )
      order by r.slot_start`,
    [mentorId, new Date(from), new Date(to), now, excludeRequestId, HOLD_GRACE_MINUTES],
  );
  return rows.map((row) => ({ startsAt: new Date(row.slot_start), endsAt: new Date(row.slot_end) }));
}
