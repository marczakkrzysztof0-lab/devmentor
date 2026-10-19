# Developer cancels for a full refund until the mentor accepts

Issue: #19 (E02-S03) · Epic: #9 · Depends on: #17 (spec `2026-10-19-prepaid-request-with-question.md`), #18 (shared transition guard), #24 refund operation (spec `2026-10-19-stripe-card-payment-refund-and-webhook.md`) · Risk: `risk-high` (money)

## 📝 TLDR

After paying (#17) a developer whose problem solved itself, or who picked the wrong mentor, has no way out except waiting for a decline or a lapse. This spec proposes (future behavior) a *Anuluj i odzyskaj pieniądze* button on the developer's private request page that works for as long as the mentor has not accepted (D05, R11): it cancels the request, removes it from the mentor's open list and refunds the full amount automatically. Once the mentor has accepted, the button is gone and the page explains why. A cancel racing an accept, decline or lapse resolves to exactly one outcome and at most one refund.

## Resolved assumptions (autonomous defaults)

> **2026-10-19 — owner confirmation:** Krzysztof Marczak confirmed every ⚠ item in this spec as written (chat: „Potwierdzam wszystkie decyzje ⚠ ze specyfikacji lekcji 05 tak, jak są zapisane”). Remaining ⚠ marks below are historical.

| # | Question | Chosen answer | Rationale | Flag |
|---|---|---|---|---|
| Q1 | Who may cancel? | Whoever holds the `/r/{token}` link (#17 token contract). | The developer's only credential in 1.0. | ⚠ via #17 Q1 (guest vs account) |
| Q2 | Cancel while the payment is still pending? | Not offered: abandoning Stripe is the cancel (#17). Button only in `awaiting_mentor`. | Nothing to refund; no cancel/payment race. | — |
| Q3 | Until when? | **Any time the request is `awaiting_mentor`** — no slot-time guard. After slot start the mentor can no longer accept (#18), so cancel and lapse both end in a full refund; whichever commits first sets the reason. | D05 / R11: "until the mentor accepts" (coordinator decision). | — |
| Q4 | Who is told? | The mentor's list moves it to *Zakończone — anulowane przez dewelopera*; no email for the cancel itself. The developer gets #17's refund-done / refund-failed email. | AC: "the mentor no longer sees it as open"; the developer just acted. | — |
| Q5 | Cancel after acceptance? | No action, no refund (R11). The page says the session stands and a no-show follows #21's rules. | R11 explicit; partial refunds need a dispute owner (Q05). | — |

## 📝 Problem Statement

Developers prepay for help with a blocker that may resolve before the mentor answers. D05 chose "free cancel until the mentor accepts, none after" over Preply's 12-hour window because sessions are short-notice and a mentor who committed to a slot must not be left unpaid. The rule is trustworthy only if the boundary is exact: a developer never loses money by cancelling a split second before an accept, and never gets a refund for a session the mentor already committed to.

## 👤 User stories

1. **Problem solved itself.** Kuba paid at 9:00 for a 12:30 slot; at 10:15 a colleague fixes the bug. He opens his `/r/…` link (from the confirmation email) and **sees** *Czeka na mentora*, a button *Anuluj i odzyskaj 150 zł* and *Możesz anulować, dopóki mentor nie zaakceptuje*. He **wants** his money back, clicks, confirms (*Na pewno? Mentor nie zobaczy już tego pytania*). The **system** cancels only if the request still awaits the mentor, records the refund intent in the same transaction and asks Stripe. He **sees** *Anulowane — zwrot 150 zł zlecony*, later *Zwrot wykonany* (and an email). **Next:** nothing; Anna's list shows it under *Zakończone*.
2. **Too late.** Anna accepted at 10:14. Kuba's page **shows** *Zaakceptowane — sesja dziś 12:30 (czat tekstowy)* and *Mentor już przyjął pytanie — anulowanie ze zwrotem nie jest już możliwe*; no button.
3. **Same moment.** Anna clicks *Akceptuję* while Kuba clicks *Anuluj*. Exactly one wins. Cancel wins → Anna sees *Nie można zaakceptować — deweloper anulował zapytanie* (#18), Kuba is refunded. Accept wins → Kuba sees *Mentor właśnie zaakceptował — sesja się odbędzie*; no money moves.
4. **Slot started, mentor silent.** At 12:32, before the lapse job ran, Kuba cancels. Cancel succeeds with a full refund. Had the job run first, he sees the lapse refund instead — the money comes back either way.

## 📝 Proposed Solution

One server action, one conditional update: `UPDATE requests SET status = 'cancelled', cancelled_at = now() WHERE access_token_hash = $hash AND status = 'awaiting_mentor' RETURNING id, payment_id`; in the same transaction `requestRefund(tx, paymentId, 'mentee_cancelled')` (#24); after commit `executeRefund`. Accept, decline and lapse (#18) guard the same row with `status = 'awaiting_mentor'`; PostgreSQL re-checks the `WHERE` after a blocked lock, so the first committed transition wins and the rest update nothing. Zero rows → re-read by token and answer with the current state (API Contracts).

Rejected: a "cancelling" intermediate state or application locks (same guarantee, more states); `SERIALIZABLE` (retries for no gain on a single-row guard); a slot-time cutoff for cancel (contradicts D05).

## 📝 Data Model

No migration. Uses #17's `awaiting_mentor → cancelled` transition (#17 transition-owner table) and `cancelled_at`; refund on `payments` (#24) with reason `mentee_cancelled`.

## 📝 API Contracts

- **`cancelRequest(token)`** →
  - `{ ok: true, refund: 'requested' }`;
  - `{ ok: false, reason: 'already_refunding', status: 'declined' | 'lapsed' | 'cancelled' }` — not an error: the money is already coming back; the page re-renders that state with its refund status;
  - `{ ok: false, reason: 'accepted' }` — page re-renders the accepted state;
  - `{ ok: false, reason: 'not_paid' }` (`awaiting_payment` / `payment_failed`); `{ ok: false, reason: 'not_found' }` (unknown/expired token → 404).
- **`/r/{token}`** (#17) gains: the cancel button (only in `awaiting_mentor`), the cancelled state with refund status, and the post-acceptance explanation.

## 📝 Edge Cases & Failure Scenarios

| Scenario | Outcome |
|---|---|
| Cancel vs accept at once | One row update succeeds (AC); loser gets its message; at most one refund. |
| Cancel vs decline or lapse | Both refund in full; `requestRefund` idempotent per payment → one refund; page shows the status that committed first (`already_refunding`). |
| Cancel after slot start, before the lapse job | Allowed; refund `mentee_cancelled`. |
| Double click / two tabs | Second → `already_refunding` (`cancelled`); one Stripe refund. |
| Stripe down | Request `cancelled`, slot free at once; refund retried by #24; *Zwrot w toku*. |
| Refund fails for 24 h | *Zwrot nie powiódł się — napisz do nas* + email; manual owner Q05 ⚠ (#24 Q10). |
| Stale page, click after acceptance | `accepted`; page shows the accepted state. |
| Guessed or expired token | 404, no detail. |

## 📝 Risks & Impact Review

- **SDLC money gate:** race, idempotency and Stripe-failure tests; second reviewer; `needs-qa`, no self-QA.
- **Capability link:** anyone with the link can cancel, and money only returns to the original card; the link is never shown to the mentor, never in mentor emails, and the page sends no referrer (#17).
- **Product calls:** inherits #17 Q1.

## 📝 Decisions in play

Relies on D05 / R11 (full refund until acceptance, none after) and R09 (lapse, #18) through the shared guard. Leaves open Q05. Supersedes nothing. Owner: Krzysztof Marczak.

## 📋 Phasing

Single phase: one action, one page change; splitting would ship a button without its race guarantee.

## 📋 Implementation Plan

1. **`lib/requests` `cancelByToken`** (injected DB client, like #18). DB tests: `awaiting_mentor` → `cancelled` + one refund `mentee_cancelled` (AC); same with `slot_start` in the past (D05); `accepted` → refused, refund unchanged (AC negative); `awaiting_payment` → `not_paid`; `declined` / `lapsed` / second cancel → `already_refunding`, no new refund.
2. **Race tests (AC).** Hold connection A's transaction open after #18 `accept` updated the row; start `cancelByToken` on B; commit A; B returns `accepted`, no refund. Mirror (cancel holds, accept waits) → accept gets `cancelled`, one refund. Same pairs for cancel vs `lapseOverdue` and cancel vs decline → one refund. How the test waits for B to block is an implementation detail. The post-commit `executeRefund` vs retry-job race is #24's test.
3. **`/r/{token}` cancel UI** with confirm. Tests: button only in `awaiting_mentor` (incl. after slot start); absent when accepted; stale click answered `accepted` re-renders accepted; `already_refunding` renders the refund state, not an error; cancelled state shows *Zwrot w toku* / *wykonany* / *nie powiódł się*; request gone from the mentor's *Czeka na decyzję* (#18, AC).
4. **QA.** Stripe test dashboard shows exactly one refund after cancel; PR body cites race tests as money-gate evidence.

## 🔍 Review & grill outcome

GPT review → grill log `reviews/2026-10-19-developer-cancels-before-acceptance.grill.md`.

| GPT finding | Outcome | Why |
|---|---|---|
| High: cancel cut off at slot start contradicts D05 | **Accepted** | Slot-time guard removed from action and button (coordinator decision: cancel until acceptance). |
| Medium: `lapsed` result undefined | **Accepted** | `already_refunding` with the winning status; page shows the refund, not an error. |
| Low: `pg_stat_activity` test detail | **Accepted** | Test states the condition and outcome; synchronization left to implementation. |

Grill decisions (5 questions, 1 ⚠ — inherited #17 Q1 guest link): cancel any time while `awaiting_mentor`; cancel/lapse race resolved by first commit, both refund; `already_refunding` response; no email for the cancel itself (refund emails via #17); behavior-level race tests.
