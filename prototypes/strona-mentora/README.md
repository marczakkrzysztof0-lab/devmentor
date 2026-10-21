# Prototyp: strona mentora (E01, ekrany s01–s07)

Klikalny prototyp przepływu „od zaproszenia do linku do strony” z zatwierdzonej mapy ekranów
(`lekcja-07/mapa-ekranow.md`, decyzje L1–L21). Wygląd z design systemu (`@devmentor/ui`,
`@devmentor/ui/product`), zachowanie ze specyfikacji #14, #15, #16. Dane są fikcyjne.
Prototyp nie jest częścią aplikacji: aplikacja go nie importuje, a on nie zmienia `app/` ani `packages/ui/src`.

## Jak uruchomić

Z katalogu `prototypes/strona-mentora` (PowerShell lub bash):

```
npm run build        # zapisuje wynik w packages/ui/.storybook/public/prototypes/strona-mentora/ (gitignore)
cd ../..; npm run storybook
```

Potem otwórz `http://localhost:6006/prototypes/strona-mentora/index.html`.

Inne polecenia (w katalogu prototypu):

| Polecenie | Co robi |
|---|---|
| `npm run dev` | Vite z podglądem na żywo: `http://localhost:5180/` |
| `npm test` | testy nawigacji i scenariuszy (Playwright z repozytorium; najpierw `npm run build`) |
| `npm run evidence` | zrzuty i sprawdzenie 320/1440 px, motywów, klawiatury, kontrolek i przycisków → `evidence/` |
| `npm run typecheck` | TypeScript prototypu |
| `npm run check:tokens` | sprawdza, że prototyp używa tylko tokenów DS |

Nie ma osobnego `npm install`: prototyp korzysta z zależności zainstalowanych w repozytorium
(Vite, Tailwind i Playwright z `packages/ui`, React z katalogu głównego).

## Jak to jest zbudowane

- React 19 + Vite 8 + Tailwind 4. Ekrany składane wyłącznie z komponentów i tokenów DS.
  Brakujące elementy złożone z tokenów i oznaczone w kodzie `// LUKA DS Dx`.
- Silnik przeglądu z `lekcja-07/silnik-przegladu/` (kopia w `src/silnik/`): tryb klikania i komentarzy,
  hotspoty, tryb prezentacji, wątki, „← Back”, eksport. `prototypeId` = `strona-mentora`.
  `mostek.css` podpina nazwy silnika pod tokeny `--ds-*` (bez własnych kolorów).
- Pasek przeglądu (oznaczenie „Prototyp”, wybór ekranu, motyw, adres symulowany, zegar demo) i panel
  „Scenariusze” są osobno od nawigacji produktu.

## Konta demo

| Rola | Konto | Jak wejść |
|---|---|---|
| Mentorka | **Anna K.**, `anna@example.com` (fikcyjne) | start na s01 (link zaproszenia), albo C1 „Mentorka Anna (z sesją)” |
| Developer | **Kuba**, bez konta, strefa Warszawa lub Londyn (C10) | ekran s06, adres z C12 |
| Founder | **Oliwia**, bez UI | panel Scenariusze → „Founder Oliwia (symulowany CLI)” → wygeneruj link → „Otwórz link jako Anna” |

Strony pomocnicze: **Piotr N.** `/m/piotr-n` (opublikowana, bez okien), **Ewa** `/m/ewa-szkic` (szkic → s07).
Stały „teraz”: poniedziałek 19.10.2026, 19:00 Europe/Warsaw (C14 „+1 dzień”).

## Scenariusze (panel „Scenariusze”)

