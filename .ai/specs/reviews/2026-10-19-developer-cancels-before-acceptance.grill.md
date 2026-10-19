# Grill log: Developer cancels for a full refund until the mentor accepts (#19)

Method: grill-me — decision tree in rounds, whole frontier per round, recommended answer per question worded so "yes" accepts it; facts looked up, not asked. Owner Krzysztof Marczak not available live; blanket "yes" of 2026-10-19 applied to recommendations, except open brief questions, product-rule overrides, security or data scoping (⚠).

Inputs: spec, GPT review (verdict *revise*: contradicts D05), brief D05 / R09 / R11, coordinator's shared decision ("developer may cancel any time BEFORE the mentor accepts; an unaccepted request at slot start lapses — both paths refund in full automatically"), revised #17 (token contract, emails) and #18 (guard, refusal classification).

## Decision tree (top level)

Credential → cancel window → race with lapse/decline → response contract → notifications → tests.

## Round 1 — frontier

| # | Question (recommended answer) | Outcome |
|---|---|---|
| Q1 | The `/r/{token}` link is the credential for cancelling? | ⚠ needs human — inherits #17 Q1 (guest vs account, undecided in the brief) |
| Q2 | Allow cancel whenever the request is `awaiting_mentor`, removing the `slot_start > now()` guard from action and button? | Accepted on owner's blanket yes, 2026-10-19 (applies the shared D05 decision) |

## Round 2 — frontier (unlocked by Q2)

| # | Question (recommended answer) | Outcome |
|---|---|---|
| Q3 | Cancel vs lapse/decline: first commit wins; both refund in full through idempotent `requestRefund`; the losing cancel returns `already_refunding` with the winning status, rendered as a refund state, not an error? | Accepted on owner's blanket yes, 2026-10-19 |
| Q4 | No email for the cancel itself; the developer gets #17's refund-done/failed email; the mentor is not emailed (the request just leaves the open list)? | Accepted on owner's blanket yes, 2026-10-19 |
| Q5 | Describe race tests by condition and outcome (A holds the row lock, B waits, A commits) and leave the waiting mechanism (`pg_stat_activity` or otherwise) to implementation? | Accepted on owner's blanket yes, 2026-10-19 |

## Round 3 — frontier

Empty.

Totals: 5 questions, 4 accepted, 1 ⚠ (Q1, inherited from #17).
