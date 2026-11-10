You are the IMPLEMENTER of the mentor-payouts feature in this repository (current working directory, uncommitted changes already present). Spec: `.ai/specs/2026-11-09-mentor-payouts.md` (ignore its review log). Repo rules: `AGENTS.md`, `CODE_REVIEW.md`, `db/AGENTS.md`, `docs/design-system.md`, `packages/ui/AGENTS.md`. Constraints: no new dependencies, no commits, Polish UI copy, integer money, never print `.env*`. Git Bash: `npm` works; PowerShell: `npm.cmd`.

Code review found the following verified problems. Fix ALL of them in the existing working tree.

## 1. E2E gate is red (blocker)
`npm run test:e2e -- tests/e2e/mentor-payouts.e2e.mjs` fails:
```
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /135 zł/. Input:
'Wypłaty\nWypłaty gotowe\n…Do wypłaty\n0 zł\nWypłacone do tej pory\n135 zł\nWypłacone\n…'
  at tests/e2e/mentor-payouts.e2e.mjs:25
```
Cause: `formatMoney` (Intl pl-PL) separates amount and `zł` with U+00A0; the regex uses an ASCII space. Use `/135\s?zł/` (or normalize NBSP like `tests/e2e/public-slots.e2e.mjs`). Also assert in the E2E that the DB payout row is `paid` with `amount_minor = 13500` and the fake server recorded exactly one transfer. Reformat this E2E file to the style of `tests/e2e/session-settlement.e2e.mjs` (one statement per line).

