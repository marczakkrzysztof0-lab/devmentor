# When someone does not show, money goes where the rules say, automatically

Issue: #21 (E03-S02) · Epic: #10 · Depends on: #20 chat and its `session_messages` timestamps (spec `2026-10-30-live-text-session-chat.md`), #24 refund operation (spec `2026-10-19-stripe-card-payment-refund-and-webhook.md`), #18 jobs pattern `lapseOverdue` · Consumed by: #22 payouts (which sessions earned the mentor money) · Risk: `risk-high` (money, schema migration)

## 📝 TLDR

After #20 a session can be held, but when its slot ends nothing happens: the request stays `accepted` forever and the money sits on the platform. This spec proposes (future behavior) a scheduled job that, within minutes of every slot end, reads who posted in the chat during the slot and settles the session by R15: the mentor posted nothing → the mentor's no-show and a full automatic refund (also when neither posted, D11); only the mentor posted → the developer's no-show, the mentor keeps the payment; both posted → held. Both parties see the outcome on their pages and the developer gets an email.

## Resolved assumptions (autonomous defaults)

> Autonomous run 2026-10-30 (lesson 11). Every ⚠ item is collected for Krzysztof Marczak in `2026-10-30-e03-decisions-for-review.md`; the spec is built on the recommendation until he overrides it.

