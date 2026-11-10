import assert from "node:assert/strict";
import { test } from "node:test";
import { JOB_NAMES } from "../../lib/jobs/registry.mjs";
import { jobsHealth } from "../../lib/jobs/jobs.mjs";
import { acceptRequest } from "../../lib/requests/decision.mjs";
import {
  startOnboarding,
  syncAccountFromStripe,
} from "../../lib/payouts/accounts.mjs";
import { transferOwed } from "../../lib/payouts/transfers.mjs";
import {
  apartSlots,
  makeRequestDeps,
  paidRequest,
  seedMentor,
} from "../requests/fixtures.mjs";
import { describeDb } from "./harness.mjs";

async function createOwed(db, { ready = false, count = 1 } = {}) {
  const mentor = await seedMentor(db);
  const ctx = makeRequestDeps(db);
  const deps = { ...ctx.deps, db: db.pool };
  const slots = await apartSlots(db, mentor.mentorId, count);
  const requests = [];
  for (const slot of slots) {
    const request = await paidRequest(db, ctx, mentor, slot);
    requests.push(request);
    const decision = await acceptRequest(
      { mentorId: mentor.mentorId, requestId: request.id },
      { db: db.pool, payments: null },
    );
    assert.equal(decision.ok, true, JSON.stringify(decision));
    await db.query(
      "update requests set status='held',settled_at=now() where id=$1",
      [request.id],
    );
  }
  const start = await startOnboarding(
    {
      mentorId: mentor.mentorId,
      returnUrl: "http://localhost/mentor/payouts?stripe=return",
      refreshUrl: "http://localhost/mentor/payouts?stripe=refresh",
    },
    deps,
  );
  assert.equal(start.ok, true);
  const account = (
    await db.query(
      "select stripe_account_id from mentor_payout_accounts where mentor_id=$1",
      [mentor.mentorId],
    )
  ).rows[0].stripe_account_id;
  await transferOwed(deps);
  if (ready) {
    ctx.fake.setAccount(account, {
      payouts_enabled: true,
      transfers: "active",
    });
    await syncAccountFromStripe(mentor.mentorId, deps);
  }
  return { mentor, ctx, deps, account, requests };
}

async function rowFor(db, requestId) {
  return (
    await db.query("select * from payouts where request_id=$1", [requestId])
  ).rows[0];
}

