 done | (PR 2) |done | (PR 2) |done | (PR 2) |# Plan wykonania — E03: czat sesji (#20) i rozliczenie no-show (#21)

Source doc: .ai/specs/2026-10-30-live-text-session-chat.md
Source doc: .ai/specs/2026-10-30-no-show-settlement.md
Decyzje do przeglądu: .ai/specs/2026-10-30-e03-decisions-for-review.md
Epik: #10 · Issues: #20 (E03-S01), #21 (E03-S02)
Branche (stack, jak #40/#46): `feat/e03-session-chat` (PR 1, baza `main`) → `feat/e03-no-show-settlement` (PR 2, baza PR 1)
Engine: om-auto-create-pr-loop (dwa PR-y stackowane, lekcja 11)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 0 | 0.1 | Specyfikacje #20/#21 (om-spec-writing --autonomous), review Codexa, poprawki, lista ⚠ | inline | done | e2bc09b |
| 1 | 1.1 | Migracja 0007 `session_messages` + rdzeń `lib/sessions/messages.mjs` + testy DB | inline | done | b5313fa |
| 1 | 1.2 | Trasy `/api/r/session`, `/api/mentor/requests/[id]/session` + `lib/sessions/http.mjs` + testy | inline | done | b5313fa |
| 1 | 1.3 | DS `SessionChat` (e03) + stories (axe, play) | inline | done | b5313fa |
| 1 | 1.4 | Czat na `/r/{token}` i `/mentor/requests/{id}`; e2e w dwóch przeglądarkach; zrzuty | inline | done | b5313fa |
| 1 | 1.5 | README, `BACKWARD_COMPATIBILITY.md`, PR 1 #51 (`Fixes #20`) — CI 6/6 zielone | inline | done | b5313fa |
| 2 | 2.1 | Migracja 0008 (statusy `held` / `mentee_no_show` / `mentor_no_show`, `settled_at`) + reguła R15 | inline | todo | |
| 2 | 2.2 | Zadanie `sessions.settleEnded` (zwrot `mentor_no_show`, e-maile) + testy wyścigów i idempotencji | inline | todo | |
| 2 | 2.3 | Stany wyniku na `/r/{token}`, liście i szczegółach mentora; DS | inline | todo | |
| 2 | 2.4 | E2E rozliczenia z fałszywym Stripe + zrzuty; PR 2 (`Fixes #21`) | inline | done | (PR 2) |
| 3 | 3.1 | Review kodu Codexem, poprawki Major, zielone CI (6 jobów) w obu PR | inline | todo | |

## 🎯 Cel

W zarezerwowanym terminie mentor i deweloper rozmawiają na czacie tekstowym, którego nikt inny nie czyta (#20). Po
terminie platforma sama rozlicza sesję wg R15 + D11: brak wiadomości mentora → pełny zwrot (także gdy nikt nie
pisał), tylko mentor pisał → płatność zostaje u mentora, obie strony → sesja odbyta (#21).

## Zakres i non-goals

- Zakres: patrz Implementation Plan obu specyfikacji. Bez zmian w `package.json` (równoległa aktualizacja Next.js /
  nodemailer w #47), bez prawdziwych kluczy Stripe (fałszywy serwer jak w E02).
- Non-goals: WebSocket/SSE, przypomnienia e-mail, spory w aplikacji, anulowanie przez mentora po akceptacji, notatki
  (D10), eksport pilotażu.

## Ryzyko i bramki SDLC

`risk-high` (dane prywatne sesji, pieniądze, migracje): testy izolacji, wyścigów i idempotencji; test migracji
w górę i w dół; plan rollbacku w opisie PR; `needs-qa`, bez self-QA; drugi recenzent (Codex + KM). NIE scalamy —
scala KM.

## Przebieg (2026-10-30)

- PR 1 [#51](https://github.com/marczakkrzysztof0-lab/devmentor/pull/51): CI 6/6 zielone; review Codexa: approve (1 Minor odrzucony z uzasadnieniem — `code-review-pr51.md`).
- PR 2: `npm test` 683+3, Storybook 387 (1 flake E01 z timeoutem 30 s, zielony przy powtórce), e2e 91 (pełny zestaw; jedyny błąd — twarda spacja w „150 zł” w nowym teście — poprawiony, plik zielony).
- Build Next.js raz zatrzymał się na komunikacie o podatności tej wersji Next.js; aktualizacja zależności jest poza zakresem (osobna sesja, #47), build przy ponowieniu przeszedł.
