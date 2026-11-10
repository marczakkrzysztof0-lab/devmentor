import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDb } from "./harness.mjs";
import { seedMentor, apartSlots, makeRequestDeps, paidRequest } from "../requests/fixtures.mjs";
import { acceptRequest } from "../../lib/requests/decision.mjs";
import { startOnboarding, syncAccountFromStripe } from "../../lib/payouts/accounts.mjs";
import { recordOwed, transferOwed } from "../../lib/payouts/transfers.mjs";
import { processStripeEvent } from "../../lib/payments/webhook.mjs";
import { jobsHealth } from "../../lib/jobs/jobs.mjs";
import { mentorShareMinor } from "../../lib/payouts/amounts.mjs";

async function heldRequest(db, ctx, mentor, slot) {
  const request = await paidRequest(db, ctx, mentor, slot);
  const accepted = await acceptRequest(
    { mentorId: mentor.mentorId, requestId: request.id },
    { db: db.pool, payments: null },
  );
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  await db.query(
    "update requests set status = 'held', settled_at = now() where id = $1",
    [request.id],
  );
  return request;
}

async function readyAccount(db, ctx, mentor) {
  const deps = { ...ctx.deps, db: db.pool };
  const onboarding = await startOnboarding(
    {
      mentorId: mentor.mentorId,
      returnUrl: "http://localhost/r",
      refreshUrl: "http://localhost/f",
    },
    deps,
  );
  assert.equal(onboarding.ok, true);

  const accountResult = await db.query(
    "select stripe_account_id from mentor_payout_accounts where mentor_id = $1",
    [mentor.mentorId],
  );
  const accountId = accountResult.rows[0].stripe_account_id;
  ctx.fake.setAccount(accountId, { payouts_enabled: true, transfers: "active" });
  await syncAccountFromStripe(mentor.mentorId, deps);
}

async function payoutRow(db, requestId) {
  const result = await db.query("select * from payouts where request_id = $1", [requestId]);
  return result.rows[0];
}

