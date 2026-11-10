// Tworzy i synchronizuje konta Stripe Connect mentora (spec 2026-11-09, sekcje Rules 1–2).
import { withTransaction } from "../db/pool.mjs";
import { payoutAccountState } from "./amounts.mjs";

/** Stosuje stan obiektu Stripe do rekordu konta wypłat.
 * @param {import("../db/pool.mjs").Queryable} tx połączenie z bazą lub transakcja
 * @param {any} account konto Stripe
 * @param {Date} [asOf] czas rozpoczęcia pobrania danych
 * @param {{ eventCreated?: Date | null }} [options] czas zdarzenia webhooka
 * @returns {Promise<"applied" | "ignored">} czy stan został zapisany
 */
export async function applyAccountObject(tx, account, asOf = new Date(), { eventCreated = null } = {}) {
  if (!account?.id) return "ignored";
  const ready = payoutAccountState(account) === "ready";
  const params = [
    account.id,
    account.payouts_enabled === true,
    account.capabilities?.transfers === "active",
    account.details_submitted === true,
    ready ? "ready" : "pending",
    asOf,
    eventCreated,
  ];
  const { rows } = await tx.query(
    `update mentor_payout_accounts
        set payouts_enabled = $2, transfers_active = $3, details_submitted = $4,
            state = $5, updated_at = $6,
            checked_at = case when $7::timestamptz is null then $6 else checked_at end,
            last_event_created = case when $7::timestamptz is null then last_event_created else $7 end,
            resync_requested_at = case when $7::timestamptz is null then null else $6 end
      where stripe_account_id = $1
        and ($7::timestamptz is null or last_event_created is null or last_event_created < $7)
        and ($7::timestamptz is not null or resync_requested_at is null or resync_requested_at <= $6)
      returning mentor_id`,
    params,
  );
  if (!rows[0] && eventCreated) {
    // A webhook that was not applied queues a fresh account read.
    await tx.query(
      "update mentor_payout_accounts set resync_requested_at = $2 where stripe_account_id = $1",
      [account.id, asOf],
    );
  }
  return rows[0] ? "applied" : "ignored";
}

/** Odczytuje aktualny stan konta mentora ze Stripe.
 * @param {string} mentorId identyfikator mentora
 * @param {any} deps baza, klient Stripe, zegar i logger
 * @returns {Promise<"none" | "pending" | "ready">} zapisany stan konta
 */
export async function syncAccountFromStripe(mentorId, deps) {
  const { rows } = await deps.db.query(
    "select * from mentor_payout_accounts where mentor_id = $1",
    [mentorId],
  );
  const row = rows[0];
  if (!row?.stripe_account_id) return "none";
  const asOf = deps.now?.() ?? new Date();
  try {
    const account = await deps.stripe.accounts.retrieve(row.stripe_account_id);
    await applyAccountObject(deps.db, account, asOf);
  } catch (error) {
    (deps.log ?? console).warn(`[payouts] account sync failed: ${error?.code ?? "stripe_error"}`);
  }
  const fresh = await deps.db.query(
    "select * from mentor_payout_accounts where mentor_id = $1",
    [mentorId],
  );
  return fresh.rows[0]?.state ?? "none";
}

/** Creates or resumes Connect onboarding for an eligible mentor.
 * @param {{ mentorId: string, returnUrl: string, refreshUrl: string }} input mentor and return destinations
 * @param {any} deps база, клиент Stripe, zegar i logger
 * @returns {Promise<{ ok: true, url: string } | { ok: false, code: string }>} rezultat tworzenia linku
 */
export async function startOnboarding({ mentorId, returnUrl, refreshUrl }, deps) {
  const db = deps.db;
  await withTransaction(db, async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [mentorId]);
    await tx.query(
      "insert into mentor_payout_accounts (mentor_id) values ($1) on conflict do nothing",
      [mentorId],
    );
  });

  // The session lock serializes account creation without holding a transaction across Stripe calls.
  const lockClient = await db.connect();
  await lockClient.query("select pg_advisory_lock(hashtextextended($1, 0))", [mentorId]);
  try {
    const { rows } = await db.query(
      `select a.*,
              exists (
                select 1 from requests r
                join payments p on p.id = r.payment_id
                where r.mentor_id = a.mentor_id and p.status = 'succeeded'
              ) as has_paid
         from mentor_payout_accounts a
        where mentor_id = $1`,
      [mentorId],
    );
    const row = rows[0];
    if (row.state === "ready") return { ok: false, code: "already_ready" };
    if (!row.has_paid && row.stripe_account_id === null) {
      await db.query(
        "delete from mentor_payout_accounts where mentor_id = $1 and stripe_account_id is null",
        [mentorId],
      );
      return { ok: false, code: "not_available" };
    }

    try {
      let accountId = row.stripe_account_id;
      if (!accountId) {
        const account = await deps.stripe.accounts.create(
          {
            type: "express",
            country: "PL",
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
            business_type: "individual",
            metadata: { mentor_id: mentorId },
          },
          { idempotencyKey: `payout-account:${mentorId}:${row.create_key_version}` },
        );
        accountId = account.id;
        await db.query(
          "update mentor_payout_accounts set stripe_account_id = $2, updated_at = $3 where mentor_id = $1 and stripe_account_id is null",
          [mentorId, accountId, deps.now?.() ?? new Date()],
        );
      }
      const latest = await db.query(
        "select stripe_account_id from mentor_payout_accounts where mentor_id = $1",
        [mentorId],
      );
      const link = await deps.stripe.accountLinks.create({
        account: latest.rows[0].stripe_account_id ?? accountId,
        type: "account_onboarding",
        return_url: returnUrl,
        refresh_url: refreshUrl,
      });
      return { ok: true, url: link.url };
    } catch (error) {
      const status = Number(error?.statusCode);
      if ((status >= 400 && status !== 409 && status !== 429) || status >= 500) {
        // Received errors are cached by Stripe, so the next create must use a new key.
        await db.query(
          "update mentor_payout_accounts set create_key_version = create_key_version + 1 where mentor_id = $1",
          [mentorId],
        );
      }
      (deps.log ?? console).warn(`[payouts] onboarding failed: ${error?.code ?? "stripe_error"}`);
      return { ok: false, code: "stripe_error" };
    }
  } finally {
    await lockClient.query("select pg_advisory_unlock(hashtextextended($1, 0))", [mentorId]).catch(() => {});
    lockClient.release();
  }
}
