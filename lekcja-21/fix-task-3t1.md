You write ONE database test file for the mentor-payouts feature in this repository (current working directory; implementation already present and must NOT be changed). Spec: `.ai/specs/2026-11-09-mentor-payouts.md`. Read first: `lib/payouts/amounts.mjs`, `lib/payouts/accounts.mjs`, `lib/payouts/transfers.mjs`, `lib/payouts/summary.mjs`, `lib/payments/webhook.mjs`, `lib/jobs/jobs.mjs`, `lib/jobs/registry.mjs`, `tests/payments/fake-stripe.mjs` (`fail(method, error, { afterEffect })`, `afterNext`, `setAccount`, `dashboardRefund`, `count`, `calls`, `setDelay`), `tests/payments/helpers.mjs`, `tests/requests/fixtures.mjs` (`seedMentor`, `apartSlots`, `makeRequestDeps`, `paidRequest`), `tests/db/harness.mjs` (`describeDb`), and the existing `tests/db/payouts-transfer.test.mjs` / `payouts-onboarding.test.mjs` for how a payout scenario is set up. Style like `tests/db/session-settle.test.mjs`: Polish test names, 2-space indent, one statement per line, helpers at the top of the file.

Rules:
- Create/modify ONLY the file named below. Other workers write other test files in parallel.
- Write EVERY test listed below — do not stop early, do not summarise instead of writing. Each test must be able to fail without the code it covers.
- If a test exposes a real implementation bug, keep the test and mark it `test("…", { todo: "BUG: <one line>" }, …)` and list it in your report — do not edit implementation files.
- Run `node --test <your file>` (needs Postgres on localhost; it is running) until it passes; then `npx eslint <your file>`.
- Report: number of tests written, pass/fail/todo counts from your run, BUG todos with evidence.

## Your file
tests/db/payouts-transfer.test.mjs (rewrite; keep the existing scenario as the first test)

## Tests to write
1. Account `pending` → payout `held_for_payout`, zero `transfers.create`/`transfers.list` calls.
2. Received 5xx on `transfers.create` (fake stores it under the key) → payout `failed`, `key_bump_due` true; advance clock past backoff; next run bumps `key_version` to 2, exactly one transfer exists in the fake, payout `paid`.
3. Timeout with `afterEffect: true` on `transfers.create` → payout `failed`; next run (clock advanced) sends the SAME idempotency key (assert via `fake.calls`), one transfer in the fake, payout `paid`.
4. Expired lease: set a payout `transferring` with `lease_until` in the past and attempts 1 (via SQL after a claim) → next run re-claims with the same `key_version`, one transfer.
5. Expired lease on the last attempt (attempts = 5): transfer exists in the fake → `paid`; no transfer → `failed`, `last_error = 'lease_expired'`, `next_attempt_at` NULL.
6. Backoff: `transfers.create` fails with timeout 5 times (clock advanced each time by the backoff 1, 5, 15, 60 min) → after attempt 5 status `failed`, `next_attempt_at` NULL; `jobsHealth(db.pool, JOB_NAMES, now).failedPayouts` = 1; a 6th run makes no Stripe call.
7. Two concurrent `transferOwed` runs with `fake.setDelay(20)` and three owed requests → exactly three `transfers.create` calls, three `paid` rows.
8. Resync without webhook: account in DB `pending` with `checked_at` 31 min ago, fake account set ready (`setAccount`) → one `transferOwed` run → account `ready` and the payout `paid`.
