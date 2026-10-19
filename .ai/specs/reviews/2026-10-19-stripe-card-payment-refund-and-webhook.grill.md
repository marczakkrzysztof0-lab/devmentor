# Grill log: Stripe card payment, refund operation and payment webhook (#24)

Method: grill-me (decision tree, worked in rounds; each round asks the whole frontier; each question carries a recommended answer worded so "yes" accepts it). Facts were looked up in the repo, the brief and the 2026-10-19 specs, not asked. Owner: Krzysztof Marczak — not available live; blanket instruction on 2026-10-19 ("akceptuję wszystko", "zrób wszystko za mnie") applied as "yes" to each recommendation, except where it would answer an open brief question or override a product rule, security or data scoping (⚠).

Inputs: spec, `reviews/…review-gpt.md` (verdict *revise*, 1 critical), brief D04/D05/D11, R08/R09/R11/R15, Q01/Q02/Q05, coordinator's shared decisions (migration 0005, email adapter owned by #17).

## Decision tree (top level)

1. Refund concurrency model → 2. idempotency keys → 3. retry / pending / failure handling.
1. Checkout terminal-state authority → 2. ambiguous create errors → 3. return-page binding → 4. webhook correlation.
Config: currency, commission, cron secret, scheduler.

## Round 1 — frontier

| # | Question (recommended answer) | Outcome |
|---|---|---|
| Q1 | A DB row lock cannot cover the Stripe HTTP call. Replace `FOR UPDATE SKIP LOCKED` with a **committed lease claim** (`refund_attempts + 1`, `refund_lease_until = now() + 5 min`), then adopt-existing → create → result write guarded by the attempt number? | Accepted on owner's blanket yes, 2026-10-19 |
| Q2 | Keep **per-attempt** idempotency keys `refund:<paymentId>:<attempt>`, with the SDK's network retries (`maxNetworkRetries: 2`, 20 s timeout) reusing the key inside one attempt, and rely on Stripe refusing an over-refund as the final backstop? | Accepted on owner's blanket yes, 2026-10-19 |
| Q3 | Write local `expired` **only after Stripe confirms** (expired event, retrieve, or our `sessions.expire`), and let reconciliation call `expire` at `checkout_expires_at + 1 min` (Stripe returns *complete* if the mentee paid)? | Accepted on owner's blanket yes, 2026-10-19 |
| Q4 | On `openCheckout` errors: definitive 4xx → `expired`; timeout / network / 5xx / 409 / 429 → keep `pending`, `CheckoutFailed{retryable}`; any retry reuses `checkout:<paymentId>` to recover a session Stripe already created? | Accepted on owner's blanket yes, 2026-10-19 |
| Q5 | Change `syncCheckout(sessionId)` to `syncCheckout(paymentId, sessionId)` and ignore a session whose id, `metadata.payment_id`, amount or currency does not match? | Accepted on owner's blanket yes, 2026-10-19 |
| Q6 | Refund still failing after 24 h → terminal `failed`, logged, counted in `GET /api/internal/jobs` for an uptime monitor, fixed by hand in Stripe — no operator re-queue tool in 1.0? | ⚠ needs human — technical part applied; who handles it is brief Q05 |
| Q7 | Currency: caller passes `mentor_pages.currency` (default `PLN`); `PAYMENT_CURRENCIES` only an allowlist? | ⚠ needs human — answers brief Q02 (applied as provisional default) |
| Q8 | Commission: keep env `PLATFORM_COMMISSION_BPS` snapshot, placeholder 1000 bps, unused in E02? | ⚠ needs human — answers brief Q01 (placeholder only) |

## Round 2 — frontier (unlocked by Q1–Q5)

| # | Question (recommended answer) | Outcome |
|---|---|---|
| Q9 | Refunds Stripe reports as `pending`: retry job retrieves those older than 1 h and applies the final status? | Accepted on owner's blanket yes, 2026-10-19 |
| Q10 | Webhook correlation: checkout events by stored session id + metadata; refund/charge events via `payment_intent`; `charge.refunded` finalizes only when the full amount is refunded; unknown/ambiguous → log, 200, no change? | Accepted on owner's blanket yes, 2026-10-19 |
| Q11 | `refund_last_error` stores Stripe error code + request id only, never the message? | Accepted on owner's blanket yes, 2026-10-19 |
| Q12 | `CRON_SECRET` ≥ 32 chars (else 503), constant-time compare, each job batch 50 with a 25 s budget; scheduler chosen together with hosting (foundation spec Q8), called every 5 min? | Accepted on owner's blanket yes, 2026-10-19 |
| Q13 | Trim `job_runs` to `last_run_at` + `last_error` and keep tests only for money/contract guarantees? | Accepted on owner's blanket yes, 2026-10-19 |

## Round 3 — frontier

| # | Question (recommended answer) | Outcome |
|---|---|---|
| Q14 | The payments module sends no email; developer refund emails come from #17's `refund.succeeded` subscriber through #17's email adapter, using `payments.payer_email`? | Accepted on owner's blanket yes, 2026-10-19 |

Frontier empty. Totals: 14 questions, 11 accepted, 3 ⚠ (Q6 → Q05, Q7 → Q02, Q8 → Q01); the spec also keeps its pre-existing ⚠ Q6 fees and Q7 disputes (both Q05/Q01).
