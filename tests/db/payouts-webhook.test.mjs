import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { describeDb } from "./harness.mjs";
import { seedMentor, apartSlots, makeRequestDeps, paidRequest } from "../requests/fixtures.mjs";
import { acceptRequest } from "../../lib/requests/decision.mjs";
import { startOnboarding, syncAccountFromStripe } from "../../lib/payouts/accounts.mjs";
import { transferOwed } from "../../lib/payouts/transfers.mjs";
import { processStripeEvent, handleStripeWebhook } from "../../lib/payments/webhook.mjs";
import { verifyStripeEvent } from "../../lib/payments/stripe-client.mjs";

describeDb("zdarzenia webhooków wypłat", (db) => {
  async function accountFixture() {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    await paidRequest(db, ctx, mentor, slot);
    const deps = { ...ctx.deps, db: db.pool };
    await startOnboarding({ mentorId: mentor.mentorId, returnUrl: "http://localhost/r", refreshUrl: "http://localhost/f" }, deps);
    const row = (await db.query("select stripe_account_id from mentor_payout_accounts where mentor_id = $1", [mentor.mentorId])).rows[0];
    return { mentor, ctx, deps, accountId: row.stripe_account_id };
  }

  async function payoutFixture() {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await paidRequest(db, ctx, mentor, slot);
    await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, { db: db.pool, payments: null });
    await db.query("update requests set status = 'held', settled_at = now() where id = $1", [request.id]);
    const deps = { ...ctx.deps, db: db.pool };
    await startOnboarding({ mentorId: mentor.mentorId, returnUrl: "http://localhost/r", refreshUrl: "http://localhost/f" }, deps);
    const accountId = (await db.query("select stripe_account_id from mentor_payout_accounts where mentor_id = $1", [mentor.mentorId])).rows[0].stripe_account_id;
    ctx.fake.setAccount(accountId, { payouts_enabled: true, transfers: "active" });
    await syncAccountFromStripe(mentor.mentorId, deps);
    await transferOwed(deps);
    const payout = (await db.query("select * from payouts where request_id = $1", [request.id])).rows[0];
    return { mentor, ctx, deps, accountId, payout };
  }

  const accountEvent = (id, created, object) => ({ id, type: "account.updated", created, livemode: false, data: { object } });

  test("nowsze account.updated ready wygrywa ze starszym pending", async () => {
    const { deps, accountId, mentor } = await accountFixture();
    const ready = { id: accountId, payouts_enabled: true, details_submitted: true, capabilities: { transfers: "active" } };
    assert.equal(await processStripeEvent(accountEvent("evt-new-ready", 200, ready), deps), "applied");
    assert.equal(await processStripeEvent(accountEvent("evt-old-pending", 100, { ...ready, payouts_enabled: false }), deps), "ignored");
    const row = (await db.query("select state from mentor_payout_accounts where mentor_id = $1", [mentor.mentorId])).rows[0];
    assert.equal(row.state, "ready");
  });

  test("ready account.updated immediately transfers every owed request exactly once", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const slots = await apartSlots(db, mentor.mentorId, 2);
    const deps = { ...ctx.deps, db: db.pool };
    for (const slot of slots) {
      const request = await paidRequest(db, ctx, mentor, slot);
      await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, { db: db.pool, payments: null });
      await db.query("update requests set status='held', settled_at=now() where id=$1", [request.id]);
    }
    await startOnboarding({ mentorId: mentor.mentorId, returnUrl: "http://localhost/r", refreshUrl: "http://localhost/f" }, deps);
    const accountId = (await db.query("select stripe_account_id from mentor_payout_accounts where mentor_id=$1", [mentor.mentorId])).rows[0].stripe_account_id;
    ctx.fake.setAccount(accountId, { payouts_enabled: true, transfers: "active" });
    const ready = { id: accountId, payouts_enabled: true, capabilities: { transfers: "active" } };
    assert.equal(await processStripeEvent(accountEvent("evt-batch-ready", 400, ready), deps), "applied");
    assert.equal((await transferOwed(deps)).transferred, 2);
    assert.equal(ctx.fake.count("transfers.create"), 2);
    assert.equal((await transferOwed(deps)).transferred, 0);
    assert.equal(ctx.fake.count("transfers.create"), 2);
  });

  test("to samo ID zdarzenia zwraca duplicate przy drugim dostarczeniu", async () => {
    const { deps, accountId } = await accountFixture();
    const event = accountEvent("evt-duplicate", 200, { id: accountId, payouts_enabled: true, capabilities: { transfers: "active" } });
    assert.equal(await processStripeEvent(event, deps), "applied");
    assert.equal(await processStripeEvent(event, deps), "duplicate");
  });

  test("równe event.created z innym stanem nie zmienia stanu i prosi o synchronizację", async () => {
    const { deps, accountId, mentor } = await accountFixture();
    const ready = { id: accountId, payouts_enabled: true, capabilities: { transfers: "active" } };
    await processStripeEvent(accountEvent("evt-equal-ready", 200, ready), deps);
    assert.equal(await processStripeEvent(accountEvent("evt-equal-pending", 200, { ...ready, payouts_enabled: false }), deps), "ignored");
    const row = (await db.query("select state, resync_requested_at from mentor_payout_accounts where mentor_id = $1", [mentor.mentorId])).rows[0];
    assert.equal(row.state, "ready");
    assert.ok(row.resync_requested_at);
  });

  test("equal account.updated pending after ready preserves ready", async () => {
    const { deps, accountId, mentor } = await accountFixture();
    const ready = { id: accountId, payouts_enabled: true, capabilities: { transfers: "active" } };
    await processStripeEvent(accountEvent("evt-equal-ready-first", 500, ready), deps);
    assert.equal(await processStripeEvent(accountEvent("evt-equal-pending-second", 500, { ...ready, payouts_enabled: false }), deps), "ignored");
    const row = (await db.query("select state, resync_requested_at from mentor_payout_accounts where mentor_id=$1", [mentor.mentorId])).rows[0];
    assert.equal(row.state, "ready");
    assert.ok(row.resync_requested_at);
  });
  test("equal account.updated ready after pending preserves pending", async () => {
    const { deps, accountId, mentor } = await accountFixture();
    const ready = { id: accountId, payouts_enabled: true, capabilities: { transfers: "active" } };
    await processStripeEvent(accountEvent("evt-equal-pending-first", 600, { ...ready, payouts_enabled: false }), deps);
    assert.equal(await processStripeEvent(accountEvent("evt-equal-ready-second", 600, ready), deps), "ignored");
    const row = (await db.query("select state, resync_requested_at from mentor_payout_accounts where mentor_id=$1", [mentor.mentorId])).rows[0];
    assert.equal(row.state, "pending");
    assert.ok(row.resync_requested_at);
  });
  test("odczyt rozpoczęty przed flagą resync nie nadpisuje stanu ani flagi", async () => {
    const { deps, accountId, mentor, ctx } = await accountFixture();
    await db.query("update mentor_payout_accounts set resync_requested_at = $1 where mentor_id = $2", [new Date(Date.now() + 60_000), mentor.mentorId]);
    const result = await syncAccountFromStripe(mentor.mentorId, { ...deps, now: () => new Date(Date.now() - 60_000) });
    const row = (await db.query("select state, resync_requested_at from mentor_payout_accounts where mentor_id = $1", [mentor.mentorId])).rows[0];
    assert.equal(result, "pending");
    assert.ok(row.resync_requested_at);
    assert.equal(ctx.fake.count("accounts.retrieve"), 1);
    assert.ok(accountId);
  });

  test("podpis Connect jest akceptowany, a podpis z błędnym sekretem zwraca 400", async () => {
    const fixture = await accountFixture();
    const deps = { ...fixture.deps, config: { ...fixture.deps.config, connectWebhookSecret: "whsec_connect_test_secret" } };
    const rawBody = JSON.stringify({ id: "evt-connect", type: "account.updated", created: 200, livemode: false, data: { object: { id: fixture.accountId, payouts_enabled: true, capabilities: { transfers: "active" } } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: deps.config.connectWebhookSecret });
    assert.equal((await handleStripeWebhook({ rawBody, signature }, deps, verifyStripeEvent)).status, 200);
    const wrong = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: "whsec_wrong_secret" });
    assert.equal((await handleStripeWebhook({ rawBody, signature: wrong }, deps, verifyStripeEvent)).status, 400);
  });

  test("transfer.created adoptuje payout transferring oraz failed", async () => {
    for (const [index, status] of ["transferring", "failed"].entries()) {
      const { deps, accountId, payout } = await payoutFixture();
      await db.query("update payouts set status = $2, paid_at = null, stripe_transfer_id = null, attempts = 1 where id = $1", [payout.id, status]);
      const event = { id: `evt-transfer-adopt-${index}`, type: "transfer.created", created: 300, livemode: false, data: { object: { id: `tr-adopt-${index}`, amount: payout.amount_minor, currency: payout.currency.toLowerCase(), destination: accountId, metadata: { payout_id: payout.id } } } };
      assert.equal(await processStripeEvent(event, deps), "applied");
      const row = (await db.query("select status, stripe_transfer_id from payouts where id = $1", [payout.id])).rows[0];
      assert.equal(row.status, "paid");
      assert.equal(row.stripe_transfer_id, `tr-adopt-${index}`);
    }
  });

  test("transfer.reversed i transfer.updated ze zwrotem wymagają kontroli, zerowy zwrot jest noop", async () => {
    const { deps, payout } = await payoutFixture();
    const event = (id, type, amount_reversed) => ({ id, type, created: 300, livemode: false, data: { object: { id: payout.stripe_transfer_id, amount_reversed } } });
    assert.equal(await processStripeEvent(event("evt-transfer-reversed", "transfer.reversed", 100), deps), "applied");
    const first = (await db.query("select status, manual_reason from payouts where id = $1", [payout.id])).rows[0];
    assert.equal(first.status, "paid");
    assert.equal(first.manual_reason, "transfer_reversed");

    const second = await payoutFixture();
    assert.equal(await processStripeEvent({ ...event("evt-transfer-updated-reversed", "transfer.updated", 50), data: { object: { id: second.payout.stripe_transfer_id, amount_reversed: 50 } } }, second.deps), "applied");
    const updated = (await db.query("select status, manual_reason from payouts where id = $1", [second.payout.id])).rows[0];
    assert.equal(updated.status, "paid");
    assert.equal(updated.manual_reason, "transfer_reversed");
    assert.equal(await processStripeEvent({ ...event("evt-transfer-updated-zero", "transfer.updated", 0), data: { object: { id: second.payout.stripe_transfer_id, amount_reversed: 0 } } }, second.deps), "noop");
  });
});