## 2. Missing risk-high tests (blocker)
Only 4 DB tests exist for payouts. Add DB tests (`describeDb`, fake Stripe, injected clock) so that EVERY row of the spec section "Edge cases → tests" has a test that would fail without the code it covers. At minimum, in new/updated files `tests/db/payouts-webhook.test.mjs`, `tests/db/payouts-transfer.test.mjs`, `tests/db/payouts-onboarding.test.mjs`:
- webhook `account.updated`: older event after newer `ready` → stays `ready`; replay (same event id) → `duplicate`; same-second event with another state → not applied + `resync_requested_at` set; retrieval started before a webhook flag → discarded; Connect-signed event accepted with `connectWebhookSecret`, wrong secret → 400.
- `transfer.created` adopts `transferring` and `failed` rows; `transfer.reversed` / `transfer.updated` with `amount_reversed > 0` → `manual_reason = 'transfer_reversed'`.
- received 5xx on `transfers.create` (stored under the key by the fake) → next attempt takes over, bumps `key_version`, exactly one transfer; timeout with `afterEffect: true` → next attempt same key → one transfer; expired lease re-claimed with the same key; expired lease on the last attempt → take-over found → `paid`, not found → `failed`/`lease_expired`; backoff 1/5/15/60 and stop at 5 with `next_attempt_at` NULL and `failedPayouts` counted; last attempt with ambiguous error runs a final take-over.
- disputed payment → `failed`/`disputed`, zero Stripe transfer calls; refund after `paid` → `refunded_after_payout` + `payoutsNeedingAttention`; refund recorded while the Stripe call is in flight (use `fake.afterNext("transfers.create", …)`) → `paid` + `refunded_after_payout`; partial dashboard refund before transfer (via webhook `charge.refunded` with partial amount) → never paid; failed/canceled dashboard refund → never paid.
- `mentor_no_show`, `declined`, `lapsed`, `cancelled` never owed; commission 10000 bps → no payout row; SQL share equals `mentorShareMinor` for 500000 grosze at 9999 and 10000 bps; account `pending` → zero `transfers.*` calls; account verified in Stripe without webhook → job resync → paid.
- onboarding: zero paid requests → `not_available`; two concurrent clicks of one mentor → one `accounts.create`, one row; received error on `accounts.create` → `create_key_version` bumped, retry creates the account; no-response error → same key.
- registry order (`payouts.transferOwed` after `sessions.settleEnded` and `payments.retryRefunds`, before `email.sendDue`); `jobsHealth` returns `failedPayouts`, `payoutsNeedingAttention`.
- access control with mentors A and B (AGENTS.md: positive path for BOTH, denied read, denied write + owner's data unchanged): both start onboarding and get their own account; B's summary/sync never contains A's account id, requests or non-zero amounts (give A a held request so amounts are non-zero); after B's calls A's `mentor_payout_accounts` row and A's `payouts` rows are byte-for-byte unchanged.

## 3. Refund cancels a possibly-transferred `failed` row (major)
`lib/payouts/transfers.mjs` `cancelRefunded` and the webhook `onRefundSeen` (`lib/payments/webhook.mjs`) set `cancelled` for `failed` rows without Stripe check, but a `failed` row with `attempts > 0` may follow an ambiguous outcome where Stripe created the transfer. Fix: for `failed` rows with `attempts > 0`, run the take-over list first (in the job; the webhook only cancels `held_for_payout` and `failed` rows with `attempts = 0`, leaving the others for the job); found → `paid` + `manual_reason = 'refunded_after_payout'`. Also let `transfer.created` for a `cancelled` row with no transfer id record the id, set `paid`… — keep CHECK constraints valid — and `refunded_after_payout`. Test it.

## 4. Payout read error breaks `/mentor` (major)
`app/mentor/page.tsx` calls `getPayoutSummary(getPool(), …)` without try/catch and imports DB code directly. Spec: "A payout read error never blocks the panel (the prompt is skipped, logged by error name)". Move it behind a `lib/payouts/server.ts` wrapper (mentor id only from `getCurrentMentor()`), catch, `console.error` with `error.name` only, render without the prompt.

## 5. Design system does not match the spec (major)
`packages/ui/src/product/e04/MentorPayouts.tsx` still has `action_required` (line 20, 79, 97, 188) and `in_transit` ("Wypłata w drodze", line 89); `failed` reads "Nie udało się wypłacić — do ręcznej obsługi" (line 92). Spec wording: setup states `none`/`pending`/`ready`; session statuses `held_for_payout` → "Wstrzymane — czeka na dane do wypłaty" (account not ready) / "Do wypłaty" (ready), `transferring` → "Wypłata w toku", `paid` → "Wypłacone", `failed` → "Wypłata wstrzymana — wyjaśniamy", `cancelled` → "Zwrócone deweloperowi — bez wypłaty". Remove the draft states and "draft" wording; add stories for each session status, each setup state, loading/error/empty, phone width (390 px, `phone` helper) and the dark theme (see existing stories for how themes/viewports are done). `PayoutSetupPrompt` must use `HostedRedirectAction` and get stories (default, error from the action, phone).

## 6. Unreadable money code (major)
`lib/payouts/*.mjs`, the payout handlers in `lib/payments/webhook.mjs`, `app/mentor/payouts/*`, `app/mentor/page.tsx` changes, the new tests and fakes are minified one-liners. Reformat to match neighbouring modules (`lib/payments/refunds.mjs`, `lib/sessions/settle.mjs`): 2-space indentation, one statement per line, multi-line SQL, JSDoc on exported functions, a short Polish header comment per module like the neighbours, short comments at claim / take-over / key bump / final-lease steps; split `transferOne` into named helpers.

## 7. Action result shape (minor)
`app/mentor/payouts/actions.ts` must return `{ ok: true, url } | { ok: false }` (no `redirect`), and the `/mentor` prompt must use the same action through `HostedRedirectAction` so a Stripe error shows the standard message (no inline `"use server"` closure in the page).

## 8. Deadline ignored (minor)
`resyncAccounts` in `lib/payouts/transfers.mjs` checks `deps.deadline` (never set) instead of the `deadline` option passed by `transferOwed`. Fix and keep every step bounded by `limit` and `deadline`.

## 9. One refund predicate (minor)
`hasAnyRefund(paymentIntent, charge)` in `lib/payouts/amounts.mjs` is called with a refund list as `paymentIntent`. Change to `hasAnyRefund({ charge, refunds })` and use it in `onChargeRefunded` and `onRefund` instead of inline checks.

## 10. Nit
`tests/db/migrations.test.mjs:43` constant `UP_TO_0008` contains 0009 tables → rename `UP_TO_0009`.

## Done when (run them yourself)
`npm run lint` 0 errors; `npm test` all pass; `npm run typecheck:ui`; `npm run check:tokens`. (Build/E2E/Storybook are run by the orchestrator outside your sandbox; still make sure TypeScript compiles: `npx tsc --noEmit`.) Report: files changed, test counts, anything not done and why.
