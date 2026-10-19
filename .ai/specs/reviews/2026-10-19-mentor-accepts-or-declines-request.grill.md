# Grill log: Mentor accepts or declines a request (#18)

Method: grill-me — decision tree in rounds, whole frontier per round, recommended answer per question worded so "yes" accepts it; facts looked up, not asked. Owner Krzysztof Marczak not available live; blanket "yes" of 2026-10-19 applied to recommendations, except open brief questions, product-rule overrides, security or data scoping (⚠).

Inputs: spec, GPT review (verdict *revise*), brief D02, D05, D10, R02, R05, R09, A01, coordinator's shared decisions (emails via #17's adapter; D05 lapse at slot start), revised #17 (transition-owner table, email adapter) and #24 (jobs endpoint, health).

## Decision tree (top level)

Notification → measuring A01. Decision window → refusal codes → UI wording. Session boundary with #20. UI states.

## Round 1 — frontier

| # | Question (recommended answer) | Outcome |
|---|---|---|
| Q1 | Mentor learns of a paid request by email (sent by #17's subscriber) plus the `/mentor` badge; developer gets emails on accept, decline and lapse from this spec via `enqueueEmail`? | Accepted on owner's blanket yes, 2026-10-19 |
| Q2 | Measure A01 (time to acceptance, lapses per mentor) from the manual pilot export (D10), no in-product metric? | Accepted on owner's blanket yes, 2026-10-19 |
| Q3 | The `accepted` request is the session; `requests.id` is the chat key for #20, which owns post-accept states (drop the ⚠ and state it as a contract)? | Accepted on owner's blanket yes, 2026-10-19 |
| Q4 | Keep the decision deadline at slot start for **both** accept and decline (after it, the lapse path refunds with reason `lapsed`)? | Accepted on owner's blanket yes, 2026-10-19 |

## Round 2 — frontier (unlocked by Q1–Q4)

| # | Question (recommended answer) | Outcome |
|---|---|---|
| Q5 | Show *zwrot zlecony / w toku* only when `refund_status` is set; before the lapse job runs show *Termin minął — zwrot zostanie zlecony automatycznie*? | Accepted on owner's blanket yes, 2026-10-19 |
| Q6 | After a failed conditional update, re-read scoped by `mentor_id` and classify: `not_found` → terminal status code → `slot_started`? | Accepted on owner's blanket yes, 2026-10-19 |
| Q7 | Add an empty-list state (with the share URL) and a load-error state with no partial data? | Accepted on owner's blanket yes, 2026-10-19 |
| Q8 | Cut CTE/`SKIP LOCKED` wording from the solution, keeping only the guarantees (bounded batch, each row once, atomic with refund + email)? | Accepted on owner's blanket yes, 2026-10-19 |

## Round 3 — frontier

Empty: lapse cadence (every jobs call, ~5 min) follows from #24's scheduler decision (fact, not asked).

Totals: 8 questions, 8 accepted, 0 ⚠. Q05 (manual exceptions owner) stays open in the brief and is referenced, not answered.
