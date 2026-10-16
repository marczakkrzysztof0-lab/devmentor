# DevMentor — product brief

- Date: 2026-10-16
- Mode: own; Owner: Krzysztof Marczak (brief owner); Pass: full
- Evidence basis: seven interview notes with seven different people (four developers, three senior engineers who help others), interviewed by the founders; recruitment was the founders' networks or mentor list for four, a Facebook freelancer group for one, and is not recorded for the 2026-08-20 and 2026-08-22 notes; one export of 109 help threads from one developers' Discord over 14 days, labelled by founder B, a moderator there; one self-selected survey of 54 people in the same Discord, also run by founder B (stated intentions, not payments; the export and survey are one founder's community, not independent sources); five competitor pages checked on 2026-09-04; a list of 50 candidate mentors, none contacted; the founders' Miro boards (positions, not evidence); workshop decisions and N01–N02. Decisions D01–D09 and N03–N05 were taken on the agent's recommendation under the owner's blanket instruction to proceed with recommended answers; they are decisions, not evidence. The most consequential untested belief: mentors who accept questions into booked slots can answer developers fast enough for their blockers (A01), and enough mentors from the list will join and get paid requests (A02).
- Coverage: 88 claims — 77 sourced (interview 15, data 4, document 49, product 2, benchmark 7), 0 synthetic, 11 assumed; 4 entries on the collection plan (most document lines cite decisions D01–D09, not independent evidence)
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: not yet signed — Krzysztof Marczak to confirm D01–D09 and N03–N05 (accepted on his blanket instruction, relayed by the orchestrating agent); ready for: implementation planning of the 1.0 scope (backlog dry run); committing to the build waits on Q10, Q11; opening real payments in the pilot waits on Q01, Q02, Q04, Q05
- Sources: `.ai/specs/research/` (interviews `2026-08-20-interview-working-dev.md`, `2026-08-22-interview-mentor.md`, `2026-09-01-interview-backend-dev-fintech.md`, `2026-09-02-interview-freelancer-react.md`, `2026-09-02-interview-platform-dev-solves-alone.md`, `2026-09-03-interview-senior-python-meetups.md`, `2026-09-03-interview-staff-engineer-declined-before.md`; data `2026-09-04-discord-help-requests.csv` with `2026-09-04-data-request-discord-help.md`, `2026-09-04-survey-discord-willingness-to-pay.md`, `2026-09-04-mentor-list.csv` with `2026-09-04-mentor-list-note.md`; benchmarks `2026-09-04-benchmark-*.md`; workshop `2026-08-26-workshop-export.md`; boards `2026-09-0*-miro-board-*.md`; decisions `decisions/`); repository `README.md`, `BACKWARD_COMPATIBILITY.md`, `SDLC.md`, `app/`

## Decision summary

Decision: what version 1.0 of DevMentor contains and how its first test runs. Agreed on the agent's recommendation under the owner's blanket instruction (D01–D09); the owner confirms or supersedes.

Three of four developers interviewed were stuck on a specific problem under deadline with nobody available who had done it; they searched, asked on Discord, got wrong or vague answers, then shipped a workaround, rolled back or under-quoted; the fourth solved his problem alone through his company's channel (see Problems). In the Discord export a fifth of help threads got no reply and answered threads waited about an hour for a first reply. Two of three senior engineers interviewed already answer recurring questions for free from a private doc; two of three would consider 25 minutes of paid text if the platform handles money and no-shows and they can see who is asking (one said "może").

Now: paid text sessions of 25 or 50 minutes, requested through the mentor's own link with the question up front, accepted by the mentor, prepaid by card, and a private session note the mentee approves (Scope, D01–D07). The knowledge-base vision — vault subscriptions, MCP, AI answers from notes, Obsidian export — is Later (N03).

The mismatch most likely to change this: developers asked for help within twenty minutes to the same day, while mentors want to vet the request, answer between meetings and not at weekends (A01). Entry only through a mentor's link (D03) means the strangers seen asking on Discord are not reached unless a mentor posts the link there. Text-only (N01) does not cover the freelancer's estimate case, where he wanted to talk. Mentor supply is untested: nobody on the list of fifty has been contacted, and the mentors value their notes more than sessions, which 1.0 defers (A02). Stated willingness to pay is not payment; 3 of 54 survey respondents paid someone the last time they were stuck (A03). Whether this scope fits the workshop's 25-hour build limit is not shown (Q11).

Next: plan the 1.0 build, then run the mentor pilot (D09), which shows whether mentors publish, share and get paid requests. Before real payments open, the owner sets the commission, currency, legal owner and dispute owner (Q01, Q02, Q04, Q05) and the pilot's pass/stop thresholds (Q03).

## Vision

Mentors earn from the knowledge in their private answers: first for a paid session, later again when approved notes from it help someone else through a vault reachable from developers' tools. This is the team's intended direction, not a demonstrated benefit. `[DOCUMENT]` `research/2026-09-02-miro-board-vision-target-needs.md`, D01

## Target group and stakeholders

- Customer (pays), chosen for 1.0: the individual developer paying by card (D04). `[DOCUMENT]` D04
- Customer, stated (not observed payments): the freelancer would pay up to 200 zł from his own pocket; the fintech developer would pay himself, "chyba"; the platform developer would pay only through his employer. `[INTERVIEW]` `research/2026-09-02-interview-freelancer-react.md`, `research/2026-09-01-interview-backend-dev-fintech.md`, `research/2026-09-02-interview-platform-dev-solves-alone.md`
- Customer, stated in the survey: 24 of 54 would pay from their own pocket, 19 through an employer, 9 would not pay. `[DATA]` `research/2026-09-04-survey-discord-willingness-to-pay.md`
- User (mentee): a working or freelance developer facing a specific blocker before a deadline, with nobody available who has done that exact thing. `[INTERVIEW]` `research/2026-08-20-interview-working-dev.md`, `research/2026-09-01-interview-backend-dev-fintech.md`, `research/2026-09-02-interview-freelancer-react.md`
- User (mentee), not served: a developer in a large company with an internal channel solves things alone and would pay only for a rare, expensable one-off. `[INTERVIEW]` `research/2026-09-02-interview-platform-dev-solves-alone.md`
- User (mentor): a senior engineer who already answers questions for free in DMs, Slack or Discord, often from a private answers doc. `[INTERVIEW]` `research/2026-08-22-interview-mentor.md`, `research/2026-09-03-interview-senior-python-meetups.md`, `research/2026-09-03-interview-staff-engineer-declined-before.md`
- Beachhead stacks (TypeScript, React, Python, AI agents, English-speaking) are the founders' choice. `[DOCUMENT]` `research/2026-09-02-miro-board-vision-target-needs.md`
- Stakeholders: founder A (Oliwia) holds sponsor, product owner and UX roles; founder B holds project manager, tech lead and developer roles; QA and legal have nobody; finance / payout operator is not on the matrix. `[DOCUMENT]` `research/2026-09-05-miro-board-raci-matrix.md`
- Stripe is the only payments provider allowed. `[DOCUMENT]` `research/2026-08-26-workshop-export.md`
- Decider for scope decisions: Krzysztof Marczak (brief owner) for D01–D09 and N03–N05; founder A owns the workshop rules and N01–N02. The RACI makes founder A accountable for MVP scope and the commission model, so Krzysztof's authority over those choices needs confirming (Q10).

## Problems, with evidence

- A developer stuck on a TypeScript generics error the day before a release, with the team's senior on leave, spent 40 minutes on Stack Overflow, got two contradictory Discord answers and shipped a workaround: "half a day, and I still don't trust that code." `[INTERVIEW]` `research/2026-08-20-interview-working-dev.md`
- A fintech backend developer hit a broken staging ingress after a Helm upgrade on a Friday evening; an hour of search, nobody on Slack, a wrong Discord answer on Saturday, rollback, release slipped to Tuesday. One episode; frequency not asked. `[INTERVIEW]` `research/2026-09-01-interview-backend-dev-fintech.md`
- A freelancer quoting a server-components migration read for two evenings, got "it depends" on Discord and under-quoted by about a week of his own time; he wanted someone who had done it to say what he was missing, the same day, and for an estimate he wanted to talk it through ("do wyceny rozmowa"), which text-only 1.0 does not cover. `[INTERVIEW]` `research/2026-09-02-interview-freelancer-react.md`
- What these three wanted was an answer from someone who has done the exact thing — within the hour, within twenty minutes, or the same day. `[INTERVIEW]` same three notes
- In 14 days of one Discord's help channels, 23 of 109 threads got no human reply; the 86 answered waited a median of 67 minutes for the first reply; 31 carried an urgency signal, 9 of those got no reply and 8 ended with the poster saying it was solved. `[DATA]` `research/2026-09-04-discord-help-requests.csv`
- In the same community's survey, 30 of 54 had been stuck with nobody to ask this week or this month; 3 paid someone and 38 asked an AI assistant that time; 20 shipped a workaround. How AI answers fell short for them was not asked. `[DATA]` `research/2026-09-04-survey-discord-willingness-to-pay.md`
- A senior engineer answers the same three questions every month, unpaid, by pasting from a private notes file: "two evenings a month, for free, and the notes rot." `[INTERVIEW]` `research/2026-08-22-interview-mentor.md`
- A Python meetup speaker answers recurring questions weekly from a paste doc, has never charged ("faktury. nie"), and would take 25-minute text sessions if the platform handles money and no-shows. `[INTERVIEW]` `research/2026-09-03-interview-senior-python-meetups.md`
- A staff engineer who declined MentorCruise's monthly model answers interesting questions on Slack and would "maybe" take a 25-minute written session with the question up front, at a high price, found only through her own link. `[INTERVIEW]` `research/2026-09-03-interview-staff-engineer-declined-before.md`
- That these episodes happen often enough to support a paid market is not shown: two notes did not ask about frequency and "ciągle" was never quantified (A03). `[ASSUMPTION]` interviewers' own remarks in the notes
- Reading-aid corrections: the CSV gives a median of 67 minutes (founder B's note says 68), 20 partially resolved threads (note: 23), and 23 threads between 17:00 and 21:00 against 40 between 10:00 and 14:00, so "evenings are the busiest" is not supported.

## Product and how it stands out

- What it is: a place where a developer pays a senior engineer for a 25- or 50-minute text session, reached through that engineer's link (Scope). `[DOCUMENT]` D01
- The repository is a Next.js skeleton with one page; nothing of the product exists yet. `[PRODUCT]` `app/page.tsx`, `README.md`
- The README describes a different product (ratings and reviews, rating filters, hourly rate, trial lesson, packages, video later), which conflicts with N01, N02 and D03 (Q08). `[PRODUCT]` `README.md`
- What makes it different, on checked pages: Codementor and Preply show star ratings on every card, which DevMentor excludes (N02). `[BENCHMARK]` `research/2026-09-04-benchmark-codementor.md`, `research/2026-09-04-benchmark-preply.md`
- Four of the five checked pages (Preply not checked for this) mention nothing kept from a session; DevMentor keeps a mentee-approved note (D06). `[BENCHMARK]` `research/2026-09-04-benchmark-*.md`
- That a knowledge layer will make mentors earn more or developers return is a hypothesis (A06). `[ASSUMPTION]` `research/2026-09-02-miro-board-product-goals.md`

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|
| Codementor | request-to-live-session for code help; listed React rates $15–$80 per 15 min `[BENCHMARK]` | call-based and transactional; nothing kept; every card 5.0 | 2026-09-04 | https://www.codementor.io/react-experts |
| MentorCruise | free intro call; mentor cards with price and cadence, from $100/month `[BENCHMARK]` | monthly relationship, the model the staff engineer declined | 2026-09-04 | https://mentorcruise.com/ |
| Topmate | one expert's own page and link; 10% commission on own-link sales, 20% via marketplace `[BENCHMARK]` | any profession; nothing kept | 2026-09-04 | https://topmate.io/pricing |
| Preply | 25/50-min lessons; free cancellation up to 12 h before `[BENCHMARK]` | recurring lessons, languages, ratings on cards | 2026-09-04 | https://preply.com/en/how-it-works |
| ADPList | booking in minutes, session count shown as a non-rating trust signal `[BENCHMARK]` | free, mentors not paid, career more than code | 2026-09-04 | https://adplist.org/ |

The founders' board scores and opinion table carry no rubric, links or dates and are not used here.

## Goals and success criteria

- Business goal for 1.0: show that mentors from our list earn from paid text sessions requested through their own link (D01, D09). `[DOCUMENT]` D01, D09
- The board's year-one goals (100 mentors with vaults, 30% of mentees on a vault subscription) belong to the vision and are not 1.0 targets. `[DOCUMENT]` `research/2026-09-02-miro-board-product-goals.md`
- User outcome (mentee): an answer, in text, from someone whose public work shows they have done this, without searching and arranging across channels. `[INTERVIEW]` `research/2026-09-01-interview-backend-dev-fintech.md`, `research/2026-09-02-interview-freelancer-react.md`
- User outcome (mentor): paid for questions they already answer, without invoices, chasing no-shows or being ranked. `[INTERVIEW]` `research/2026-09-03-interview-senior-python-meetups.md`
- Primary metric: paid sessions held per invited mentor during the pilot. `[DOCUMENT]` D09
- Baseline today: zero; nobody on the list has been contacted. `[DATA]` `research/2026-09-04-mentor-list.csv`
- Threshold and date: not set (Q03).
- Provisional speed targets: mentee from link to paid request within 5 minutes; mentor from invitation to a shareable page within 20 minutes. `[DOCUMENT]` D08
- What must not get worse: nothing from a session leaves the two parties without the mentee's approval (R04); no ratings (R03).

## Scope

- **Now:** build 1.0 — mentor page with public-work link, description, prices and availability, shared by link (R03, R07, R14); mentee request with question, slot and card prepayment (R05, R06, R08); mentor accept or decline (R05); live text session in a 25/50-minute slot (R01, R02); refunds and no-shows (R09–R11); optional private note approved by the mentee (R12); payout setup after the first request (R13). Then the pilot with the first batch of mentors (D09).
- **Later:** vault subscription, MCP access, AI answers from notes, Obsidian / markdown export (N03); publishing approved notes with consent and take-down (N04); opt-in public directory and search (D03); asynchronous "reply within 24h" questions (D02); company invoicing, team plans, session packs (D04); a session count or similar non-rating trust signal.
- **Not doing:** see Non-goals.

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Session | A paid 25- or 50-minute live text chat between one mentor and one mentee in a booked slot | platform | mentor, mentee |
| Request | A mentee's question, chosen length and slot, prepaid, waiting for the mentor to accept or decline | mentee | mentor, mentee |
| Share link | The address of a mentor's page, which the mentor gives to their own audience; the only way to reach a mentor in 1.0 | mentor | anyone with the link |
| Public work link | A link to what the mentor has built or written, shown instead of ratings | mentor | anyone with the link |
| Session note | A short note the mentor may write after a session; saved only after the mentee approves | mentor | mentor, mentee |
| No-show | A party who posts nothing in the session chat during the booked slot | platform | mentor, mentee |
| Vault | Later: a mentor's collection of approved notes sold as a subscription | mentor | not in 1.0 |

## Key flows

### Current state: developer stuck before a deadline

Searches docs and Stack Overflow → asks on internal Slack (nobody there) → posts on a public Discord → waits, often an hour or more, sometimes for no reply → gets a vague or wrong answer → ships a workaround, rolls back or sends an under-quoted estimate. `[INTERVIEW]` `research/2026-08-20-interview-working-dev.md`, `research/2026-09-01-interview-backend-dev-fintech.md`, `research/2026-09-02-interview-freelancer-react.md`

A paid alternative tried once: 40 minutes to find someone on Codementor, then a call failed on the microphone and the developer gave up. `[INTERVIEW]` `research/2026-09-01-interview-backend-dev-fintech.md`

### Future state (1.0): developer gets unstuck through a mentor's link

1. The developer opens a mentor's share link (posted by the mentor in their community) and sees the public-work link, what the mentor has done, prices for 25 and 50 minutes and open slots (R03, R07, R14). `[DOCUMENT]` D03, D04
2. Writes the question, picks a length and slot, pays by card (R05, R06, R08) — within the 5-minute target (D08). `[DOCUMENT]` D02, D04
3. Whether the developer needs an account or can pay as a guest is not decided; the 5-minute target and the fintech developer's "nie że zakładam konto" point toward minimal sign-up. `[ASSUMPTION]` no decision in the material
4. The mentor reads the question and accepts or declines; a decline, or no acceptance before the slot starts, refunds in full automatically (R05, R09). `[DOCUMENT]` D02, D05
5. At the slot both write in the session chat; the session screen says it is text only (R02). `[DOCUMENT]` N01, D02
6. If either side posts nothing during the slot, the no-show rule applies (R09, R10). `[DOCUMENT]` D05
7. After the session the mentor may write a short note; the mentee approves or rejects it; an approved note is visible to the two of them only (R12). `[DOCUMENT]` D06

### Future state (1.0): mentor goes from invitation to first paid session

1. A founder invites a mentor they know personally from the list (warm contacts first). `[DOCUMENT]` D09, `research/2026-09-04-mentor-list-note.md`
2. The mentor adds a public-work link, a plain description, prices per length and availability — within the 20-minute target, without payout details (R13, D08). `[DOCUMENT]` D07, D08
3. The mentor shares the page link with their own audience. `[DOCUMENT]` D03
4. A request with a question arrives; the mentor accepts or declines (R05). `[DOCUMENT]` D02
5. After the first paid request, the mentor completes payout setup before the first payout (R13). `[DOCUMENT]` D07

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | Sessions are 25 or 50 minutes. | sessions | `[DOCUMENT]` `research/2026-08-26-workshop-export.md` | active | unknown | superseding record by founder A | founder A | none |
| R02 | Sessions are text only; every session screen says so. | sessions | `[DOCUMENT]` N01 | active | unknown | superseding record by founder A | founder A | none |
| R03 | No ratings or reviews; every mentor page shows a link to public work and a plain description of what the mentor has done. | mentor page | `[DOCUMENT]` N02 | active | unknown | superseding record by founder A | founder A | none |
| R04 | Nothing from a session is published or shared beyond the two parties without the mentee's approval. | sessions, notes | `[DOCUMENT]` `research/2026-08-26-workshop-export.md` | active | unknown | superseding record by both founders | founders A and B | none |
| R05 | A request carries the mentee's question; the mentor sees it before accepting or declining; a session exists only after acceptance. | requests | `[DOCUMENT]` D02 | active | after the pilot (D09) | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |
| R06 | Slots come only from availability the mentor published. | requests | `[DOCUMENT]` D02 | active | after the pilot (D09) | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |
| R07 | The mentor sets a price for 25 and for 50 minutes; the price is shown before the mentee writes the question. | mentor page, requests | `[DOCUMENT]` D04 | active | unknown | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |
| R08 | The mentee pays the full price by card through Stripe when sending the request. | payments | `[DOCUMENT]` D04 | active | unknown | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |
| R09 | Full automatic refund, the same day and without a support ticket, when the mentor declines, does not accept before the slot starts, or is a no-show. | payments | `[DOCUMENT]` D05 | active | unknown | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |
| R10 | When the mentee is a no-show, the mentor keeps the payment. | payments | `[DOCUMENT]` D05 | active | unknown | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |
| R11 | The mentee can cancel with a full refund until the mentor accepts; not after. | payments | `[DOCUMENT]` D05 | active | after the pilot (D09) | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |
| R12 | A session note is optional for the mentor; it is saved only when the mentee approves, is visible only to the mentor and the mentee, carries the mentor's name and can be deleted by the mentor; a rejected note is not kept. | notes | `[DOCUMENT]` D06 | active | unknown | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |
| R13 | A mentor can publish a page and receive requests without payout details; payout details are required before the first payout. | mentor onboarding, payouts | `[DOCUMENT]` D07 | active | unknown | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |
| R14 | A mentor page is reached through its share link and is not listed in any public directory or search in 1.0. | mentor page | `[DOCUMENT]` D03 | active | after the pilot (D09) | superseding record by Krzysztof Marczak | Krzysztof Marczak | none |

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | Video calls | Never planned: text is the session format (R02) | founder A | active | unknown | superseding record by founder A | `[DOCUMENT]` `research/decisions/N01-no-video.md` | none |
| N02 | Ratings or reviews | Never planned: public work instead (R03) | founder A | active | unknown | superseding record by founder A | `[DOCUMENT]` `research/decisions/N02-no-ratings.md` | none |
| N03 | Knowledge-base sales in 1.0: vault subscription, MCP access, AI answers from notes, Obsidian / markdown sync | Later: the vision, after paid sessions and notes exist; mentors want to see any AI layer first | Krzysztof Marczak | active | after the pilot (D09) | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/N03-no-knowledge-base-sales-in-1-0.md` | none |
| N04 | Publishing session notes in 1.0 | Later: needs its own consent step and take-down | Krzysztof Marczak | active | after the pilot (D09) | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/N04-no-publishing-session-notes-in-1-0.md` | none |
| N05 | Learning paths, community, "mentorship journey", subscription for sessions | Never planned: every developer interviewed rejected one or more of these | Krzysztof Marczak | active | new evidence | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/N05-no-learning-paths-community-or-session-subscriptions.md` | none |

## Decisions

| Id | Date | Decision | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| D01 | 2026-10-16 | 1.0 is paid text sessions with private, mentee-approved notes; the knowledge-base vision waits (N03) | Developers asked for one fast answer, not saved knowledge or subscriptions; 25-hour build; alternative considered: the full vision. Agent recommendation accepted on blanket instruction | Krzysztof Marczak | active | after the pilot (D09) | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/D01-scope-1-0-paid-text-sessions.md` | none |
| D02 | 2026-10-16 | Request with question up front → mentor accepts → live text chat in a booked slot (R05, R06) | The Python mentor wants to see who is asking; the staff engineer accepted a question-up-front offer with "może"; alternatives: instant booking, async answer in a window. Agent recommendation accepted on blanket instruction | Krzysztof Marczak | active | after the pilot (D09) | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/D02-session-request-accept-live-text.md` | none |
| D03 | 2026-10-16 | Entry only through the mentor's share link; no directory in 1.0 (R14) | Mentors refuse being listed among strangers; no mentors yet; alternative: public directory. Agent recommendation accepted on blanket instruction | Krzysztof Marczak | active | after the pilot (D09) | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/D03-entry-through-mentor-share-link.md` | none |
| D04 | 2026-10-16 | Mentor sets price per length; card prepayment by the individual via Stripe (R07, R08) | Mentors want their own price; mentee wants price before writing; alternative: platform price, pay after. Agent recommendation accepted on blanket instruction | Krzysztof Marczak | active | unknown | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/D04-mentor-price-prepayment.md` | none |
| D05 | 2026-10-16 | Refund, no-show and cancellation rules (R09–R11) | From two interviews; alternative for cancellation: Preply's 12-hour window. Agent recommendation accepted on blanket instruction | Krzysztof Marczak | active | after the pilot (D09) | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/D05-refunds-and-no-shows.md` | none |
| D06 | 2026-10-16 | Optional private session notes, mentee-approved (R12) | Starts the mentors' asset without publishing; alternatives: keep nothing, publish. Agent recommendation accepted on blanket instruction | Krzysztof Marczak | active | after the pilot (D09) | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/D06-private-session-notes.md` | none |
| D07 | 2026-10-16 | Payout details only before the first payout (R13) | A list mentor refuses bank details before a booking; alternative: at sign-up. Agent recommendation accepted on blanket instruction | Krzysztof Marczak | active | unknown | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/D07-payout-details-after-first-booking.md` | none |
| D08 | 2026-10-16 | Provisional speed targets: 5 min mentee, 20 min mentor | Limits named in interviews, single accounts; alternative: no targets. Agent recommendation accepted on blanket instruction | Krzysztof Marczak | active | after the pilot (D09) | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/D08-provisional-speed-targets.md` | none |
| D09 | 2026-10-16 | First test is a pilot with warm-contact mentors; owner sets thresholds before invitations | Behaviour, not stated intent, is the open question; alternative: more surveys. Agent recommendation accepted on blanket instruction | Krzysztof Marczak | active | when thresholds are set (Q03) | superseding record by Krzysztof Marczak | `[DOCUMENT]` `research/decisions/D09-first-test-mentor-pilot.md` | none |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | Mentors who read the question first and answer in published slots respond fast enough for developers' blockers `[ASSUMPTION]` no material on mentor availability | high | Developers named twenty minutes, within the hour, the same day; mentors named "between meetings", no weekends (18 of 109 Discord threads were posted at weekends), and wanting to see who asks; mentor hours and response times were not obtained | Booked slots miss the urgent job; 1.0 serves only non-urgent questions or needs an on-call model | Pilot: time from paid request to acceptance and to session start, per request; ask each mentor their weekly hours (collection plan 1, 2) | Krzysztof Marczak | unknown (Q03) | untested |
| A02 | Enough mentors from the list accept, set up a page and share their link `[ASSUMPTION]` nobody contacted | high | Mentor answers are conditional: "jak ludzie, których znam", "kto jeszcze jest", a month without bookings means "zapomnę"; two mentors call their notes the real value ("całe value", "the product") and one wants them to earn without a call, which 1.0 defers (N03); 29 of 50 reachable with one message | No supply; the product cannot be tested | Invite the first batch; count pages published, availability set, links shared (collection plan 1) | Krzysztof Marczak | unknown (Q03) | untested |
| A03 | Developers pay mentor-set prices for real, not only say so `[ASSUMPTION]` stated intention only | high | 37 of 54 named a price for an answer "within an hour, over text" (a booked, accepted slot does not promise that), yet 9 said nobody would pay against 17 answering "nothing" to the price question; 3 paid someone the last time they were stuck; interview prices were a shrug, "chyba", or "poniżej 200" | Revenue model fails at its first step | Pilot: paid requests per shared link (collection plan 1) | Krzysztof Marczak | unknown (Q03) | untested |
| A04 | Mentors' own audiences contain developers with paid-worthy blockers `[ASSUMPTION]` | medium | One mentor gets weekly DMs and would send his Discord people if he earns; on the list, 16 of 50 have an audience of their own, 11 do not, 23 unknown | Share-link-only entry (D03) yields no requests | Pilot: requests per mentor by where the link was shared | Krzysztof Marczak | unknown | untested |
| A05 | Mentors write notes and mentees approve them `[ASSUMPTION]` | medium | Mentors call their notes the value; one will not write documentation for free; two of four developers said they would keep the answer themselves; two were not asked | The note step adds build cost without use; the vision loses its input | Pilot: notes written and approved per session | Krzysztof Marczak | unknown | untested |
| A06 | A knowledge layer (vault subscription, MCP) will later earn recurring revenue `[ASSUMPTION]` founders' board | medium for 1.0, high for the vision | Board positions only; three developers rejected subscriptions | The vision's business model needs a different payer or form | Not tested in 1.0; revisit after the pilot (N03) | Krzysztof Marczak | after the pilot | untested |
| A07 | Individual card payment is acceptable to employed developers `[ASSUMPTION]` | medium | Survey: 19 of 54 would pay through an employer; one interviewee pays for work only through his company | Employed developers do not convert without invoices | Ask paying and non-paying pilot mentees who would pay and what document they need (collection plan 3) | Krzysztof Marczak | unknown | untested |
| A08 | Developers will paste code or configuration into a session with a stranger `[ASSUMPTION]` | medium | The fintech interviewer noted the question about pasting production yaml was not asked | Sessions stall on what can be shared; terms need a confidentiality clause | Ask in follow-up developer interviews (collection plan 3); legal owner (Q04) | Krzysztof Marczak | unknown | untested |

## Kill criteria

The pilot (D09) decides whether to continue, revise or stop. The observations are set: mentors who publish a page and availability, links shared, paid requests, accepted and held sessions, time from request to acceptance, notes written and approved. The numbers that mean stop or revise, the observation window and who decides are not set (Q03); the staff engineer's "a month of silence" is one account to weigh. Krzysztof Marczak decides once thresholds are recorded.

## Hypotheses to test

None. No synthetic walkthroughs exist yet.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | What commission does the platform take on a session? | No for building (configurable); yes for opening real payments in the pilot | product owner (Krzysztof Marczak) | open |
| Q02 | Which currency or currencies are prices set and paid in? | No for building; yes for opening real payments | product owner | open |
| Q03 | What pilot results mean continue, revise or stop, over what window, and who decides? | No for building; yes for the decision after the pilot | product owner | open |
| Q04 | Who owns terms of service, privacy, and the handling of code pasted into sessions and of notes? The legal role is empty | No for building; yes for opening the pilot to real users | founder A by default per the RACI note; product owner to confirm | open |
| Q05 | Who handles disputes, payouts and refunds outside the automatic rules? Finance / operator has no column in the RACI | No for building; yes for opening real payments | founders | open |
| Q06 | Does a future vault answer cite the mentor and the note? (workshop, founder B) | No for 1.0 (N03); yes for vault work | founder B | open |
| Q07 | Is pricing per mentor or per platform? (workshop) | — | — | closed by D04 |
| Q08 | The README describes a different product (ratings, filters, hourly rate, trial lesson, packages); who updates it to match this brief? | No; risks confusing reviews and agents | repository maintainer | open |
| Q09 | Does QA get a sign-off role in release go / no-go, as `SDLC.md`'s QA gate requires? | No for planning; yes for the first release | founders | open |
| Q10 | Does Krzysztof Marczak hold the scope and commission authority the RACI gives founder A, or does founder A confirm D01–D09? | Yes for signing the Definition of Ready; no for a backlog dry run | Krzysztof Marczak, founder A | open |
| Q11 | Does the workshop's 25-hour build limit still bind 1.0, and does this Now scope (prepayment, held payouts, automatic refunds, no-show detection, live chat, note approval) fit it? | Yes for committing to the build; no for drafting the backlog, which shows its size | Krzysztof Marczak with founder B (tech lead) | open |

## Definition of Ready addendum (own)

Problems and Target group rest on seven interviews and one community's export and survey: enough to plan, not enough to size the market. Every decision Now depends on (D01–D08) is active, taken on the agent's recommendation under the owner's blanket instruction; the owner has not reviewed them individually, and his authority over scope against the RACI is open (Q10). Most `[DOCUMENT]` lines in Coverage (rules R05–R14, future-state flow steps, the 1.0 goal) cite those recorded decisions, not independent evidence. Whether Now fits the 25-hour build limit is open (Q11). A01–A03 are untested and are what the pilot tests; building 1.0 does not make them true. `SDLC.md` carries no ticket-level Definition of Ready and the discovery layer is not configured, so readiness here follows this skill's common rules. Ready for: implementation planning of the 1.0 scope (a backlog dry run). Not ready for: committing to the build (Q10, Q11), opening real payments (Q01, Q02, Q04, Q05) or the continue/stop call (Q03).

## Collection plan

### Do invited mentors publish, share their link and get paid requests, and how fast do they accept?

- What decision or work needs it: A01, A02, A03, A04; the continue/stop call after the pilot (Q03)
- Who can answer it: the first batch of mentors from the list and the 1.0 pilot records
- How: data request on the pilot — per invited mentor: accepted invitation, page published, availability set, link shared (where), link visits, requests started and abandoned, paid, accepted, held, earliest slot offered, the mentee's stated deadline when given, time from request to acceptance and to session start
- Owner and by when: unknown
- Template: `.ai/specs/research/templates/data-request.md`

### How many hours a week can a mentor give, how quickly can they answer, at what rate, and does their employer allow it?

- What decision or work needs it: A01, A02; pricing guidance on the mentor page (R07)
- Who can answer it: the Python meetup speaker and the staff engineer (not asked), and the first invited mentors
- How: interviews about the last week they answered someone's question and how they fit it in
- Owner and by when: unknown
- Template: `.ai/specs/research/templates/interview-note.md`

### How often are developers stuck like this, who would pay, and would they paste code to a stranger?

- What decision or work needs it: A03, A07, A08; Q04
- Who can answer it: the fintech developer and the freelancer (follow-up), and developers who request or abandon a request in the pilot
- How: interviews about the last two times they were stuck, what they tried (including AI assistants) and how it fell short, what they paid for and with what document, and what they could not share
- Owner and by when: unknown
- Template: `.ai/specs/research/templates/interview-note.md`

### Do mentors write notes and do mentees approve them?

- What decision or work needs it: A05; the move to Later work on the vault (N03, N04)
- Who can answer it: the 1.0 pilot records
- How: data request — per held session: note written, approved, rejected, deleted
- Owner and by when: unknown
- Template: `.ai/specs/research/templates/data-request.md`
