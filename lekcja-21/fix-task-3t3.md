You write ONE database test file for the mentor-payouts feature in this repository (current working directory; implementation already present and must NOT be changed). Spec: `.ai/specs/2026-11-09-mentor-payouts.md`. Read first: `lib/payouts/amounts.mjs`, `lib/payouts/accounts.mjs`, `lib/payouts/transfers.mjs`, `lib/payouts/summary.mjs`, `lib/payments/webhook.mjs`, `lib/jobs/jobs.mjs`, `lib/jobs/registry.mjs`, `tests/payments/fake-stripe.mjs` (`fail(method, error, { afterEffect })`, `afterNext`, `setAccount`, `dashboardRefund`, `count`, `calls`, `setDelay`), `tests/payments/helpers.mjs`, `tests/requests/fixtures.mjs` (`seedMentor`, `apartSlots`, `makeRequestDeps`, `paidRequest`), `tests/db/harness.mjs` (`describeDb`), and the existing `tests/db/payouts-transfer.test.mjs` / `payouts-onboarding.test.mjs` for how a payout scenario is set up. Style like `tests/db/session-settle.test.mjs`: Polish test names, 2-space indent, one statement per line, helpers at the top of the file.

Rules:
- Create/modify ONLY the file named below. Other workers write other test files in parallel.
- Write EVERY test listed below — do not stop early, do not summarise instead of writing. Each test must be able to fail without the code it covers.
- If a test exposes a real implementation bug, keep the test and mark it `test("…", { todo: "BUG: <one line>" }, …)` and list it in your report — do not edit implementation files.
- Run `node --test <your file>` (needs Postgres on localhost; it is running) until it passes; then `npx eslint <your file>`.
- Report: number of tests written, pass/fail/todo counts from your run, BUG todos with evidence.

## Your file
tests/db/payouts-webhook.test.mjs (rewrite; keep existing two tests' intent) and tests/db/payouts-jobs.test.mjs (new) — these two files only

## Tests to write
payouts-webhook.test.mjs:
1. `account.updated` newer event `ready`, then an OLDER event `pending` → stays `ready`.
2. Same event id delivered twice → second result `duplicate`.
3. Equal `event.created` with a different state → state not changed, `resync_requested_at` set.
4. Retrieval started before the resync flag: call `syncAccountFromStripe` with a clock earlier than `resync_requested_at` (or set the flag during the fake's `afterNext("accounts.retrieve", …)`) → retrieved state not applied, flag kept.
5. Event signed with `connectWebhookSecret` accepted by `handleStripeWebhook` (use `Stripe.webhooks.generateTestHeaderString` and `verifyStripeEvent` from `lib/payments/stripe-client.mjs`); wrong secret → 400.
6. `transfer.created` with `metadata.payout_id` adopts a `transferring` row and, separately, a `failed` row → `paid` with that transfer id.
7. `transfer.reversed` and `transfer.updated` with `amount_reversed > 0` → `manual_reason = 'transfer_reversed'`, status unchanged; `transfer.updated` with `amount_reversed = 0` → noop.
payouts-jobs.test.mjs:
8. `JOB_NAMES` order: `payouts.transferOwed` after `sessions.settleEnded` and after `payments.retryRefunds`, before `email.sendDue`.
9. `jobsHealth` returns numeric `failedPayouts` and `payoutsNeedingAttention` (0 on an empty schema, 1 after inserting one terminal failed payout / one flagged paid payout).
