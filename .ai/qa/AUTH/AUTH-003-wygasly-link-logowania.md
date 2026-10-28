# AUTH-003: Komunikat „Ten link jest nieaktywny…” bez przycisku i bez logowania, gdy link logowania wygasł

| Pole | Wartość |
|---|---|
| Id | AUTH-003 |
| Obszar / spec | AUTH / `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14; link logowania ważny 72 h, `SIGN_IN_LINK_TTL_HOURS`) |
| Priorytet | Średni |
| Typ | UI e2e (Playwright) + baza + HTTP |
| Niestandardowy | nie |
| Implementacja | [tests/e2e/auth-003-wygasly-link-logowania.e2e.mjs](../../../tests/e2e/auth-003-wygasly-link-logowania.e2e.mjs) — test „pokazuje „Ten link jest nieaktywny…” bez przycisku i nie loguje, gdy link logowania wygasł” |

## Given
- Mentor z kontem, bez aktywnej sesji (sesje odwołane).
- Link logowania, któremu w bazie ustawiono `created_at = now() - 73 hours` i `expires_at = now() - 1 minute`.

## When
- Mentor otwiera ten link w przeglądarce bez sesji.
- Następnie otwiera `/mentor` w tej samej przeglądarce.

## Then
- HTTP 200; h1 „Ten link jest nieaktywny — poproś zespół o nowy”.
- Brak przycisku „Zaloguj” (zero przycisków na stronie), a tekst głównej części nie zawiera „wygas”, „użyt” ani „72” (komunikat neutralny).
- Brak ciasteczka `dm_session`.
- Baza: `used_at` = `null`, aktywnych sesji = 0.
- `/mentor` pokazuje h1 „Dostęp tylko przez zaproszenie — poproś zespół o link do logowania”.

## Dane i sprzątanie
- Mentor tworzony w teście (`signedInMentor`, `createInvitation`), link z `createSignInLink` (helper `signInUrl`), `uniqueEmail("expired-sign-in")`.
- Wygaśnięcie symulowane w bazie (UPDATE `expires_at`), bez zależności od zegara testu.
- Schemat `dm_migtest_*` tworzony i usuwany przez `scripts/test-e2e.mjs`; kontekst zamykany w `finally`.

## Uwagi
- Sprawdza tylko termin minięty o minutę; granicy dokładnie 72 h nie testuje.
- Komunikat jest celowo identyczny dla linku wygasłego, zużytego i nieznanego.
- Niższe poziomy: `tests/db/mentor-auth.test.mjs` („wygasły, nieznany i pusty link logowania → ta sama odpowiedź, used_at zostaje null”, „wygasłe, odwołane, nieznane i puste tokeny zaproszenia → identyczna odpowiedź”), `tests/auth/tokens.test.mjs` („stałe ważności zgodne ze specyfikacją”).
