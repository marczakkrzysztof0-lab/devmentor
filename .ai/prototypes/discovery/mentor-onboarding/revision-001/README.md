# Discovery prototype: mentor — from invitation to first paid request

- Brief: `.ai/specs/product-brief.md` (2026-10-16, with D12 of 2026-10-19)
- Flow: "Future state (1.0): mentor goes from invitation to first paid session" (brief, Key flows, steps 1–5)
- Revision: 001, 2026-10-20; previous revision: none
- Panel report: none supplied; no synthetic panel was run for this flow, so the record contains no `[SYNTHETIC]` items.
- Simulation boundary confirmed by Krzysztof Marczak (via coordinator), 2026-10-20: end at the accepted request (no session screen); P02 accepted; founder-side invitation screen outside the prototype; P01–P10 accepted as `[ASSUMPTION]`. Confirmation approves the simulation, not the truth of the assumptions.
- Supporting specs read as context (owner-confirmed 2026-10-19): `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14), `.ai/specs/2026-10-19-mentor-weekly-availability-and-open-slots.md` (#15), `.ai/specs/2026-10-19-mentor-accepts-or-declines-request.md` (#18).

This artifact holds fictitious data only. It shows a sequence of screens; it is not research evidence, does not show user demand and does not satisfy the Definition of Ready or production readiness.

## Actor, start, success

- **Actor:** a senior engineer from the mentor list, invited personally by a founder (warm contact, D09).
- **Start:** the mentor opens the invitation link a founder sent (the founder's CLI step is outside the prototype).
- **Success:** the mentor has a published page with a public-work link, description and both prices, has availability with open slots, has copied the share link, has accepted the first paid request (a booked session exists) and has completed payout setup — without having been asked for payout details before publishing.
- **Excluded:** founder invitation step (CLI), sharing the link in the mentor's community, email notifications, the developer's side, the session chat itself, no-show handling, the real Stripe payout onboarding, notes, the pilot export.

## Rules, non-goals and decisions preserved

| Id | How the prototype keeps it | Owner / change path |
|---|---|---|
| R01 | Request lengths are 25 or 50 min; availability yields 25/50-min slots | founder A / superseding record by founder A |
| R02 | Accepted request shows "czat tekstowy" and "bez wideo i rozmowy głosowej" | founder A |
| R03 | Public-work link and description required to publish; no ratings anywhere | founder A |
| R04 | No notes, nothing leaves the two parties | founders A and B |
| R05 | Question, length, slot shown before Akceptuję / Odrzucam; "booked" only after acceptance | Krzysztof Marczak |
| R06 | Requests use only slots computed from saved availability; simulated request is blocked without open slots | Krzysztof Marczak |
| R07 | Mentor sets both prices; hint says the developer sees the price before writing | Krzysztof Marczak |
| R08 | Request shows the amount paid by card when sending (display only) | Krzysztof Marczak |
| R09 | Decline and lapse (no acceptance before slot start) show an automatic full refund | Krzysztof Marczak |
| R11 | Developer withdrawal possible only while pending; shows refund | Krzysztof Marczak |
| R13 | No payout/bank fields before publishing; payout setup only after the first paid request, not blocking acceptance | Krzysztof Marczak |
| R14 | Page copy: reachable only through the link, not in a directory | Krzysztof Marczak |
| R15 | Not reached: the flow ends before the session is held | Krzysztof Marczak |
| N01–N05 | No video, ratings, vault/AI, note publishing, learning paths or subscriptions | per brief Non-goals |
| D02, D03, D04, D07 | request→accept, link-only entry, mentor price, payout details late | Krzysztof Marczak |
| D08 | 20-minute setup target recorded here only; no timer in the UI | Krzysztof Marczak |
| D10 | Notes and in-product pilot view absent | Krzysztof Marczak |
| D12 | PLN, both lengths required, founder-issued sign-in links, 3-hour minimum notice | Krzysztof Marczak |

Open questions left open: Q01 (commission — no net amount shown), Q03, Q04, Q05.

## Assumptions

- `[ASSUMPTION]` **P01** Entry through a personal single-use invitation link, no password; re-entry via a founder-issued sign-in link. Source: spec #14 and D12, not the brief. Check: pilot mentors' first sign-in.
- `[ASSUMPTION]` **P02** Payout setup is prompted (banner + screen) once the first paid request arrives, does not block acceptance, and the real setup happens in Stripe outside the prototype. No spec exists (#22/#25). Check: spec for #22/#25; pilot observation.
- `[ASSUMPTION]` **P03** The mentor learns about a new request only from the in-app list here; the email from #17 is not simulated. Check: #17 email adapter.
- `[ASSUMPTION]` **P04** No commission or "you receive" figure; the price is what the developer pays (Q01 open).
- `[ASSUMPTION]` **P05** A page can be published without availability; the prototype leads to availability before sharing (order from #14/#15). Check: pilot — how many publish without availability.
- `[ASSUMPTION]` **P06** The mentor sees a developer display name plus the question; the brief does not define what the mentor knows about the asker (the Python mentor wants to see who asks). Check: #17 request fields; mentor interviews.
- `[ASSUMPTION]` **P07** No decline reason collected (spec #18 Q4).
- `[ASSUMPTION]` **P08** The flow ends at an accepted request (booked session) and completed payout setup; the session chat and no-show (R15) belong to the developer flow / #20.
- `[ASSUMPTION]` **P09** Fixtures are fictitious: mentor data typed by the reviewer; requests from "Marek" (TypeScript generics, 50 min) and "Ola" (Helm ingress, 25 min); simulated "now" Monday 2026-10-26 09:00, zone Europe/Warsaw; 14-day horizon, :00/:30 grid.
- `[ASSUMPTION]` **P10** UI copy is Polish rendering of the brief's glossary terms (sesja, zapytanie, link do udostępnienia, link do publicznej pracy).
- `[ASSUMPTION]` **P11** Field limits taken from spec #14 (name 2–80, URL http(s) ≤ 500, description ≤ 2000, prices 20–5000 zł); slug 3–40 chars of the #23 pattern is the prototype's own guess at length.

## Screen / state map

| Screen (fragment) | Action | Expected next state | Rules / assumptions |
|---|---|---|---|
| Zaproszenie (`#zaproszenie`) | Akceptuję zaproszenie | signed in → Twoja strona | P01 |
| Zaproszenie, inactive (test state, or after use) | — | "Ten link jest nieaktywny — poproś zespół o nowy" | P01 |
| Brak dostępu (`#brak-dostepu`, any mentor screen while signed out) | Open sign-in link (simulated) | Zapytania; before acceptance: inactive message | P01 |
| Twoja strona (`#edytor`) | Opublikuj with missing/invalid fields | inline errors per field, input kept, first invalid focused | R03, R07, P11 |
| Twoja strona | Opublikuj (valid) | "Publikowanie…" → Strona opublikowana | R03, R07, R13 |
| Twoja strona, failure (test state) | Opublikuj | "Nie udało się zapisać…", retry succeeds | — |
| Twoja strona after publish | Zapisz zmiany | "Zapisano…"; slug read-only | spec #14 |
| Strona opublikowana (`#opublikowano`) | Kopiuj link | "Skopiowano (symulacja)"; checklist updated | D03, R14 |
| Dostępność (`#dostepnosc`) | Zapisz with invalid window | per-day error | R06 |
| Dostępność | Zapisz (valid) / none selected | slot preview / "Brak dostępności" | R01, R06, D12, P09 |
| Zapytania (`#panel`) | — | empty state, checklist, no-availability notice | P05 |
| Zapytania + test "Symuluj nowe opłacone zapytanie" | — | request listed as pending; payout banner shown (refused without publish + slots) | R06, R08, P02, P03 |
| Zapytanie (`#zapytanie`) | Akceptuję | "Zapisywanie decyzji…" → booked, "czat tekstowy", session screen outside | R02, R05, P08 |
| Zapytanie | Odrzucam → Tak, odrzucam / Anuluj | declined + automatic full refund / back to decision | R09, P07 |
| Zapytanie + test "Slot … bez akceptacji" | — | lapsed + automatic refund | R09 |
| Zapytanie + test "Developer wycofał…" | — | withdrawn + refund | R11 |
| Wypłaty (`#wyplaty`) | Przejdź do Stripe → Symuluj ukończenie / przerwanie | done / "nie została dokończona", retry possible | R13, P02 |
| Unknown fragment | Przejdź do początku | Zaproszenie (or Zapytania when signed in) | — |
| Test "Sesja logowania wygasła" | — | Brak dostępu | P01 |
| Reset | — | start screen, empty form, no requests, announced | — |

