# Mentor accepts or declines a request; decline or no answer refunds automatically

Issue: #18 (E02-S02) · Epic: #9 · Depends on: #17 (spec `2026-10-19-prepaid-request-with-question.md`, incl. its email adapter), #24 refund operation (spec `2026-10-19-stripe-card-payment-refund-and-webhook.md`), #14 mentor sign-in (spec `2026-10-19-mentor-invitation-and-page-publishing.md`) · Consumed by: #20 (chat) · Risk: `risk-high` (money, data scoping)

## 📝 TLDR

After #17 a paid request sits in the database and the mentor has an email about it, but nobody can turn it into a session or give the money back. This spec proposes (future behavior) a mentor request list behind the existing mentor sign-in where the mentor reads the question, length and slot and clicks *Akceptuję* or *Odrzucam*; a decline refunds the developer in full at once, and a request still unanswered when its slot starts lapses and is refunded by a scheduled job — no ticket, same day (R09). The developer gets an email for each outcome. An accepted request is the booked session that #20 opens as a chat.

## Resolved assumptions (autonomous defaults)

> **2026-10-19 — owner confirmation:** Krzysztof Marczak confirmed every ⚠ item in this spec as written (chat: „Potwierdzam wszystkie decyzje ⚠ ze specyfikacji lekcji 05 tak, jak są zapisane”). Remaining ⚠ marks below are historical.

