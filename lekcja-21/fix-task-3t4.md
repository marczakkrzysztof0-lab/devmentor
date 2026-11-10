You write ONE database test file for the mentor-payouts feature in this repository (current working directory; implementation already present and must NOT be changed). Spec: `.ai/specs/2026-11-09-mentor-payouts.md`. Read first: `lib/payouts/amounts.mjs`, `lib/payouts/accounts.mjs`, `lib/payouts/transfers.mjs`, `lib/payouts/summary.mjs`, `lib/payments/webhook.mjs`, `lib/jobs/jobs.mjs`, `lib/jobs/registry.mjs`, `tests/payments/fake-stripe.mjs` (`fail(method, error, { afterEffect })`, `afterNext`, `setAccount`, `dashboardRefund`, `count`, `calls`, `setDelay`), `tests/payments/helpers.mjs`, `tests/requests/fixtures.mjs` (`seedMentor`, `apartSlots`, `makeRequestDeps`, `paidRequest`), `tests/db/harness.mjs` (`describeDb`), and the existing `tests/db/payouts-transfer.test.mjs` / `payouts-onboarding.test.mjs` for how a payout scenario is set up. Style like `tests/db/session-settle.test.mjs`: Polish test names, 2-space indent, one statement per line, helpers at the top of the file.

Rules:
- Create/modify ONLY the file named below. Other workers write other test files in parallel.
- Write EVERY test listed below — do not stop early, do not summarise instead of writing. Each test must be able to fail without the code it covers.
- If a test exposes a real implementation bug, keep the test and mark it `test("…", { todo: "BUG: <one line>" }, …)` and list it in your report — do not edit implementation files.
- Run `node --test <your file>` (needs Postgres on localhost; it is running) until it passes; then `npx eslint <your file>`.
- Report: number of tests written, pass/fail/todo counts from your run, BUG todos with evidence.

## Your file
tests/db/payouts-access.test.mjs (new)

## Tests to write
Access control (AGENTS.md: two accounts, three checks). Mentors A and B. A has a paid request settled `held` (owed 13500) and started onboarding; B has a paid request too.
1. Positive path for BOTH: each `startOnboarding` returns `ok` with a URL for their OWN account (different account ids; each row's `mentor_id` matches); each `getPayoutSummary` shows their own `hasPaidRequest` and their own items.
2. Denied read: B's `getPayoutSummary` result (JSON.stringify) contains none of A's request ids, A's account id, nor A's amount; B's `syncAccountFromStripe(B)` returns B's state and never retrieves A's account (`fake.calls` with A's id absent).
3. Denied write: snapshot A's `mentor_payout_accounts` row and A's `payouts` rows; run B's `startOnboarding`, `syncAccountFromStripe(B)` and one `transferOwed` with B's account ready but A's pending; assert A's rows deep-equal the snapshot (only `updated_at`/`checked_at` may NOT change either — compare whole rows) and no transfer to A's account in the fake.
4. Before any paid request a mentor gets `startOnboarding` → `{ ok: false, code: "not_available" }` and no row is created.