## Verification

**Static review — passed (2026-10-20):**
- Single self-contained `index.html`; inline CSS/JS; no external URLs, scripts, fonts, images, `fetch`, storage, cookies, clipboard or form actions (the only `http(s)://` strings are a placeholder and an error message). Forms use `preventDefault`. User input rendered via `textContent` only. Script passes `node --check`.
- `lang="pl"`, one `h1` per screen focused on navigation, labelled inputs, `aria-invalid` + `aria-describedby` errors, polite live region, visible `:focus-visible` outline, narrow-viewport CSS (table rows stack under 32rem).
- Every screen in the map has a destination; excluded destinations are marked "poza prototypem"; no rule above changed. UI contains no persona coaching or expected research conclusions.
- Only the new revision directory was written; brief, specs, app code unchanged; no `.uxproof/`.

**Browser walk — not run.** Configured provider `agent-browser` (`.ai/browsers/agent-browser.md`) is not installed, and downloading it was not authorized. The skill forbids substituting another browser tool (Playwright in the repo was therefore not used). No `evidence/` directory exists. Keyboard traversal, focus after navigation, announced statuses and narrow viewport are unverified.

### Manual checklist (open `index.html` directly in a browser)

1. Start: "Zaproszenie do DevMentor" visible; click **Akceptuję zaproszenie** → "Twoja strona mentora", nav visible.
2. Click **Opublikuj** with empty form → five field errors, focus on the name field, status "Popraw zaznaczone pola…".
3. Type a name → address suggested (e.g. "Anna K." → `anna-k`). Enter `github.com/x` → URL error; fix to `https://github.com/x`, add a description, prices 150 / 280 → **Opublikuj** → "Publikowanie…" → "Strona opublikowana" with `devmentor.example/m/anna-k`.
4. **Kopiuj link** → "Skopiowano (symulacja…)".
5. Test state **Następny zapis… się nie powiedzie** → on Moja strona click **Zapisz zmiany** → error, data kept; click again → "Zapisano"; address field read-only.
6. **Ustaw dostępność**: preview says "Brak dostępności". Tick Poniedziałek with 20:00–19:00 → error; set 18:00–20:00, tick Środa 10:00–12:00 → **Zapisz** → preview lists slots starting Mon 26 Oct 18:00 (none before 12:00 that day).
7. Zapytania: checklist all ticked, "Brak zapytań". Test **Symuluj nowe opłacone zapytanie** → pending request from Marek (50 min, 280 zł) and the payout banner.
8. Open the request → question, slot, amount; **Odrzucam** → confirmation → **Anuluj** → buttons back; **Akceptuję** → "Zapisywanie decyzji…" → "Sesja zarezerwowana", "czat tekstowy", session screen marked outside the prototype.
9. Simulate a second request (Ola, 25 min) → test **Slot zapytania się zaczął bez akceptacji** → status "Wygasło … zwrot". (Repeat after Reset for **Developer wycofał…** and for decline → "Odrzucone … zwrot".)
10. Banner **Ustaw wypłaty** → **Przejdź do konfiguracji…** → **Symuluj przerwanie** → message, retry → **Symuluj ukończenie** → "Wypłaty skonfigurowane"; banner gone on Zapytania.
11. Browser Back/Forward move between screens; open `index.html#cokolwiek` → "Nie ma takiego ekranu" → **Przejdź do początku**.
12. Test **Sesja logowania wygasła** → "Brak dostępu"; sign-in link (simulated) → Zapytania; `#zaproszenie` now shows the link as inactive after sign-out.
13. **Reset symulacji** → start screen, empty form, no requests, status "Symulacja zresetowana do początku".
14. Keyboard only: Tab through each screen, focus visible, Enter/Space operate controls; heading focused after navigation. Narrow window (~360 px): no horizontal scroll, all actions reachable.

## Open and reset

Open `index.html` from this folder directly in a browser (`file://`); no server or network needed. **Reset symulacji** in the "Test state" box restores the start. All state is in memory; reloading the page also resets it.
