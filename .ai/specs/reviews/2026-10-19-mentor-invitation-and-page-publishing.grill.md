# Grill log: Mentor invitation, sign-in and page publishing (#14)

Method: grill-me (decision tree, rounds over the frontier, recommended answer per question; "yes" accepts it). Owner Krzysztof Marczak not available live; blanket instruction on 2026-10-19 ("zrób wszystko za mnie", "akceptuję wszystko") applied as "yes" to each recommendation, except where it would override a product-brief rule, security or data scoping, or answer open brief questions (Q01–Q05, Q09) — those stay ⚠.

Inputs: spec, GPT review, product brief (D03, D04, D07, D08, D09, R03, R07, R08, R13, Q01, Q02), #23 spec and its review (identity invariant), coordinator's shared decisions (token rule, price columns, PLN default ⚠, both lengths ⚠, email adapter owned by #17, migrations 0002–0003).

## Decision tree

```
Sign-in method (Q1)
├─ Sign-in link redemption (Q6) ── expiry (Q7)
└─ Invitation acceptance identity (Q9)
Invitation creation (Q5)
Page content & money
├─ Currency (Q2 ⚠) ─ Both prices (Q3 ⚠) ─ Commission display (Q4 ⚠)
└─ Slug generation (Q8)
QA of the 20-minute target (Q10)
```

## Round 1 — frontier: roots

| # | Question | Recommended answer | Outcome |
|---|---|---|---|
| Q1 | Passwordless DB-backed sessions (30-day cookie), re-entry via founder-run `mentor:sign-in-link`; no dependency on #17's email adapter (swap later)? | Yes — #14 ships before #17; ~20 warm-contact mentors; no new secrets. | Accepted on owner's blanket yes, 2026-10-19 |
| Q2 | One platform currency PLN, stored per page in `mentor_pages.currency`, not chosen by the mentor? | Yes (PLN default, per-page column as hedge). | ⚠ needs human — answers brief Q02 |
| Q3 | Both 25- and 50-minute prices required to publish? | Yes (R07 literal reading; CHECK easier to drop than add). | ⚠ needs human — epic #8 open question, coordinator kept ⚠ |
| Q4 | Entered price is the full price the developer pays (R08); no commission or "you receive" figure shown? | Yes. | ⚠ needs human — depends on brief Q01 (commission) |
| Q5 | Invitations only via founder CLI `mentor:invite`, valid 14 days, no admin UI? | Yes — smallest surface for D09 pilot. | Accepted on owner's blanket yes, 2026-10-19 |

## Round 2 — frontier unlocked by Q1, Q5

| # | Question | Recommended answer | Outcome |
|---|---|---|---|
| Q6 | `/sign-in/[token]` `GET` renders only a **Zaloguj** button; the action redeems with one conditional `UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING`, so concurrent clicks yield one session? | Yes — fixes GPT High finding (mail scanners, races). | Accepted on owner's blanket yes, 2026-10-19 |
| Q7 | Sign-in links expire after 72 h (was 7 days); invitations stay 14 days? | Yes — founder sends it personally, so a short life costs little and narrows a leaked link's window. | Accepted on owner's blanket yes, 2026-10-19 |
| Q8 | Placeholder slug is random and neutral (`mentor-xxxxxx`), editor suggests one from the display name until first publish; email never used? | Yes — fixes GPT Medium finding (email leak). | Accepted on owner's blanket yes, 2026-10-19 |
| Q9 | `acceptInvitation` copies the mentor's email from the invitation (never from input) and tests it? | Yes — closes the #23 review's identity finding by construction. | Accepted on owner's blanket yes, 2026-10-19 |
| Q10 | The 20-minute walkthrough is timed and recorded in the PR, not a blocking QA gate? | Yes — D08 calls the target provisional; the pilot measures real mentors. | Accepted on owner's blanket yes, 2026-10-19 |

Frontier empty after round 2.

## ⚠ Still needing a human

- Q2 — currency PLN (brief Q02).
- Q3 — both lengths required to publish (epic #8).
- Q4 — no commission figure shown to the mentor (brief Q01).
