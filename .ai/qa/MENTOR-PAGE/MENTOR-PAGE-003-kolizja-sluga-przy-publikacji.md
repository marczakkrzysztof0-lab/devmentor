# MENTOR-PAGE-003: Odmowa publikacji pod adresem zajętym przez inną mentorkę — „Ten adres jest zajęty”, strona pierwszej bez zmian

| Pole | Wartość |
|---|---|
| Id | MENTOR-PAGE-003 |
| Obszar / spec | MENTOR-PAGE / `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14; Edge Cases — kolizja sluga, `fieldErrorsFromDbError`) |
| Priorytet | Średni |
| Typ | UI e2e (Playwright) + baza + HTTP |
| Niestandardowy | tak |
| Implementacja | [tests/e2e/mentor-page-003-kolizja-sluga.e2e.mjs](../../../tests/e2e/mentor-page-003-kolizja-sluga.e2e.mjs) — test „odmawia publikacji pod adresem zajętym przez inną mentorkę — „Ten adres jest zajęty”, strona pierwszej bez zmian” |

## Given
- Dwie zalogowane mentorki w osobnych kontekstach przeglądarki: A i B.
- Mentorka A wypełniła stronę (imię „Alicja Pierwsza”, ceny 120 i 220 zł, unikalny slug `zajety-…`) i opublikowała ją — widzi „Twój link”.
- Zapamiętane wiersze stron A i B w bazie (stan „przed”).

## When
- Mentorka B wypełnia stronę tymi samymi danymi (imię „Beata Druga”, ten sam slug) i klika „Opublikuj stronę”.

## Then
- Przy polu „Adres strony” pojawia się komunikat „Ten adres jest zajęty”, powiązany z polem (`aria-describedby`).
- Dane B zostają w formularzu: „Imię i nazwisko” = „Beata Druga”, „Adres strony” = slug.
- U B nie ma pola „Twój link”.
- Baza: wiersz B bez zmian (nieopublikowany), wiersz A bez zmian i nadal ze slugiem `slug`.

## Dane i sprzątanie
- Obie mentorki tworzone w teście przez `createInvitation` (helper `signedInMentor`): `uniqueEmail("slug-owner")`, `uniqueEmail("slug-second")`; slug z `Date.now()`.
- Schemat `dm_migtest_*` tworzony i usuwany przez `scripts/test-e2e.mjs`.
- Oba konteksty przeglądarki zamykane w `finally`.

## Uwagi
- Unikalność pilnuje indeks `mentor_pages_slug_key` w bazie, a nie sprawdzenie w UI — dlatego błąd pojawia się dopiero po kliknięciu.
- Nie sprawdza wyścigu (jednoczesnej publikacji) ani wielkości liter w slugu.
- Niższe poziomy: `tests/db/mentor-page.test.mjs` („slug zajęty przez innego mentora → „Ten adres jest zajęty”, nic nie zapisane”, „równoczesna publikacja dwóch mentorów z tym samym slugiem: wygrywa dokładnie jeden”), `tests/mentor-page/mentor-page.test.mjs` („unikalność sluga → „Ten adres jest zajęty””).
