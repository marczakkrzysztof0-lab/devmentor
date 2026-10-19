# Grill log: Mentor weekly availability and open slots (#15)

Method: grill-me (decision tree, rounds over the frontier, recommended answer per question; "yes" accepts it). Owner Krzysztof Marczak not available live; blanket instruction on 2026-10-19 ("zrób wszystko za mnie", "akceptuję wszystko") applied as "yes" to each recommendation, except where it would override a product-brief rule, security or data scoping, or answer open brief questions — those stay ⚠.

Inputs: spec, GPT review, product brief (R01, R05, R06, R09, D02, D08, A01), #14, #16, #17 specs (read-only for E02), coordinator's shared decisions — **applied, not re-asked**: `MIN_NOTICE_MINUTES = 180` defined here; :00/:30 grid in the mentor's local zone, stored in UTC; both lengths ⚠; `isSlotOffered` is a pre-check and #17 owns the atomic hold; migration 0004.

Facts checked instead of asked: window CHECKs (`% 30 = 0`, `end > start`) make 30 min the minimum window, so every window fits a 25-min slot (GPT High finding rejected on this fact); #17 already calls `isSlotOffered` with `busy = heldRanges` under a mentor row lock.

## Decision tree

```
Availability model (Q1)
├─ Lengths per window (Q2 ⚠)
├─ Horizon (Q3) ── [notice, grid: shared]
├─ Go-live on save (Q4)
└─ Delivery shape (Q5)
    └─ DST candidate rules (Q6) ─ overlap merge (Q7)
       Time-zone change UX (Q8) ─ window removal vs requests (Q9)
```

## Round 1 — frontier: roots

| # | Question | Recommended answer | Outcome |
|---|---|---|---|
| Q1 | Weekly recurring windows only, no dated exceptions in 1.0? | Yes — set-once habit; removing a window covers vacations meanwhile. | Accepted on owner's blanket yes, 2026-10-19 |
| Q2 | Every window yields both 25- and 50-min slots where they fit (no per-window length)? | Yes, consistent with #14 Q3. | ⚠ needs human — same epic #8 "both lengths" question |
| Q3 | Rolling 14-day horizon as exported constant `HORIZON_DAYS`, with `MIN_NOTICE_MINUTES = 180` as the one notice constant? | Yes; A01 tension measured in the pilot. | Accepted on owner's blanket yes, 2026-10-19 |
| Q4 | Saving windows makes them live immediately, also on draft pages (no separate publish step)? | Yes — fewer steps toward D08. | Accepted on owner's blanket yes, 2026-10-19 |
| Q5 | Ship engine + editor as a single phase / PR (no separate engine phase, no separate spec)? | Yes — neither half has a user or consumer alone (GPT Medium findings). | Accepted on owner's blanket yes, 2026-10-19 |

## Round 2 — frontier unlocked by Q1, Q5

| # | Question | Recommended answer | Outcome |
|---|---|---|---|
| Q6 | DST: candidates are local :00/:30 wall times; gap → no slot; fall-back ambiguity → first occurrence; a slot must end (real elapsed minutes) by the window end in UTC? | Yes — one rule set for preview, #16 and #17. | Accepted on owner's blanket yes, 2026-10-19 |
| Q7 | Overlapping/adjacent windows are merged per local date before fitting slots (no overlap validation in the editor)? | Yes. | Accepted on owner's blanket yes, 2026-10-19 |
| Q8 | Time-zone change: inline warning + "Zapisz i zmień strefę" button; no modal diff? | Yes — fixes GPT Medium finding at minimal UI cost. | Accepted on owner's blanket yes, 2026-10-19 |
| Q9 | Removing a window never cancels or alters existing requests; it only stops future offering? | Yes — requests are E02's. | Accepted on owner's blanket yes, 2026-10-19 |

Frontier empty after round 2.

## ⚠ Still needing a human

- Q2 — both lengths offered/required (epic #8, shared with #14 Q3).