| # | Question | Chosen answer | Rationale | Flag |
|---|---|---|---|---|
| Q1 | What counts as "posted during the slot"? | At least one stored message by that party with `created_at` in `[slot_start, slot_end)`. Any content, even *cześć*. | #20 only accepts posts inside the slot, so every stored message counts; judging content would need a human (no dispute owner, Q05). | ⚠ NEEDS HUMAN CONFIRMATION |
| Q2 | How are outcomes stored? | Three new terminal request statuses `held`, `mentee_no_show`, `mentor_no_show` + `settled_at` (migration 0008 replaces `requests_status_known`). Refund reason `mentor_no_show` already exists in 0005. | One state machine on `requests` (contract from 0006); #22 reads earned sessions from status, no join over messages. | — |
| Q3 | When does settlement run? | Job `sessions.settleEnded` on every jobs call (#24, every 5 min hosted; `npm run jobs` locally), for `accepted` requests with `slot_end <= now()`. No grace minutes after the slot. | „Same day” (R09) with margin; same pattern and health monitoring as `lapseOverdue`; grace would contradict Q2 of #20 (posts close at `slot_end`). | ⚠ NEEDS HUMAN CONFIRMATION |
| Q4 | Who is told? | Developer email for `mentor_no_show` (*zwrot zlecony*) and `mentee_no_show` (*płatność zostaje u mentora*, with the rule). No email for `held`. No emails to the mentor; the mentor sees the outcome in the request list. | Developer's money moves in both no-show cases; the mentor email path does not exist yet (#17 only sends new-request mail) and the mentor knows whether they wrote. | ⚠ NEEDS HUMAN CONFIRMATION |
| Q5 | Can the mentor cancel an accepted session? | No new action. A mentor who cannot come simply does not post — the session settles as the mentor's no-show and refunds automatically. | R11 closes developer cancellation after acceptance; R09/R15 already refund a mentor no-show; no new money path. | ⚠ NEEDS HUMAN CONFIRMATION |
| Q6 | Disputes („the mentor only said hi”, „I was there but the page did not load”) | No in-product dispute. Handled by hand in the Stripe dashboard (D12, Q05 partly answered); outcomes are final in the app. | No dispute owner yet (Q05); an appeal flow is new scope. | ⚠ NEEDS HUMAN CONFIRMATION |
| Q7 | Between slot end and settlement | Both pages show *Sesja zakończona — rozliczamy (zwykle do kilku minut)*; no money wording until the status is set. `session_ended` is only a derived view state (`accepted` + `slot_end <= now`), never stored. | Same "follow the data" rule as #18's *zostanie zlecony*. | — |
| Q8 | How long do both parties see the outcome and the chat? (review) | Same as #20 Q3/Q10: the developer while `/r/{token}` is valid (30 days after the slot), the mentor while the request is on their list (settled sessions stay in *Zakończone* for 30 days after `settled_at`, then only via the detail URL). | One retention rule for chat and outcome; the asymmetry (the mentor keeps the detail URL) is the same as for declined/lapsed requests in #18. | ⚠ NEEDS HUMAN CONFIRMATION |

## 📝 Problem Statement

Two of three senior engineers interviewed would take paid text sessions only „if the platform handles money and no-shows” (`[INTERVIEW]` 2026-08-22, 2026-09-03 ×2); developers were promised a full refund the same day without a ticket when the mentor does not show (D05, R09). D11/R15 fixed the remaining conflict: when neither posts, it is the mentor's no-show. Without this story every accepted session ends in limbo: the developer never learns whether money comes back and #22 cannot know what the mentor earned.

## 👤 User stories

1. **Mentor did not come.** Kuba writes at 12:31 and 12:40; Anna writes nothing. At 12:55 the slot ends; Kuba's page: *Sesja zakończona — rozliczamy*. At the next job run (≤ 5 min) the **system** sets `mentor_no_show`, records refund `mentor_no_show` and the email in one transaction, then asks Stripe. Kuba **sees** *Brak wiadomości od mentora w czasie sesji — zwrot 150 zł zlecony automatycznie*, later *Zwrot wykonany*; same in the email. Anna's list: *Zakończone — brak Twojej wiadomości (zwrot dla dewelopera)*.
2. **Developer did not come.** Anna writes at 12:30 and 12:35, Kuba nothing. Settled `mentee_no_show`; no refund. Kuba **sees** *Brak Twojej wiadomości w czasie sesji — zgodnie z zasadami płatność zostaje u mentora* and the email says the same with the rule; Anna: *Zakończone — brak wiadomości od dewelopera (płatność zostaje)*.
3. **Nobody wrote.** Neither posts. Settled `mentor_no_show` (D11) → full refund, as story 1.
4. **Held.** Both wrote. Settled `held`; *Sesja odbyta*; no refund, no email.

## 📝 Proposed Solution

- **Rule** (pure function `settlementOutcome({ mentorPosted, menteePosted })`): `!mentorPosted` → `mentor_no_show`; `mentorPosted && !menteePosted` → `mentee_no_show`; both → `held`. Exhaustive table test, exactly R15 + D11.
- **Job `sessions.settleEnded`** in `lib/jobs/registry.mjs`, after `requests.lapseOverdue` and before `payments.retryRefunds` / `email.sendDue` (so the same run retries a failed refund and sends the email). Bounded batch ≤ `limit`, within the jobs budget. Each session in its own transaction:
  1. pick the oldest ended `accepted` request `FOR UPDATE SKIP LOCKED` (a row locked by a #20 post in flight is skipped this run and settled next run — never settled with a missing message);
  2. `exists` per author over `session_messages` in `[slot_start, slot_end)`;
  3. guarded update `WHERE id = $1 AND status = 'accepted'` → outcome status + `settled_at`;
  4. `mentor_no_show` → `requestRefund(tx, paymentId, 'mentor_no_show')` (#24, idempotent); email per Q4 via `enqueueEmail`;
  5. after commit `executeRefund` (failure → retried by `payments.retryRefunds`; 24 h → `failed`, health counter, manual per Q05).
- **Errors in a run:** a database or outbox error inside one session's transaction rolls back that session only (nothing half-settled) and ends the run with the error recorded in `job_runs.last_error` (#24); the next run retries from the oldest unsettled session. Sessions already committed in the run stay settled and their refunds are already requested. (Skipping the failing row and continuing would loop on the same oldest row; this matches `lapseOverdue`.)
- **Only through the existing jobs endpoint:** the job is added to `lib/jobs/registry.mjs` and runs only through `POST /api/internal/jobs` (`Bearer CRON_SECRET`, #24) or `npm run jobs`; no new route.
- **Refund that finally fails (R09 not met automatically):** after #24 gives up (24 h, or a dispute) the payment is `refund_status = 'failed'`; the developer's page says *Zwrot nie powiódł się — napisz do nas* (the existing #24/E02 wording and `refund_failed` email: „Odpowiedz na tę wiadomość — zwrot dokończymy ręcznie”); the failure is counted in the jobs health (`failedRefunds`) for the founders, who refund by hand in Stripe (D12). Owner of that queue: open (Q05). The page never shows *zwrot wykonany* unless `refund_status = 'succeeded'`.
- **Database clock** for "ended" (as #18's lapse); tests inject `now`.
- **Read paths:** `/r/{token}` shows the outcome above the read-only chat (#20) with refund status from `payments.refund_status` (*zlecony*, *w toku*, *wykonany*, *nie powiódł się — skontaktujemy się*); the mentor list moves settled sessions to *Zakończone* with the outcome label; `accepted` past `slot_end` shows *Sesja zakończona — rozliczamy*.

Rejected: settling on page view (an unopened page never refunds — same reason as #18); timers per session (lost on restart); counting only „substantive” messages (needs human judgment, Q05); partial refunds (no rule in the brief).

## 📝 Architecture

- `lib/sessions/settle.mjs` (rule + one-row settle in the caller's transaction + job) next to #20's `messages.mjs`; job registered in `lib/jobs/registry.mjs` — reuses `withTransaction`, `requestRefund` / `executeRefundAfterCommit` (#18 `decision.mjs`), `enqueueEmail`, `requestEmailContext`.
- Locking with #20: posts hold `FOR UPDATE` on the request row; settlement takes the same row with `SKIP LOCKED`. A message is therefore either committed before the settlement reads `session_messages` or refused as `closed`.
- `lib/requests/view.mjs` `viewStatus` gains `session_ended` (accepted, `slot_end <= now`) and the three outcomes; DS `RequestStatusView` and the mentor list get the labels.
- **Contract for #22:** money earned by the mentor = payments of requests in `held` or `mentee_no_show` (no refund on them); `mentor_no_show` is always refunded.

## 📝 Data Model

Migration `0008_session_outcomes`:
- `requests.settled_at timestamptz` (NULL until settled).
- Replace `requests_status_known` with the 0006 list + `held`, `mentee_no_show`, `mentor_no_show`.
- New CHECK `requests_settled_has_time`: `(status IN ('held','mentee_no_show','mentor_no_show')) = (settled_at IS NOT NULL)`.
- New partial index `requests_accepted_slot_end_idx ON requests (slot_end) WHERE status = 'accepted'` (job scan).
- `requests_mentor_slot_holding_idx` unchanged (settled sessions are in the past; they no longer hold anything).
- Down: refuses (RAISE) when any row is in a new status — dev/test only, like 0005/0006; otherwise restores the old CHECK and drops the column and index.

## 📝 API Contracts

| Call | Effect | Notes |
|---|---|---|
| `settlementOutcome({ mentorPosted, menteePosted })` | → `held` \| `mentee_no_show` \| `mentor_no_show` | pure |
| `settleOneInTx(tx, { at, stamp })` | settles the oldest ended `accepted` session; returns `{ requestId, paymentId, outcome }` or `null` | refund + email in the same tx |
| Job `settleEnded(deps, { limit, deadline })` | loops `settleOneInTx`, `executeRefund` after each commit | returns `{ settled, held, menteeNoShow, mentorNoShow }` |
| Emails | `session_mentor_no_show` (amount, mentor name, when; the `/r/` link is not stored — only its hash — so the email points to the confirmation email, as #18 does), `session_mentee_no_show` (mentor name, when, the rule) | no message content, no question (R04) |

`/r/{token}` statuses: `session_ended`, `held`, `mentee_no_show`, `mentor_no_show` (+ refund status). Mentor list labels for the same.

## 📝 Edge Cases & Failure Scenarios

| Scenario | Outcome |
|---|---|
| Two job runs at once | `SKIP LOCKED` + guarded update → each session settled once; `requestRefund` idempotent → one refund. |
| Post in flight at `slot_end` | Row locked → skipped this run, settled next run with the message counted (or the post got `closed`). |
| Stripe down | Status set, refund `requested`, retried by #24; page *Zwrot w toku*. |
| Refund failing 24 h / disputed payment | #24 → `failed`, health `failedRefunds`, manual in Stripe (Q05); page *Zwrot nie powiódł się — napisz do nas* (the existing #24/E02 wording and `refund_failed` email: „Odpowiedz na tę wiadomość — zwrot dokończymy ręcznie”). |
| DB error while settling one session | That session rolled back; run ends with `last_error`; next run retries; earlier sessions of the run stay settled. |
| Scheduler stopped | Pages show *Sesja zakończona — rozliczamy*; health `stale` after 30 min; nothing settles until it runs (correctness kept, timing lost). |
| Email provider down | Outcome stands; outbox retries (#17). |
| Mentor wrote one word, left | `held` if the developer also wrote, else `mentee_no_show` — by rule (Q1); disputes manual (Q6). |
| Clock / DST | All comparisons in `timestamptz` on the DB clock. |
| Request accepted before #20 deployed, slot already over | Settled by the first run: no messages → `mentor_no_show` → refund. Release note: deploy #20 and #21 together, or settle before any real session (pilot not started). |

## 📝 Risks & Impact Review

- **SDLC gates (money, migration):** failure, retry and idempotency tests (two concurrent runs, re-run, Stripe error); second reviewer; up/down migration test; rollback plan in the PR body (revert the job registration first — sessions then simply stay `accepted`; the down migration refuses once outcomes exist). `needs-qa`, no self-QA.
- **Irreversible money moves:** a refund cannot be undone in the app; a wrongly kept payment is fixed by hand in Stripe (Q05). The rule is mechanical so both parties can predict it; pages state it before the slot (#20 notice extended: *Jeśli mentor nie napisze nic w czasie sesji, dostajesz pełny zwrot*).
- **Product risk (gaming):** a mentor can keep the money with one message when the developer is absent — that is R15 as decided; the pilot export can show `mentee_no_show` rates per mentor.

## 📝 Decisions in play

Implements D05 / R09, D11 / R15 (R10 superseded). Relies on R11 (no developer cancellation after acceptance), D12 (manual disputes in Stripe). Leaves open Q01 (commission — not applied here; #22 reads `commission_bps`), Q05. Supersedes nothing. Owner: Krzysztof Marczak.

## 📋 Phasing

- **Phase 1 — Settlement:** migration, rule, job, emails, page states. Depends on #20 being merged (stacked PR).

## 📋 Implementation Plan

1. **Migration 0008 + rule.** Tests: up/down/up; CHECK `settled_has_time`; down refuses with settled rows; `settlementOutcome` table (4 cases, AC 1–4).
2. **`settleOneInTx` + `settleEnded` + registry.** Registry test: `sessions.settleEnded` registered after `requests.lapseOverdue` and before `payments.retryRefunds` / `email.sendDue` (runs only through the authorized jobs endpoint — no new route). DB tests with injected time and fake Stripe (as E02): developer-only posts → `mentor_no_show` + one refund `mentor_no_show` + email (AC 1); mentor-only → `mentee_no_show`, no refund (AC 2); none → `mentor_no_show` + refund (AC 3); both → `held`, no refund (AC 4); message outside the slot ignored; not-yet-ended untouched; second run no-op; two concurrent runs → one settlement, one Stripe refund call; row locked by a post → skipped; Stripe error → refund retried by `retryRefunds`.
3. **Pages + DS labels + emails.** `/r/{token}` and mentor list/detail for `session_ended` and each outcome with each refund status; DS stories; email templates without content.
4. **E2E.** Fake Stripe; accepted session with slot moved by SQL; developer posts only → jobs endpoint → page shows refund (screenshot); mentor posts only → kept; held.
5. **Docs.** README (job), `BACKWARD_COMPATIBILITY.md` (statuses, #22 contract), run plan.

## 🔍 Review outcome

Codex (GPT) review → `reviews/2026-10-30-no-show-settlement.review-gpt.md` (verdict: revise).

| Finding | Outcome | Why / change |
|---|---|---|
| Decision: confirm Q1–Q6 defaults | **Collected** | All ⚠ items are in `2026-10-30-e03-decisions-for-review.md` for Krzysztof Marczak. |
| High: access period to chat/outcome differs | **Accepted as ⚠** | Q8: one rule with #20 Q3/Q10, asymmetry named. |
| High: refund that ends `failed` | **Accepted** | Page copy and founders' path written (health counter, manual Stripe refund, owner Q05); *wykonany* only on `succeeded`. |
| Medium: jobs endpoint authorization | **Accepted** | Only the existing `POST /api/internal/jobs`; registry order test. |
| Medium: partial failure within a run | **Accepted** | Per-session transaction; error ends the run with `last_error`, next run retries (same as `lapseOverdue`). |
| Low: `session_ended` integrity | **Accepted** | Derived only; `requests_settled_has_time` keeps `accepted` ⇒ `settled_at IS NULL`. |
