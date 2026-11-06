# Lekcja 17 — bramki deterministyczne (opcjonalne): Stryker i Size Limit

Zgoda Krzysztofa (przekazana przez koordynatora): devDependencies `@stryker-mutator/core@10.0.0`, `size-limit@14.2.0`, `@size-limit/file@14.2.0` (wersje przypięte, każda starsza niż 2 tygodnie). RESTler pominięty.

Pomiar: 2026-11-03, Windows 11, node v24.21.0, gałąź `lekcja-17-review` (baza `a4812a3`).

## 1. Test mutacyjny — Stryker na `lib/requests/validate.mjs`

**Dlaczego ten moduł:** walidacja zapytania przed płatnością (spec #17: długość 25/50 — R01, pytanie 20–4000 znaków — R05, kwota, termin, id próby). Czysta funkcja, szybkie testy (`tests/requests/validate.test.mjs`), błąd = zapis złego zapytania albo odrzucenie dobrego.

**Konfiguracja:** [`stryker.config.mjs`](../stryker.config.mjs) — runner `command` (`node --test tests/requests/validate.test.mjs`), bez Jest/Vitest. Uruchomienie: `npm run test:mutation` (~1,5 min). Raport HTML/JSON w `reports/mutation/` (w `.gitignore`). **Nie w CI** — za wolny na każdy PR; propozycja: ręcznie przy zmianie modułu albo w nocnej zmianie.

### Wynik

| | Mutanty | Zabite | Przeżyły | Wynik |
|---|---|---|---|---|
| Przed (testy z `main`) | 111 | 96 | 15 | **86,49%** |
| Po dopisaniu 4 testów | 111 | 105 | 6 | **94,59%** |

### Przeżyłe mutanty (przed) i co z nimi zrobiłem

| plik:linia | Mutant | Dlaczego przeżył | Brakujący test → stan |
|---|---|---|---|
| `lib/requests/validate.mjs:22` | regex UUID bez `^` | testy nie podawały UUID z doklejonym prefiksem | `x<UUID>`, ` <UUID>` → błąd terminu — **dopisany** |
| `lib/requests/validate.mjs:22` | regex UUID bez `$` | j.w. dla sufiksu | `<UUID>x`, `<UUID>-0000` → błąd — **dopisany** |
| `lib/requests/validate.mjs:51` | `typeof slotStart === "string"` → `true` | test „nie-napis” używał liczby i `null` — `Date.parse` daje dla nich NaN, więc wynik ten sam | `slotStart` jako obiekt `Date` → błąd terminu (inaczej `Date.parse(String(date))` przepuszcza) — **dopisany** |
| `lib/requests/validate.mjs:16–19` | 4 × komunikat → `""` | testy porównują z `MESSAGES` z tego samego modułu (tautologia), więc zmiana tekstu nie jest wykrywana | komunikaty przypięte dosłownie (3 z 4 są też w DS `validateRequest`, `Request.tsx`) — **dopisany** |
| `lib/requests/validate.mjs:15` | `MESSAGES` → `{}` | j.w. | j.w. — **dopisany** |
| `lib/requests/validate.mjs:13` | `SESSION_LENGTHS` → `[]` | eksportowana stała nieużywana w walidacji (warunek ma 25/50 wpisane na sztywno) i nietestowana | `SESSION_LENGTHS` = `[25, 50]` — **dopisany**; uwaga do refaktoru: warunek mógłby używać stałej |
| `lib/requests/validate.mjs:48` | `typeof submissionId === "string"` → `true` | nie-napis i tak nie przejdzie `UUID.test` (string z `String(x)` nie jest UUID) | **równoważny** w praktyce (trzeba by obiektu z `toString()` zwracającym UUID) — bez testu |
| `lib/requests/validate.mjs:48` | `""` → `"Stryker was here!"` | ten napis też nie jest UUID | **równoważny** |
| `lib/requests/validate.mjs:51` | `""` → `"Stryker was here!"` | `Date.parse` tego napisu = NaN, jak dla `""` | **równoważny** |
| `lib/requests/validate.mjs:52` | `slotText === ""` → `false` | `Date.parse("")` też daje NaN — gałąź jest nadmiarowa | **równoważny**; można uprościć kod (osobny refaktor) |
| `lib/requests/validate.mjs:52` | `""` → `"Stryker was here!"` | j.w. | **równoważny** |
| `lib/requests/validate.mjs:67` | `""` → `"Stryker was here!"` | 17 znaków < 20 → ten sam błąd „za krótkie” | **równoważny** (zależy od QUESTION_MIN > 17) |

Zostały tylko mutanty równoważne (6). Proponowany próg dla tego modułu: `break: 90` (dziś 94,59%), gdyby Stryker wszedł do nocnej zmiany.

## 2. Rozmiar paczek — Size Limit na `.next/static/chunks`

Konfiguracja: [`.size-limit.json`](../.size-limit.json), `npm run size` po `npm run build`; **w CI jako krok joba `build`**. Rozmiary po kompresji brotli (domyślnie w `@size-limit/file`), 1 kB = 1000 B. Nazwy chunków Turbopacka to hashe (zmieniają się przy każdej zmianie kodu), więc limity są na sumę JS i sumę CSS, a nie na pojedyncze pliki.

### Rozmiary (build Turbopack, `next build`, Next 16.4.3)

| Chunk | Surowy (B) | Brotli (B) |
|---|---:|---:|
| `20box33a0_n53.js` | 229 627 | 61 437 |
| `0cmhdt-eijyco.js` | 139 591 | 38 870 |
| `0cz1d0mv5g_q7.js` | 112 594 | 35 158 |
| `16cnhmrf6tr23.js` | 136 164 | 31 207 |
| `3ihb0kkv42-hc.js` | 71 960 | 22 650 |
| `1gib8kq9fh6sm.js` | 30 780 | 8 491 |
| `33yc0ygc4jf55.js` | 30 198 | 7 180 |
| `turbopack-2c3mg3r-05n1w.js` | 11 255 | 3 923 |
| `1rqeq3uddo_nb.js` | 10 166 | 3 312 |
| `1tq6ppe__m8m-.js` | 14 090 | 3 224 |
| `2dojq7_jk_nzh.js` | 6 884 | 1 953 |
| `08j5zr3d5xo5s.js` | 2 919 | 1 254 |
| `0zrncon3x8nx2.js` | 1 125 | 534 |
| `3wa4hfvqm3ye8.css` | 36 429 | 7 065 |
| **Razem JS** (13 plików) | 797 353 | **219 193** |
| **Razem CSS** | 36 429 | **7 065** |

### Proponowane limity (wpisane w `.size-limit.json`)

| Grupa | Dziś | Limit | Uzasadnienie |
|---|---:|---:|---|
| JS klienta razem | 219,19 kB | **240 kB** | ~+10%: jedna nowa strona/komponent mieści się, nowa ciężka biblioteka (np. edytor, wykresy) — nie |
| CSS razem | 7,07 kB | **8 kB** | ~+13%; Tailwind z tokenami DS — skok CSS zwykle oznacza wartości spoza tokenów |

Dalszy krok (do decyzji): limit na największy chunk wymagałby stałych nazw (np. analiza `.next/build-manifest.json` per trasa) — pominięte, żeby nie budować kruchej bramki na hashach.

## Czego te bramki nie dowodzą

- Stryker mierzy jakość testów jednego modułu, nie poprawność całego przepływu zapytania (DB, płatność — testy `tests/db/*`, e2e).
- Size Limit mierzy sumę wszystkich chunków, nie to, co pobiera konkretna strona; Windows i Linux mogą dać minimalnie różne liczby (margines 10% to pokrywa).
