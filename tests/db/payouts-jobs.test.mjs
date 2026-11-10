import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDb } from "./harness.mjs";
import { JOB_NAMES } from "../../lib/jobs/registry.mjs";
import { jobsHealth } from "../../lib/jobs/jobs.mjs";
import { seedMentor, apartSlots, makeRequestDeps, paidRequest } from "../requests/fixtures.mjs";
import { acceptRequest } from "../../lib/requests/decision.mjs";
import { startOnboarding, syncAccountFromStripe } from "../../lib/payouts/accounts.mjs";
import { transferOwed } from "../../lib/payouts/transfers.mjs";

describeDb("zadania wypłat", (db) => {
  async function paidPayout() {
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
    return (await db.query("select * from payouts where request_id = $1", [request.id])).rows[0];
  }

  test("JOB_NAMES umieszcza transferOwed po settleEnded i retryRefunds, przed email.sendDue", () => {
    const index = (name) => JOB_NAMES.indexOf(name);
    assert.ok(index("payouts.transferOwed") > index("sessions.settleEnded"));
    assert.ok(index("payouts.transferOwed") > index("payments.retryRefunds"));
    assert.ok(index("payouts.transferOwed") < index("email.sendDue"));
  });

  test("jobsHealth zwraca liczniki liczbowe failedPayouts i payoutsNeedingAttention", async () => {
    const empty = await jobsHealth(db.pool, []);
    assert.equal(typeof empty.failedPayouts, "number");
    assert.equal(typeof empty.payoutsNeedingAttention, "number");
    assert.equal(empty.failedPayouts, 0);
    assert.equal(empty.payoutsNeedingAttention, 0);

    const failed = await paidPayout();
    await db.query("update payouts set status = 'failed', paid_at = null, stripe_transfer_id = null, next_attempt_at = null where id = $1", [failed.id]);
    const flagged = await paidPayout();
    await db.query("update payouts set manual_reason = 'transfer_reversed' where id = $1", [flagged.id]);
    const health = await jobsHealth(db.pool, []);
    assert.equal(health.failedPayouts, 1);
    assert.equal(health.payoutsNeedingAttention, 1);
  });
});
