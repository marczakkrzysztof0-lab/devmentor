# Grill log: Data store and first schema migration (#23)

Method: grill-me (decision tree, rounds over the frontier, recommended answer per question; "yes" accepts it). Owner Krzysztof Marczak not available live; blanket instruction on 2026-10-19 ("zrób wszystko za mnie", "akceptuję wszystko") applied as "yes" to each recommendation, except where it would override a product-brief rule, security or data scoping, or answer open brief questions (Q01–Q05, Q09).

Inputs: spec, GPT review, product brief, sibling 2026-10-19 specs, coordinator's shared cross-spec decisions (migration numbering 0001–0006, hashed ≥128-bit tokens, prices `price_25_minor`/`price_50_minor` + `currency` in #14).

## Decision tree

```
Persistence tooling (Q1)
├─ Test isolation (Q2)
├─ Invitation identity & lifecycle boundary (Q3 → Q5, Q6)
└─ Rollback safety (Q4)
Prices / currency in 0001 → settled by coordinator (in #14 0003), not asked
```

## Round 1 — frontier: roots

| # | Question | Recommended answer | Outcome |
|---|---|---|---|
| Q1 | Keep `pg` + `node-pg-migrate` with plain-SQL up/down files (no ORM)? | Yes — only option with first-class down migrations runnable from the `.mjs` test suite. | Accepted on owner's blanket yes, 2026-10-19 (clears the former ⚠) |
| Q2 | Migration tests use a disposable schema `dm_migtest_<random>` with a `COMMENT ON SCHEMA` marker, and crash-leftover cleanup drops only schemas matching both prefix and marker? | Yes — fixes GPT High finding; no second database or env var. | Accepted on owner's blanket yes, 2026-10-19 |
| Q3 | Invited identity: `mentors.email` is always copied from `invitations.email` inside the acceptance transaction (no email input), with no DB trigger; #14 tests it? | Yes — mismatch impossible by construction; trigger is over-engineering. | Accepted on owner's blanket yes, 2026-10-19 |
| Q4 | `db:rollback` documented as local/test-only, no code guard until a deployment spec exists? | Yes — no deployed database exists; guard belongs with hosting. | Accepted on owner's blanket yes, 2026-10-19 |

## Round 2 — frontier unlocked by Q3/Q4

| # | Question | Recommended answer | Outcome |
|---|---|---|---|
| Q5 | Split of ownership: #23 guarantees DB invariants (unique token hash, accepted ⇔ mentor_id, not accepted+revoked, one invitation per mentor); #14 owns expiry, revocation, single use, confirm-button acceptance? | Yes — removes the "flat CRUD" risk the review named. | Accepted on owner's blanket yes, 2026-10-19 |
| Q6 | Allow several open invitations for the same email (no partial unique index); first accepted wins, #14 refuses the rest? | Yes — founders re-invite after expiry without revoking; the "mentor exists" check already protects identity. | Accepted on owner's blanket yes, 2026-10-19 |

Frontier empty after round 2.

## ⚠ Still needing a human

None introduced here. Carried in #14: Q02 currency (PLN default), "both lengths required".
