# Grill log: Public mentor share page (#16)

Method: grill-me (decision tree, rounds over the frontier, recommended answer per question; "yes" accepts it). Owner Krzysztof Marczak not available live; blanket instruction on 2026-10-19 ("zrób wszystko za mnie", "akceptuję wszystko") applied as "yes" to each recommendation, except where it would override a product-brief rule, security or data scoping, or answer open brief questions — those stay ⚠.

Inputs: spec, GPT review, product brief (R03, R07, R14, D03, D08, N02), #14, #15, #17 specs, coordinator's shared decisions (price columns + currency, slot grid local/UTC, `isSlotOffered` pre-check, #17 owns the hold and passes held ranges as `busy`).

Facts checked instead of asked: all public fields live in `mentor_pages` (#23/#14), so no join to `mentors` is needed; #17 adds the request form and per-slot links below the slot list and passes `heldRanges` as `busy`.

## Decision tree

```
Page content & order (R03, R07 — rules, not asked)
├─ Slot interactivity before #17 (Q1)
├─ Discoverability (Q2)
├─ Not-found behaviour (Q3)
├─ Caching (Q4)
└─ Delivery & release (Q5)
    ├─ DTO / data scoping (Q6)
    ├─ Viewer zone fallback (Q7)
    └─ Directory test scope (Q8)
```

## Round 1 — frontier: roots

| # | Question | Recommended answer | Outcome |
|---|---|---|---|
| Q1 | Slots shown as plain text with a 25/50 toggle; no "Book" button until #17 makes them links? | Yes — no dead button ships. | Accepted on owner's blanket yes, 2026-10-19 |
| Q2 | Meet R14 by having no directory/search/sitemap/link to `/m/*` in the app, plus best-effort `noindex, nofollow` described as a crawler hint, not a guarantee? | Yes — fixes GPT High finding without inventing an unenforceable promise. | Accepted on owner's blanket yes, 2026-10-19 |
| Q3 | Unknown and unpublished slugs return the same 404 with no mentor data? | Yes — no draft leak, no slug probing. | Accepted on owner's blanket yes, 2026-10-19 |
| Q4 | No caching in 1.0; slug lookup before streaming, slots in their own Suspense + error boundary? | Yes — edits must show immediately; pilot traffic is tiny. | Accepted on owner's blanket yes, 2026-10-19 |
| Q5 | Keep two phases, Phase 1 scoped to stories 3–5, with a release gate: no real invitations before Phase 2? | Yes — fixes GPT Medium finding; Phase 1 still unblocks review after #14. | Accepted on owner's blanket yes, 2026-10-19 |

## Round 2 — frontier unlocked by Q3, Q5

| # | Question | Recommended answer | Outcome |
|---|---|---|---|
| Q6 | One query on `mentor_pages` only, `published_at IS NOT NULL` in the same `WHERE`, allowlisted DTO (no mentor id serialized), slot query keyed by that row's `mentor_id`? | Yes — data-scoping guard pinned by a key-set test. | Accepted on owner's blanket yes, 2026-10-19 |
| Q7 | Viewer zone: format in the browser zone; on missing zone or formatter error fall back to UTC labelled "UTC"? | Yes. | Accepted on owner's blanket yes, 2026-10-19 |
| Q8 | Directory tests limited to the new segment (`/m`, `/m?search=`), dropping `/mentors` and `/`? | Yes — this spec adds no other route. | Accepted on owner's blanket yes, 2026-10-19 |

Frontier empty after round 2.

## ⚠ Still needing a human

None here. Currency display follows `mentor_pages.currency`; Q02 stays ⚠ in #14.
