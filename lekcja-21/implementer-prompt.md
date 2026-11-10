You are the single IMPLEMENTER of one feature in this repository (DevMentor: Next.js 16, React 19, TypeScript, Tailwind 4, PostgreSQL 17 in Docker, node:test, Storybook design system `@devmentor/ui`, Stripe **test mode only**). Repository root = current working directory (`C:\Users\KMarczak\projekty\devmentor-l21`, branch `lekcja-21-multi-model`). Windows + Git Bash.

## What to build
Implement exactly the approved specification `.ai/specs/2026-11-09-mentor-payouts.md` (sections Rules, Open questions defaults, Data model, Architecture, Onboarding, Account state sync, Payout job, Webhook handlers, API contracts, Access control, Edge cases → tests, Fakes, Tests to add, Docs to update, Implementation plan). The original brief is `lekcja-21/prompt-e04-wyplaty.md` (requirements, edge cases, tests, out of scope). Where the spec and the brief differ, the spec wins (its "Open questions" table records every decided deviation). Ignore the "Spec review log" section.

## Repository rules (read before coding)
`AGENTS.md` (hard rules: never read/print `.env`/`.env.local`; UI copy Polish, gender-neutral; access control proven with two accounts), `db/AGENTS.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`, `SDLC.md`, `docs/design-system.md`, `packages/ui/AGENTS.md`. Next.js 16 differs from your training data: check `node_modules/next/dist/docs/` before using Next APIs (cacheComponents is on: request-time data behind `<Suspense>`, `connection()`; Server Components by default).

## Files to create / change (from the spec)
- `db/migrations/0009_mentor_payouts.sql` (up + down), `tests/db/migrations.test.mjs` (add 0009 and its tables).
- `lib/payouts/amounts.mjs`, `accounts.mjs`, `transfers.mjs`, `summary.mjs`, `server.ts`.
- `lib/payments/webhook.mjs` (new events, `refund_seen_at` hook, second secret), `lib/payments/config.mjs` (optional `connectWebhookSecret`), `lib/jobs/registry.mjs` (`payouts.transferOwed`), `lib/jobs/jobs.mjs` (`failedPayouts`, `payoutsNeedingAttention`).
- `app/mentor/payouts/page.tsx` + `actions.ts`, `app/mentor/page.tsx` (prompt / status line).
- `packages/ui/src/product/e04/MentorPayouts.tsx` (finalize), new `PayoutSetupPrompt.tsx`, stories, export from `packages/ui/src/product/index.ts`.
- Fakes: `tests/payments/fake-stripe.mjs`, `tests/e2e/fake-stripe-server.mjs` (as in spec "Fakes").
- Tests: `tests/payouts/amounts.test.mjs`, `tests/db/payouts-*.test.mjs`, `tests/e2e/mentor-payouts.e2e.mjs` (next to `tests/e2e/session-settlement.e2e.mjs`; screenshots when `E2E_SCREENSHOT_DIR` set).
- Docs: `README.md`, `.env.example` (commented placeholder only), `BACKWARD_COMPATIBILITY.md`, `track.md` if it lists built stories.
Reuse existing patterns: `lib/payments/refunds.mjs` (claim/lease/guarded write), `lib/sessions/settle.mjs` (job), `lib/requests/mentor-area.ts` (server-only DAL with `getCurrentMentor()`), `tests/db/harness.mjs` (`describeDb`), `tests/requests/fixtures.mjs`, `tests/db/session-settle.test.mjs`, `tests/e2e/session-settlement.e2e.mjs`.

## Constraints
- No new npm dependencies. No real Stripe keys, no live mode, no network calls except localhost. Never print secrets.
- Money: integers in grosze only, no floating point.
- Do not commit, push or change git config. Do not touch files outside this worktree.
- Out of scope (do not do): commission value decisions, refund/dispute rule changes, operator dashboard flows, own bank-detail forms, unrelated refactors.

## Environment
- Postgres: Docker Desktop is running. `npm run setup` (docker compose + `.env.local` + migrations) if the DB is not up; `npm run db:migrate` after adding the migration. DB tests use disposable schemas via `describeDb`.
- In Git Bash `npm` works; in PowerShell use `npm.cmd`.

## Done when (run them yourself and fix until green)
1. `npm run lint` — 0 errors.
2. `npm test` — all pass (incl. the new unit and DB tests).
3. `npm run build` (set `NEXT_PUBLIC_APP_URL=http://localhost:3000`).
4. `npm run typecheck:ui`, `npm run check:tokens`, `npm run test:storybook:themes` (Storybook stories as tests; install Playwright chromium only if missing).
5. `npm run test:e2e -- tests/e2e/mentor-payouts.e2e.mjs tests/e2e/session-settlement.e2e.mjs` (after build).
Finish with a short report: files changed, test counts per command, anything not done and why, any place where you had to deviate from the spec (with reason).
