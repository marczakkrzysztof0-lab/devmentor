You are an independent reviewer of a FEATURE SPECIFICATION (not code) in this repository (DevMentor: Next.js 16, React 19, TS, PostgreSQL, Stripe test mode, node:test). You have a fresh context. Work read-only.

## Subject
- Spec under review: `.ai/specs/2026-11-09-mentor-payouts.md`
- Brief it must satisfy (source of requirements, rules, edge cases, tests, out-of-scope): `lekcja-21/prompt-e04-wyplaty.md`
- Issues: #22 and #25 are summarised in the brief and the spec.

## Repository rules to check against (read them)
`AGENTS.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`, `SDLC.md`, `db/AGENTS.md`, `docs/design-system.md`, `.ai/specs/product-brief.md` (D07, D12, R09, R13, R15, Q01, Q05).
Verify claims about existing code by reading it: `lib/payments/*` (webhook.mjs, refunds.mjs, payments.mjs, config.mjs, stripe-client.mjs), `lib/jobs/*`, `lib/sessions/settle.mjs`, `lib/requests/*`, `db/migrations/0005_payments.sql`, `0006_requests.sql`, `0008_session_outcomes.sql`, `app/mentor/*`, `app/api/webhooks/stripe/route.ts`, `packages/ui/src/product/e04/*`, `packages/ui/src/product/shared/HostedRedirect.tsx`, `tests/payments/fake-stripe.mjs`, `tests/e2e/fake-stripe-server.mjs`, `tests/db/migrations.test.mjs`.

## Review criteria (om-code-review rubric applied to a spec)
1. Correctness vs. the brief: every rule (1–5), requirement (1–6), edge case and required test from the brief is covered and not contradicted; nothing out of scope is added.
2. Money safety: exactly-once transfer, idempotency, concurrency (row locks / guarded updates), retries with bounded attempts, refunds never paid out, integer-only money math, rounding.
3. Security / access control: mentor id only from the session, no cross-mentor reads/writes, webhook signature verification, secrets hygiene, test mode only.
4. Data integrity and backward compatibility: migration additive with up/down, constraints sound, protected surfaces in BACKWARD_COMPATIBILITY.md handled.
5. Consistency with existing code and Stripe API semantics (Connect Express, account links, transfers, idempotency keys, account.updated delivery). Flag factual errors about the existing code.
6. Testability: each rule and edge case maps to a concrete test.
7. Repo conventions (Next.js 16 cacheComponents/Suspense, Server Components default, design system, Polish UI rule vs brief).

Severity: blocker (money loss / double payout / security hole / contradicts brief or protected contract), major (realistic correctness gap, missing required test, wrong API semantics), minor (convention, clarity), nit.

Report only real, evidence-backed problems in the spec. Cite the spec section and, for claims about code, the file and line you read. Do not praise, do not restate the spec.

## Output
Return ONLY a JSON object (no markdown fences, no prose around it):
{"verdict":"approve"|"request_changes","findings":[{"id":"F1","severity":"blocker|major|minor|nit","file":"path","line":<number or null>,"claim":"one sentence problem","evidence":"what you read that proves it","fix":"concrete change to the spec"}]}
