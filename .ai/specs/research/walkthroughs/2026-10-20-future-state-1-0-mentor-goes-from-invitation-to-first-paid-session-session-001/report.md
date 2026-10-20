# Walkthrough: Future state (1.0): mentor goes from invitation to first paid session, `.ai/prototypes/discovery/mentor-onboarding/revision-001/index.html`, 2026-10-20

The most consequential repeated hypothesis: every persona in both runs would stall at the price fields, because the prototype does not show a commission or what the mentor keeps and does not let them offer only 25 minutes. Two of the four would leave the form without publishing. In both runs the selective personas would also not open availability until they see "who else is here" and get a booking from someone they know. Next real check: at the first pilot invitations, watch 3–5 mentors from the list fill in the page and availability, and ask what stopped them at prices and at availability. Every finding is synthetic and does not satisfy the Definition of Ready.

Stance: validate (owner's choice; the brief's mode `own` would default to adversary)
Panel: 2 runs × 2 personas; run 1: P01, P02; run 2: P03, P04
Basis: `product-brief.md` (Key flows, Business rules, Non-goals, Scope, Glossary) `[DOCUMENT]`; mentor interviews `2026-08-22-interview-mentor.md`, `2026-09-03-interview-staff-engineer-declined-before.md` `[INTERVIEW]`; mentor list `2026-09-04-mentor-list.csv` + note `[DATA]`; prototype `index.html` + `README.md` `[PRODUCT]` (simulation)
Panel snapshot: `.ai/specs/research/walkthroughs/2026-10-20-future-state-1-0-mentor-goes-from-invitation-to-first-paid-session-session-001/personas.md`
Session: `.ai/specs/research/walkthroughs/2026-10-20-future-state-1-0-mentor-goes-from-invitation-to-first-paid-session-session-001/`; subject `.ai/prototypes/discovery/mentor-onboarding/revision-001/index.html`; flow "Future state (1.0): mentor goes from invitation to first paid session"
Composition: assumed. There are two segments with one interview note each, and no data gives the shares between them. The run-2 corners come from the mentor list: no own audience (11 of 50), nobody on the team knows them (21 of 50). ⚠️ Homogeneous by construction: P01/P03 and P02/P04 each rest on one note.
Saturation: not reached. Run 2 added 3 new topics (no own audience, self-promotion on someone else's Slack, a weekend slot that "should not exist") out of about 40 in the last three interviews.
Parity: 8 of 15 held-out themes (11 of 15 counting partial) against `2026-09-03-interview-senior-python-meetups.md`. Real-only and panel-only lists are in `calibration.md`.
Elapsed: about 10 min wall-clock (personas and scripts ~3 min, two runs of two parallel persona subagents ~3.5 min, transcripts, consolidation and parity ~4 min)
Not askable of this panel: A03, A07, A08 (developer side); A05, A06 (not in 1.0). A01, A02 and A04 were asked; A01 and A04 got mostly "no basis" from segment A (gap in the material).

## 🎯 Scope and limits

- **Medium: prototype read from its code and text, with no browser.** The configured provider `agent-browser` is not installed. On the owner's instruction nothing was downloaded, and no other browser was substituted. The main agent wrote down each screen's visible text, controls and results from `index.html` (E1 invitation → E2 page editor → E3 published → E4 availability → E5 requests + payout banner → E6 request decision → E7 payouts). Each persona chose its actions against that description. Nobody clicked the prototype, so there are no screenshots, and focus, keyboard and narrow-viewport behaviour were not observed. (A separate manual click-through by the coordinator is in `lekcja-07/weryfikacja-szarego-prototypu.md`.)
- Each persona ran in one fresh subagent pass: interview, decision simulation, then the walk. The walk was not interactive step by step; the outcomes of every control were given up front.
- Not walked: founder's CLI invitation, real Stripe onboarding, email/other notifications, sharing in a community, the session chat, no-show handling, the developer side. Test-state controls (simulated request, lapse, withdraw) were not shown to personas; the main agent applied "a request from Marek arrives" after availability.
- Role: the mentor signed in through the invitation. Only fictitious data was entered.

## 🔍 Barriers that repeated (all three tied)

### 1. Pricing blind: no commission or "you receive", no reference, both lengths required → the mentor stalls at E2 or leaves before publishing.

[SYNTHETIC]

Weight 4; spread ±0; personas P01, P02 (run 1), P03, P04 (run 2); tied with 2 and 3.
E2 "Cena za 25 / 50 minut", hint "Cena to pełna kwota, którą płaci developer". Fast reactions: "Jak mam to wycenić na ślepo?" (P03), "Po co mi 50?" (P02). In D1 (20 minutes between meetings), P02, P03 and P04 closed the tab without publishing. P01 typed a guessed value because there is no draft and he feared losing his input. With 5 minutes, all four would not finish. This rests on the persona lines "price unknown / high as a filter" and on the gap noted in the material (rate never obtained).
Touches R07, D08 (20-minute setup target), Q01 (commission open), P04 assumption (no net amount), A02.
Real check: in the pilot, record per invited mentor the time on the page form and whether they published in the first sitting. Ask: "What did you look at or ask before typing your prices?"

### 2. Weekly availability does not match how these mentors give time ("between meetings", "two evenings a month"): one window per day, no cap, no pause.

[SYNTHETIC]

Weight 4; spread ±0; P01, P02 (run 1), P03, P04 (run 2); tied.
E4: a 7-day table with 18:00–20:00 prefilled, one window per day, no limit or exceptions. P01/P03: "Nie da się ustawić dwóch wieczorów w miesiącu". P02/P04: "Między spotkaniami nie mam jednego okna". All four would set Monday 18–20 as a workaround. Two said they would watch and reject the excess by hand.
Touches R06, A01 (mentor availability and speed), A02.
Real check: collection plan 2 (mentor hours). Ask pilot mentors "Last week, when did you answer someone, and how did it fit your day?", then compare with the availability they saved.

### 3. A request is visible only inside the app, so it would lapse unseen and the mentor would not know.

[SYNTHETIC]

Weight 4; spread ±0; P01, P02 (run 1), P03, P04 (run 2); tied.
E5 is the only place a request appears (P03 assumption: the #17 email is not simulated). In D2 (meetings until 17:30, slot at 18:00), P01 and P03 would miss it, and the auto-refund would hide it from them. P02/P04: "żyję na Slacku"; a Saturday request would go unseen.
Touches A01, R09, P03 assumption, #17.
Real check: pilot export: time from paid request to acceptance, and lapsed requests per mentor. Ask the mentor where they first learned about each request.

## 📋 Missing cases that repeated

[SYNTHETIC]
**No preview and no draft before publishing; the address is irreversible; the page is live before availability exists.** Weight 4, ±0, P01–P04. E2/E3 ("Już opublikowana? Nawet jej nie widziałam"). Three of four would not paste the link until they had seen the page. Touches P05, R14. Check: in the pilot, ask whether they looked at their page before sharing; record time from publish to first share.

[SYNTHETIC]
**At the decision, the mentor cannot ask a clarifying question, answer in writing asynchronously, or shorten to 25 minutes.** Weight 4, ±0, P01–P04 (E6: "Pewnie 10 minut, jak wklei kod"). Touches R05, D02 (async is Later). Check: for each pilot request, ask the mentor what they would have wanted to do instead of accept/decline, and log declines and lapses with reasons.

[SYNTHETIC]
**The payout screen does not say the commission, when money arrives, or how invoice and tax work.** All four would defer Stripe until after a session. Weight 4, ±0, P01–P04. Touches Q01, Q05, R13, P02 assumption. Check: in the pilot, record time from first paid request to completed payout setup, and ask "What did you need to know before giving payout details?"

[SYNTHETIC]
**The invitation is anonymous ("Zespół DevMentor"): it shows no inviter name, no other mentors, no commission, and no "not now".** Weight 4, ±0, P01–P04. P04 (unknown founder) closed the tab at first approach. Touches D09 (warm contact), A02, P01 assumption. Check: in the pilot, compare invitation acceptance when the message names the founder with acceptance when it does not; ask what they wanted to know before clicking.

[SYNTHETIC]
**A mentor who does not need the money may never set up payouts, and nothing covers that case.** Weight 2, ±0, P02 (run 1), P04 (run 2), segment B only ("może na nigdy"). Touches R13, Q05. Check: pilot export: mentors with held sessions and no payout setup after N days; ask them why.

## ⚠️ Contradictions with the brief

[SYNTHETIC]
**Both lengths are required (D12) against "25 is fair, most questions take 10".** Weight 4, ±0, P01–P04. P04 would set the 50-minute price "zaporowo" so that nobody books it. Touches D12, R01, R07. Check: in the pilot, count 50-minute prices set far above twice the 25-minute price, and 50-minute bookings; ask mentors which length they wanted to offer.

[SYNTHETIC]
**Segment A: the flow sells the mentor's time, while they want their notes to earn ("Codementor bis").** Weight 2, ±0, P01 (run 1), P03 (run 2). In D4, both would accept a paid "jak zacząć" and paste from their file. Touches the Vision, D10, N03, A05/A06, and the A02 evidence ("całe value"). Check: ask pilot mentors after their first session what they reused from their own notes, and whether they would continue without the notes layer.

[SYNTHETIC]
**Segment B: availability is required before trust exists.** They want to see "who else is here" and a first booking from someone they know, and without availability nobody can book. Weight 2, ±0, P02 (run 1, set availability only "testowo"), P04 (run 2, stopped at E4). Touches D09, R06, A02. Check: in the pilot, record mentors who publish a page but no availability; ask them what would make them open slots.

Repeated pattern in the decision simulation, not a defect: segment B (P02, P04, both runs) would accept 50 minutes at 18:00 from a stranger when the question is "a concrete broken thing", against their own stated rules. This would support the question-up-front design (R05/D02). Check: ask pilot mentors about the accept/decline reason per request.

## 🔍 Outliers

P04 (run 2) is the only persona who stopped inside the flow, at E4, because of the trust loop above. Her conditions to return: she sees other mentors, and someone she knows wants to book. She also closed the invitation at first approach, since nobody on the team knows her (corner from 21 of 50 on the list). Of everything in this panel, her path is the closest to the brief's "a month of silence means lapse".

## 🔁 Seen once, not reported as a finding

- P03 (run 2): with no audience of his own, "wklej tam, gdzie ludzie już pytają" means one-to-one DMs only; no self-promotion on someone else's Slack (A04; 11 of 50 on the list).
- P04 (run 2): a weekend slot "shouldn't exist"; she would see a Saturday request on Monday "o ile pamiętam, że mam konto".
- P03 (run 2): changed the suggested slug "na bezpieczny" because it cannot be changed later.
- P02 (run 1): with only 5 minutes she would not even message the founder, so the thread is at risk of being lost.

## 🧪 To confirm with real users

| # | Hypothesis | Persona ids / runs | Settles | Who to recruit | How |
|---|---|---|---|---|---|
| 1 | Mentors stall at prices without commission/net and a reference | P01, P02 / 1; P03, P04 / 2 | R07, D08, Q01, A02 | first pilot mentors (3–5, warm and introduced) | observe page setup; time on form; "what did you check before typing prices?" |
| 2 | Weekly windows do not fit "between meetings" / "two evenings a month" | P01–P04 / 1–2 | A01, R06 | pilot mentors; the Python and staff engineers (collection plan 2) | "last week you answered someone: when, how long?" vs saved availability |
| 3 | In-app-only notice → requests lapse unseen | P01–P04 / 1–2 | A01, R09, #17 | pilot mentors | export: request→acceptance time, lapses; "where did you first see it?" |
| 4 | No preview or draft delays sharing | P01–P04 / 1–2 | P05, R14 | pilot mentors | publish→first share time; "did you check your page first?" |
| 5 | Mentor wants to clarify, answer async, or shorten | P01–P04 / 1–2 | R05, D02 | pilot mentors | per request: "what did you want to do instead?" |
| 6 | Payout setup deferred without commission, timing, tax info | P01–P04 / 1–2 | R13, Q01, Q05 | pilot mentors | first request→payout setup time; "what did you need to know?" |
| 7 | Anonymous invitation lowers acceptance (esp. introduced mentors) | P01–P04 / 1–2 | D09, A02 | invited mentors, warm vs introduced | acceptance by invitation wording; "what did you want to know before clicking?" |
| 8 | Money-indifferent mentors never set up payouts | P02 / 1; P04 / 2 | R13, Q05 | pilot mentors with held sessions | export: sessions held without payout setup |
| 9 | Both lengths required conflicts with 25-only intent | P01–P04 / 1–2 | D12, R01 | pilot mentors | 50-min price vs 2× 25-min; 50-min bookings; "which length did you want?" |
| 10 | Notes-first mentors see 1.0 as "Codementor again" | P01 / 1; P03 / 2 | Vision, D10, N03, A02 | notes-first mentors (2022 profile) | after first session: "what did you reuse from your notes; would you continue?" |
| 11 | Selective mentors withhold availability until trust (who else, known booker) | P02 / 1; P04 / 2 | D09, R06, A02 | selective seniors from the list | count published-without-availability; "what would make you open slots?" |

## 📝 Interviews

Transcripts: `transcripts/run-1-P01.md`, `transcripts/run-1-P02.md`, `transcripts/run-2-P03.md`, `transcripts/run-2-P04.md`. Grounding flags: P02 and P04 retold passage episodes (Q6 "7:40", Q7 "ok, ale pewnie powiem nie") as their own; those answers carry no finding on their own. Acquiescence: 8 yes of 16 answered balanced questions (0.5), each matching the persona lines, so no acquiescence was flagged. No stated-preference question was asked. Prices were marked [bez podstawy]; the only number used is "two evenings a month" from the note.

## 🔍 Parity with real interviews

Held out: `2026-09-03-interview-senior-python-meetups.md` (it built no persona).
- **Shared themes:** recurring questions answered from a paste doc; the doc is the value; no ratings; no bank details before a booking; invoices; see who asks / no homework questions; joins if people he knows are there; wants a price reference; 20-minute setup limit (partial); name and consent on anything published (partial). The sentiment matches: wary, conditional.
- **Real-only (blind spots, material to gather):** asking for money feels awkward ("dziwnie by było prosić"); a mentee no-show should still pay the mentor; he brings his Discord audience only if it earns; anger at content reused without asking and the wish to be told about any AI use; the specific pricing move "look at others, go a bit lower". The no-show theme was outside this walk.
- **Panel-only (questions for the next interview):** availability model; in-app-only notices; preview/draft/irreversible slug; forced 50 minutes; async/clarify at decision; commission blocking pricing; payout timing/tax; anonymous invitation. Most are screen-level, and the real note never saw screens.
- Limitation: the held-out note was not run on this script; the number is in `calibration.md` as a first trend point.

## 📸 Evidence

No screenshots. The prototype was read from its code and text, with no browser walk. Screen states come from `index.html` (sections `#zaproszenie`, `#edytor`, `#opublikowano`, `#dostepnosc`, `#panel`, `#zapytanie`, `#wyplaty`).

Personas: .ai/specs/research/personas.md
Walkthrough: .ai/specs/research/walkthroughs/2026-10-20-future-state-1-0-mentor-goes-from-invitation-to-first-paid-session-session-001/report.md
Runs: 2 runs × 2 personas; 11 findings survived every run; saturation not reached
Parity: 8 of 15 held-out themes (11 of 15 with partial) vs 2026-09-03-interview-senior-python-meetups.md
Hypotheses: 11 to confirm with real users
Next: om-discover --refresh
