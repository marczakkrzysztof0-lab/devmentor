# Postęp: klikalny prototyp „strona-mentora” (E01, s01–s07)

Zadanie: `lekcja-07/klikalny-prototyp-prompt.md`. Mapa: `lekcja-07/mapa-ekranow.md` (zatwierdzona 2026-10-20, L1–L21).

## Etap 0. Plan — 2026-10-20 — zatwierdzony

- React 19 + Vite 8 + Tailwind 4, komponenty `@devmentor/ui` i `@devmentor/ui/product`. Build do `packages/ui/.storybook/public/prototypes/strona-mentora/` (gitignore).
- Decyzje (K. Marczak przez delegację): Q1 slug zastępczy `mentor-q7k2ma` wg L9, brak propozycji z imienia = LUKA DS D4. Q2 limit 21 okien: Alert po próbie zapisu, LUKA DS D8. Q3 C15 = ograniczanie szerokości `.frame`.

## Etap 1. Szkielet i ścieżka bez błędów — 2026-10-20 — zrobione

- `package.json` (bez zależności, nie workspace), `vite.config.mjs`, `index.html`, `src/main.tsx`, `src/App.tsx`.
- Silnik przeglądu skopiowany do `src/silnik/` (`prototype.js`, `prototype.css` bez zmian; `comments.js` z `prototypeId: 'strona-mentora'`; `mostek.css` przepięty na `--ds-*`, style `.btn`/`.segmented`/`.toast` paska z tokenów).
- Pasek: „Prototyp”, `.screen-nav` s01–s07, przełącznik motywu (`data-theme` + `.dark`), adres symulowany, zegar demo.
- Ścieżka: s01 Akceptuję → s04 publikacja → panel z linkiem → s05 zapis okien → s06 strona publiczna.
- Poprawki po pierwszym uruchomieniu: kolejność resetu motywu Tailwind (nagłówki bez rozmiarów), pasek nie-sticky (zasłaniał ekran), fokus na h1 po wczytaniu s04/s05.

## Etap 2. Stany, role, scenariusze — 2026-10-20 — zrobione

- Kontrolki C1–C15 z mapy + C16 (wczytywanie s04/s05, dodane w prototypie). Founder: symulowany CLI w panelu.
- Bramki: s04/s05 bez sesji pokazują komunikat s03 (14-S1, 14-S2, L14); „Wyloguj” → s03 (L7). Inny mentor (L5): notatka.
- Dane zostają po błędzie; L6: po wygaśnięciu sesji przy zapisie formularz zostaje z Alertem, kolejne wejście = bramka.
- Przekierowania (14-A4, L5) jako notatka „Symulacja prototypu” z krokiem do kliknięcia (bez pętli „← Back”).

## Etap 3. Uczciwość i sprawdzenie — 2026-10-20 — zrobione

- Notatki przy każdym ekranie (`.notes`: historie, symulacje, czego nie rozstrzyga). README z sekcją „Ograniczenia symulacji”.
- `tests/nawigacja.test.mjs`: 11/11 zielonych. `scripts/evidence.mjs`: 28 zrzutów (7 ekranów × 320/1440 × jasny/ciemny), 34 zrzuty stanów (1440/375), klawiatura, 77 wartości kontrolek, 34 przyciski/linki — bez poziomego przewijania, bez martwych kliknięć, bez błędów konsoli. Wynik: `evidence/`.
- Repo: `npm run lint`, `npm test`, `npm run check:tokens`, `npm run typecheck:ui`, `tsc` w katalogu głównym — zielone.
- `check:tokens` pomija `packages/ui/.storybook/public/prototypes/` (wynik budowania + kopia szarego prototypu, gitignore, literalne kolory). Źródło prototypu sprawdza `npm run check:tokens` w tym katalogu (OK).

## Otwarte

- Niesprawdzone: czytnik ekranu, Firefox/Safari, prawdziwy telefon, otwarcie przez `npm run storybook` (sprawdzone na tym samym katalogu statycznym przez `scripts/serve.mjs`).
- Pytania do specyfikacji: horyzont 14 dni vs termin 3.11 w mapie/fixtures; C8 „okna w 3 h → brak terminów” niemożliwe przy oknach tygodniowych; podwójne kliknięcie linku logowania przy istniejącej sesji; kolejność baneru dostępności i panelu linku po publikacji.
