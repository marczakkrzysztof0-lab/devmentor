# Grill log: Prepaid request with the question up front (#17)

Method: grill-me — decision tree in rounds, whole frontier per round, recommended answer per question worded so "yes" accepts it; facts looked up, not asked. Owner Krzysztof Marczak not available live; blanket "yes" of 2026-10-19 applied to recommendations, except open brief questions, product-rule overrides, security or data scoping (⚠).

Inputs: spec, GPT review (verdict *revise*), brief (Key flow step 3, D02, D04, D08, R04–R08, A01, A08, Q04), coordinator's shared decisions (email adapter owned here, atomic hold owned here, MIN_NOTICE_MINUTES = 180, token rules, migration 0006), revised #24 (Stripe-confirmed expiry, `syncCheckout(paymentId, sessionId)`, retryable checkout errors).

## Decision tree (top level)

Identity of the developer → notification channel → email mechanics. Slot hold → hold end → late payment → retries. Token contract. Schema scope.

## Round 1 — frontier

| # | Question (recommended answer) | Outcome |
|---|---|---|
| Q1 | Keep the developer a **guest** with a `/r/{token}` link (no account)? | ⚠ needs human — brief left account vs guest undecided on purpose; guest stays the build default |
| Q2 | Use the developer's `payer_email` from Stripe Checkout as the email address, instead of adding an email field to our form? | Accepted on owner's blanket yes, 2026-10-19 |
| Q3 | Email adapter = `lib/email` with an `outbound_emails` outbox written in the caller's transaction, sent after commit and by the jobs endpoint; transports `log` and `smtp` (nodemailer, `SMTP_URL`, `EMAIL_FROM`)? | Accepted on owner's blanket yes, 2026-10-19 |
| Q4 | Emails never contain the question text; the mentor email has name, length, slot, deadline and a link to `/mentor/requests/{id}`? | Accepted on owner's blanket yes, 2026-10-19 |
| Q5 | Release a pending hold as soon as #24 marks the payment `expired` (Stripe-confirmed), with `checkout_expires_at + 10 min` as the outer limit? | Accepted on owner's blanket yes, 2026-10-19 |
| Q6 | `/r/` token: 32 random bytes base64url, SHA-256 stored, reusable, valid until 30 days after `slot_end`, no rotation in 1.0, every action resolved from the hash only? | Accepted on owner's blanket yes, 2026-10-19 |

## Round 2 — frontier (unlocked by Q2–Q6)

| # | Question (recommended answer) | Outcome |
|---|---|---|
| Q7 | The confirmation email carries the plaintext link: create it as a `draft` row in `startRequest`, make it `due` on payment success, and null its `params` once sent? | Accepted on owner's blanket yes, 2026-10-19 |
| Q8 | On a late `payment.succeeded`: under the mentor-row lock, accept the payment only if the request is still `awaiting_payment` and no other holding request overlaps; otherwise refund `invalid_on_payment`? | Accepted on owner's blanket yes, 2026-10-19 |
| Q9 | Retry after a retryable checkout failure reuses the same `submissionId` and the same pending payment, so the developer's own hold never blocks them? | Accepted on owner's blanket yes, 2026-10-19 |
| Q10 | Availability edits never cancel held or paid requests (validated once at creation, R06); the mentor declines if needed — no shared lock with `saveAvailability`? | Accepted on owner's blanket yes, 2026-10-19 |
| Q11 | Keep the full E02 state machine in this migration (reject the GPT split) and add a transition-owner table as the cross-spec contract? | Accepted on owner's blanket yes, 2026-10-19 |

## Round 3 — frontier

Empty: the cancel-return race is settled by #24's Stripe-confirmed expiry (fact, not asked).

Totals: 11 questions, 10 accepted, 1 ⚠ (Q1 guest vs account). Inherited ⚠ via E01: 3 h notice vs A01 (#15), currency Q02 (#14).
