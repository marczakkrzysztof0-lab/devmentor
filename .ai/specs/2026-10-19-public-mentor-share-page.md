# Public mentor share page

Issue: #16 (E01-S03) · Epic: #8 · Depends on: #14 (`2026-10-19-mentor-invitation-and-page-publishing.md`), #15 (`2026-10-19-mentor-weekly-availability-and-open-slots.md`) · Risk: `risk-medium`

## 📝 TLDR

A mentor can publish a page and availability (#14, #15), but the share link `/m/{slug}` leads nowhere. This spec proposes (future behavior) a read-only public page that shows a developer, in this order: who the mentor is (name, link to public work, plain description), the 25- and 50-minute prices, and open slots in the developer's own time zone — with no ratings, reviews or scores, and no way to reach it except the link (R03, R07, R14). It is the developer's decision screen; the request with the question (#17) starts from it.

## Resolved assumptions (autonomous defaults)

> **2026-10-19 — owner confirmation:** Krzysztof Marczak confirmed every ⚠ item in this spec as written (chat: „Potwierdzam wszystkie decyzje ⚠ ze specyfikacji lekcji 05 tak, jak są zapisane”). Remaining ⚠ marks below are historical.

| # | Question | Chosen answer | Rationale | Flag |
|---|---|---|---|---|
| Q1 | Are slots selectable here, before #17 exists? | Slots are shown grouped by day with a 25/50 toggle, as plain text; #17 turns each slot into its request link. No dead "Book" button ships. | One capability per spec; a button that leads nowhere would fail QA. | — |
| Q2 | Search engines? | R14 is met by what we control: no directory, listing, search, sitemap entry or link to `/m/*` anywhere in the app. On top, best-effort `robots: noindex, nofollow` on `/m/*` — a crawler hint, not a guarantee (a link posted publicly can still surface). | Staff engineer's "nie wsadzajcie mnie na listę"; reversible by one line. | Accepted (grill Q2) |
| Q3 | How many days of slots? | The whole 14-day horizon from #15, grouped by day, earliest first. | The developer's job is "as soon as possible" (A01); the earliest slot comes first. | — |
| Q4 | Status code for unpublished/unknown slug? | Same not-found page for both; no mentor data, no hint whether the slug exists. | AC "no mentor data is shown"; avoids leaking drafts. | — |
| Q5 | Caching and streaming? | No caching in 1.0. The slug lookup runs before streaming, so unknown/unpublished slugs get a real 404; only the slot section streams behind its own Suspense + error boundary. | Pilot traffic is tiny; a mentor's edit must be visible immediately (#14 story 3). Revisit with `use cache` + tags if needed. | — |
| Q6 | Page language and price formatting? | Polish copy (as #14); `price_25_minor` / `price_50_minor` formatted with `Intl.NumberFormat('pl-PL', { style: 'currency', currency })` from `mentor_pages.currency`. | Currency comes from data, so Q02's answer (⚠ in #14) needs no page change. | — |

## 👤 User stories

1. **Developer with a blocker opens the link.** Kuba, a React freelancer quoting a migration tonight, clicks a link Anna posted in her Discord. On his phone he **sees**, top to bottom: "Anna K." · a prominent link "Publiczna praca: github.com/annak" · her description in plain words ("Migrowałam dwa duże projekty na server components…") · prices "25 min — 150 zł" and "50 min — 280 zł" · "Najbliższe terminy (twoja strefa: Europe/Warsaw)" with "jutro 18:00, 18:30, 19:00…". The **system** shows nothing else: no stars, no review count, no "other mentors", no search box. **Next:** he decides whether she has done this exact thing and whether a slot is soon enough; when #17 ships he picks a slot and writes his question.
2. **Developer switches length.** Kuba taps "50 min"; the list **shows** only slots where 50 minutes fit (19:30 disappears). Prices stayed visible above the whole time — he never has to write anything to learn the cost (R07).
3. **Mentor with no availability.** A developer opens Piotr's page; it **shows** the profile and prices and "Brak wolnych terminów w najbliższych 14 dniach". No slot time is rendered (#15 AC).
4. **Wrong or unpublished link.** Someone opens `/m/piotr` before Piotr has published, or a typo `/m/annak2`. They **see** a neutral "Nie ma takiej strony mentora" with no name, description, price or slot.
5. **Someone looking for mentors.** A developer goes to `/`, `/m` or tries `/m?search=react`. There is no list, directory, search or filter anywhere; `/m` is not found (R14, D03).

## 📝 Problem Statement

Developers want "someone who has done the exact thing" quickly and want the price "zanim cokolwiek napiszę" (freelancer, 2026-09-02); D08 gives them 5 minutes from link to paid request. Mentors refuse ratings and listings (N02, D03). The share page is the only surface where a developer meets a mentor in 1.0, so its content and its absences are the product's trust model: public work instead of stars. Competitors (Codementor, Preply) put ratings on every card — the one thing this page must not have.

## 📝 Proposed Solution

- Route `app/m/[slug]/page.tsx`, server-rendered. **One query on `mentor_pages` alone** (no join to `mentors`) with `WHERE slug = $1 AND published_at IS NOT NULL` builds the public DTO with an explicit allowlist: `displayName`, `publicWorkUrl`, `description`, `price25Minor`, `price50Minor`, `currency`, `slug`. Its `mentor_id` stays server-side and is the only key the slot query uses, so slots are read only for a published page. `mentors.email` is never selected; `mentors.time_zone` and windows are read server-only for the slot section and never serialized.
- Slots: `listOpenSlots` from #15 at request time (`busy = []` until #17 passes its held ranges), as UTC ISO strings to a small client component that formats them in the viewer's zone and handles the 25/50 toggle. If the browser zone is missing or the formatter throws, it falls back to UTC and labels times "UTC".
- Description rendered as plain text with line breaks preserved (no HTML, no Markdown). Public-work link: `rel="nofollow noopener ugc"`, `target="_blank"`, full hostname visible so the developer sees where it goes.
- Alternatives: rendering slots in the mentor's zone (confusing for a viewer elsewhere); embedding the request form here (that is #17, and R07 wants prices before any question field — satisfied by order on this page and kept by #17).

## 📝 Architecture

- New: `app/m/[slug]/page.tsx` (+ `not-found`, slot-section Suspense/error boundary), `lib/mentor-page/public.ts` (DTO query, server-only), `app/m/[slug]/slot-list.tsx` (client).
- Reuses: `lib/db` (#14), `listOpenSlots` and window queries (#15). No new tables.
- Future consumer: #17 adds per-slot links (`slug`, `startsAt`, `lengthMinutes`) and its request form below the slot list; it must re-validate the slot server-side with `listOpenSlots` (see #15).

## 📝 UI/UX

Order on the page is a requirement, not styling: identity → public work → description → prices → slots → (later #17: question). Mobile-first (developers arrive from Discord/Slack links on phones); with a 400-character description, identity, public work and prices fit the first screen at 375 × 812. States: published with slots; published without slots (story 3); not found (story 4); slot load error ("Nie udało się wczytać terminów — odśwież stronę", profile and prices still shown). Accessibility: slot toggle is a real radio group; times include the date in text, not only by grouping; the viewer's zone is printed in the heading. Page `<title>`: "{displayName} — DevMentor". Absent by design: ratings, reviews, scores, session counts, "similar mentors", search, filters, share counters.

## 📝 Edge Cases & Failure Scenarios

- Mentor edits price while a developer has the page open: the developer sees the old price until reload; #17 must charge the price read at request time and show it again before payment.
- Very long description (2000 chars): wraps; no truncation that could hide what the mentor has done.
- No `dangerouslySetInnerHTML` anywhere on the page (name and description are untrusted text).
- Slot loading fails: the slot section's error boundary shows "Nie udało się wczytać terminów — odśwież stronę"; profile and prices stay.
- Windows exist but yield no slot (all inside the 3-hour notice, zone not set, later all busy): same neutral empty state.

## 📝 Risks & Impact Review

- `/m/[slug]` becomes a protected public URL (`BACKWARD_COMPATIBILITY.md` "dziś" table): mentors post these links; a later route change needs redirects.
- The DTO allowlist is the guard against leaking `mentors.email` or draft content; a test pins its keys.
- `noindex` is best-effort (Q2); once indexed, de-indexing is slow — the safe default is not to index.

## 📝 Decisions in play

Relies on R03, R07, R14, D03, D08, N02. Leaves open Q02 (currency display follows data). Supersedes nothing. Owner: Krzysztof Marczak; R03/N02 owner: founder A.

## 📋 Phasing

- **Phase 1 — Profile and prices:** `/m/[slug]` with identity, public work, description, prices, 404, noindex. Mergeable after #14; the slot section is absent. Delivers stories 3–5 only, not story 1.
- **Phase 2 — Open slots:** slot list with viewer-zone formatting and the 25/50 toggle, after #15.
- **Release gate:** no invitation goes to a real mentor until Phase 2 is merged (with #14's own gate).

## 📋 Implementation Plan

**Phase 1 — Profile and prices**

1. `lib/mentor-page/public.ts`: `getPublishedPageBySlug(slug)`. Tests (DB-backed): published page returned with exactly the allowlisted keys (no email, no time zone, no mentor id); draft slug and unknown slug both return null (AC unpublished).
2. `app/m/[slug]/page.tsx` + 404 + `noindex` metadata. Tests: rendered HTML of a published page contains name, public-work URL, description and both formatted prices, in that document order, and no question field (AC R03, R07); contains none of "ocen", "opini", "rating", "review", "★" (AC N02); draft and unknown slugs return 404 and render no mentor name, description or price (AC); the response carries `noindex`.
3. No-directory guard within the new segment: `/m` and `/m?search=react` return 404; `/m/[slug]` renders no other mentor and no search UI (AC R14).

**Phase 2 — Open slots**

4. Slot section: server-only query for windows + zone, `listOpenSlots`, ISO slots to `slot-list.tsx`, inside its own Suspense + error boundary. Tests: slots shown equal the function's output for a fixed clock; mentor without windows, and mentor whose windows all fall inside the notice, show the empty-state text and no slot time (#15 AC); a throwing slot loader still renders profile and prices.
5. `slot-list.tsx`: viewer-zone formatting, day grouping, 25/50 toggle. Unit test of the grouping/formatting helper (`.mjs`) for two zones and for an invalid zone (→ UTC label). QA in a real browser at 375 px and desktop, including the no-slots and not-found states (`needs-qa`).

## 🔍 Review & grill outcome

GPT review → decisions:
- **High, DTO may leak draft data:** accepted — all public fields from `mentor_pages` alone, `published_at IS NOT NULL` in the same query, slot query keyed by that row's `mentor_id`.
- **High, `noindex` is not a guarantee:** accepted — R14 is met by no directory/search/sitemap in the app; `noindex` reworded as best-effort.
- **Medium, Phase 1 lacks story 1's slots:** accepted — Phase 1 scoped to stories 3–5, release gate: no real invitations before Phase 2.
- **Medium, invalid viewer time zone:** accepted — fallback to UTC on missing zone or formatter error; tested.
- **Low, directory tests on unrelated routes:** accepted in part — kept `/m` and `/m?search=` (new segment), cut `/mentors` and `/`.

Grill (`reviews/2026-10-19-public-mentor-share-page.grill.md`): 2 rounds, 8 questions, all accepted on owner's blanket yes; none ⚠ here (currency display follows data; Q02 stays ⚠ in #14). Shared decision applied: slot section passes `busy = []` until #17 wires its held ranges.
