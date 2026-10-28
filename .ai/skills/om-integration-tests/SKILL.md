---
name: om-integration-tests
description: Repo-local extension of om-integration-tests for DevMentor — every test gets a Given–When–Then Markdown scenario in .ai/qa/{AREA}/ linked to its node --test / Playwright implementation, always following best-practices-testow-integracyjnych.md.
---

# om-integration-tests – rozszerzenie dla DevMentora

Rozszerza zainstalowany skill `om-integration-tests` (`.claude/skills/om-integration-tests/SKILL.md`). Przepływ, zasady bezpieczeństwa i raport z analizą porażek zostają bez zmian; poniższe reguły dochodzą na wierzch i wygrywają tylko w sprawach specyficznych dla tego repo. Nie łagodzą żadnej reguły bazowej.

## Zawsze, przy każdym użyciu skilla

1. **Dobre praktyki są obowiązkowe.** Przed napisaniem scenariusza lub testu przeczytaj `.ai/skills/om-integration-tests/best-practices-testow-integracyjnych.md` i stosuj wszystkie 15 punktów. W przeglądzie własnej pracy sprawdź je po kolei (szczególnie: Given–When–Then, determinizm, niezależność, konkretne asercje, nazwa = akcja + warunek + rezultat).
2. **Scenariusz Markdown jest obowiązkowy** (w bazowym skillu krok 8 jest opcjonalny — tutaj NIE). Każdy nowy test integracyjny ma plik:

   `.ai/qa/{AREA}/{AREA}-{number}-{slug}.md`

   - `{AREA}` — obszar wielkimi literami: `AUTH` (zaproszenie, logowanie, sesja), `MENTOR-PAGE` (edytor i publikacja strony), `AVAILABILITY` (dostępność mentora), `PUBLIC-PAGE` (publiczna strona `/m/{slug}`); nowy obszar dodaj do tej listy.
   - `{number}` — trzy cyfry, kolejny wolny numer w katalogu obszaru (`ls .ai/qa/{AREA}`).
   - `{slug}` — krótki opis po polsku, małe litery ASCII i myślniki (bez polskich znaków).
3. **Każdy scenariusz linkuje do implementacji testu** — względną ścieżką Markdown do pliku i nazwą testu, np. `[tests/e2e/mentor-page-001-publikacja-bez-ceny.e2e.mjs](../../../tests/e2e/mentor-page-001-publikacja-bez-ceny.e2e.mjs)`. Implementacja odwrotnie: pierwsza linia komentarza w pliku testu podaje id scenariusza i ścieżkę `.ai/qa/...`. Scenariusz bez linku do działającego testu = niedokończona praca.
4. **Szablon scenariusza** (wypełniony tym, co naprawdę zaobserwowano w aplikacji, nie przypuszczeniem):

   ```markdown
   # {AREA}-{number}: {nazwa = akcja + warunek + rezultat}

   | Pole | Wartość |
   |---|---|
   | Id | {AREA}-{number} |
   | Obszar / spec | {AREA} / `.ai/specs/…` (kryterium, np. Z7, L5) |
   | Priorytet | Wysoki / Średni / Niski |
   | Typ | UI e2e / API / DB |
   | Niestandardowy | tak / nie |
   | Implementacja | [tests/e2e/….e2e.mjs](../../../tests/e2e/….e2e.mjs) — test „…” |

   ## Given
   ## When
   ## Then
   ## Dane i sprzątanie
   ## Uwagi (przypadki brzegowe, czego scenariusz celowo nie sprawdza)
   ```

## Specyfika DevMentora

- **Środowisko.** Testy repo uruchamia `npm run test:integration` (alias `npm run test:e2e`, `scripts/test-e2e.mjs`): wymaga `npm run build` i Postgresa z `DATABASE_URL`; sam tworzy jednorazowy schemat `dm_migtest_*`, migruje go i startuje `next start` na wolnym porcie. Do eksploracji UI i ręcznego QA używaj współdzielonego środowiska z `om-prepare-test-env` (`.ai/scripts/test-env-up.sh` / `.ps1`, deskryptor `.ai/qa/test-env.json`, seed: opublikowana `/m/mentorka-testowa`).
- **Przeglądarka.** Provider `playwright` (`.ai/browsers/playwright.md`) z pakietu `playwright` już obecnego w repo (workspace `packages/ui`) i Chromium z cache. Niczego nie instaluj ani nie pobieraj lokalnie; w CI `npx playwright install chromium` robi job `e2e`.
- **Gdzie i jak pisać testy.** UI/HTTP + baza: `tests/e2e/{area}-{number}-{slug}.e2e.mjs` (`node:test` + `import { chromium } from "playwright"`, `describe(..., { skip })` gdy brak `E2E_BASE_URL`). Logika domeny + baza bez UI: `tests/db/*.test.mjs` przez `describeDb` z `tests/db/harness.mjs`. Wspólne kroki (zaproszenie → zalogowana karta, odczyt wiersza) bierz z `tests/e2e/support/mentor.mjs` — helpery jednej odpowiedzialności, kroki testowanego zachowania zostają w treści testu.
- **Dane.** Fixture tworzy test: `createInvitation` / `createSignInLink` z `scripts/mentor-links.mjs`, funkcje domeny z `lib/**` albo UI tylko dla testowanego fragmentu. Unikalne e-maile/slugi z licznikiem i `Date.now()`; nie polegaj na seedzie środowiska QA. Czas: nie zależ od „teraz” w asercjach (porównuj z wartościami liczonymi z tego samego `now` albo ustawiaj `expires_at` w bazie).
- **Selektory.** `getByRole` → `getByLabel(…, { exact: true })` → `getByText`; teksty UI po polsku dokładnie jak w aplikacji. Przed wpisywaniem poczekaj na hydrację formularza (wzór: `waitForEditor` w `tests/e2e/support/mentor.mjs`).
- **CI.** Test musi przechodzić na Linuksie w jobie `e2e` (`.github/workflows/ci.yml`, service `postgres:17`, `CI=true` — brak bazy = błąd, nie pominięcie).
- **Po napisaniu:** `npm run build`, potem `npm run test:integration -- tests/e2e/<plik>` (szybko, jeden plik), na końcu cały `npm run test:integration` i siatka z `AGENTS.md`.

## Granice

To rozszerzenie nie dodaje dostępu do sieci, nie instaluje narzędzi i nie zmienia miejsc, gdzie trafia wynik poza opisanymi wyżej plikami w repo.
