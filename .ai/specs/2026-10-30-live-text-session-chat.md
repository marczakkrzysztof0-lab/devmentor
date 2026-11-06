# Mentor and developer hold the session as a live text chat in the booked slot

Issue: #20 (E03-S01) · Epic: #10 · Depends on: #18 accept (spec `2026-10-19-mentor-accepts-or-declines-request.md`, its contract „the chat is keyed by `requests.id` of an `accepted` request”), #17 request page `/r/{token}` (spec `2026-10-19-prepaid-request-with-question.md`), #14 mentor sign-in · Consumed by: #21 no-show settlement (spec `2026-10-30-no-show-settlement.md`) · Risk: `risk-high` (data scoping: private session content, R04; schema migration)

## 📝 TLDR

After #18 an accepted request is a booked session, but there is nowhere to hold it: both pages say *czat tekstowy* and stop there. This spec proposes (future behavior) a text chat on the two pages each party already has — the developer's `/r/{token}` and the mentor's `/mentor/requests/{id}` — open for posting exactly during the booked slot, refreshed every few seconds, readable afterwards by the two parties only. Every message is stored with the database time, which is the evidence #21 settles no-shows from (R15).

## Resolved assumptions (autonomous defaults)

> **2026-10-30 — owner confirmation:** Krzysztof Marczak confirmed every ⚠ item in this spec as written (chat 2026-10-30; record D13, `research/decisions/D13-lesson-11-e03-spec-defaults-confirmed.md`). Remaining ⚠ marks below are historical.

> Autonomous run 2026-10-30 (lesson 11). Every ⚠ item is collected for Krzysztof Marczak in `2026-10-30-e03-decisions-for-review.md`; the spec is built on the recommendation until he overrides it.

