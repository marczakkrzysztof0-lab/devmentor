import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDb } from "./harness.mjs";
import { seedMentor, apartSlots, makeRequestDeps, paidRequest } from "../requests/fixtures.mjs";
import { startOnboarding } from "../../lib/payouts/accounts.mjs";
import { getPayoutSummary } from "../../lib/payouts/summary.mjs";

describeDb("payout onboarding and ownership", (db) => {
  test("współbieżne uruchomienie tworzy jedno konto, a błąd odpowiedzi podnosi wersję klucza", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const deps = { ...ctx.deps, db: db.pool };
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    await paidRequest(db, ctx, mentor, slot);

    const input = {
      mentorId: mentor.mentorId,
      returnUrl: "http://localhost/r",
      refreshUrl: "http://localhost/f",
    };
    const concurrent = await Promise.all([
      startOnboarding(input, deps),
      startOnboarding(input, deps),
    ]);
    assert.equal(concurrent.filter((result) => result.ok).length, 2);
    assert.equal(ctx.fake.count("accounts.create"), 1);

    const accountCount = await db.query(
      "select count(*)::int as n from mentor_payout_accounts where mentor_id = $1",
      [mentor.mentorId],
    );
    assert.equal(accountCount.rows[0].n, 1);

    const another = await seedMentor(db);
    const [slot2] = await apartSlots(db, another.mentorId, 1);
    await paidRequest(db, ctx, another, slot2);
    ctx.fake.fail(
      "accounts.create",
      Object.assign(new Error("temporary"), { statusCode: 500, code: "api_error" }),
    );

    const failedOnboarding = await startOnboarding(
      { ...input, mentorId: another.mentorId },
      deps,
    );
    assert.equal(failedOnboarding.ok, false);

    const keyVersion = await db.query(
      "select create_key_version from mentor_payout_accounts where mentor_id = $1",
      [another.mentorId],
    );
    assert.equal(keyVersion.rows[0].create_key_version, 2);

    const retriedOnboarding = await startOnboarding(
      { ...input, mentorId: another.mentorId },
      deps,
    );
    assert.equal(retriedOnboarding.ok, true);

    const timeoutMentor = await seedMentor(db);
    const [timeoutSlot] = await apartSlots(db, timeoutMentor.mentorId, 1);
    await paidRequest(db, ctx, timeoutMentor, timeoutSlot);
    const timeoutError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    ctx.fake.fail("accounts.create", timeoutError);
    const timeoutInput = { ...input, mentorId: timeoutMentor.mentorId };
    assert.equal((await startOnboarding(timeoutInput, deps)).ok, false);
    const createCalls = ctx.fake.calls.filter((call) => call.method === "accounts.create");
    const timeoutKey = createCalls.at(-1).options.idempotencyKey;
    const timeoutVersion = await db.query(
      "select create_key_version from mentor_payout_accounts where mentor_id = $1",
      [timeoutMentor.mentorId],
    );
    assert.equal(timeoutVersion.rows[0].create_key_version, 1);
    assert.equal((await startOnboarding(timeoutInput, deps)).ok, true);
    const retriedCreateCalls = ctx.fake.calls.filter((call) => call.method === "accounts.create");
    assert.equal(retriedCreateCalls.at(-1).options.idempotencyKey, timeoutKey);
  });

  test("no paid request is refused; paid mentors get separate accounts and scoped summaries", async () => {
    const a = await seedMentor(db);
    const b = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const deps = { ...ctx.deps, db: db.pool };

    const notYet = await startOnboarding(
      { mentorId: a.mentorId, returnUrl: "http://localhost/r", refreshUrl: "http://localhost/f" },
      deps,
    );
    assert.deepEqual(notYet, { ok: false, code: "not_available" });

    const [slotA] = await apartSlots(db, a.mentorId, 1);
    await paidRequest(db, ctx, a, slotA);
    const [slotB] = await apartSlots(db, b.mentorId, 1);
    await paidRequest(db, ctx, b, slotB);

    const mentors = [a, b];
    const onboardingResults = await Promise.all(
      mentors.map((mentor) =>
        startOnboarding(
          {
            mentorId: mentor.mentorId,
            returnUrl: "http://localhost/r",
            refreshUrl: "http://localhost/f",
          },
          deps,
        ),
      ),
    );
    const [resultA, resultB] = onboardingResults;
    assert.equal(resultA.ok, true);
    assert.equal(resultB.ok, true);

    const accountA = await db.query(
      "select stripe_account_id from mentor_payout_accounts where mentor_id = $1",
      [a.mentorId],
    );
    const accountB = await db.query(
      "select stripe_account_id from mentor_payout_accounts where mentor_id = $1",
      [b.mentorId],
    );
    assert.notEqual(accountA.rows[0].stripe_account_id, accountB.rows[0].stripe_account_id);

    const summaryA = await getPayoutSummary(db.pool, { mentorId: a.mentorId });
    const summaryB = await getPayoutSummary(db.pool, { mentorId: b.mentorId });
    assert.equal(summaryA.hasPaidRequest, true);
    assert.equal(summaryB.hasPaidRequest, true);
    assert.equal(summaryA.detailsSubmitted, false);
    assert.equal(summaryB.detailsSubmitted, false);
    assert.equal(summaryA.heldMinor, 0);
    assert.equal(summaryB.heldMinor, 0);

    const accounts = await db.query(
      `select mentor_id, stripe_account_id, create_key_version, state, updated_at
       from mentor_payout_accounts
       where mentor_id = any($1::uuid[])
       order by mentor_id`,
      [[a.mentorId, b.mentorId]],
    );
    assert.equal(accounts.rowCount, 2);
    assert.equal(new Set(accounts.rows.map((row) => row.stripe_account_id)).size, 2);

    const scopedSummary = await getPayoutSummary(db.pool, { mentorId: a.mentorId });
    assert.equal(scopedSummary.items.some((item) => item.menteeFirstName !== "Kuba"), false);
  });

  test("down migration refuses to erase any attempted payout", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await paidRequest(db, ctx, mentor, slot);

    await db.query(
      `insert into payouts (request_id, mentor_id, payment_id, amount_minor, currency, status, attempts, last_error)
       select r.id, r.mentor_id, p.id, 13500, p.currency, 'failed', 1, 'api_error'
       from requests r
       join payments p on p.id = r.payment_id
       where r.id = $1`,
      [request.id],
    );
    await assert.rejects(db.migrate("down", 1), /payout attempt may have moved money/);

    const latestResult = await db.query(
      "select name from pgmigrations order by run_on desc, id desc limit 1",
    );
    const latest = latestResult.rows[0];
    assert.equal(latest.name, "0009_mentor_payouts");
  });

  test("summary totals include only the mentor page currency", async () => {
    const mentor = await seedMentor(db);
    const ctx = makeRequestDeps(db);
    const slots = await apartSlots(db, mentor.mentorId, 2);
    const first = await paidRequest(db, ctx, mentor, slots[0]);
    const second = await paidRequest(db, ctx, mentor, slots[1]);

    await db.query(
      "update requests set status = 'held', settled_at = now() where id = any($1::uuid[])",
      [[first.id, second.id]],
    );
    await db.query("update payments set amount_minor = 20000 where id = $1", [first.paymentId]);
    await db.query(
      "update payments set currency = 'EUR', amount_minor = 30000 where id = $1",
      [second.paymentId],
    );

    const summary = await getPayoutSummary(db.pool, { mentorId: mentor.mentorId });
    assert.equal(summary.currency, "PLN");
    assert.equal(summary.heldMinor, 18000);
    assert.equal(summary.items.length, 1);
    assert.equal(summary.items[0].currency, "PLN");
  });
});
