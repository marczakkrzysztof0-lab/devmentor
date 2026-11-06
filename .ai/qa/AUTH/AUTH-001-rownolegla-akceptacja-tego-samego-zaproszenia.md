# AUTH-001: Jedno konto i jedna sesja, gdy dwie przeglądarki jednocześnie akceptują to samo zaproszenie — druga widzi nieaktywny link

| Pole | Wartość |
|---|---|
| Id | AUTH-001 |
| Obszar / spec | AUTH / `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14; L3, Z4, `acceptInvitation`) |
| Priorytet | Wysoki |
| Typ | UI e2e (Playwright) + baza + HTTP |
| Niestandardowy | tak |
| Implementacja | [tests/e2e/auth-001-rownolegla-akceptacja-zaproszenia.e2e.mjs](../../../tests/e2e/auth-001-rownolegla-akceptacja-zaproszenia.e2e.mjs) — test „tworzy jedno konto i jedną sesję, gdy dwie przeglądarki klikają „Akceptuję zaproszenie” jednocześnie — druga widzi nieaktywny link” |

## Given
- Ważne zaproszenie dla unikalnego e-maila.
- Ten sam link otwarty w dwóch niezależnych przeglądarkach (osobne ciasteczka); w obu widoczny przycisk „Akceptuję zaproszenie”.

## When
- Obie przeglądarki klikają „Akceptuję zaproszenie” w tej samej chwili (`Promise.all`).

## Then
- Dokładnie jedna przeglądarka widzi nagłówek h1 „Twoja strona” i jest na ścieżce `/mentor`; druga widzi h1 „Ten link jest nieaktywny — poproś zespół o nowy”.
- Przegrana karta nie ma żadnych przycisków i nie ma ciasteczka `dm_session`.
- Baza (dla tego e-maila): `mentors` = 1, `pages` = 1 (szkic), `accepted` (zaproszenia z `accepted_at`) = 1, `sessions` = 1.
- Ponowne otwarcie linku w przegranej przeglądarce nadal pokazuje h1 „Ten link jest nieaktywny — poproś zespół o nowy”.

## Dane i sprzątanie
- Zaproszenie tworzone w teście przez `createInvitation` z `scripts/mentor-links.mjs` (helper `invitationUrl`), `uniqueEmail("parallel-accept")`.
- Schemat `dm_migtest_*` tworzony i usuwany przez `scripts/test-e2e.mjs`.
- Oba konteksty przeglądarki zamykane w `finally`.

## Uwagi
- Zwycięzcę wyłania wyścig, więc test nie zakłada, która karta wygra — porównuje posortowane wyniki.
- Nie sprawdza zaproszenia na e-mail, który ma już konto, ani wygasłego zaproszenia.
- Niższe poziomy: `tests/db/mentor-auth.test.mjs` („równoległe akceptacje: to samo zaproszenie i dwa zaproszenia na jeden e-mail → jeden mentor”, „drugi raz to samo zaproszenie (bez sesji) → ta sama neutralna odpowiedź co wygasłe”, „akceptacja to jedna transakcja: awaria w połowie (slug) nie zostawia niczego”).