| # | Question | Chosen answer | Rationale | Flag |
|---|---|---|---|---|
| Q1 | What is "a session exists" after acceptance? | The `accepted` request **is** the booked session; `requests.id` is the id #20's chat uses; #20 owns every state after `accepted`. No `sessions` table here. | R05; a separate table would duplicate slot, parties and payment. | — (contract #20 must follow) |
| Q2 | How is the mentor told about a new request? | Email from #17's subscriber when the payment succeeds, plus a badge *N zapytań czeka na decyzję* on `/mentor`. Developer gets emails on accept, decline and lapse (this spec) through #17's adapter. The pilot export (D10) shows time to acceptance and lapse count per mentor, which is how A01 is measured. | Coordinator decision (A01); badge alone relies on the mentor opening the app. | — |
| Q3 | Deadline for the decision? | The slot start (R09). Accept and decline refused at or after `slot_start` by the DB clock; after that the request belongs to the lapse path. | No other window in the brief. | — |
| Q4 | Decline reason? | None collected; neutral message to the developer. | Free-text reasons to strangers invite disputes (Q05). | — |
| Q5 | How fast is a lapse refunded? | `lapseOverdue` runs on every jobs call (#24, every 5 min in the hosted pilot) → refund starts within ~5 min. | "Same day" with margin. | — |
| Q6 | Undo a decision? | No. Both buttons need a second click (*Na pewno?*). | Reversal needs a dispute path (Q05). | — |

## 📝 Problem Statement

Mentors agreed to paid text sessions on two conditions: they see who is asking and what before committing ("musiałbym widzieć, kto pyta", D02), and the platform handles money and no-shows (`[INTERVIEW]` 2026-09-03). Developers were promised a full refund the same day without a ticket when the mentor says no or stays silent (D05). Without this story every paid request is stuck forever.

## 👤 User stories

1. **Mentor decides.** Anna gets *Nowe opłacone pytanie od Kuby — 25 min, jutro 12:30* by email, opens the link between meetings, signs in if needed, and on `/mentor/requests/{id}` **sees** Kuba's name, *25 min*, *jutro 12:30–12:55* in her time zone, *Zdecyduj do jutra 12:30* and the full question. She **wants** to know if she has done this before — she has. *Akceptuję*, confirm; the **system** accepts only if the request still awaits her and the slot has not started, and **shows** *Zaakceptowane — sesja jutro 12:30 (czat tekstowy)*. **Next:** Kuba gets an email and his page shows the same; at 12:30 both open the chat (#20).
2. **Mentor declines.** A Kubernetes question; Anna clicks *Odrzucam*, confirms. The **system** marks it declined and records the refund intent in the same transaction, then asks Stripe. Anna **sees** *Odrzucone — deweloper dostaje pełny zwrot*. Kuba's page and email: *Mentor nie przyjmie tego pytania — zwrot 150 zł zlecony automatycznie*, later *Zwrot wykonany*.
3. **Nobody answers in time.** Anna is on holiday. At 12:30 the slot starts unanswered. Until the next job run both sides see *Termin minął — zwrot zostanie zlecony automatycznie*; the run lapses it and requests the refund; then Kuba sees and gets by email *Mentor nie odpowiedział przed terminem — zwrot zlecony*. Anna's list moves it to *Zakończone — przeterminowane*.
4. **Too late or already gone.** Anna clicks *Akceptuję* in an old tab on a request Kuba cancelled (#19) a minute ago. She **sees** *Nie można zaakceptować — deweloper anulował zapytanie*; nothing changes.

## 📝 Proposed Solution

- **Screens** under the #14 session: `/mentor/requests` (*Czeka na decyzję* by slot, *Zaakceptowane*, *Zakończone* — declined, lapsed, cancelled, last 30 days) and `/mentor/requests/[id]`. Never lists `awaiting_payment` / `payment_failed` (#17). Empty list → *Nie masz jeszcze zapytań — udostępnij swój link* with the share URL; load error → *Nie udało się wczytać zapytań — odśwież* (no partial data).
- **Transitions** (mentor id only from `getCurrentMentor()`): one conditional update per action — `WHERE id = $id AND mentor_id = $currentMentor AND status = 'awaiting_mentor' AND slot_start > now()`. PostgreSQL re-checks the `WHERE` after a blocked row lock, so accept, decline, cancel (#19) and lapse are mutually exclusive with no application locks.
- **Refusal code from a fresh read.** Zero rows updated → re-read the row **scoped by `mentor_id`** after the failed update and classify in this order: not found (or another mentor's) → `not_found`; status `cancelled` / `declined` / `lapsed` / `accepted` → that code; still `awaiting_mentor` with `slot_start <= now()` → `slot_started`.
- **Refunds** via #24: `requestRefund(tx, paymentId, reason)` inside the decline/lapse transaction, `executeRefund` after commit; retries are #24's. **Emails** via #17's `enqueueEmail` in the same transaction: `request_accepted`, `request_declined`, `request_lapsed` to `payments.payer_email`.
- **Lapse job** `requests.lapseOverdue` on #24's jobs endpoint: bounded batch, rows skipped if locked, overdue `awaiting_mentor` → `lapsed` + refund `lapsed` + email in one transaction; `executeRefund` after commit. Uses the DB clock (same as the accept guard); tests inject a timestamp. Correctness never depends on the job — only refund timing; #24's health endpoint goes `stale` after 30 min.
- **Refund wording follows the data:** *zwrot zlecony / w toku* only when `refund_status` is set; before that *Termin minął — zwrot zostanie zlecony automatycznie*.

Rejected: per-request timers (lost on restart); lazy lapse on page view (an unopened request would never refund).

## 📝 Data Model

No migration. Uses #17's `accepted` / `declined` / `lapsed` transitions (#17 transition-owner table) and `accepted_at`, `declined_at`, `lapsed_at`; refund state on `payments` (#24), reasons `mentor_declined`, `lapsed`.

## 📝 API Contracts

| Action | Effect | Refusal codes (state unchanged) |
|---|---|---|
| `acceptRequest(requestId)` | `awaiting_mentor` → `accepted`, `accepted_at`; email `request_accepted` | `not_found`, `cancelled`, `declined`, `lapsed`, `already_accepted`, `slot_started` |
| `declineRequest(requestId)` | → `declined`, `declined_at`; refund `mentor_declined`; email `request_declined` | `not_found`, `cancelled`, `lapsed`, `already_accepted`, `already_declined`, `slot_started` |
| Job `lapseOverdue()` | overdue `awaiting_mentor` → `lapsed`, `lapsed_at`; refund `lapsed`; email `request_lapsed` | — returns count |

`/r/{token}` (#17) gains: accepted (slot, *czat tekstowy*, R02), declined + refund status, overdue-not-yet-lapsed, lapsed + refund status.

**Contract for #20:** the chat is keyed by `requests.id` of an `accepted` request; #20 adds its own post-acceptance states and does not create a parallel session record.

## 📝 Edge Cases & Failure Scenarios

| Scenario | Outcome |
|---|---|
| Accept and lapse at the same instant | One update wins; accept loser re-reads and gets `lapsed` or `slot_started`. |
| Decline and developer's cancel (#19) at once | One wins; both use idempotent `requestRefund` → one refund. |
| Double click on *Odrzucam* | `already_declined`; one refund. |
| Mentor B guesses mentor A's request id | `not_found`, no data. |
| Stripe down at decline | Request `declined`; refund `requested`, retried by #24; *Zwrot w toku*. |
| Email provider down | Decision stands; #17's outbox retries. |
| Scheduler stopped | Accept impossible after slot start; both see *Termin minął — zwrot zostanie zlecony automatycznie*; health `stale` after 30 min. |
| Mentor session expired mid-decision | Refused as signed out; #14 sign-in. |
| Page unpublished / window removed after payment | Mentor can still decide (#17). |

## 📝 Risks & Impact Review

- **SDLC gates:** money (failure/retry/idempotency tests, second reviewer) and data scoping (one mentor cannot read or act on another's requests). `needs-qa`, no self-QA.
- **Irreversibility:** accept and decline cannot be undone; confirm click and consequence text (*Odrzucenie zwraca pieniądze deweloperowi*).
- **Privacy:** question only to its mentor; payer email never on mentor screens; no question text in emails (#17).

## 📝 Decisions in play

Relies on D02 / R05, D05 / R09, R02, D10 (pilot export measures A01). Leaves open Q05. Supersedes nothing. Owner: Krzysztof Marczak.

## 📋 Phasing

- **Phase 1 — Mentor sees and decides:** list, detail, accept, decline with refund and emails; developer page states; overdue display.
- **Phase 2 — Automatic lapse:** `lapseOverdue`. Phase 1 may merge alone but must not reach the pilot without Phase 2 (R09).

## 📋 Implementation Plan

**Phase 1**

1. **`lib/requests` mentor queries + transitions.** DB tests: list excludes `awaiting_payment` / `payment_failed`; mentor B gets `not_found` for mentor A's request in every status (isolation, no status leak); accept on `cancelled`, `declined`, `lapsed` refused with that code (AC negative); accept after `slot_start` → `slot_started`; decline → one refund `mentor_declined` + one email; decline twice → one Stripe refund call.
2. **Screens + badge.** Tests: signed-out access shows no request data; detail shows question, length and slot before any button (AC); badge counts only this mentor's `awaiting_mentor`; overdue request shows *Termin minął* without buttons; empty and error states.
3. **Developer page states** on `/r/{token}`. Tests: accepted state with the text-only label (AC, R02); overdue-not-lapsed shows *zostanie zlecony*, not *zlecony*; each refund state renders.

**Phase 2**

4. **`lapseOverdue`.** DB tests with an injected timestamp: overdue → `lapsed` + refund + email + `executeRefund` in the same run; `accepted` untouched; second run no-op; two concurrent runs lapse each row once; accept vs lapse and decline vs lapse on two connections → one winner, at most one refund.
5. **Docs/QA.** PR body: deploy both phases together; QA: accept, decline (Stripe test dashboard shows the refund; email in the log transport), lapse by moving a test request's `slot_start` into the past and calling the jobs endpoint.

## 🔍 Review & grill outcome

GPT review → grill log `reviews/2026-10-19-mentor-accepts-or-declines-request.grill.md`.

| GPT finding | Outcome | Why |
|---|---|---|
| Decision: notify the mentor? | **Accepted** | Coordinator decision: email on new paid request (#17); A01 measured via the pilot export (D10). |
| High: UI promises a refund before it is requested | **Accepted** | *Zlecony* only when `refund_status` is set; *zostanie zlecony* before the lapse job. |
| High: no-notification doesn't address A01 | **Accepted** | Emails to mentor and developer; badge kept as secondary. |
| Medium: session boundary vs #20 | **Accepted** | Request id is the session id; #20 owns post-accept states (contract section). |
| Medium: `slot_started` for every losing accept | **Accepted** | Code from a scoped re-read after the failed update, fixed classification order. |
| Low: SQL detail vs missing UI states | **Accepted** | CTE detail cut; empty-list and load-error states added. |

Grill decisions (8 questions, 0 ⚠): mentor + developer emails; A01 measured via export; #20 contract; refund wording tied to `refund_status`; refusal classification order; decline also refused after slot start; empty/error states; trimmed SQL detail.
