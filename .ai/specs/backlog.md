# Backlogs

## .ai/specs/product-brief.md
Backlog source: .ai/specs/product-brief.md
Last filed: 2026-10-16

Tree confirmed by Krzysztof Marczak (brief owner) on 2026-10-16: the dry run `.ai/analysis/2026-10-16-backlog-dry-run.md` as revised by D10 (notes and the in-product pilot view to Later; the pilot reads a manual export) and D11 (both silent = mentor's no-show, R15; E03-S02 unblocked). Payments in Stripe test mode until Q01, Q02, Q04, Q05 are answered. Dedupe: GitHub issues in all states searched by id and by 2–3 phrasings per item on 2026-10-16; no existing issue covered any item, nothing adopted.

| Id | Issue | Title | Epic | Depends on | Adopted |
|---|---|---|---|---|---|
| E01 | [#8](https://github.com/marczakkrzysztof0-lab/devmentor/issues/8) | Mentor page reached by share link | — | — | no |
| E01-S01 | [#14](https://github.com/marczakkrzysztof0-lab/devmentor/issues/14) | An invited mentor publishes their page within 20 minutes without payout details | #8 | E01-S01-T01 (#23) | no |
| E01-S01-T01 | [#23](https://github.com/marczakkrzysztof0-lab/devmentor/issues/23) | Data store and first schema migration (mentors, invitations, pages) | #8 (story #14) | — | no |
| E01-S02 | [#15](https://github.com/marczakkrzysztof0-lab/devmentor/issues/15) | A mentor publishes availability and only those slots are offered | #8 | E01-S01 (#14) | no |
| E01-S03 | [#16](https://github.com/marczakkrzysztof0-lab/devmentor/issues/16) | A developer opening a share link sees who the mentor is, prices and open slots, with no ratings | #8 | E01-S01 (#14), E01-S02 (#15) | no |
| E02 | [#9](https://github.com/marczakkrzysztof0-lab/devmentor/issues/9) | Paid request and the mentor's decision | — | — | no |
| E02-S01 | [#17](https://github.com/marczakkrzysztof0-lab/devmentor/issues/17) | A developer sends a prepaid request with their question within 5 minutes | #9 | E01-S03 (#16), E02-S01-T01 (#24) | no |
| E02-S01-T01 | [#24](https://github.com/marczakkrzysztof0-lab/devmentor/issues/24) | Stripe card payment, refund operation and payment webhook | #9 (story #17) | — | no |
| E02-S02 | [#18](https://github.com/marczakkrzysztof0-lab/devmentor/issues/18) | A mentor reads the question and accepts or declines; a decline or no answer before the slot refunds automatically | #9 | E02-S01 (#17) | no |
| E02-S03 | [#19](https://github.com/marczakkrzysztof0-lab/devmentor/issues/19) | A developer can cancel for a full refund until the mentor accepts | #9 | E02-S01 (#17) | no |
| E03 | [#10](https://github.com/marczakkrzysztof0-lab/devmentor/issues/10) | Live text session and no-shows | — | — | no |
| E03-S01 | [#20](https://github.com/marczakkrzysztof0-lab/devmentor/issues/20) | Mentor and developer hold the session as a live text chat in the booked slot | #10 | E02-S02 (#18) | no |
| E03-S02 | [#21](https://github.com/marczakkrzysztof0-lab/devmentor/issues/21) | When someone does not show, money goes where the rules say, automatically | #10 | E03-S01 (#20), E02-S01-T01 (#24) | no |
| E04 | [#11](https://github.com/marczakkrzysztof0-lab/devmentor/issues/11) | Mentor payout | — | — | no |
| E04-S01 | [#22](https://github.com/marczakkrzysztof0-lab/devmentor/issues/22) | After the first paid request a mentor sets up payouts and receives the money owed | #11 | E02-S01 (#17), E03-S02 (#21), E04-S01-T01 (#25) | no |
| E04-S01-T01 | [#25](https://github.com/marczakkrzysztof0-lab/devmentor/issues/25) | Stripe payout onboarding for mentors | #11 (story #22) | — | no |
| E06 | [#12](https://github.com/marczakkrzysztof0-lab/devmentor/issues/12) | Pilot with the first mentors | — | — | no |
| E06-T01 | [#26](https://github.com/marczakkrzysztof0-lab/devmentor/issues/26) | Research: mentors' weekly hours, answer speed, rate and employer permission (collection plan 2) | #12 | — | no |
| E06-T02 | [#27](https://github.com/marczakkrzysztof0-lab/devmentor/issues/27) | Research: how often developers are stuck, who pays, and would they paste code to a stranger (collection plan 3) | #12 | — | no |
| E06-T03 | [#28](https://github.com/marczakkrzysztof0-lab/devmentor/issues/28) | Research: pilot data request from a manual export of payment and session records (collection plan 1) | #12 | — | no |
| E07 | [#13](https://github.com/marczakkrzysztof0-lab/devmentor/issues/13) | Later (parked; items unfiled) | — | — | no |

### Reserved ids (not filed)

| Id | Was | Status |
|---|---|---|
| E05 | Private session notes (dry run) | moved to Later by D10; listed in E07 (#13); id reserved |
| E05-S01 | A mentor can leave a private note, kept only if the developer approves (dry run) | moved to Later by D10; id reserved |
| E06-S01 | A founder sees each invited mentor's pilot record (dry run) | moved to Later by D10; replaced by the manual export data request E06-T03 (#28); id reserved |

### Held back

- Guest checkout without an account — Key flow step 3 is `[ASSUMPTION]` with no decision; E02-S01 stays neutral on account vs guest.
- Any promise of a response time — A01 untested; the pilot measures it (E06-T03).