| # | Kontrolka | Wartości | Ekrany |
|---|---|---|---|
| C1 | Rola / widok | Anna z sesją · Anna bez sesji · Kuba · Oliwia | wszystkie |
| C2 | Link zaproszenia | ważny · wygasł · odwołany · już użyty · nieznany · email ma konto | s01 |
| C3 | Wynik kliknięcia w linku | sukces · długo trwa · brak sieci | s01, s02 |
| C4 | Link logowania | ważny · użyty · wygasł · nieznany · podwójne kliknięcie | s02 |
| C5 | Sesja | aktywna · brak · wygasła przy wejściu · wygasa przy zapisie (L6) · inny mentor (L5) | s01–s05 |
| C6 | Stan strony Anny | pusty szkic · szkic wypełniony · opublikowana · opublikowana bez dostępności | s04, s06/s07 |
| C7 | Wynik zapisu / publikacji | ok · adres zajęty · błąd pola · błąd serwera · brak sieci · długo trwa | s04 |
| C8 | Dostępność Anny | brak okien · wt 18–20 + czw 12–13 · okno dziś w ciągu 3 h | s04, s05, s06 |
| C9 | Wynik zapisu dostępności | ok · błąd serwera · brak sieci · długo trwa · 22 okna (limit 21) | s05 |
| C10 | Strefa przeglądarki | Europe/Warsaw · Europe/London · niedostępna | s05, s06 |
| C11 | Sekcja terminów | gotowe · ładowanie · błąd · brak sieci | s06 |
| C12 | Adres publiczny | `/m/anna-k` · `/m/piotr-n` · `/m/ewa-szkic` · `/m/annak2` · `/m` · `/m?search=react` | s06, s07 |
| C13 | Opis | 3 zdania · 2000 znaków | s06 |
| C14 | Zegar demo | stały „teraz” · +1 dzień | s05, s06 |
| C15 | Szerokość ramki | pełna · 1024 · 375 · 320 px | wszystkie |
| C16 | Wczytywanie s04, s05 (dodane w prototypie) | krótko (0,5 s) · zatrzymane | s04, s05 |

„Reset symulacji” wraca do początku. Stan jest tylko w pamięci karty: przeładowanie też resetuje.

## Ograniczenia symulacji

- **Nic nie jest wysyłane ani zapisywane na serwerze.** Zaproszenie, logowanie, zapis szkicu, publikacja
  i zapis dostępności to symulacje w przeglądarce; wyniki ustawiają kontrolki C3, C7, C9.
- **Brak maili i zewnętrznych usług.** W E01 ich nie ma; linki wydaje founder przez CLI (tu: symulowany wynik
  polecenia w panelu). Nie zbieramy haseł ani danych kart.
- **Linki zewnętrzne** (np. `github.com/annak`) nie są otwierane; pasek pokazuje komunikat.
- **„Kopiuj link”** kopiuje do schowka adres demo `http://localhost:3000/m/…`, który nie działa poza prototypem.
- **Przekierowania** (14-A4, L5) są pokazane jako notatka „Symulacja prototypu” z krokiem do kliknięcia,
  żeby „← Back” nie wpadał w pętlę.
- **Terminy liczy prototyp** (siatka :00/:30, 3 h wyprzedzenia, horyzont 14 dni od stałego „teraz”, DST 25.10).
  To nie jest implementacja `listOpenSlots`.
- **Inny zalogowany mentor** (C5) nie ma danych: edytor i dostępność pokazują tylko notatkę.
- **Wczytywanie** (stan Ł) trwa stałe 0,5 s przy każdym wejściu na s04/s05; nieskończone — C16.
- **s06 nie ma rezerwacji — celowo.** W E01 strona publiczna pokazuje terminy jako tekst, bez formularza,
  przycisku ani linku przy terminie (L1, #16 Q1/Q8). Rezerwacja z terminu (każdy termin = wejście do formularza)
  należy do #17 (E02). Uwaga testera z 2026-10-21 „brak rezerwacji” to potwierdzenie oczekiwania, nie błąd prototypu.
- **Opis Piotra N.** to fikcyjny tekst pomocniczy (bez ocen, liczb ani opinii).
- **Komentarze** zapisują się w przeglądarce recenzenta; do zespołu trafiają przez eksport i commit `src/silnik/comments.js`.