describeDb("payout transfers", (db) => {
  test("holds while pending, transfers the owed share once account is ready", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const req = await paidRequest(db, ctx, mentor, slot);
    assert.equal(
      (
        await acceptRequest(
          { mentorId: mentor.mentorId, requestId: req.id },
          { db: db.pool, payments: null },
        )
      ).ok,
      true,
    );
    await db.query(
      "update requests set status='held',settled_at=now() where id=$1",
      [req.id],
    );
    const deps = { ...ctx.deps, db: db.pool };
    const start = await startOnboarding(
      {
        mentorId: mentor.mentorId,
        returnUrl: "http://localhost/mentor/payouts?stripe=return",
        refreshUrl: "http://localhost/mentor/payouts?stripe=refresh",
      },
      deps,
    );
    assert.equal(start.ok, true);
    assert.equal((await transferOwed(deps)).transferred, 0);
    assert.equal(ctx.fake.count("transfers.create"), 0);
    const acct = (
      await db.query(
        "select stripe_account_id from mentor_payout_accounts where mentor_id=$1",
        [mentor.mentorId],
      )
    ).rows[0].stripe_account_id;
    ctx.fake.setAccount(acct, { payouts_enabled: true, transfers: "active" });
    await syncAccountFromStripe(mentor.mentorId, deps);
    ctx.fake.setDelay(15);
    const results = await Promise.all([transferOwed(deps), transferOwed(deps)]);
    assert.equal(
      results.reduce((n, r) => n + r.transferred, 0),
      1,
    );
    assert.equal(ctx.fake.count("transfers.create"), 1);
    ctx.fake.setDelay(0);
    const payout = (
      await db.query("select * from payouts where request_id=$1", [req.id])
    ).rows[0];
    assert.equal(payout.status, "paid");
    assert.equal(payout.amount_minor, 13500);
    assert.equal((await transferOwed(deps)).transferred, 0);
    assert.equal(ctx.fake.count("transfers.create"), 1);
    const [, secondSlot] = await apartSlots(
      db,
      mentor.mentorId,
      2,
      new Date(Date.now() + 3600000),
    );
    const second = await paidRequest(db, ctx, mentor, secondSlot);
    const decision = await acceptRequest(
      { mentorId: mentor.mentorId, requestId: second.id },
      { db: db.pool, payments: null },
    );
    assert.equal(decision.ok, true, JSON.stringify(decision));
    await db.query(
      "update requests set status='held',settled_at=now() where id=$1",
      [second.id],
    );
    const pi = (
      await db.query(
        "select stripe_payment_intent_id from payments where id=$1",
        [second.paymentId],
      )
    ).rows[0].stripe_payment_intent_id;
    ctx.fake.dashboardRefund(pi, 2500, "failed");
    await transferOwed(deps);
    const canceled = (
      await db.query("select status from payouts where request_id=$1", [
        second.id,
      ])
    ).rows[0];
    assert.equal(canceled.status, "cancelled");
    assert.equal(
      (
        await db.query("select refund_seen_at from payments where id=$1", [
          second.paymentId,
        ])
      ).rows[0].refund_seen_at instanceof Date,
      true,
    );
    assert.equal(ctx.fake.count("transfers.create"), 1);
  });

  test("konto pending wstrzymuje wypłatę bez wywołań transfers", async () => {
    const { ctx, deps, requests } = await createOwed(db);
    await transferOwed(deps);
    assert.equal((await rowFor(db, requests[0].id)).status, "held_for_payout");
    assert.equal(ctx.fake.count("transfers.create"), 0);
    assert.equal(ctx.fake.count("transfers.list"), 0);
  });

  test("odebrany błąd 5xx zmienia klucz po sprawdzeniu przejęcia", async () => {
    const { ctx, deps, requests } = await createOwed(db, { ready: true });
    const error = Object.assign(new Error("api error"), {
      statusCode: 500,
      code: "api_error",
    });
    ctx.fake.fail("transfers.create", error);
    await transferOwed(deps);
    const failed = await rowFor(db, requests[0].id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.key_bump_due, true);
    deps.now = () => new Date(Date.now() + 2 * 60_000);
    await transferOwed(deps);
    const paid = await rowFor(db, requests[0].id);
    assert.equal(paid.key_version, 2);
    assert.equal(paid.status, "paid");
    assert.equal(ctx.fake.transfers.size, 1);
  });

  test("cached create error survives a later refund-list timeout", async () => {
    const { ctx, deps, requests } = await createOwed(db, { ready: true });
    ctx.fake.fail("transfers.create", Object.assign(new Error("bad request"), { statusCode: 400, code: "invalid_request" }));
    await transferOwed(deps);
    assert.equal((await rowFor(db, requests[0].id)).key_bump_due, true);
    deps.now = () => new Date(Date.now() + 2 * 60_000);
    ctx.fake.fail("refunds.list", Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
    await transferOwed(deps);
    assert.equal((await rowFor(db, requests[0].id)).key_bump_due, true);
    deps.now = () => new Date(Date.now() + 7 * 60_000);
    await transferOwed(deps);
    const paid = await rowFor(db, requests[0].id);
    assert.equal(paid.key_version, 2);
    assert.equal(paid.status, "paid");
    assert.equal(ctx.fake.count("transfers.create"), 2);
    assert.equal(ctx.fake.transfers.size, 1);
  });
  test("refund on a reclaimed payout adopts a transfer before cancellation", async () => {
    const { ctx, deps, requests, account } = await createOwed(db, { ready: true });
    const payout = await rowFor(db, requests[0].id);
    await db.query("update payouts set status='failed', attempts=1, last_error='timeout', next_attempt_at=now()-interval '1 minute' where id=$1", [payout.id]);
    const transfer = await deps.stripe.transfers.create({ amount: payout.amount_minor, currency: payout.currency, destination: account, metadata: { payout_id: payout.id } });
    const pi = (await db.query("select stripe_payment_intent_id from payments where id=$1", [payout.payment_id])).rows[0].stripe_payment_intent_id;
    ctx.fake.dashboardRefund(pi, 100, "failed");
    await db.query("update payments set refund_seen_at=now() where id=$1", [payout.payment_id]);
    await transferOwed(deps);
    const updated = await rowFor(db, requests[0].id);
    assert.equal(updated.status, "paid");
    assert.equal(updated.stripe_transfer_id, transfer.id);
    assert.equal(updated.manual_reason, "refunded_after_payout");
    assert.equal(ctx.fake.count("transfers.create"), 1);
  });
  test("zwrócona wypłata nie jest anulowana, gdy przejęcie transferu kończy się błędem", async () => {
    const { ctx, deps, requests, account } = await createOwed(db, { ready: true });
    const payout = await rowFor(db, requests[0].id);
    const transfer = await deps.stripe.transfers.create({
      amount: payout.amount_minor,
      currency: payout.currency,
      destination: account,
      metadata: { payout_id: payout.id },
    });
    await db.query(
      "update payouts set status='failed', attempts=1, last_error='timeout', next_attempt_at=now()-interval '1 minute' where id=$1",
      [payout.id],
    );
    await db.query("update payments set refund_seen_at=now() where id=$1", [payout.payment_id]);
    ctx.fake.fail("transfers.list", Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), { times: 3 });

    await transferOwed(deps);
    const failed = await rowFor(db, requests[0].id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.next_attempt_at instanceof Date, true);
    assert.equal(failed.key_version, 1);

    deps.now = () => new Date(Date.now() + 2 * 60_000);
    await transferOwed(deps);
    const paid = await rowFor(db, requests[0].id);
    assert.equal(paid.status, "paid");
    assert.equal(paid.stripe_transfer_id, transfer.id);
    assert.equal(paid.manual_reason, "refunded_after_payout");
    assert.equal(ctx.fake.count("transfers.create"), 1);
  });
  test("przejmuje wygasłą dzierżawę zwróconej wypłaty przed anulowaniem", async () => {
    const withTransfer = await createOwed(db, { ready: true });
    const payout = await rowFor(db, withTransfer.requests[0].id);
    const transfer = await withTransfer.deps.stripe.transfers.create({
      amount: payout.amount_minor,
      currency: payout.currency,
      destination: withTransfer.account,
      metadata: { payout_id: payout.id },
    });
    await db.query("update payments set refund_seen_at=now() where id=$1", [payout.payment_id]);
    await db.query(
      "update payouts set status='transferring', attempts=1, lease_until=now()-interval '1 minute' where id=$1",
      [payout.id],
    );
    await transferOwed(withTransfer.deps);
    const adopted = await rowFor(db, withTransfer.requests[0].id);
    assert.equal(adopted.status, "paid");
    assert.equal(adopted.stripe_transfer_id, transfer.id);
    assert.equal(adopted.manual_reason, "refunded_after_payout");
    assert.equal(withTransfer.ctx.fake.count("transfers.create"), 1);

    const withoutTransfer = await createOwed(db, { ready: true });
    const missing = await rowFor(db, withoutTransfer.requests[0].id);
    await db.query("update payments set refund_seen_at=now() where id=$1", [missing.payment_id]);
    await db.query(
      "update payouts set status='transferring', attempts=1, lease_until=now()-interval '1 minute' where id=$1",
      [missing.id],
    );
    await transferOwed(withoutTransfer.deps);
    assert.equal((await rowFor(db, withoutTransfer.requests[0].id)).status, "cancelled");
    assert.equal(withoutTransfer.ctx.fake.count("transfers.create"), 0);
  });
  test("porzuca próbę, gdy przed transfers.create zostały mniej niż dwie minuty", async () => {
    const { ctx, deps, requests } = await createOwed(db, { ready: true });
    const claimTime = new Date();
    let calls = 0;
    deps.now = () => {
      calls += 1;
      return calls === 5 ? new Date(claimTime.getTime() + 14 * 60_000) : claimTime;
    };

    await transferOwed(deps);
    const abandoned = await rowFor(db, requests[0].id);
    assert.equal(abandoned.status, "transferring");
    assert.equal(abandoned.attempts, 1);
    assert.equal(ctx.fake.count("transfers.create"), 0);

    deps.now = () => new Date(claimTime.getTime() + 16 * 60_000);
    await transferOwed(deps);
    assert.equal((await rowFor(db, requests[0].id)).status, "paid");
    assert.equal(ctx.fake.count("transfers.create"), 1);
    assert.equal(
      ctx.fake.calls.filter((call) => call.method === "transfers.create").at(-1).options.idempotencyKey,
      `payout:${requests[0].id}:1`,
    );
  });
  test("timeout po wykonaniu transferu przejmuje transfer w tym samym przebiegu", async () => {
    const { ctx, deps, requests } = await createOwed(db, { ready: true });
    const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    ctx.fake.fail("transfers.create", error, { afterEffect: true });
    await transferOwed(deps);
    const paid = await rowFor(db, requests[0].id);
    assert.equal(paid.status, "paid");
    assert.equal(paid.stripe_transfer_id, [...ctx.fake.transfers.keys()][0]);
    assert.equal(ctx.fake.count("transfers.create"), 1);
    await transferOwed(deps);
    assert.equal(ctx.fake.count("transfers.create"), 1);
    assert.equal(ctx.fake.transfers.size, 1);
  });

  test("timeout bez wykonania ponawia ten sam klucz idempotencji", async () => {
    const { ctx, deps, requests } = await createOwed(db, { ready: true });
    const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    ctx.fake.fail("transfers.create", error, { afterEffect: false });
    await transferOwed(deps);
    const failed = await rowFor(db, requests[0].id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.key_bump_due, false);
    const firstKey = ctx.fake.calls.find(
      (call) => call.method === "transfers.create",
    ).options.idempotencyKey;
    deps.now = () => new Date(Date.now() + 2 * 60_000);
    await transferOwed(deps);
    const createCalls = ctx.fake.calls.filter(
      (call) => call.method === "transfers.create",
    );
    assert.equal(createCalls.length, 2);
    assert.equal(createCalls[1].options.idempotencyKey, firstKey);
    assert.equal((await rowFor(db, requests[0].id)).status, "paid");
    assert.equal(ctx.fake.transfers.size, 1);
  });

  test("wygasła dzierżawa ponawia transfer z tą samą wersją klucza", async () => {
    const { ctx, deps, requests } = await createOwed(db, { ready: true });
    const payout = (
      await db.query("select id from payouts where request_id=$1", [
        requests[0].id,
      ])
    ).rows[0];
    await db.query(
      "update payouts set status='transferring',attempts=1,lease_until=now()-interval '1 minute' where id=$1",
      [payout.id],
    );
    await transferOwed(deps);
    const paid = await rowFor(db, requests[0].id);
    assert.equal(paid.status, "paid");
    assert.equal(paid.key_version, 1);
    assert.equal(ctx.fake.transfers.size, 1);
  });

  test("ostatnia wygasła dzierżawa przejmuje transfer albo kończy się lease_expired", async () => {
    const withTransfer = await createOwed(db, { ready: true });
    const payout = (
      await db.query("select id from payouts where request_id=$1", [
        withTransfer.requests[0].id,
      ])
    ).rows[0];
    await withTransfer.deps.stripe.transfers.create({
      amount: 13500,
      currency: "pln",
      destination: withTransfer.account,
      metadata: { payout_id: payout.id },
    });
    await db.query(
      "update payouts set status='transferring',attempts=5,lease_until=now()-interval '1 minute' where id=$1",
      [payout.id],
    );
    await transferOwed(withTransfer.deps);
    assert.equal(
      (await rowFor(db, withTransfer.requests[0].id)).status,
      "paid",
    );
    assert.equal(withTransfer.ctx.fake.count("transfers.create"), 1);
    const withoutTransfer = await createOwed(db, { ready: true });
    const missing = (
      await db.query("select id from payouts where request_id=$1", [
        withoutTransfer.requests[0].id,
      ])
    ).rows[0];
    await db.query(
      "update payouts set status='transferring',attempts=5,lease_until=now()-interval '1 minute' where id=$1",
      [missing.id],
    );
    await transferOwed(withoutTransfer.deps);
    const failed = await rowFor(db, withoutTransfer.requests[0].id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.last_error, "lease_expired");
    assert.equal(failed.next_attempt_at, null);
    assert.equal(withoutTransfer.ctx.fake.count("transfers.create"), 0);
  });

  test("pięć timeoutów kończy ponowienia i uwidacznia failedPayouts", async () => {
    const healthBefore = await jobsHealth(db.pool, JOB_NAMES, new Date());
    const { ctx, deps, requests } = await createOwed(db, { ready: true });
    let now = Date.now();
    deps.now = () => new Date(now);
    const backoff = [1, 5, 15, 60];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        const calls = ctx.fake.count("transfers.create");
        await transferOwed(deps);
        assert.equal(ctx.fake.count("transfers.create"), calls);
        now += backoff[attempt - 1] * 60_000;
      }
      ctx.fake.fail("transfers.create", Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
      await transferOwed(deps);
      const payout = await rowFor(db, requests[0].id);
      if (attempt < 4) assert.equal(payout.next_attempt_at.getTime(), now + backoff[attempt] * 60_000);
    }
    const failed = await rowFor(db, requests[0].id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 5);
    assert.equal(failed.next_attempt_at, null);
    assert.equal(
      (await jobsHealth(db.pool, JOB_NAMES, new Date(now))).failedPayouts,
      healthBefore.failedPayouts + 1,
    );
    const calls = ctx.fake.count("transfers.create");
    await transferOwed(deps);
    assert.equal(ctx.fake.count("transfers.create"), calls);
  });

  test("dwa przebiegi równoległe przekazują każdą z trzech należności raz", async () => {
    const { ctx, deps, requests } = await createOwed(db, {
      ready: true,
      count: 3,
    });
    ctx.fake.setDelay(20);
    const results = await Promise.all([transferOwed(deps), transferOwed(deps)]);
    ctx.fake.setDelay(0);
    assert.equal(ctx.fake.count("transfers.create"), 3);
    const paid = await db.query(
      "select count(*)::int as n from payouts where request_id=any($1::uuid[]) and status='paid'",
      [requests.map((request) => request.id)],
    );
    assert.equal(paid.rows[0].n, 3);
    assert.equal(
      results.reduce((sum, result) => sum + result.transferred, 0),
      3,
    );
  });

  test("przebieg odświeża nieaktualne konto pending bez webhooka", async () => {
    const { ctx, deps, requests, account, mentor } = await createOwed(db);
    await transferOwed(deps);
    await db.query(
      "update mentor_payout_accounts set checked_at=now()-interval '31 minutes' where mentor_id=$1",
      [mentor.mentorId],
    );
    ctx.fake.setAccount(account, {
      payouts_enabled: true,
      transfers: "active",
    });
    await transferOwed(deps);
    assert.equal(
      (
        await db.query(
          "select state from mentor_payout_accounts where mentor_id=$1",
          [mentor.mentorId],
        )
      ).rows[0].state,
      "ready",
    );
    assert.equal((await rowFor(db, requests[0].id)).status, "paid");
  });
});
