# Architectural Review: Prepaid request with the question up front

**Verdict: revise.** The stories describe a coherent paid request flow and should prevent a flat CRUD implementation. Resolve the guest-access and notification decisions, then correct the payment/expiry and slot-hold contracts before implementation.

## Decision needed

- **Guest access (Q1):** The brief deliberately left account creation open, while this spec chooses a capability link and flags it for confirmation. Confirm guest access before treating `/r/{token}` as a protected surface; it determines how a mentee can recover access to a question and decision.
- **Notifications (Q2):** With no notification and no account, losing the link means losing access, and mentors learn of paid requests only by opening their list. Decide whether that meets the pilot’s user needs; the current spec correctly calls out the consequence but leaves the product call unresolved.

## Findings

- **High: Checkout return can expire a payment that has already succeeded.** The spec says `/r/{token}` calls `expireCheckout` on `checkout=cancel`, and that Stripe may report the session is already complete, in which case #24 says to sync it. But the request edge case treats a payment-confirmed-after-`payment_failed` event as late and requests a refund. If cancellation and payment completion race, behavior depends on which transition wins, and the spec does not define the user-visible result or guarantee the paid request reaches the mentor. Define the race resolution across payment and request transitions, including whether a confirmed payment remains valid when the request still holds its slot.

- **High: Slot expiry is specified inconsistently with the payment state machine.** A request holds a slot only while `awaiting_payment` and the checkout expiry is in the future, but the spec also says a missed webhook must not hold it past expiry and a late payment is refunded. #24’s reconciliation waits until expiry plus five minutes to reread Stripe, leaving a period where the slot is offered again while payment may still succeed. Define when the hold ends and how a payment arriving after that point is prevented from creating a conflicting paid booking.

- **High: The new capability URL exposes sensitive free text without a defined token contract.** `/r/{token}` grants access to the question and request details, but the spec does not define token entropy, generation, or whether tokens are rotated or revocable. `Referrer-Policy: no-referrer` and hashing the stored token do not protect against guessing or a leaked URL. Specify a high-entropy, unguessable token and establish the access boundary for every request-page action; align it with the token conventions in #14.

- **Medium: The “same payment attempt” retry contract is not safe after checkout expiry.** Repeated `submissionId` is reused only for an unexpired checkout; otherwise it is refused and the browser generates a new id. Yet the spec does not define how a new attempt avoids retaining or conflicting with the old request’s hold if expiry/reconciliation/webhook processing is delayed. Specify the retry behavior and ensure an expired attempt cannot block a fresh request or slot.

- **Medium: Concurrent availability edits can invalidate the slot check.** `startRequest` serializes requests by locking the mentor row, but the spec does not establish that availability edits use that same lock. A mentor can remove a window after the request’s check and before commit, so the request may reserve a slot no longer offered. Define a shared locking or transaction boundary with availability writes, or explicitly define that already-started requests remain valid.

- **Medium: The data model embeds later-story state and timestamps before those transitions are designed.** The spec adds `accepted`, `declined`, `lapsed`, and `cancelled` plus their timestamps “on purpose,” while #18 and #19 own those transitions. This couples the initial migration to future flows and risks their constraints diverging from later decisions. Keep only states required by #17/#24, or make the shared state machine an explicit cross-spec contract reviewed alongside #18/#19.

## Review limits

- Repository runtime code is still minimal; there are no payment, request, or database modules to compare against.
- Cross-spec review covered the payment, share-page, availability, acceptance/decline, cancellation, and data-store specs.