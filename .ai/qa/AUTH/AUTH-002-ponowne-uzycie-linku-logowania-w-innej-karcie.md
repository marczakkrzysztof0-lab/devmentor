# AUTH-002: Link logowania zużywany raz — druga karta tej samej przeglądarki wchodzi bez nowej sesji, inna przeglądarka widzi nieaktywny link

| Pole | Wartość |
|---|---|
| Id | AUTH-002 |
| Obszar / spec | AUTH / `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14; P3, Z39, `redeemSignInLink`, `inspectSignInLink`) |
| Priorytet | Wysoki |
| Typ | UI e2e (Playwright) + baza + HTTP |
| Niestandardowy | tak |
| Implementacja | [tests/e2e/auth-002-link-logowania-w-drugiej-karcie.e2e.mjs](../../../tests/e2e/auth-002-link-logowania-w-drugiej-karcie.e2e.mjs) — test „zużywa link raz: druga karta tej samej przeglądarki wchodzi bez nowej sesji, inna przeglądarka widzi nieaktywny link” |

## Given
- Mentor z kontem, bez aktywnej sesji (sesje odwołane `revoked_at = now()`).
- Świeży link logowania otwarty w dwóch kartach tej samej przeglądarki; w obu widoczny przycisk „Zaloguj”.
- Osobna, trzecia przeglądarka („inne urządzenie”) bez sesji.

## When
- Karta 1 klika „Zaloguj”.
- Karta 2 (stara strona z przyciskiem) klika „Zaloguj” tym samym, już zużytym linkiem.
- Ktoś otwiera ten sam link w innej przeglądarce.

## Then
- Karta 1 trafia na `{BASE_URL}/mentor`, edytor jest gotowy; w bazie `mentor_sign_in_links.used_at` ustawione, aktywnych sesji = 1.
- Karta 2 też trafia na `/mentor` (sesją karty 1); aktywnych sesji nadal = 1, wiersz linku (w tym `used_at`) bez zmian.
- Inna przeglądarka widzi h1 „Ten link jest nieaktywny — poproś zespół o nowy”, nie ma żadnego przycisku ani ciasteczka `dm_session`; aktywnych sesji nadal = 1.

## Dane i sprzątanie
- Mentor tworzony w teście (`signedInMentor` z `createInvitation`), link z `createSignInLink` (helper `signInUrl`), `uniqueEmail("sign-in-tabs")`.
- Schemat `dm_migtest_*` tworzony i usuwany przez `scripts/test-e2e.mjs`.
- Konteksty „laptop” i „inne urządzenie” zamykane w `finally`.

## Uwagi
- Stan „bez sesji” budujemy w bazie (odwołanie sesji), a nie przez UI — najkrótsza droga do fixture.
- Nie sprawdza jednoczesnego kliknięcia w dwóch kartach, tylko kliknięcia kolejne.
- Niższe poziomy: `tests/db/mentor-auth.test.mjs` („ważny link logowania → sesja, used_at = now; ponowne użycie → nieaktywny”, „dwa równoległe użycia linku → dokładnie jedna sesja; druga karta z sesją pierwszej → alreadySignedIn (Z39)”, „inspectInvitation i inspectSignInLink niczego nie zmieniają (GET na poziomie domeny)”).
