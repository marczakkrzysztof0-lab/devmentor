import test from "node:test";
import assert from "node:assert/strict";
import {
  mentorShareMinor,
  payoutAccountState,
  shouldAskForPayouts,
  payoutBackoffMinutes,
  hasAnyRefund,
} from "../../lib/payouts/amounts.mjs";
import { createFakeStripe, serverError } from "../payments/fake-stripe.mjs";

const shareCases = [
  { name: "1 at 1000 bps remains 1", amount: 1, bps: 1000, expected: 1 },
  { name: "x at 0 bps remains x", amount: 123, bps: 0, expected: 123 },
  { name: "10000 bps leaves 0", amount: 9, bps: 10000, expected: 0 },
  { name: "15000 at 1000 bps leaves 13500", amount: 15000, bps: 1000, expected: 13500 },
  { name: "199 at 333 bps leaves 193", amount: 199, bps: 333, expected: 193 },
  { name: "500000 at 9999 bps leaves 50", amount: 500000, bps: 9999, expected: 50 },
];

for (const { name, amount, bps, expected } of shareCases) {
  test(`share math: ${name}`, () => {
    assert.equal(mentorShareMinor(amount, bps), expected);
  });
}

test("share rejects invalid inputs", () => {
  assert.throws(() => mentorShareMinor(-1, 0));
  assert.throws(() => mentorShareMinor(10, 10001));
  assert.throws(() => mentorShareMinor(1.2, 0));
});

test("account state and prompt follow setup rules", () => {
  assert.equal(payoutAccountState(null), "none");
  assert.equal(payoutAccountState({ id: "acct", payouts_enabled: true, capabilities: { transfers: "active" } }), "ready");
  assert.equal(payoutAccountState({ id: "acct", payouts_enabled: true, capabilities: { transfers: "pending" } }), "pending");
  assert.equal(shouldAskForPayouts({ hasPaidRequest: false, accountState: "none" }), false);
  assert.equal(shouldAskForPayouts({ hasPaidRequest: true, accountState: "pending" }), true);
});

test("retry backoff and refund detector", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(payoutBackoffMinutes), [1, 5, 15, 60, 60]);
  assert.equal(hasAnyRefund({ refunds: { data: [{ id: "re" }] } }), true);
});

test("fake Stripe replays received errors for the same idempotency key", async () => {
  const fake = createFakeStripe();
  fake.fail("accounts.create", serverError());
  const args = { type: "express" };
  const opts = { idempotencyKey: "payout-account:test:1" };
  await assert.rejects(fake.stripe.accounts.create(args, opts));
  await assert.rejects(fake.stripe.accounts.create(args, opts));
  assert.equal(fake.count("accounts.create"), 2);
  assert.equal(fake.accounts.size, 0);
});
