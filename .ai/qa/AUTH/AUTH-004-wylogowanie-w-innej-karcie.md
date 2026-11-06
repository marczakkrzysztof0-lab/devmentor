# AUTH-004: Odebranie dostępu drugiej karcie po „Wyloguj” w pierwszej — zapis dostępności odrzucony, panel pokazuje tylko komunikat

| Pole | Wartość |
|---|---|
| Id | AUTH-004 |
| Obszar / spec | AUTH / `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14; Z7, Z8, `signOut`) |
| Priorytet | Średni |
| Typ | UI e2e (Playwright) + baza + HTTP |
| Niestandardowy | nie |
| Implementacja | [tests/e2e/auth-004-wylogowanie-w-innej-karcie.e2e.mjs](../../../tests/e2e/auth-004-wylogowanie-w-innej-karcie.e2e.mjs) — test „odbiera dostęp drugiej karcie po „Wyloguj” w pierwszej — zapis dostępności odrzucony, panel pokazuje tylko komunikat” |

## Given
- Zalogowany mentor w jednym kontekście przeglądarki; karta A na `/mentor`.
- Karta B na `/mentor/availability` (h1 „Dostępność”), w której kliknięto „Dodaj okno: wtorek” — widoczny przycisk „Usuń okno wtorek 18:00–20:00”, okno jeszcze niezapisane.

## When
- W karcie A klika „Wyloguj” w nawigacji „Panel mentora”.
- W karcie B (stara strona) klika „Zapisz”.
- Karta B przechodzi na `/mentor`.

## Then
- Karta A pokazuje h1 „Dostęp tylko przez zaproszenie — poproś zespół o link do logowania”; w bazie aktywnych sesji = 0.
- Karta B pokazuje w głównej części alert z dwiema liniami: „Sesja wygasła — poproś zespół o link do logowania” i „Twoje okna zostały na ekranie.”; wpisane okno nadal widoczne (1 przycisk „Usuń okno wtorek 18:00–20:00”); w bazie `availability_windows` = 0 wierszy.
- Po przejściu na `/mentor` karta B pokazuje tylko h1 „Dostęp tylko przez zaproszenie…”, bez formularza (`form, input, textarea, select` = 0) i bez nawigacji.

## Dane i sprzątanie
- Mentor tworzony w teście (`signedInMentor`, `createInvitation`), `uniqueEmail("sign-out-tabs")`.
- Schemat `dm_migtest_*` tworzony i usuwany przez `scripts/test-e2e.mjs`; kontekst (z obiema kartami) zamykany w `finally`.

## Uwagi
- Sprawdza tylko zapis dostępności po wylogowaniu; nie sprawdza zapisu strony mentora (`saveMentorPage`).
- Nie sprawdza automatycznego przekierowania (spec: brak przekierowania, dane zostają na ekranie).
- Niższe poziomy: `tests/db/mentor-auth.test.mjs` („endSession ustawia revoked_at i jest idempotentne”, „getMentorForSession: tylko id; null dla wygasłej, odwołanej, nieznanej i pustej”), `tests/db/availability-save.test.mjs` („bez sesji: unauthorized, nic nie zapisane (baza nietknięta)”), `tests/mentor-page/mentor-page.test.mjs` („unauthorizedResult zwraca świeży obiekt”).
