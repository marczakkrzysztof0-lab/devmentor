# MENTOR-PAGE-004: Propozycja adresu bez polskich znaków z imienia „Łukasz Żółć-Ślęzak” i publikacja strony pod tym adresem

| Pole | Wartość |
|---|---|
| Id | MENTOR-PAGE-004 |
| Obszar / spec | MENTOR-PAGE / `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14; Z10, Q6, `slugFromName`) |
| Priorytet | Średni |
| Typ | UI e2e (Playwright) + baza + HTTP |
| Niestandardowy | tak |
| Implementacja | [tests/e2e/mentor-page-004-slug-z-polskimi-znakami.e2e.mjs](../../../tests/e2e/mentor-page-004-slug-z-polskimi-znakami.e2e.mjs) — test „proponuje adres bez polskich znaków i publikuje stronę, którą deweloper otwiera pod tym adresem” |

## Given
- Zalogowany mentor na pierwszej wizycie w edytorze (pole „Adres strony” ma adres zastępczy `mentor-xxxxxx`).

## When
- Wpisuje w „Imię i nazwisko” wartość „Łukasz Żółć-Ślęzak”.
- Zostawia propozycję adresu, uzupełnia link `https://github.com/lukasz-zolc`, opis, „Cena za 25 min (zł)” = `180`, „Cena za 50 min (zł)” = `320` i klika „Opublikuj stronę”.
- Deweloper (osobna przeglądarka, bez sesji, strefa Europe/London) otwiera `/m/lukasz-zolc-slezak`.

## Then
- Po wpisaniu imienia pole „Adres strony” ma wartość `lukasz-zolc-slezak`.
- Po publikacji pole „Twój link” ma wartość `{BASE_URL}/m/lukasz-zolc-slezak`.
- Baza: `slug` = `lukasz-zolc-slezak`, `display_name` = „Łukasz Żółć-Ślęzak” (z polskimi znakami).
- HTTP: strona publiczna zwraca 200, nagłówek h1 = „Łukasz Żółć-Ślęzak”, tytuł dokumentu = „Łukasz Żółć-Ślęzak — DevMentor”.

## Dane i sprzątanie
- Mentor tworzony w teście przez `createInvitation` (helper `signedInMentor`), `uniqueEmail("polish-slug")`; slug jest stały i deterministyczny, więc test polega na świeżym schemacie.
- Schemat `dm_migtest_*` tworzony i usuwany przez `scripts/test-e2e.mjs`.
- Kontekst mentora i kontekst odwiedzającego zamykane w `finally`.

## Uwagi
- Transliteracja jest sprawdzana jednym imieniem z literami ł, ż, ó, ć, ś, ę; nie testuje innych alfabetów ani przycinania do 40 znaków.
- Nie sprawdza nadpisywania ręcznie edytowanego adresu (propozycja z imienia nadpisuje pole tylko do pierwszej ręcznej edycji).
- Niższe poziomy: `tests/mentor-page/validate.test.mjs` („maks. 40 znaków, bez myślnika na końcu po przycięciu”, „SLUG_PATTERN jest regułą z #23”), `tests/auth/mentor-auth.test.mjs` („spełnia regułę sluga z migracji 0001”).
