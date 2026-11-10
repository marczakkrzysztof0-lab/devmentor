You are an independent CODE reviewer with a fresh context. Work read-only (do not modify files, do not commit). Repository root = current working directory (DevMentor: Next.js 16, React 19, TS, PostgreSQL, Stripe test mode, node:test, Storybook DS `@devmentor/ui`).

## Subject
The uncommitted change in this worktree vs `origin/main`: run `git diff origin/main -- . ':(exclude)lekcja-21' ':(exclude).ai/agentic.config.json'` plus the untracked files from `git status --short` (new files: `lib/payouts/*`, `app/mentor/payouts/*`, `db/migrations/0009_mentor_payouts.sql`, `tests/db/payouts-*`, `tests/payouts/*`, `tests/e2e/mentor-payouts.e2e.mjs`, `packages/ui/src/product/e04/PayoutSetupPrompt*`, `.ai/specs/2026-11-09-mentor-payouts.md`). Read new files in full.

## What it must implement
- Approved spec: `.ai/specs/2026-11-09-mentor-payouts.md` (ignore its "Spec review log"). Its Rules, Open-questions defaults, Data model, Job, Webhook, Access control and "Edge cases → tests" table are the acceptance criteria.
- Brief: `lekcja-21/prompt-e04-wyplaty.md` (rules 1–5, requirements, edge cases, tests that must be added, out of scope).

## Repo rules
`AGENTS.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`, `SDLC.md`, `db/AGENTS.md`, `docs/design-system.md`, `packages/ui/AGENTS.md`, `.ai/specs/product-brief.md`. Next.js 16 docs in `node_modules/next/dist/docs/`.

## Validation evidence supplied by the orchestrator (you may re-run read-only checks; DB tests need Postgres on localhost)
- `npm run lint`: exit 0.
- `npm test`: 745 tests, 745 pass, 0 fail.
- `npm run build` (NEXT_PUBLIC_APP_URL=http://localhost:3000): success; route `/mentor/payouts` present.
- `npm run typecheck:ui`: pass. `npm run check:tokens`: OK. `npm run size`: within limits.
- `npm run test:storybook:themes` / `test:storybook`: NOT RUN locally — vitest browser server cannot bind a localhost port on this Windows machine (`listen EACCES ::1:<port>`), environment issue; CI job `storybook` will run it.
- `npm run test:e2e -- tests/e2e/mentor-payouts.e2e.mjs tests/e2e/session-settlement.e2e.mjs`: 2 tests, 1 pass, 1 FAIL — mentor-payouts.e2e.mjs: `AssertionError: The input did not match the regular expression /135 zł/` on `/mentor/payouts` text, which showed: 'Wypłaty gotowe … Konfiguracja na stronie Stripe zakończona … Do wypłaty 0 zł … Wypłacone do tej pory …'.

## Review rubric (om-code-review)
Correctness vs spec/brief (every rule and edge case implemented AND covered by a test that would fail without it); money safety (exactly-once transfer, idempotency key rules, claims/leases, refunds never paid, integer math); security (mentor id only from session, data scoping, webhook signature, secrets); data integrity & backward compatibility (migration up/down, constraints, protected surfaces); concurrency; tests (risk-high: failure, retry, idempotency, two-account access control evidence); Next.js 16 / Server Components / Suspense; design system & Polish UI copy; readability/conventions of the repo (formatting, comments style, JSDoc as in neighbouring modules).

Severity: blocker (gate red, money loss/double payout, security hole, broken contract, missing risk-high evidence), major (realistic bug, missing required test, spec rule not implemented, unreadable code that hides bugs), minor (convention, clarity), nit.

Report only evidence-backed problems; cite file and line you read. No praise, no restating.

## Output
Return ONLY a JSON object (no markdown fences, no prose):
{"verdict":"approve"|"request_changes","findings":[{"id":"F1","severity":"blocker|major|minor|nit","file":"path","line":<number or null>,"claim":"one sentence","evidence":"what you read/ran","fix":"concrete change"}]}
