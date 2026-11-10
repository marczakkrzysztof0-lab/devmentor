import {test} from "node:test";
import assert from "node:assert/strict";
import {describeDb} from "./harness.mjs";
import {seedMentor,apartSlots,makeRequestDeps,paidRequest} from "../requests/fixtures.mjs";
import {startOnboarding,syncAccountFromStripe} from "../../lib/payouts/accounts.mjs";
import {transferOwed} from "../../lib/payouts/transfers.mjs";
import {getPayoutSummary} from "../../lib/payouts/summary.mjs";

const ONBOARDING_URLS = {
  returnUrl: "http://localhost/mentor/payouts?stripe=return",
  refreshUrl: "http://localhost/mentor/payouts?stripe=refresh",
};

async function createPaidHeldRequest(db, ctx, mentor) {
  const [slot] = await apartSlots(db, mentor.mentorId, 1);
  const request = await paidRequest(db, ctx, mentor, slot);
  await db.query("update requests set status='held',settled_at=now() where id=$1", [request.id]);
  return request;
}

async function createPair(db) {
  const mentorA = await seedMentor(db);
  const mentorB = await seedMentor(db);
  const ctx = makeRequestDeps(db);
  const deps = {...ctx.deps, db: db.pool};
  const requestA = await createPaidHeldRequest(db, ctx, mentorA);
  const requestB = await createPaidHeldRequest(db, ctx, mentorB);
  return {mentorA, mentorB, ctx, deps, requestA, requestB};
}

async function onboard(mentorId, deps) {
  return startOnboarding({mentorId, ...ONBOARDING_URLS}, deps);
}

async function payoutAccount(db, mentorId) {
  const {rows} = await db.query("select * from mentor_payout_accounts where mentor_id=$1", [mentorId]);
  return rows[0];
}

describeDb("payout access control", db => {
  test("każdy mentor uruchamia własne konto i widzi własne podsumowanie", async () => {
    const {mentorA, mentorB, deps, requestA, requestB} = await createPair(db);
    const [resultA, resultB] = await Promise.all([
      onboard(mentorA.mentorId, deps),
      onboard(mentorB.mentorId, deps),
    ]);
    const accountA = await payoutAccount(db, mentorA.mentorId);
    const accountB = await payoutAccount(db, mentorB.mentorId);
    assert.equal(resultA.ok, true);
    assert.equal(resultB.ok, true);
    assert.match(resultA.url, new RegExp(accountA.stripe_account_id));
    assert.match(resultB.url, new RegExp(accountB.stripe_account_id));
    assert.notEqual(accountA.stripe_account_id, accountB.stripe_account_id);
    assert.equal(accountA.mentor_id, mentorA.mentorId);
    assert.equal(accountB.mentor_id, mentorB.mentorId);
    const summaryA = await getPayoutSummary(db.pool, {mentorId: mentorA.mentorId});
    const summaryB = await getPayoutSummary(db.pool, {mentorId: mentorB.mentorId});
    assert.equal(summaryA.hasPaidRequest, true);
    assert.equal(summaryB.hasPaidRequest, true);
    assert.deepEqual(summaryA.items.map(item => item.requestId), [requestA.id]);
    assert.deepEqual(summaryB.items.map(item => item.requestId), [requestB.id]);
    assert.equal(summaryA.items[0].shareMinor, 13500);
    assert.equal(summaryB.items[0].shareMinor, 13500);
  });

  test("mentor B nie odczytuje wypłat A ani nie synchronizuje jego konta", async () => {
    const {mentorA, mentorB, ctx, deps, requestA, requestB} = await createPair(db);
    await db.query("update payments set amount_minor=28000 where id=(select payment_id from requests where id=$1)", [requestB.id]);
    await onboard(mentorA.mentorId, deps);
    await onboard(mentorB.mentorId, deps);
    const accountA = await payoutAccount(db, mentorA.mentorId);
    const accountB = await payoutAccount(db, mentorB.mentorId);
    ctx.fake.calls.length = 0;
    const summaryB = await getPayoutSummary(db.pool, {mentorId: mentorB.mentorId});
    const serialized = JSON.stringify(summaryB);
    assert.equal(serialized.includes(requestA.id), false);
    assert.equal(serialized.includes(accountA.stripe_account_id), false);
    assert.equal(serialized.includes("13500"), false);
    assert.deepEqual(summaryB.items.map(item => item.requestId), [requestB.id]);
    assert.equal(await syncAccountFromStripe(mentorB.mentorId, deps), "pending");
    const retrievedIds = ctx.fake.calls
      .filter(call => call.method === "accounts.retrieve")
      .map(call => call.params.id);
    assert.ok(retrievedIds.includes(accountB.stripe_account_id));
    assert.equal(retrievedIds.includes(accountA.stripe_account_id), false);
  });

  test("operacje mentora B nie zmieniają wierszy wypłat ani konta A", async () => {
    const {mentorA, mentorB, ctx, deps, requestA} = await createPair(db);
    await onboard(mentorA.mentorId, deps);
    await onboard(mentorB.mentorId, deps);
    const accountB = await payoutAccount(db, mentorB.mentorId);
    await transferOwed(deps);
    const accountA = await payoutAccount(db, mentorA.mentorId);
    ctx.fake.setAccount(accountB.stripe_account_id, {payouts_enabled: true, transfers: "active"});
    await syncAccountFromStripe(mentorB.mentorId, deps);
    const accountSnapshot = await payoutAccount(db, mentorA.mentorId);
    const payoutSnapshot = (await db.query("select * from payouts where mentor_id=$1 order by id", [mentorA.mentorId])).rows;
    await onboard(mentorB.mentorId, deps);
    await syncAccountFromStripe(mentorB.mentorId, deps);
    await transferOwed(deps);
    assert.deepEqual(await payoutAccount(db, mentorA.mentorId), accountSnapshot);
    assert.deepEqual((await db.query("select * from payouts where mentor_id=$1 order by id", [mentorA.mentorId])).rows, payoutSnapshot);
    const transfers = ctx.fake.calls.filter(call => call.method === "transfers.create");
    assert.equal(transfers.some(call => call.params.destination === accountA.stripe_account_id), false);
  });

  test("mentor bez opłaconego zapytania nie może rozpocząć onboardingu", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const deps = {...ctx.deps, db: db.pool};
    assert.deepEqual(await onboard(mentor.mentorId, deps), {ok: false, code: "not_available"});
    const {rows} = await db.query("select * from mentor_payout_accounts where mentor_id=$1", [mentor.mentorId]);
    assert.equal(rows.length, 0);
  });
});
