// Rozliczenie sesji po terminie wg reguły nieobecności (spec #21 Proposed Solution; R09, R15, D11).
//
// - Reguła (`settlementOutcome`): mentor nic nie napisał → `mentor_no_show` (także gdy nikt nie pisał, D11) → pełny
//   zwrot `mentor_no_show`; pisał tylko mentor → `mentee_no_show` (płatność zostaje u mentora, R15); obie strony →
//   `held`. „Napisał” = co najmniej jedna wiadomość tej strony z `created_at` w `[slot_start, slot_end)` (Q1).
// - Zadanie `sessions.settleEnded` na endpoincie zadań #24 (co 5 min na hostingu, lokalnie `npm run jobs`) —
//   jedyna droga uruchomienia; bez nowej trasy. Paczka ≤ `limit`, w budżecie czasu zadań.
// - Każda sesja w OSOBNEJ transakcji: najstarsza zakończona `accepted` z `FOR UPDATE SKIP LOCKED` — wiersz trzymany
//   przez zapis wiadomości (#20 trzyma `FOR UPDATE` do commitu) jest pomijany i rozliczany w kolejnym przebiegu, już
//   z tą wiadomością. Strzeżony UPDATE (`status = 'accepted'`), zamiar zwrotu i e-mail w tej samej transakcji;
//   `executeRefund` po commicie (błąd → ponowi `payments.retryRefunds`; po 24 h `failed` + zdrowie zadań, ręcznie, Q05).
// - Błąd w transakcji jednej sesji cofa tylko ją i kończy przebieg z błędem (`job_runs.last_error`); kolejny przebieg
//   zaczyna od tej samej sesji. Sesje rozliczone wcześniej w przebiegu zostają rozliczone (jak `lapseOverdue`).
// - Zegar bazy (jak #18); testy wstrzykują `now`.
import { withTransaction } from "../db/pool.mjs";
import { enqueueEmail } from "../email/outbox.mjs";
import { clock } from "../payments/payments.mjs";
import { requestRefund } from "../payments/refunds.mjs";
import { executeRefundAfterCommit, requestEmailContext } from "../requests/decision.mjs";

/** @typedef {"held" | "mentee_no_show" | "mentor_no_show"} SessionOutcome */

/** Stany zapytania po rozliczeniu sesji (0008). */
export const SETTLED_STATUSES = Object.freeze(["held", "mentee_no_show", "mentor_no_show"]);

/**
 * Reguła R15 + D11.
 * @param {{ mentorPosted: boolean, menteePosted: boolean }} posted
 * @returns {SessionOutcome}
 */
export function settlementOutcome({ mentorPosted, menteePosted }) {
  if (!mentorPosted) return "mentor_no_show";
  return menteePosted ? "held" : "mentee_no_show";
}

/** E-mail do płatnika dla wyniku (Q4): bez e-maila przy sesji odbytej. */
const EMAIL_FOR = /** @type {Record<SessionOutcome, string | null>} */ ({
  held: null,
  mentee_no_show: "session_mentee_no_show",
  mentor_no_show: "session_mentor_no_show",
});

/**
 * Rozlicza najstarszą zakończoną sesję w transakcji wywołującego (testy wyścigów trzymają ją otwartą).
 * @param {import("pg").PoolClient} tx
 * @param {{ at: Date | null, stamp: Date }} time  `at` — zegar bazy do porównań (null = `now()`); `stamp` — znaczniki zwrotu i outboxu
 * @returns {Promise<{ requestId: string, paymentId: string, outcome: SessionOutcome } | null>} null = nic do rozliczenia
 */
export async function settleOneInTx(tx, { at, stamp }) {
  const { rows } = await tx.query(
    `select id, payment_id, slot_start, slot_end
       from requests
      where status = 'accepted' and slot_end <= coalesce($1::timestamptz, now())
      order by slot_end, id
      limit 1
      for update skip locked`,
    [at],
  );
  const session = rows[0];
  if (!session) return null;
  const { rows: posted } = await tx.query(
    `select bool_or(author = 'mentor') as mentor_posted, bool_or(author = 'mentee') as mentee_posted
       from session_messages
      where request_id = $1 and created_at >= $2 and created_at < $3`,
    [session.id, session.slot_start, session.slot_end],
  );
  const outcome = settlementOutcome({ mentorPosted: posted[0]?.mentor_posted === true, menteePosted: posted[0]?.mentee_posted === true });
  const { rowCount } = await tx.query(
    `update requests set status = $2, settled_at = coalesce($3::timestamptz, now()), updated_at = coalesce($3::timestamptz, now())
      where id = $1 and status = 'accepted'`,
    [session.id, outcome, at],
  );
  if (rowCount !== 1) return null;
  if (outcome === "mentor_no_show") await requestRefund(tx, session.payment_id, "mentor_no_show", { now: () => stamp });
  const template = EMAIL_FOR[outcome];
  if (template) {
    const email = await requestEmailContext(tx, session.id);
    if (email.payerEmail) {
      const { mentorName, when, amount } = email.params;
      await enqueueEmail(tx, { to: email.payerEmail, template, params: { mentorName, when, amount } }, { now: stamp });
    }
  }
  return { requestId: session.id, paymentId: session.payment_id, outcome };
}

/**
 * Zadanie `sessions.settleEnded`.
 * @param {{ db: import("pg").Pool, payments: import("../payments/payments.mjs").PaymentsDeps | null, now?: () => Date }} deps
 * @param {{ limit?: number, deadline?: number }} [options]
 * @returns {Promise<{ settled: number, held: number, menteeNoShow: number, mentorNoShow: number }>}
 */
export async function settleEnded(deps, { limit = 50, deadline = Infinity } = {}) {
  const counts = { settled: 0, held: 0, menteeNoShow: 0, mentorNoShow: 0 };
  while (counts.settled < limit && Date.now() <= deadline) {
    const at = deps.now ? deps.now() : null;
    const stamp = deps.payments ? clock(deps.payments) : (at ?? new Date());
    const result = await withTransaction(deps.db, (tx) => settleOneInTx(tx, { at, stamp }));
    if (!result) break;
    counts.settled += 1;
    if (result.outcome === "held") counts.held += 1;
    else if (result.outcome === "mentee_no_show") counts.menteeNoShow += 1;
    else {
      counts.mentorNoShow += 1;
      await executeRefundAfterCommit(result.paymentId, deps.payments);
    }
  }
  return counts;
}
