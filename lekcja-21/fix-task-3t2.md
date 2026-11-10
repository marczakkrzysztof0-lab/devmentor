You write ONE database test file for the mentor-payouts feature in this repository (current working directory; implementation already present and must NOT be changed). Spec: `.ai/specs/2026-11-09-mentor-payouts.md`. Read first: `lib/payouts/amounts.mjs`, `lib/payouts/accounts.mjs`, `lib/payouts/transfers.mjs`, `lib/payouts/summary.mjs`, `lib/payments/webhook.mjs`, `lib/jobs/jobs.mjs`, `lib/jobs/registry.mjs`, `tests/payments/fake-stripe.mjs` (`fail(method, error, { afterEffect })`, `afterNext`, `setAccount`, `dashboardRefund`, `count`, `calls`, `setDelay`), `tests/payments/helpers.mjs`, `tests/requests/fixtures.mjs` (`seedMentor`, `apartSlots`, `makeRequestDeps`, `paidRequest`), `tests/db/harness.mjs` (`describeDb`), and the existing `tests/db/payouts-transfer.test.mjs` / `payouts-onboarding.test.mjs` for how a payout scenario is set up. Style like `tests/db/session-settle.test.mjs`: Polish test names, 2-space indent, one statement per line, helpers at the top of the file.

Rules:
- Create/modify ONLY the file named below. Other workers write other test files in parallel.
- Write EVERY test listed below — do not stop early, do not summarise instead of writing. Each test must be able to fail without the code it covers.
- If a test exposes a real implementation bug, keep the test and mark it `test("…", { todo: "BUG: <one line>" }, …)` and list it in your report — do not edit implementation files.
- Run `node --test <your file>` (needs Postgres on localhost; it is running) until it passes; then `npx eslint <your file>`.
- Report: number of tests written, pass/fail/todo counts from your run, BUG todos with evidence.

## Your file
tests/db/payouts-money.test.mjs (new)

## Tests to write
1. Disputed payment (`update payments set disputed_at = now()`) on an owed request with a ready account → payout `failed`, `last_error = 'disputed'`, zero `transfers.create`.
2. Refund after `paid` (set `payments.refund_status`/`refund_seen_at` after the payout) → next run sets `manual_reason = 'refunded_after_payout'`; `jobsHealth(...).payoutsNeedingAttention` = 1; no new Stripe call.
3. Refund recorded while `transfers.create` is in flight (`fake.afterNext("transfers.create", async () => db.query("update payments set refund_seen_at = now() where id = $1", [...]))`) → payout `paid` with `manual_reason = 'refunded_after_payout'`.
4. Partial dashboard refund delivered as a `charge.refunded` event through `processStripeEvent` (amount_refunded < amount, matching payment_intent) before any transfer → `payments.refund_seen_at` set, payout never `paid` (status `cancelled` or no row), zero `transfers.create`.
5. Failed dashboard refund (`fake.dashboardRefund(pi, amount, "failed")`) → never paid (cancelled under the claim), zero `transfers.create`.
6. `failed` payout with `attempts > 0` whose payment then gets a refund: (a) a transfer for it exists in the fake → job marks it `paid` + `refunded_after_payout`; (b) none exists → `cancelled`.
7. Never owed: requests set to `mentor_no_show`, `declined`, `lapsed`, `cancelled` (with valid timestamps for the CHECK constraints) → `recordOwed` creates no rows for them.
8. Commission 10000 bps → no payout row; SQL share equals `mentorShareMinor` for (500000, 9999), (500000, 10000), (15000, 1000), (199, 333): insert payments with those values (update the payment of a paid request) and compare `payouts.amount_minor` with `mentorShareMinor`.