describeDb("kwoty i zabezpieczenia wypłat", (db) => {
  test("sporna płatność nie uruchamia transferu", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await heldRequest(db, ctx, mentor, slot);
    await readyAccount(db, ctx, mentor);

    await db.query("update payments set disputed_at = now() where id = $1", [request.paymentId]);
    const deps = { ...ctx.deps, db: db.pool };
    await transferOwed(deps);

    const payout = await payoutRow(db, request.id);
    assert.equal(payout.status, "failed");
    assert.equal(payout.last_error, "disputed");
    assert.equal(ctx.fake.count("transfers.create"), 0);
  });

  test("zwrot po wypłacie oznacza ręczną obsługę bez kolejnego wywołania Stripe", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await heldRequest(db, ctx, mentor, slot);
    await readyAccount(db, ctx, mentor);
    const deps = { ...ctx.deps, db: db.pool };

    await transferOwed(deps);
    const calls = ctx.fake.calls.length;
    await db.query(
      `update payments
       set refund_status = 'succeeded', refund_reason = 'external', refund_requested_at = now(),
           refunded_at = now(), refund_seen_at = now()
       where id = $1`,
      [request.paymentId],
    );
    await transferOwed(deps);

    const payout = await payoutRow(db, request.id);
    assert.equal(payout.manual_reason, "refunded_after_payout");
    const health = await jobsHealth(db.pool, [], new Date());
    assert.equal(health.payoutsNeedingAttention, 1);
    assert.equal(ctx.fake.calls.length, calls);
  });

  test("zwrot zapisany podczas tworzenia transferu zostaje oznaczony po wypłacie", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await heldRequest(db, ctx, mentor, slot);
    await readyAccount(db, ctx, mentor);

    ctx.fake.afterNext("transfers.create", async () =>
      db.query("update payments set refund_seen_at = now() where id = $1", [request.paymentId]),
    );
    const deps = { ...ctx.deps, db: db.pool };
    await transferOwed(deps);

    const payout = await payoutRow(db, request.id);
    assert.equal(payout.status, "paid");
    assert.equal(payout.manual_reason, "refunded_after_payout");
  });

  test("częściowy zwrot z panelu blokuje transfer", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await heldRequest(db, ctx, mentor, slot);
    await readyAccount(db, ctx, mentor);

    const paymentResult = await db.query(
      "select stripe_payment_intent_id, amount_minor from payments where id = $1",
      [request.paymentId],
    );
    const payment = paymentResult.rows[0];
    await processStripeEvent(
      {
        id: "evt_partial_refund",
        type: "charge.refunded",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "ch_partial",
            payment_intent: payment.stripe_payment_intent_id,
            amount: payment.amount_minor,
            amount_refunded: 100,
            refunds: { data: [] },
          },
        },
      },
      ctx.deps,
    );
    const deps = { ...ctx.deps, db: db.pool };
    await transferOwed(deps);

    const refundMarker = await db.query(
      "select refund_seen_at from payments where id = $1",
      [request.paymentId],
    );
    assert.ok(refundMarker.rows[0].refund_seen_at);
    const payout = await payoutRow(db, request.id);
    assert.ok(!payout || payout.status === "cancelled");
    assert.equal(ctx.fake.count("transfers.create"), 0);
  });

  test("nieudany zwrot z panelu blokuje transfer", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await heldRequest(db, ctx, mentor, slot);
    await readyAccount(db, ctx, mentor);

    const paymentResult = await db.query(
      "select stripe_payment_intent_id from payments where id = $1",
      [request.paymentId],
    );
    const paymentIntentId = paymentResult.rows[0].stripe_payment_intent_id;
    ctx.fake.dashboardRefund(paymentIntentId, 500, "failed");
    const deps = { ...ctx.deps, db: db.pool };
    await transferOwed(deps);

    const payout = await payoutRow(db, request.id);
    assert.equal(payout.status, "cancelled");
    assert.equal(ctx.fake.count("transfers.create"), 0);
  });

  test("niepewny nieudany transfer po zwrocie jest rozliczany z listy Stripe", async (t) => {
    for (const exists of [true, false]) {
      const title = exists
        ? "istniejący transfer przechodzi do paid"
        : "brak transferu anuluje wypłatę";
      await t.test(title, async () => {
        const mentor = await seedMentor(db);
        const ctx = makeRequestDeps(db);
        const [slot] = await apartSlots(db, mentor.mentorId, 1);
        const request = await heldRequest(db, ctx, mentor, slot);
        await readyAccount(db, ctx, mentor);
        const deps = { ...ctx.deps, db: db.pool };

        await recordOwed(db.pool);
        const payout = await payoutRow(db, request.id);
        if (exists) {
          await transferOwed(deps);
        }
        await db.query(
          `update payouts
           set status = 'failed', attempts = 1, last_error = 'api_error',
               next_attempt_at = now() - interval '1 minute', stripe_transfer_id = null, paid_at = null
           where id = $1`,
          [payout.id],
        );
        await db.query("update payments set refund_seen_at = now() where id = $1", [request.paymentId]);
        await transferOwed(deps);

        const result = await payoutRow(db, request.id);
        const expectedStatus = exists ? "paid" : "cancelled";
        const expectedManualReason = exists ? "refunded_after_payout" : null;
        assert.equal(result.status, expectedStatus);
        assert.equal(result.manual_reason, expectedManualReason);
      });
    }
  });

  test("niekwalifikujące się statusy zapytania nie tworzą należności", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const slots = await apartSlots(db, mentor.mentorId, 4);
    const requests = [];
    for (const slot of slots) {
      requests.push(await paidRequest(db, ctx, mentor, slot));
    }

    await db.query(
      "update requests set status = 'mentor_no_show', settled_at = now() where id = $1",
      [requests[0].id],
    );
    await db.query(
      "update requests set status = 'declined', settled_at = null, declined_at = now() where id = $1",
      [requests[1].id],
    );
    await db.query("update requests set status = 'lapsed', settled_at = null where id = $1", [requests[2].id]);
    await db.query(
      "update requests set status = 'cancelled', settled_at = null, cancelled_at = now() where id = $1",
      [requests[3].id],
    );
    assert.equal(await recordOwed(db.pool), 0);

    const payoutCount = await db.query(
      "select count(*)::int as n from payouts where request_id = any($1::uuid[])",
      [requests.map((request) => request.id)],
    );
    assert.equal(payoutCount.rows[0].n, 0);
  });

  test("prowizja 10000 bps nie tworzy wypłaty, a udziały SQL zgadzają się z helperem", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const slots = await apartSlots(db, mentor.mentorId, 5);
    const requests = [];
    for (const slot of slots) {
      requests.push(await heldRequest(db, ctx, mentor, slot));
    }

    const values = [[500000, 9999], [500000, 10000], [15000, 1000], [199, 333]];
    await db.query("update payments set commission_bps = 10000 where id = $1", [requests[0].paymentId]);
    for (const [index, [amount, bps]] of values.entries()) {
      await db.query(
        "update payments set amount_minor = $2, commission_bps = $3 where id = $1",
        [requests[index + 1].paymentId, amount, bps],
      );
    }
    await recordOwed(db.pool);

    const fullCommissionPayout = await payoutRow(db, requests[0].id);
    assert.equal(fullCommissionPayout, undefined);
    for (const [index, [amount, bps]] of values.entries()) {
      const payout = await payoutRow(db, requests[index + 1].id);
      if (bps === 10000) {
        assert.equal(payout, undefined);
        assert.equal(mentorShareMinor(amount, bps), 0);
      } else {
        assert.equal(payout.amount_minor, mentorShareMinor(amount, bps));
      }
    }
  });
});
