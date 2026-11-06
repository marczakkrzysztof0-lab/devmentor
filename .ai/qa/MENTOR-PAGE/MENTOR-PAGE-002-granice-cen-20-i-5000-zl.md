# MENTOR-PAGE-002: Odrzucenie cen 19 i 5001 zł oraz publikacja z cenami granicznymi 20 i 5000 zł

| Pole | Wartość |
|---|---|
| Id | MENTOR-PAGE-002 |
| Obszar / spec | MENTOR-PAGE / `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14; Q14, walidacja cen: pełne złote 20–5000) |
| Priorytet | Średni |
| Typ | UI e2e (Playwright) + baza + HTTP |
| Niestandardowy | nie |
| Implementacja | [tests/e2e/mentor-page-002-granice-cen.e2e.mjs](../../../tests/e2e/mentor-page-002-granice-cen.e2e.mjs) — test „odrzuca 19 i 5001 zł, publikuje stronę z cenami 20 i 5000 zł (2000 i 500000 groszy w bazie)” |

## Given
- Zalogowana mentorka ze szkicem.
- Wypełnione: imię „Gabriela Granica”, link `https://gitlab.com/gabriela`, opis „Testy kontraktowe i CI dla 12 mikroserwisów.”, unikalny slug `granice-…`.
- Ceny jeszcze niewpisane.

## When
- Wpisuje „Cena za 25 min (zł)” = `19` i „Cena za 50 min (zł)” = `5001`, klika „Opublikuj stronę”.
- Następnie zmienia ceny na `20` i `5000` i ponownie klika „Opublikuj stronę”.

## Then
- Po pierwszym kliknięciu widoczne oba komunikaty: „Podaj cenę za 25 min od 20 do 5000 zł, bez groszy” i „Podaj cenę za 50 min od 20 do 5000 zł, bez groszy”.
- Baza: `published_at` = `null`; HTTP: `GET /m/{slug}` → 404.
- Po drugim kliknięciu pojawia się pole „Twój link” o wartości `{BASE_URL}/m/{slug}`, a komunikat o cenie za 25 min znika.
- Baza: `published_at` ustawione, `price_25_minor` = 2000, `price_50_minor` = 500000, `currency` = „PLN”.
- Pole „Cena za 50 min (zł)” nadal pokazuje `5000`.
- HTTP: `GET /m/{slug}` → 200.

## Dane i sprzątanie
- Mentorka tworzona w teście przez `createInvitation` (helper `signedInMentor`), e-mail `uniqueEmail("price-bounds")`, slug z `Date.now()`.
- Schemat `dm_migtest_*` tworzony i usuwany przez `scripts/test-e2e.mjs`.
- Kontekst przeglądarki zamykany w `finally`.

## Uwagi
- Sprawdza wartości tuż poza zakresem (19, 5001) i graniczne (20, 5000) obu cen naraz; nie rozdziela, która cena jest błędna osobno.
- Nie sprawdza groszy ani wartości nienumerycznych (np. `20,50`) — to pokrywa test jednostkowy.
- Niższe poziomy: `tests/mentor-page/validate.test.mjs` („zera wiodące i spacje dookoła są przyjęte”, „pełny formularz → wartości znormalizowane, ceny w groszach”), `tests/db/mentor-page.test.mjs` („ceny w groszach; waluta zostaje PLN, nawet gdy wejście mówi EUR”), `tests/db/prices-schema.test.mjs` („cena 0 lub ujemna jest odrzucana (także w szkicu)”).
