# PUBLIC-PAGE-001: Terminy z okna zapisanego w panelu widoczne dla dewelopera w jego strefie, pusty stan po usunięciu okna

| Pole | Wartość |
|---|---|
| Id | PUBLIC-PAGE-001 |
| Obszar / spec | PUBLIC-PAGE / `.ai/specs/2026-10-19-public-mentor-share-page.md` (#16, Phase 2) i `.ai/specs/2026-10-19-mentor-weekly-availability-and-open-slots.md` (#15) |
| Priorytet | Wysoki |
| Typ | UI e2e (Playwright) + baza + HTTP |
| Niestandardowy | nie |
| Implementacja | [tests/e2e/public-page-001-okno-z-panelu-na-stronie-publicznej.e2e.mjs](../../../tests/e2e/public-page-001-okno-z-panelu-na-stronie-publicznej.e2e.mjs) — test „pokazuje deweloperowi terminy z okna zapisanego w panelu, w jego strefie, i pusty stan po usunięciu okna” |

## Given
- Zalogowana mentorka (strefa Europe/Warsaw); deweloper w osobnej przeglądarce ze strefą Europe/London.
- Mentorka wypełnia stronę (imię „Paulina Pełna”, ceny 140 i 260 zł, unikalny slug `pelna-sciezka-…`) i klika „Opublikuj stronę” — widzi „Twój link”.
- W panelu „Dostępność” klika „Dodaj okno: wtorek” (okno „wtorek 18:00–20:00”) i „Zapisz” — pojawia się „Dostępność zapisana”.

## When
- Deweloper otwiera `/m/{slug}`.
- Mentorka klika „Usuń okno wtorek 18:00–20:00”, „Zapisz”, a deweloper odświeża stronę.

## Then
- Widoczne: h1 „Paulina Pełna” i h2 „Najbliższe terminy (twoja strefa: Europe/London)”.
- Dla długości „25 min” i „50 min” (radio) godziny na stronie to wyłącznie 17:00–18:30 (25 min) i 17:00–18:00 (50 min), w tym 17:00 (= 18:00 w Warszawie); brak komunikatu o braku terminów.
- Po usunięciu okna: tekst „Brak wolnych terminów w najbliższych 14 dniach”, brak grupy radio, h1 „Paulina Pełna” nadal widoczny.
- Baza: 0 wierszy w `availability_windows` dla mentorki.

## Dane i sprzątanie
- Mentorka tworzona w teście (`signedInMentor`, `createInvitation`), `uniqueEmail("full-path")`; strona i okno powstają wyłącznie przez UI (celem jest cała ścieżka).
- Schemat `dm_migtest_*` tworzony i usuwany przez `scripts/test-e2e.mjs`.
- Konteksty mentorki i dewelopera zamykane w `finally`.

## Uwagi
- Asercje na godziny nie zależą od „teraz”: porównują zakres 17:00–18:30 / 18:00, a nie konkretne daty; okno wtorkowe jest zawsze w horyzoncie 14 dni.
- Nie sprawdza minimalnego wyprzedzenia (3 h), zmiany czasu ani rezerwacji terminu.
- Niższe poziomy: `tests/availability/slots.test.mjs` („okno 2-godzinne 18:00–20:00: 25 o 18:00–19:30, 50 o 18:00–19:00, bez 50 o 19:30”, „pn 19:00 Warszawa: wt 18:00 Warszawa oferowane = 17:00 w Londynie; nic w ciągu 3 h”), `tests/db/availability-save.test.mjs` („round-trip: zapis, potem loadAvailability zwraca te same okna i strefę; updated_at = now”), `tests/db/public-page.test.mjs` („opublikowana strona: publiczne dane + osobno mentorId”), starsze e2e `tests/e2e/public-slots.e2e.mjs`.
