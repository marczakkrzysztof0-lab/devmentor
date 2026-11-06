// Automatyczne wygaśnięcie zapytania bez decyzji (spec #18 Phase 2, Proposed Solution „Lapse job”; API Contracts
// `lapseOverdue`; R09: zwrot tego samego dnia, bez zgłoszenia).
//
// - Zadanie `requests.lapseOverdue` na endpoincie zadań #24 (co 5 min na hostingu, lokalnie `npm run jobs`).
// - Paczka ≤ `limit`, w budżecie czasu zadań. Każdy wiersz w OSOBNEJ transakcji: wybór najstarszego przeterminowanego
//   `awaiting_mentor` z `FOR UPDATE SKIP LOCKED` (wiersz trzymany przez akceptację / odrzucenie / anulowanie jest
//   pomijany — rozstrzygnie go tamta transakcja albo kolejny przebieg), → `lapsed` + `lapsed_at`, zamiar zwrotu
//   `lapsed` i e-mail `request_lapsed` razem; `executeRefund` po commicie (błąd → ponowi `payments.retryRefunds`).
// - Zegar bazy (ten sam co strażnik akceptacji w `decision.mjs`); testy wstrzykują `now`.
// - Poprawność nie zależy od zadania — akceptacja po starcie terminu jest i tak odrzucana; od zadania zależy tylko
//   chwila zwrotu (zatrzymany scheduler → zdrowie zadań `stale` po 30 min).
import { withTransaction } from "../db/pool.mjs";
import { enqueueEmail } from "../email/outbox.mjs";
import { clock } from "../payments/payments.mjs";
import { requestRefund } from "../payments/refunds.mjs";
import { executeRefundAfterCommit, requestEmailContext } from "./decision.mjs";

/**
 * Wygasza jedno przeterminowane zapytanie w transakcji wywołującego (testy wyścigów trzymają ją otwartą).
 * @param {import("pg").PoolClient} tx
 * @param {{ at: Date | null, stamp: Date }} time  `at` — zegar strażnika (null = baza); `stamp` — znaczniki outboxu
 * @returns {Promise<{ requestId: string, paymentId: string } | null>} null = nic do wygaszenia (albo wszystko zablokowane)
 */
export async function lapseOneInTx(tx, { at, stamp }) {
  const { rows } = await tx.query(
    `update requests
        set status = 'lapsed', lapsed_at = coalesce($1::timestamptz, now()), updated_at = coalesce($1::timestamptz, now())
      where id = (
              select id from requests
               where status = 'awaiting_mentor' and slot_start <= coalesce($1::timestamptz, now())
               order by slot_start
               limit 1
               for update skip locked)
        and status = 'awaiting_mentor'
      returning id, payment_id`,
    [at],
  );
  const lapsed = rows[0];
  if (!lapsed) return null;
  await requestRefund(tx, lapsed.payment_id, "lapsed", { now: () => stamp });
  const email = await requestEmailContext(tx, lapsed.id);
  if (email.payerEmail) {
    const { mentorName, when, amount } = email.params;
    await enqueueEmail(tx, { to: email.payerEmail, template: "request_lapsed", params: { mentorName, when, amount } }, { now: stamp });
  }
  return { requestId: lapsed.id, paymentId: lapsed.payment_id };
}

/**
 * Zadanie `requests.lapseOverdue`.
 * @param {{ db: import("pg").Pool, payments: import("../payments/payments.mjs").PaymentsDeps | null, now?: () => Date }} deps
 * @param {{ limit?: number, deadline?: number }} [options]
 * @returns {Promise<{ lapsed: number }>}
 */
export async function lapseOverdue(deps, { limit = 50, deadline = Infinity } = {}) {
  let lapsed = 0;
  while (lapsed < limit && Date.now() <= deadline) {
    const at = deps.now ? deps.now() : null;
    const stamp = deps.payments ? clock(deps.payments) : (at ?? new Date());
    const outcome = await withTransaction(deps.db, (tx) => lapseOneInTx(tx, { at, stamp }));
    if (!outcome) break;
    lapsed += 1;
    await executeRefundAfterCommit(outcome.paymentId, deps.payments);
  }
  return { lapsed };
}
