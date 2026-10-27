# Plan wykonania — E02 część 2: decyzja mentora (#18) i anulowanie przez dewelopera (#19)

Source doc: .ai/specs/2026-10-19-mentor-accepts-or-declines-request.md
Source doc: .ai/specs/2026-10-19-developer-cancels-before-acceptance.md
Epik: #9 · Issues: #18 (E02-S02), #19 (E02-S03) · Branch: `feat/e02-mentor-decision-and-cancel`
Base: `feat/e02-stripe-and-prepaid-request` (PR #40, stack — nie `main`)
Engine: om-auto-create-pr-loop (steps: 11, --loop: yes)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA. The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed — per-Step commits touch only `Status` and `Commit`.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 1 | 1.1 | Szablony e-maili decyzji i wygaśnięcia | dispatch:cheap | done | a2da224 |
| 1 | 1.2 | Zapytania mentora: lista, licznik, szczegóły | dispatch | done | ac7ee9b |
| 1 | 1.3 | Akceptacja i odrzucenie ze zwrotem | inline | done | e718227 |
| 2 | 2.1 | Stany /r/{token}: termin minął i decyzje | dispatch | done | 15826a2 |
| 2 | 2.2 | Ekrany mentora /mentor/requests i nawigacja | inline | done | 0f5ce76 |
| 3 | 3.1 | Zadanie lapseOverdue | inline | todo | — |
| 4 | 4.1 | cancelByToken | inline | todo | — |
| 4 | 4.2 | Testy wyścigów przejść | dispatch | todo | — |
| 4 | 4.3 | Anulowanie na /r/{token} | inline | todo | — |
| 5 | 5.1 | Zrzuty ekranu nowych ekranów | inline | todo | — |
| 5 | 5.2 | Dokumentacja i track.md | dispatch:cheap | todo | — |

## 🎯 Cel

Mentor widzi opłacone zapytania na `/mentor/requests`, czyta pytanie i akceptuje albo odrzuca (odrzucenie =
automatyczny pełny zwrot). Zapytanie bez decyzji do startu terminu wygasa w zadaniu okresowym ze zwrotem (R09).
Deweloper do chwili akceptacji może anulować ze zwrotem na `/r/{token}` (D05/R11). Wszystkie przejścia z
`awaiting_mentor` są wzajemnie wykluczające się (jeden warunkowy `UPDATE`) i dają najwyżej jeden zwrot.

## Zakres

- `lib/requests/mentor.mjs` (lista, licznik, szczegóły, `acceptRequest`, `declineRequest`, klasyfikacja odmowy z
  ponownego odczytu po `mentor_id`), `lib/requests/lapse.mjs` (`lapseOverdue`), `lib/requests/cancel.mjs`
  (`cancelByToken`), rejestr zadań (`requests.lapseOverdue`), szablony `request_accepted|declined|lapsed`.
- UI: `/mentor/requests`, `/mentor/requests/[id]` (DS `RequestList`, `RequestDecision`, `RequestNotFound`),
  „Zapytania” + licznik w `MentorNav` na wszystkich ekranach mentora, `/r/{token}`: stany accepted / declined /
  overdue / lapsed / cancelled ze stanem zwrotu, `CancelRequest`, `CancelNotPossible`.
- Testy: DB (izolacja mentorów, kody odmów, jeden zwrot, e-maile, wyścigi na dwóch połączeniach), e2e (Playwright z
  fałszywym Stripe), zrzuty ekranu.
- Dokumentacja: `track.md` („Epik 02 — część 2”), README (zadania), `BACKWARD_COMPATIBILITY.md` (nowe URL-e).

## Non-goals

- Czat (#20), no-show (#21), wypłaty (#22/#25), eksport pilotażu (D10), cofanie decyzji, powód odrzucenia (Q4).
- Migracje — maszyna stanów i kolumny są w `0006_requests` (#17).
- Zmiany w `packages/ui` — komponenty #18/#19 już są w DS (chyba że okaże się luka; wtedy osobny krok).
- Ręczne QA na prawdziwym Stripe (tryb testowy) — wymaga kluczy; zostaje dla QA (`needs-qa`, bez self-QA).

## Implementation Plan

### Phase 1: Decyzja mentora — domena (#18 Phase 1, krok 1)

#### 1.1 Szablony e-maili decyzji i wygaśnięcia
- `lib/email/templates.mjs`: `request_accepted`, `request_declined`, `request_lapsed` — zwykły tekst, polski,
  neutralny płciowo (C12), bez emoji/wykrzykników, BEZ treści pytania. Parametry: `mentorName`, `when`,
  `lengthMinutes`, `amount`. Zwrot opisany jako „zlecony automatycznie” (zwrot zlecany w tej samej transakcji).
- Testy jednostkowe w `tests/email/` (render, brak pytania, nieznany szablon nadal rzuca).

#### 1.2 Zapytania mentora: lista, licznik, szczegóły
- `lib/requests/mentor.mjs`: `listMentorRequests(db, { mentorId, now })` — bez `awaiting_payment`/`payment_failed`;
  `awaiting_mentor` (z `overdue`, gdy `slot_start <= now`), `accepted`, zakończone (`declined`/`lapsed`/`cancelled`)
  z ostatnich 30 dni; `countAwaitingDecision(db, { mentorId, now })` — tylko `awaiting_mentor` z `slot_start > now`;
  `getMentorRequest(db, { mentorId, requestId, now })` — szczegóły z pytaniem, kwotą, `refundStatus`; `null` dla
  cudzego / nieznanego / nieopłaconego / złego kształtu id (bez błędu bazy). Bez adresu e-mail płacącego.
- Testy DB: wykluczenie nieopłaconych, izolacja (mentor B nie widzi A w żadnym stanie), licznik, overdue, 30 dni.

#### 1.3 Akceptacja i odrzucenie ze zwrotem
- `acceptRequest` / `declineRequest` (+ warianty `…InTx` dla testów wyścigów): jeden warunkowy `UPDATE … WHERE id
  AND mentor_id AND status = 'awaiting_mentor' AND slot_start > zegar bazy`; zero wierszy → ponowny odczyt po
  `mentor_id` i klasyfikacja (not_found → status → slot_started). Odrzucenie: `requestRefund(tx, …,
  'mentor_declined')` + e-mail w tej samej transakcji, `executeRefund` po commicie (błąd → ponowi #24).
- Testy DB: kody odmów (cancelled/declined/lapsed/already_*/slot_started/not_found), izolacja, jeden zwrot i jeden
  e-mail, podwójne odrzucenie = jedno wywołanie Stripe, awaria Stripe → `declined` + zwrot `requested`.

### Phase 2: Decyzja mentora — ekrany (#18 Phase 1, kroki 2–3)

#### 2.1 Stany /r/{token}: termin minął i decyzje
- `lib/requests/view.mjs`: `viewStatus` zwraca `overdue` dla `awaiting_mentor` z `slot_start <= now`.
  Strona przekazuje stan zwrotu dla `declined`/`lapsed`/`cancelled` (DS już ma teksty).
- Testy: overdue przed wygaśnięciem → „zostanie zlecony”; po zleceniu → „zlecony”; accepted → stan accepted.

#### 2.2 Ekrany mentora /mentor/requests i nawigacja
- `app/mentor/requests/page.tsx` (lista, pusty stan z linkiem, błąd wczytania), `app/mentor/requests/[id]/page.tsx`
  (`RequestDecision`, `RequestNotFound`), server actions `acceptRequestAction` / `declineRequestAction` (mentor tylko
  z `getCurrentMentor()`; bez sesji → `not_found`, bez danych), `refresh()` po decyzji.
- `MentorNav`: „Zapytania” + licznik na `/mentor`, `/mentor/availability`, `/mentor/requests*`.
- E2E `tests/e2e/mentor-requests.e2e.mjs`: bez sesji brak danych; lista i szczegóły (pytanie przed przyciskami);
  akceptacja → `/r/` „Zaakceptowane”; odrzucenie → „Odrzucone — deweloper dostaje pełny zwrot”, `/r/` ze zwrotem;
  aktualizacja asercji E01 „bez Zapytania” w istniejących e2e.

### Phase 3: Automatyczne wygaśnięcie (#18 Phase 2)

#### 3.1 Zadanie lapseOverdue
- `lib/requests/lapse.mjs` `lapseOverdue(deps, { limit, deadline, now })`: paczka, `FOR UPDATE SKIP LOCKED`, w jednej
  transakcji na wiersz: `lapsed` + `lapsed_at` + zwrot `lapsed` + e-mail `request_lapsed`; `executeRefund` po commicie;
  zegar bazy, w testach wstrzykiwany. Rejestr: `requests.lapseOverdue` przed `payments.retryRefunds`.
- Testy DB: overdue → lapsed + zwrot + e-mail + wywołanie Stripe; accepted nietknięte; drugi przebieg no-op; dwa
  równoległe przebiegi; accept vs lapse i decline vs lapse na dwóch połączeniach → jeden zwycięzca, ≤ 1 zwrot.

### Phase 4: Anulowanie przez dewelopera (#19)

#### 4.1 cancelByToken
- `lib/requests/cancel.mjs` `cancelByToken(token, deps)` + `cancelByTokenInTx`: warunkowy `UPDATE … WHERE
  access_token_hash AND status = 'awaiting_mentor'` (bez strażnika czasu, D05), zwrot `mentee_cancelled`,
  `executeRefund` po commicie; wynik wg API Contracts (`ok`/`already_refunding`+status/`accepted`/`not_paid`/`not_found`).
- Testy DB z kryteriów akceptacji (w tym po starcie terminu, brak e-maila o samym anulowaniu).

#### 4.2 Testy wyścigów przejść
- Dwa połączenia: A trzyma transakcję po `accept`, B `cancelByToken` czeka na blokadę, commit A → B `accepted`, bez
  zwrotu; lustrzanie cancel → accept dostaje `cancelled`, jeden zwrot. Pary cancel vs decline, cancel vs lapse →
  jeden zwrot.

#### 4.3 Anulowanie na /r/{token}
- Server action `cancelRequestAction(token)` (token tylko z adresu strony), `refresh()`; `CancelRequest` w
  `awaiting_mentor` i `overdue`, `CancelNotPossible` w `accepted`; wynik `accepted` → alert DS; `already_refunding`
  → odświeżony stan zwrotu, nie błąd.
- E2E: anulowanie → „Anulowane — zwrot 150 zł zlecony”, znika z „Czeka na decyzję” u mentora; po akceptacji brak
  przycisku.

### Phase 5: Weryfikacja i dokumentacja

#### 5.1 Zrzuty ekranu nowych ekranów
- E2E z `E2E_SCREENSHOT_DIR` → `.ai/runs/2026-10-27-e02-mentor-decision-and-cancel/screenshots/`.

#### 5.2 Dokumentacja i track.md
- `track.md` sekcja „Epik 02 — część 2 (lekcja 11, zadanie domowe)”, README (zadanie `requests.lapseOverdue`, nowe
  ekrany), `BACKWARD_COMPATIBILITY.md` (`/mentor/requests`, `/mentor/requests/[id]`, link w e-mailu do mentora).

## Ryzyka

- Pieniądze i zakres danych (`risk-high`): testy porażki, ponowienia, idempotencji i współbieżności; izolacja
  mentorów; drugi reviewer; `needs-qa` bez self-QA.
- Stos PR-ów: ten PR bazuje na niescalonym #40 — po scaleniu #40 base trzeba przestawić na `main`.
- Bez kluczy Stripe przepływ zwrotu sprawdzony tylko na fałszywym Stripe (testy + e2e).

## External References

Brak (`--skill-url` nie podano).

## Decyzje do przeglądu przez Krzysztofa

(uzupełniane w trakcie runu)
