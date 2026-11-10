You are the IMPLEMENTER of the mentor-payouts feature (current working directory; uncommitted changes present). Spec: `.ai/specs/2026-11-09-mentor-payouts.md`. Rules: `AGENTS.md`, `CODE_REVIEW.md`. No new dependencies, no commits, never print `.env*`. Another worker is editing ONLY test files under `tests/db/` and `tests/payouts/` in parallel — do NOT touch those.

## Task (one packet): make the payout code readable without changing behaviour
Code review (major, verified): the new money-moving code is minified into one-line statements with 1-space indentation and no JSDoc, against repo conventions. Reformat these files fully:
- `lib/payouts/amounts.mjs`, `lib/payouts/accounts.mjs`, `lib/payouts/transfers.mjs`, `lib/payouts/summary.mjs`, `lib/payouts/server.ts`
- the payout-related functions and edits in `lib/payments/webhook.mjs` (onRefundSeen, onTransferCreated, onTransferReversed, account.updated dispatch, second-secret verification) and the edits in `lib/jobs/jobs.mjs`, `lib/jobs/registry.mjs`
- `app/mentor/payouts/page.tsx`, `app/mentor/payouts/actions.ts`, the payout part of `app/mentor/page.tsx`
- `packages/ui/src/product/e04/PayoutSetupPrompt.tsx`, `PayoutSetupPrompt.stories.tsx`
- the additions in `tests/payments/fake-stripe.mjs` and `tests/e2e/fake-stripe-server.mjs`, and `tests/e2e/mentor-payouts.e2e.mjs`

Target style = neighbouring modules `lib/payments/refunds.mjs`, `lib/sessions/settle.mjs`, `tests/e2e/session-settlement.e2e.mjs`: 2-space indentation, one statement per line, multi-line SQL template strings, a Polish header comment per new module (what it does, which spec section), JSDoc with types on every exported function, short comments at the claim / re-check / take-over / key bump / remaining-lease / final take-over steps. Split `transferOne` in `transfers.mjs` into named helpers (claim, resolveExpiredLastAttempt, recheckUnderClaim, findExistingTransfer, createTransfer, writeSuccess, writeFailure). Keep every exported name and signature unchanged (tests import them).

Also add to `PayoutSetupPrompt.stories.tsx` stories: default; action returns `{ ok: false }` (play: click the button, expect the standard error alert); phone width (use the `phone` helper from `../../../.storybook/screens` as `MentorPayouts.stories.tsx` does).

Done when: `npm test` all pass (same count as before or more), `npm run lint` 0 errors, `npx tsc --noEmit` and `npm run typecheck:ui` pass. Report files changed and results.