| # | Question | Chosen answer | Rationale | Flag |
|---|---|---|---|---|
| Q1 | How is the chat "live"? | Short polling: the open page asks for new messages every 3 s (`GET`, cursor = last seen sequence number); a sent message appears at once for its author. No WebSocket / SSE. | Works on any Next.js host and serverless; no new dependency; 3 s is live enough for text answers (`/r/{token}` already polls payments every 3 s). A push channel can replace polling behind the same message API later. | ⚠ NEEDS HUMAN CONFIRMATION |
| Q2 | When can people post? | Only during the slot `[slot_start, slot_end)` by the database clock. Before: the chat shows *Czat otworzy się {data godzina}*; after: read-only. No early entry, no grace minutes. | R15 counts posts "during the slot"; one window for posting and for the no-show rule leaves nothing to argue about. | ⚠ NEEDS HUMAN CONFIRMATION |
| Q3 | Is the chat readable after the slot? (open question on #20) | Yes, read-only, for the two parties only: the developer while the `/r/{token}` link is valid (30 days after the slot, #17), the mentor on the request detail page for as long as the request is shown to them. | The answer is what the developer paid for; R04 is about third parties, not about the two parties keeping it. Deleting earlier is a later privacy call (Q04 legal owner). | ⚠ NEEDS HUMAN CONFIRMATION |
| Q4 | Edit / delete messages? | No. A message is final once sent. | Messages are the no-show evidence (#21); editing would need history. | ⚠ NEEDS HUMAN CONFIRMATION |
| Q5 | Message format | Plain text, whitespace and line breaks preserved (developers paste code); no Markdown rendering, no links made clickable, no attachments or images. 1–4000 characters after trimming. | Smallest safe surface (no HTML injection, no file storage); 4000 matches the question limit (#17). | ⚠ NEEDS HUMAN CONFIRMATION |
| Q6 | Abuse limit | 500 messages per session in total; the 501st is refused with *Limit wiadomości w tej sesji został osiągnięty*. | Cheap guard against a script filling the table; a real 50-min session is far below it. | — |
| Q7 | Reminder when the slot starts? | None in this spec. The developer's acceptance email (#18) and the mentor's request list already show the slot. | Least new surface; whether reminders reduce no-shows is a pilot question (A01). | ⚠ NEEDS HUMAN CONFIRMATION |
| Q8 | Where does the chat live? | On the existing pages: `/r/{token}` (developer, token = credential, as in #17/D12) and `/mentor/requests/{id}` (mentor, #14 session). No new page URL. | Both parties already have and bookmark these links; no new token or URL contract. | — |
| Q9 | Names in the chat | Mentor sees the developer's `mentee_name` (#17, immutable on the request); developer sees the mentor's current display name (`mentor_pages`); own messages labelled *Ty*. Names are read at display time, never copied into messages. | Mentors want to see who asks (D02); no email addresses ever shown. | — |
| Q10 | How long are messages kept? (review) | In 1.0 messages are kept with the request; no automatic deletion, no deletion request flow. Access ends as in Q3; a deletion request is handled by hand by the founders until Q04 names a legal owner and a retention period. | Q04 (legal owner) is open; deleting automatically would also delete #21's evidence while a dispute (Q05) may still come. | ⚠ NEEDS HUMAN CONFIRMATION |
| Q11 | Rate limiting the token endpoint? (review) | No per-IP rate limit in 1.0. The token is 256 random bits (guessing is infeasible), each response is bounded (≤ 200 messages, ≤ 4000 characters each) and the client polls every 3 s only while the tab is visible. A host-level limit can be added without changing the contract. | No rate-limit infrastructure exists in the app; the risk is cost, not access. | ⚠ NEEDS HUMAN CONFIRMATION |

## 📝 Problem Statement

The brief's whole 1.0 promise ends in this step: „At the slot both write in the session chat; the session screen says it is text only” (Key flow step 5, R02, N01). Mentors agreed to paid text sessions only if the platform handles the exchange and no-shows (`[INTERVIEW]` 2026-09-03); developers pay before the slot and today have nowhere to meet the mentor. Without the chat no session can be held, and #21 has nothing to decide a no-show from.

## 👤 User stories

1. **Both are there.** Kuba's session with Anna is today 12:30–12:55. At 12:25 Kuba opens his `/r/{token}` link: *Zaakceptowane — sesja dziś 12:30 (czat tekstowy)*, the chat panel says *Czat otworzy się o 12:30* and *Sesja odbywa się wyłącznie na czacie tekstowym — bez wideo i rozmowy głosowej*. At 12:30 the box unlocks without a reload; he pastes his error. Anna, on `/mentor/requests/{id}`, sees Kuba's message within ~3 s, answers; both see *Zostało 22 min*. At 12:55 the box locks: *Sesja zakończona — czat tylko do odczytu*.
2. **Late tab.** Anna types her last answer at 12:54:58 and presses *Wyślij* at 12:55:01. The **system** refuses (`closed`) and she sees *Sesja już się zakończyła — wiadomość nie została wysłana*; her text stays in the box so she can copy it.
3. **Somebody else.** Kuba forwards nothing, but mentor Bartek guesses `/mentor/requests/{id}` of Anna's session: *Nie ma takiego zapytania albo nie masz do niego dostępu*, no messages. A random `/r/{token}` → 404. The message API answers the same `not_found` for both, without saying whether the session exists.
4. **Offline for a moment.** Kuba's Wi-Fi drops; polling fails three times → *Brak połączenia — próbujemy ponownie*; sending shows *Nie udało się wysłać — spróbuj ponownie* and keeps the text. When the network returns, missed messages arrive in order.

## 📝 Proposed Solution

> **UI/UX:** Polish copy, gender-neutral (C12): „Twoja wiadomość”, „Napisz wiadomość”, never gendered verbs about either party.

- **Session = accepted request** (#18 contract). The chat exists for requests in `accepted` (and, after #21, in its settled states, read-only). In any earlier or refunded state the chat is not shown and the API returns `not_found`.
- **Posting** (`postSessionMessage`): one transaction — `SELECT … FROM requests WHERE id = $1 FOR UPDATE`, then read the time **after** the lock is held (`clock_timestamp()`), check `status = 'accepted'` and that time in `[slot_start, slot_end)`, check the 500 cap, insert with `created_at` = that time. The row lock is held until commit, so it serializes posts within one session (two humans — no contention) and posts with #21's settlement (protocol below).
- **Lock protocol with #21 (one rule for both specs):** a post holds `FOR UPDATE` on the request row from before its time check until commit. Settlement selects ended `accepted` rows with `FOR UPDATE SKIP LOCKED`: a row held by a post in flight is **skipped** and settled by the next job run, after the post committed (or was refused). A post that starts while settlement holds the row waits, then re-reads the row (READ COMMITTED re-check), sees a settled status and is refused `closed`. Either way a stored message is always visible to the settlement that decides the session. Both orders are covered by two-connection tests.
- **Why `seq` is a safe cursor:** `seq` comes from an identity sequence, so values are not ordered by commit across the whole table — but the cursor is per session (`request_id = $1 AND seq > $after`), and inside one session the next insert can only take its `seq` after the previous post committed and released the row lock. So within a session `seq` order = commit order, and a poller cannot see `seq` n+1 before n. Gaps (rolled-back inserts) are harmless.
- **Reading** (`listSessionMessages`): messages of one session with `seq > after`, oldest first, at most 200 per call, plus `hasMore`, the session phase (`before` / `open` / `ended`), `opensAt`, `closesAt` and the server `now` — the client never decides the window from its own clock. The client sets `after` to the last `seq` it received; while `hasMore` it fetches again at once before returning to the 3 s rhythm; it dedupes by `id`.
- **Two thin route handlers** call the same core, one per credential:
  - developer: `GET|POST /api/r/session` with the link token in the `X-Request-Token` header (never in the URL or body logs);
  - mentor: `GET|POST /api/mentor/requests/{id}/session`, mentor id only from `getCurrentMentor()` (cookie), request id untrusted (shape-checked).
  Both: `Cache-Control: no-store`, JSON, `not_found` (404) for anything not theirs; mentor without a session → 401 `signed_out`.
- **Client** (`SessionChat` in `@devmentor/ui/product`, wrapped by a small client component in each page): polls every 3 s only while the tab is visible and the phase is `before`/`open` (plus one final poll after `closesAt`); after `ended` it stops. Optimistic append of the author's own message only after the server answers `ok` (no fake bubbles). `aria-live="polite"` region for new messages, focus stays in the box after sending, `Ctrl+Enter` sends.
- **Text-only notice** on every session screen (R02): *Sesja odbywa się wyłącznie na czacie tekstowym — bez wideo i rozmowy głosowej.* No video or voice control anywhere (N01).

Rejected: WebSocket/SSE server (needs a long-lived process; not every host supports it — reversible later); a third-party chat service (sends private session content outside the two parties and the platform, R04/Q04); `router.refresh()` polling (re-renders the whole page every 3 s and re-runs unrelated queries); server actions for polling (Next.js runs a client's actions one at a time, so a slow poll would block *Wyślij*).

## 📝 Architecture

- New module `lib/sessions/` (`messages.mjs` core with JSDoc, `server.ts` `server-only` wrappers) — same split as `lib/requests` (`.mjs` tested with `node --test`, thin `.ts` for cookies and pool).
- Reuses: `hashToken` / `isLinkTokenShape` (`lib/auth/tokens.mjs`) and the #17 token-validity rule (30 days after `slot_end`); `getCurrentMentor()` (#14); `withTransaction` (`lib/db/pool.mjs`).
- Pages: `app/r/[token]/request-view.tsx` shows the chat when the request is accepted (and after #21 when settled); `app/mentor/requests/[id]/page.tsx` shows it under the accepted request.
- DS: new `packages/ui/src/product/e03/SessionChat.tsx` (+ stories with axe, E03 screens story) built from existing components (`Textarea`, `Button`, `StatusText`, `Alert`, `Panel`) and tokens; no new primitive.
- `proxy.ts` unchanged: the API paths are under `/api`, not `/r/*`.
- Consumers: #21 reads `session_messages` to decide no-shows; the pilot export (D10) can count messages per session (not their content).

## 📝 Data Model

Migration `0007_session_messages`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `seq` | bigint identity | polling cursor; order within a session |
| `request_id` | uuid FK → `requests(id)` ON DELETE RESTRICT | the session |
| `author` | text CHECK IN (`mentor`, `mentee`) | role, never a person id from the client |
| `body` | text CHECK `char_length(btrim(body)) BETWEEN 1 AND 4000` | stored as sent (trim only for the check); never logged, never in emails |
| `created_at` | timestamptz | database time read after the row lock (`clock_timestamp()`, injected in tests) — the moment the post was accepted, which is the no-show evidence; not a delivery time |

Index `(request_id, seq)`. No `updated_at` (immutable). Sensitive: body is private session content (R04, A08) — read only through the two scoped paths above; error logs carry only error names.

## 📝 API Contracts

| Call | Input | Success | Refusals (nothing stored) |
|---|---|---|---|
| `GET /api/r/session?after=<seq>` | header `X-Request-Token` | `{ phase, opensAt, closesAt, now, viewer: "mentee", messages: [{ id, seq, author: "me"\|"other", authorName, body, createdAt }], hasMore }` | 404 `not_found` (bad/expired token, request not accepted/settled) |
| `POST /api/r/session` | header token; JSON `{ body }` | 201 `{ ok: true, message }` | 400 `invalid_body` (empty / > 4000 / not text); 409 `not_open` (before slot), `closed` (after slot or settled), `limit_reached`; 404 `not_found` |
| `GET /api/mentor/requests/{id}/session?after=<seq>` | mentor cookie | same shape, `viewer: "mentor"` | 401 `signed_out`; 404 `not_found` (other mentor's, unknown, bad id shape, not accepted) |
| `POST /api/mentor/requests/{id}/session` | mentor cookie; `{ body }` | as above | as above + 401 |

`after` defaults to 0, non-integer → 0. Bodies > 16 KB are rejected before parsing (413 `too_large`).

**Cross-site protection (both POST routes):** (1) only `Content-Type: application/json` is accepted (415 otherwise) — a cross-site JSON POST needs a CORS preflight, which the app never answers, so a foreign page cannot send one with the mentor's cookie; (2) when an `Origin` header is present it must equal the origin of `NEXT_PUBLIC_APP_URL` (`appBaseUrl()`, the same canonical URL the emails use), else 403 `forbidden_origin`; a missing `Origin` (non-browser clients) is allowed, because without a browser there is no ambient cookie to abuse and the developer route needs the token anyway. Tests: foreign `Origin` → 403, form content type → 415, matching origin → 201.

**Token handling:** the token travels only in the `X-Request-Token` header; the app never logs request headers, URLs of these routes carry no token, and the token check is the same function as the `/r/{token}` page (`hash` + 30-day validity), so the page and the API never disagree about access.

## 📝 UI/UX

| Phase | Developer (`/r/{token}`) and mentor (`/mentor/requests/{id}`) |
|---|---|
| before | header *Sesja {data} {od}–{do} · {25/50} min*, text-only notice, *Czat otworzy się {godzina}*, box disabled |
| open | messages (oldest first, one list with 1 px dividers, each labelled *Ty* or the other party's name and the time), *Zostało N min* (from server time, updated each poll), box + *Wyślij* |
| ended | *Sesja zakończona — czat tylko do odczytu*, no box; after #21 the outcome line above it |
| error states | polling failed ×3 → *Brak połączenia — próbujemy ponownie* (keeps trying); send failed → message kept in box; 401 for mentor → *Sesja logowania wygasła — zaloguj się ponownie* |
| empty | open with no messages → *Nikt jeszcze nie napisał. Zacznij od przywitania i krótkiego opisu problemu.* |

Times in the viewer's zone (browser for the developer, mentor's zone for the mentor — as #17/#18). Narrow viewport: box below messages, full width; message list scrolls, the page does not jump when new messages arrive unless the reader is at the bottom.

## 📝 Edge Cases & Failure Scenarios

| Scenario | Outcome |
|---|---|
| Post at 12:54:59.9 while the settlement job runs | Post holds the row → settlement skips it this run (`SKIP LOCKED`) and settles it next run with the message counted. Settlement holds the row first → the post waits, re-reads a settled status, gets `closed`. |
| Post waits for the lock across `slot_end` | Its time is read after the lock (`clock_timestamp()`), so it is refused `closed` — `created_at` is never earlier than the moment the post was allowed. |
| Client clock wrong | Window and countdown come from server `now`; client clock only formats. |
| Two tabs of the same party | Both poll; each shows all messages; no duplicates (dedupe by `id`). |
| Forwarded `/r/{token}` link | The holder can chat as the developer — same credential rule as #17 (D12); copy on the page says *Nie udostępniaj tego linku*. |
| Mentor session expired mid-session | GET/POST 401 → sign-in prompt; reading resumes after #14 sign-in. |
| Database down | GET 503 → *Brak połączenia — próbujemy ponownie*; POST 503 → text kept. |
| Request cancelled/declined/lapsed | No chat (API `not_found`, page shows its #18/#19 state). |
| 500 messages | `limit_reached`, box disabled with the message. |
| Script / HTML in a message | Rendered as text by React; never `dangerouslySetInnerHTML`. |

## 📝 Risks & Impact Review

- **SDLC gates:** data scoping (`risk-high`): isolation tests — mentor B and a wrong token read nothing and post nothing in mentor A's session; schema migration: up/down test and rollback plan in the PR (down drops the table — dev/test only after pilot data, like 0005/0006). `needs-qa`, no self-QA.
- **Privacy (R04, A08):** content leaves only to the two parties; not in emails, logs, Stripe, the pilot export (counts only). Legal ownership of pasted code is Q04 (open).
- **Polling cost:** 2 parties × 1 req/3 s × 50 min ≈ 2 000 cheap indexed reads per session — fine for the pilot; replace with push if sessions grow.
- **Reversibility:** messages are immutable by design; a wrong message cannot be withdrawn (copy near the box: *Wiadomości nie da się edytować ani usunąć*).

## 📝 Decisions in play

Relies on D02 / R05 (session after acceptance), R01 (25/50), R02 + N01 (text only), R04 (two parties), D05 / R15 (timestamps for the no-show rule), D12 (guest link `/r/{token}`). Leaves open Q04. Supersedes nothing. Owner: Krzysztof Marczak.

## 📋 Phasing

- **Phase 1 — Chat:** migration, core, two route handlers, `SessionChat`, both pages. Shippable alone: accepted sessions can be held; they stay `accepted` until #21 settles them (no money moves).

## 📋 Implementation Plan

1. **Migration 0007 + core `lib/sessions/messages.mjs`.** DB tests (injected time for every boundary): up/down/up; CHECKs (author, body 1–4000, FK); post at `slot_start − 1 ms` → `not_open`, at `slot_start` → stored with that time, at `slot_end − 1 ms` → stored, at `slot_end` → `closed`; non-accepted (awaiting, declined, cancelled, lapsed) → `not_found`; expired token (30 days after) → `not_found`; 500th stored, 501st → `limit_reached`, also with two concurrent posts at 499 (exactly one wins); cursor returns only newer, ≤ 200 + `hasMore`, 201 messages fetched in two pages without gaps; `author` mapped to `me`/`other` per viewer; isolation: mentor B / wrong token → `not_found` for read and post; lock race: a post holding the row → the second post waits and both are stored in `seq` order.
2. **Route handlers + `server.ts`.** Tests (unit on handler helpers + e2e): token only from header; 401 vs 404 for mentor; `no-store`; foreign `Origin` → 403; non-JSON → 415; > 16 KB → 413.
3. **DS `SessionChat` + stories.** Story states: before, open-empty, open with messages (long code block, narrow viewport), ended, offline, send failed, limit reached; axe clean; text-only notice present in every state (AC R02); no video/voice control.
4. **Pages.** `/r/{token}` accepted → chat; `/mentor/requests/{id}` accepted → chat. E2E (two browser contexts, fake Stripe as in E02, slot moved into "now" by SQL): developer and mentor see each other's messages within one poll (AC 1); text-only notice on both screens (AC 2); third person (other mentor, bad token) sees none (AC 3); stored message has DB time (AC 4); screenshots for the PR.
5. **Docs.** README (chat, polling), `BACKWARD_COMPATIBILITY.md` (new table, new API paths), track of the run in `.ai/runs/`.

## 🔍 Review outcome

Codex (GPT) review → `reviews/2026-10-30-live-text-session-chat.review-gpt.md` (verdict: revise).

| Finding | Outcome | Why / change |
|---|---|---|
| Critical: identity `seq` not ordered by commit | **Rejected, clarified** | The cursor is per session and the row lock is held from before the insert until commit, so within one session the next `seq` is taken only after the previous post committed. Explained under Proposed Solution; two-connection test added (step 1). |
| High: lock protocol inconsistent with #21 (`SKIP LOCKED`) | **Accepted** | One protocol written in both specs: post holds the row; settlement skips a held row and settles it next run. Edge case rewritten. |
| High: token endpoint — logging, size, rate limit | **Partly accepted** | Token only in a header, never logged, same check as the page; response bounded (≤ 200). Rate limiting deferred as ⚠ Q11 (256-bit token). |
| High: retention undefined | **Accepted as ⚠** | Q10: kept with the request in 1.0, deletion by hand until Q04. |
| High: `Origin` check fragile | **Accepted** | Canonical origin = `NEXT_PUBLIC_APP_URL`; JSON-only (preflight) as the primary CSRF guard; missing `Origin` allowed; tests listed. |
| Medium: 500 cap race | **Accepted** | Check and insert under the same row lock; concurrent test at 499. |
| Medium: pagination with `hasMore` | **Accepted** | `after` = last `seq`; fetch again while `hasMore`; dedupe by `id`. |
| Medium: author name source | **Accepted** | Q9: read at display time; nothing personal stored in messages. |
| Medium: tests too general | **Accepted** | Step 1–2 list the boundary, isolation, expiry, origin and race tests. |
| Low: `created_at` = transaction start | **Accepted** | Time read after the lock with `clock_timestamp()`; edge case added. |
