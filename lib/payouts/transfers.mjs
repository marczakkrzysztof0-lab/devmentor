// Rejestruje należności i przekazuje je mentorom przez Stripe Connect (spec 2026-11-09, Rules 3–5).
import { PAYOUT_LEASE_MINUTES, PAYOUT_MAX_ATTEMPTS, hasAnyRefund, payoutBackoffMinutes } from "./amounts.mjs";

const log = (deps) => deps.log ?? console;
const errCode = (error) => `${error?.code ?? "stripe_error"}${error?.requestId ? `:${error.requestId}` : ""}`;
const hasReceivedResponse = (error) => Number.isFinite(error?.statusCode);
const transientOrAmbiguous = (error) =>
  !hasReceivedResponse(error) || error.statusCode === 409 || error.statusCode === 429 || error.statusCode >= 500;

/** Wyszukuje istniejący transfer dla należności, obsługując stronicowanie Stripe.
 * @param {any} stripe klient Stripe
 * @param {any} payout rekord wypłaty
 * @param {string} destination konto docelowe Stripe
 * @returns {Promise<any | null>} dopasowany transfer
 */
async function findExistingTransfer(stripe, payout, destination) {
  let startingAfter;
  do {
    const page = await stripe.transfers.list({
      destination,
      created: { gte: Math.floor((new Date(payout.created_at).getTime() - 86_400_000) / 1000) },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const found = page.data.find(
      (transfer) =>
        transfer.metadata?.payout_id === payout.id &&
        Number(transfer.amount) === Number(payout.amount_minor) &&
        String(transfer.currency).toUpperCase() === payout.currency &&
        Number(transfer.amount_reversed ?? 0) < Number(transfer.amount),
    );
    if (found) return found;
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return null;
}

/** Zapisuje należne wypłaty jako rekordy oczekujące.
 * @param {import("../db/pool.mjs").Queryable} db połączenie z bazą
 * @param {{ limit?: number }} [options] limit przetwarzanych rekordów
 * @returns {Promise<number>} liczba utworzonych rekordów
 */
export async function recordOwed(db, { limit = 50 } = {}) {
  const { rowCount } = await db.query(
    `insert into payouts (request_id, mentor_id, payment_id, amount_minor, currency)
      with candidates as (
        select r.id, r.mentor_id, p.id as payment_id,
               (p.amount_minor::bigint - (p.amount_minor::bigint * p.commission_bps / 10000))::int as amount_minor,
               p.currency
          from requests r
          join payments p on p.id = r.payment_id
         where r.status in ('held', 'mentee_no_show')
           and p.status = 'succeeded'
           and p.refund_status is null
           and p.refund_seen_at is null
           and (p.amount_minor::bigint - (p.amount_minor::bigint * p.commission_bps / 10000)) > 0
           and not exists (select 1 from payouts po where po.request_id = r.id)
         order by r.settled_at
         limit $1
      )
      select id, mentor_id, payment_id, amount_minor, currency
        from candidates
      on conflict (request_id) do nothing`,
    [limit],
  );
  return rowCount ?? 0;
}

/** Anuluje wypłaty objęte zwrotem i przejmuje transfery wykonane mimo błędu.
 * @param {import("../db/pool.mjs").Queryable} db połączenie z bazą
 * @param {any} deps zależności Stripe i logger
 * @param {{ limit?: number }} [options] limit przetwarzanych rekordów
 * @returns {Promise<number>} liczba anulowanych wypłat
 */
export async function cancelRefunded(db, deps, { limit = 50 } = {}) {
  const { rows } = await db.query(
    `select po.*
       from payouts po
       join payments p on p.id = po.payment_id
      where po.status = 'failed' and po.attempts > 0
        and (p.refund_status is not null or p.refund_seen_at is not null)
      limit $1`,
    [limit],
  );
  for (const payout of rows) {
    const { rows: accounts } = await db.query(
      "select stripe_account_id from mentor_payout_accounts where mentor_id = $1",
      [payout.mentor_id],
    );
    const accountId = accounts[0]?.stripe_account_id;
    let found = null;
    if (accountId) {
      try {
        found = await findExistingTransfer(deps.stripe, payout, accountId);
      } catch (error) {
        log(deps).warn(`[payouts] refunded payout transfer lookup failed: ${error?.code ?? "stripe_error"}`);
        continue;
      }
    }
    if (found) {
      await db.query(
        `update payouts
            set status = 'paid', stripe_transfer_id = $2, paid_at = now(),
                manual_reason = 'refunded_after_payout', next_attempt_at = null,
                lease_until = null, updated_at = now()
          where id = $1 and status = 'failed' and attempts > 0`,
        [payout.id, found.id],
      );
    }
  }
  const { rowCount } = await db.query(
    `with candidates as (
       select po.id
         from payouts po
         join payments p on p.id = po.payment_id
        where po.status in ('held_for_payout', 'failed')
          and (po.status = 'held_for_payout' or po.attempts = 0)
          and (p.refund_status is not null or p.refund_seen_at is not null)
        limit $1
     )
     update payouts po
        set status = 'cancelled', cancelled_at = now(), lease_until = null, updated_at = now()
       from candidates c
      where po.id = c.id and po.status in ('held_for_payout', 'failed')`,
    [limit],
  );
  return rowCount ?? 0;
}

/** Oznacza wypłaty zwrócone po transferze jako wymagające ręcznej obsługi.
 * @param {import("../db/pool.mjs").Queryable} db połączenie z bazą
 * @param {any} [deps] logger
 * @param {{ limit?: number }} [options] limit przetwarzanych rekordów
 * @returns {Promise<number>} liczba oznaczonych wypłat
 */
export async function flagRefundedAfterPayout(db, deps = {}, { limit = 50 } = {}) {
  const { rows } = await db.query(
    `with candidates as (
       select po.id
         from payouts po
         join payments p on p.id = po.payment_id
        where po.status = 'paid' and po.manual_reason is null
          and (p.refund_status is not null or p.refund_seen_at is not null)
        limit $1
     )
     update payouts po
        set manual_reason = 'refunded_after_payout', updated_at = now()
       from candidates c
      where po.id = c.id and po.status = 'paid' and po.manual_reason is null
      returning po.id, po.request_id`,
    [limit],
  );
  for (const row of rows) {
    log(deps).error(`[payouts] manual review required: refunded_after_payout ${row.request_id}`);
  }
  return rows.length;
}

/** Zajmuje wypłatę i uruchamia jej pojedynczą próbę transferu.
 * @param {string} payoutId identyfikator wypłaty
 * @param {any} deps baza, Stripe, zegar i logger
 * @returns {Promise<"skipped" | "cancelled" | "failed" | "transferred">} wynik próby
 */
export async function transferOne(payoutId, deps) {
  const now = deps.now?.() ?? new Date();
  const claim = await claimPayout(payoutId, deps.db, now);
  if (!claim) return "skipped";

  const payout = claim;
  const attempt = Number(payout.attempts);
  const db = deps.db;
  const settle = (sql, args) => db.query(sql, args);

  try {
    const checked = await recheckUnderClaim(payout, attempt, deps, settle, now);
    if (checked) return checked;

    const payment = (await db.query("select * from payments where id = $1", [payout.payment_id])).rows[0];
    if (payment.refund_status || payment.refund_seen_at) {
      if (attempt > 1 || payout.key_bump_due || payout.last_error) {
        let existing = null;
        try {
          existing = await findExistingTransfer(deps.stripe, payout, payout.stripe_account_id);
        } catch (error) {
          log(deps).warn(`[payouts] refunded payout transfer lookup failed: ${error?.code ?? "stripe_error"}`);
          throw error;
        }
        if (existing) {
          await writeSuccess(payout, attempt, existing, deps);
          return "transferred";
        }
      }
      await settle(
        "update payouts set status = 'cancelled', cancelled_at = $2, lease_until = null, updated_at = $2 where id = $1 and status = 'transferring' and attempts = $3",
        [payout.id, now, attempt],
      );
      return "cancelled";
    }
    if (payment.disputed_at) {
      await settle(
        "update payouts set status = 'failed', last_error = 'disputed', next_attempt_at = null, lease_until = null, updated_at = $2 where id = $1 and status = 'transferring' and attempts = $3",
        [payout.id, now, attempt],
      );
      return "failed";
    }

    const refundList = await deps.stripe.refunds.list({ payment_intent: payment.stripe_payment_intent_id });
    if (hasAnyRefund({ refunds: refundList })) {
      await db.query(
        "update payments set refund_seen_at = coalesce(refund_seen_at, $2), updated_at = $2 where id = $1",
        [payment.id, now],
      );
      await settle(
        "update payouts set status = 'cancelled', cancelled_at = $2, lease_until = null, updated_at = $2 where id = $1 and status = 'transferring' and attempts = $3",
        [payout.id, now, attempt],
      );
      return "cancelled";
    }

    const paymentIntent = await deps.stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);
    const charge = typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id;
    if (!charge) throw Object.assign(new Error(), { code: "missing_charge" });

    const existing = await findExistingTransfer(deps.stripe, payout, payout.stripe_account_id);
    if (existing) {
      await writeSuccess(payout, attempt, existing, deps);
      return "transferred";
    }

    // Re-check the remaining lease immediately before the create call.
    if ((deps.now?.() ?? new Date()).getTime() >= new Date(payout.lease_until).getTime() - 120_000) {
      return "skipped";
    }
    if (payout.key_bump_due) {
      // Bump the key only after the take-over check found no transfer for the prior key.
      await db.query(
        "update payouts set key_version = key_version + 1, key_bump_due = false where id = $1 and status = 'transferring' and attempts = $2",
        [payout.id, attempt],
      );
      payout.key_version = Number(payout.key_version) + 1;
    }
    const transfer = await createTransfer(payout, charge, deps);
    await writeSuccess(payout, attempt, transfer, deps);
    return "transferred";
  } catch (error) {
    if (transientOrAmbiguous(error)) {
      try {
        const existing = await findExistingTransfer(deps.stripe, payout, payout.stripe_account_id);
        if (existing) {
          await writeSuccess(payout, attempt, existing, deps);
          return "transferred";
        }
      } catch {
        // The next claimed attempt performs the same take-over check.
      }
    }
    await writeFailure(payout, attempt, error, deps, settle, now, error?.payoutTransferCreate === true);
    return "failed";
  }
}

/** Zajmuje wypłatę na czas jednej próby.
 * @param {string} payoutId identyfikator wypłaty
 * @param {import("../db/pool.mjs").Queryable} db połączenie z bazą
 * @param {Date} now czas próby
 * @returns {Promise<any | null>} wypłata wraz z kontem albo null
 */
async function claimPayout(payoutId, db, now) {
  // Claim commits before any Stripe request so another worker cannot start the same attempt.
  const { rows } = await db.query(
    `update payouts po
        set status = 'transferring', attempts = attempts + 1,
            lease_until = $2 + ($3 || ' minutes')::interval, updated_at = $2
       from mentor_payout_accounts a
      where po.id = $1 and a.mentor_id = po.mentor_id and a.state = 'ready'
        and a.stripe_account_id is not null
        and (po.status = 'held_for_payout'
          or (po.status = 'failed' and po.next_attempt_at <= $2)
          or (po.status = 'transferring' and po.lease_until < $2))
        and po.attempts < $4
      returning po.*, a.stripe_account_id`,
    [payoutId, now, PAYOUT_LEASE_MINUTES, PAYOUT_MAX_ATTEMPTS],
  );
  return rows[0] ?? null;
}

/** Ponownie sprawdza warunki wypłaty po zajęciu rekordu.
 * @param {any} payout rekord wypłaty
 * @param {number} attempt numer próby
 * @param {any} deps zależności wypłaty
 * @param {(sql: string, args: unknown[]) => Promise<any>} settle wykonanie zapytania
 * @param {Date} now czas próby
 * @returns {Promise<"skipped" | null>} wynik końcowy lub null, gdy można kontynuować
 */
async function recheckUnderClaim(payout, attempt, deps, settle, now) {
  // Re-check state after claim because an account webhook may have changed readiness.
  const account = await deps.db.query(
    "select state from mentor_payout_accounts where mentor_id = $1",
    [payout.mentor_id],
  );
  if (account.rows[0]?.state !== "ready") {
    await settle(
      "update payouts set status = 'held_for_payout', attempts = greatest(attempts - 1, 0), lease_until = null, updated_at = $2 where id = $1 and status = 'transferring' and attempts = $3",
      [payout.id, now, attempt],
    );
    return "skipped";
  }
  return null;
}

/** Creates a Stripe transfer with the payout's current idempotency key.
 * @param {any} payout rekord wypłaty
 * @param {string} charge identyfikator obciążenia źródłowego
 * @param {any} deps zależności Stripe
 * @returns {Promise<any>} utworzony transfer
 */
async function createTransfer(payout, charge, deps) {
  try {
    return await deps.stripe.transfers.create(
    {
      amount: Number(payout.amount_minor),
      currency: String(payout.currency).toLowerCase(),
      destination: payout.stripe_account_id,
      source_transaction: charge,
      metadata: { payout_id: payout.id, request_id: payout.request_id },
    },
    { idempotencyKey: `payout:${payout.request_id}:${payout.key_version}` },
    );
  } catch (error) {
    throw Object.assign(new Error("Stripe transfer creation failed"), {
      cause: error,
      code: error?.code,
      statusCode: error?.statusCode,
      requestId: error?.requestId,
      payoutTransferCreate: true,
    });
  }
}

/** Zapisuje sukces wyłącznie, jeśli próba nadal posiada dzierżawę.
 * @param {any} payout rekord wypłaty
 * @param {number} attempt numer próby
 * @param {any} transfer transfer Stripe
 * @param {any} deps zależności wypłaty
 * @returns {Promise<void>}
 */
async function writeSuccess(payout, attempt, transfer, deps) {
  const at = deps.now?.() ?? new Date();
  const { rows } = await deps.db.query(
    `update payouts po
        set status = 'paid', stripe_transfer_id = $4, paid_at = $2,
            lease_until = null, next_attempt_at = null,
            manual_reason = case
              when exists (
                select 1 from payments p
                 where p.id = po.payment_id
                   and (p.refund_status is not null or p.refund_seen_at is not null)
              ) then 'refunded_after_payout'
              else po.manual_reason
            end,
            updated_at = $2
      where po.id = $1 and po.status = 'transferring' and po.attempts = $3
      returning request_id, manual_reason`,
    [payout.id, at, attempt, transfer.id],
  );
  if (rows[0]?.manual_reason === "refunded_after_payout") {
    log(deps).error(`[payouts] manual review required: refunded_after_payout ${rows[0].request_id}`);
  }
}

/** Zapisuje porażkę i termin kolejnej próby.
 * @param {any} payout rekord wypłaty
 * @param {number} attempt numer próby
 * @param {any} error błąd Stripe
 * @param {any} deps zależności wypłaty
 * @param {(sql: string, args: unknown[]) => Promise<any>} settle wykonanie zapytania
 * @param {Date} now czas próby
 * @returns {Promise<void>}
 */
async function writeFailure(payout, attempt, error, deps, settle, now, fromTransferCreate) {
  const received = fromTransferCreate && hasReceivedResponse(error) && error.statusCode !== 409 && error.statusCode !== 429;
  const next = attempt >= PAYOUT_MAX_ATTEMPTS
    ? null
    : new Date(now.getTime() + payoutBackoffMinutes(attempt) * 60_000);
  await settle(
    `update payouts
        set status = 'failed', last_error = $4,
            key_bump_due = case when $5 then true else key_bump_due end,
            next_attempt_at = $6, lease_until = null, updated_at = $2
      where id = $1 and status = 'transferring' and attempts = $3`,
    [payout.id, now, attempt, errCode(error), received, next],
  );
  if (!next) log(deps).error(`[payouts] manual review required: ${payout.request_id}`);
}

/** Uruchamia synchronizację kont i transfery należne mentorom.
 * @param {any} deps zależności bazy, Stripe, zegara i loggera
 * @param {{ limit?: number, deadline?: number }} [options] limity przebiegu
 * @returns {Promise<Record<string, number>>} liczniki przebiegu
 */
export async function transferOwed(deps, { limit = 50, deadline = Infinity } = {}) {
  const now = deps.now?.() ?? new Date();
  await resyncAccounts(deps, { limit, deadline });
  const recorded = await recordOwed(deps.db, { limit });
  const cancelled = await cancelRefunded(deps.db, deps, { limit });
  const flagged = await flagRefundedAfterPayout(deps.db, deps, { limit });
  const finalLeases = await resolveExpiredFinalLeases(deps, { limit });
  const { rows } = await deps.db.query(
    `select po.id
       from payouts po
       join mentor_payout_accounts a on a.mentor_id = po.mentor_id and a.state = 'ready'
      where po.status = 'held_for_payout'
         or (po.status = 'failed' and po.next_attempt_at <= $2)
         or (po.status = 'transferring' and po.lease_until < $2)
      order by po.created_at
      limit $1`,
    [limit, now],
  );
  let transferred = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (Date.now() > deadline) {
      skipped += 1;
      continue;
    }
    const result = await transferOne(row.id, deps);
    if (result === "transferred") transferred += 1;
    else if (result === "failed") failed += 1;
    else skipped += 1;
  }
  return {
    recorded,
    cancelled,
    flagged,
    transferred: transferred + finalLeases.paid,
    failed: failed + finalLeases.failed,
    skipped,
  };
}

/** Synchronizes accounts whose webhook requested a fresh Stripe read. */
async function resyncAccounts(deps, { limit, deadline = Infinity }) {
  const now = deps.now?.() ?? new Date();
  const { rows } = await deps.db.query(
    `select distinct a.mentor_id, a.stripe_account_id
       from mentor_payout_accounts a
      where a.stripe_account_id is not null
        and (a.resync_requested_at is not null or (
          a.state = 'pending'
          and (a.checked_at is null or a.checked_at < $2::timestamptz - interval '30 minutes')
          and exists (
            select 1 from requests r
            join payments p on p.id = r.payment_id
             where r.mentor_id = a.mentor_id
               and r.status in ('held', 'mentee_no_show')
               and p.status = 'succeeded'
               and p.refund_status is null
               and p.refund_seen_at is null
          )
        ))
      limit $1`,
    [limit, now],
  );
  for (const row of rows) {
    if (Date.now() > deadline) break;
    const asOf = now;
    try {
      const account = await deps.stripe.accounts.retrieve(row.stripe_account_id);
      const { applyAccountObject } = await import("./accounts.mjs");
      await applyAccountObject(deps.db, account, asOf);
    } catch (error) {
      log(deps).warn(`[payouts] account resync failed: ${error?.code ?? "stripe_error"}`);
    }
  }
}

/** Resolves expired leases on their final allowed attempt through Stripe lookup only. */
async function resolveExpiredFinalLeases(deps, { limit }) {
  const now = deps.now?.() ?? new Date();
  const { rows } = await deps.db.query(
    "select * from payouts where status = 'transferring' and lease_until < $3 and attempts >= $1 order by lease_until limit $2",
    [PAYOUT_MAX_ATTEMPTS, limit, now],
  );
  let paid = 0;
  let failed = 0;
  for (const payout of rows) {
    const result = await resolveExpiredLastAttempt(payout, deps);
    if (result === "paid") paid += 1;
    if (result === "failed") failed += 1;
  }
  return { paid, failed };
}

/** Rozstrzyga wygasłą dzierżawę ostatniej próby wyłącznie przez przejęcie transferu.
 * @param {any} payout rekord wypłaty
 * @param {any} deps zależności bazy i Stripe
 * @returns {Promise<"paid" | "failed" | "skipped">} wynik rozstrzygnięcia
 */
async function resolveExpiredLastAttempt(payout, deps) {
  const { rows: accounts } = await deps.db.query(
    "select stripe_account_id from mentor_payout_accounts where mentor_id = $1",
    [payout.mentor_id],
  );
  const accountId = accounts[0]?.stripe_account_id;
  if (!accountId) return "skipped";

  let existing;
  try {
    existing = await findExistingTransfer(deps.stripe, payout, accountId);
  } catch {
    return "skipped";
  }
  if (existing) {
    const { rows } = await deps.db.query(
      `update payouts po
          set status = 'paid', stripe_transfer_id = $2, paid_at = now(),
              lease_until = null, next_attempt_at = null,
              manual_reason = case
                when exists (
                  select 1 from payments p
                   where p.id = po.payment_id
                     and (p.refund_status is not null or p.refund_seen_at is not null)
                ) then 'refunded_after_payout'
                else po.manual_reason
              end,
              updated_at = now()
        where po.id = $1 and po.status = 'transferring' and po.attempts >= $3
        returning request_id, manual_reason`,
      [payout.id, existing.id, PAYOUT_MAX_ATTEMPTS],
    );
    if (!rows[0]) return "skipped";
    if (rows[0].manual_reason === "refunded_after_payout") {
      log(deps).error(`[payouts] manual review required: refunded_after_payout ${rows[0].request_id}`);
    }
    return "paid";
  }

  const { rowCount } = await deps.db.query(
    `update payouts
        set status = 'failed', last_error = 'lease_expired', lease_until = null,
            next_attempt_at = null, updated_at = now()
      where id = $1 and status = 'transferring' and attempts >= $2`,
    [payout.id, PAYOUT_MAX_ATTEMPTS],
  );
  if (rowCount) log(deps).error(`[payouts] manual review required: ${payout.request_id}`);
  return rowCount ? "failed" : "skipped";
}
