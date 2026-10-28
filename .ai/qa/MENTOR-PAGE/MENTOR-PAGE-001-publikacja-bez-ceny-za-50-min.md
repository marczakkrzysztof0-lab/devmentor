# MENTOR-PAGE-001: Odmowa publikacji strony, gdy brak ceny za 50 min — błąd przy polu, dane zostają, strona niepubliczna

| Pole | Wartość |
|---|---|
| Id | MENTOR-PAGE-001 |
| Obszar / spec | MENTOR-PAGE / `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14; `saveMentorPage`, Q3, R03) |
| Priorytet | Wysoki |
| Typ | UI e2e (Playwright) + baza + HTTP |
| Niestandardowy | nie |
| Implementacja | [tests/e2e/mentor-page-001-publikacja-bez-ceny.e2e.mjs](../../../tests/e2e/mentor-page-001-publikacja-bez-ceny.e2e.mjs) — test „odmawia publikacji, gdy brak ceny za 50 min — błąd przy polu, dane zostają, strona niepubliczna” |

## Given
- Zalogowana mentorka (przez zaproszenie) ze szkicem strony.
- Formularz wypełniony: imię „Ewa Bez-Ceny”, link do prac `https://github.com/ewa-bez-ceny`, opis, „Cena za 25 min (zł)” = `150`, „Adres strony” = unikalny slug `bez-ceny-…`.
- Pole „Cena za 50 min (zł)” puste.
- Zapamiętany wiersz strony w bazie (stan „przed”).

## When
- Mentorka klika przycisk „Opublikuj stronę”.

## Then
- Przy polu „Cena za 50 min (zł)” pojawia się komunikat „Podaj cenę za 50 min od 20 do 5000 zł, bez groszy”, powiązany z polem (opis dostępny, `aria-describedby`).
- Brak komunikatu „Podaj cenę za 25 min…” (cena za 25 min jest poprawna) — to jedyny błąd.
- Fokus ustawiony na polu `price50`.
- Wpisane dane zostają w formularzu: „Imię i nazwisko” = „Ewa Bez-Ceny”, „Cena za 25 min (zł)” = `150`, „Adres strony” = slug.
- Nie ma panelu z polem „Twój link”.
- Baza: wiersz strony identyczny jak „przed”, `published_at` = `null`.
- HTTP: `GET /m/{slug}` zwraca 404.

## Dane i sprzątanie
- Mentor tworzony w teście: zaproszenie `createInvitation` z `scripts/mentor-links.mjs` przez helper `signedInMentor`, unikalny e-mail `uniqueEmail("no-price-50")`, unikalny slug z `Date.now()`.
- Jednorazowy schemat `dm_migtest_*` tworzony i usuwany przez `scripts/test-e2e.mjs`.
- Kontekst przeglądarki zamykany w `finally`, pula bazy i przeglądarka w `after`.

## Uwagi
- To odpowiednik z lekcji 12 scenariusza „mentor nie opublikuje profilu bez technologii” — tu brakującym polem jest cena za 50 min.
- Reguła jest egzekwowana w 3 warstwach: walidacja DS w przeglądarce (`packages/ui/src/product/e01/Mentor.tsx`, `validateMentorPage`), serwer (`lib/mentor-page/validate.mjs`) i CHECK publikacji w bazie (migracja 0003); ten test przechodzi przez całą ścieżkę, więc nie rozstrzyga, która warstwa zablokowała zapis.
- Niższe poziomy: `tests/db/prices-schema.test.mjs` („Q3: publikacja bez którejkolwiek ceny jest odrzucana”), `tests/mentor-page/validate.test.mjs` („pusta cena na publikacji → błąd; w szkicu → null”), `tests/db/mentor-page.test.mjs` („szkic: błędna wartość odrzucona, wiersz bez zmian”).
- Nie sprawdza: braku innych pól ani zapisu szkicu bez ceny (publish = false).
