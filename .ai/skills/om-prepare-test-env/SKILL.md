---
name: om-prepare-test-env
description: Repo-local extension of om-prepare-test-env for DevMentor — existing Docker Postgres + disposable dm_migtest_* schema instead of testcontainers, Playwright provider, logic in scripts/test-env.mjs.
---

# om-prepare-test-env – rozszerzenie dla DevMentora

Rozszerza `.claude/skills/om-prepare-test-env/SKILL.md`; zasady bezpieczeństwa bazowego skilla wygrywają.

## Wygenerowane entrypointy (faza 1 = tylko je uruchom)

| Platforma | Start | Stop |
|---|---|---|
| Git Bash / macOS / Linux / WSL2 | `sh .ai/scripts/test-env-up.sh [--force] [--force-rebuild]` | `sh .ai/scripts/test-env-down.sh` |
| Windows PowerShell | `powershell -ExecutionPolicy Bypass -File .ai/scripts/test-env-up.ps1` | `powershell -ExecutionPolicy Bypass -File .ai/scripts/test-env-down.ps1` |
| npm (dowolna powłoka) | `npm run test-env:up` | `npm run test-env:down` |

Wymaga `DATABASE_URL` w środowisku (albo `.env.local` z `npm run setup`) i działającego Postgresa (kontener `devmentor-db`). Wynik: linie `TEST_ENV_*` i deskryptor `.ai/qa/test-env.json` (gitignored, razem z `test-env.env`, `test-env.log`, `test-env.lock/`, `test-env-build-cache.json`).

## Decyzje (lekcja 12, 2026-10-27)

1. **Bez testcontainers i bez nowego kontenera.** Używamy istniejącego Postgresa z `DATABASE_URL` (lokalnie `devmentor-db` z `docker-compose.yml`, w CI service `postgres:17`) i **jednorazowego schematu** `dm_migtest_<losowe>` z markerem — tego samego mechanizmu co `tests/db/harness.mjs` i `npm run test:e2e`. Izolacja jest na poziomie schematu (`search_path` w `DATABASE_URL` aplikacji), a nie kontenera: szybciej (bez startu bazy) i bez nowych zależności. Kompromis: wersja Postgresa jest ta, którą ma lokalny kontener (17 jak w CI).
2. **Logika w jednym pliku Node** (`scripts/test-env.mjs`): blokada PID, ponowne użycie (PID nadzorcy + `/` + strona z bazy `/m/mentorka-testowa` + TTL + odcisk źródeł), cache buildu, schemat, seed, `next start`. Skrypty `.sh` i `.ps1` są cienkie, natywne dla swojej powłoki i nie wołają siebie nawzajem — Node i tak jest wymagany przez projekt, a jedna implementacja nie rozjeżdża się między platformami.
3. **Proces nadzorcy w tle** trzyma advisory lock schematu (sprzątanie pozostałości w harnessie go nie usunie), serwer Next.js i sprząta schemat przy zatrzymaniu. `down` na Windows (taskkill /F) dodatkowo usuwa schemat zapisany w deskryptorze (tylko z markerem).
4. **Seed funkcjami domeny** (`createInvitation` → `acceptInvitation` → `saveMentorPage(publish)` → `saveAvailability`), nie ręcznym SQL: opublikowana „Mentorka Testowa” `/m/mentorka-testowa`, pon–pt 18:00–20:00 Europe/Warsaw. Logowanie: link jednorazowy z `npm run mentor:sign-in-link -- mentorka.testowa@example.com` z `DATABASE_URL` schematu (brak haseł → `credentials: []`).
5. **Przeglądarka: provider `playwright`** (`.ai/browsers/playwright.md`, `browser.provider` w `.ai/agentic.config.json`). Pakiet `playwright` już jest w repo (workspace `packages/ui`), Chromium w cache — nic nie instalujemy. `agent-browser` nie jest zainstalowany, a jego instalacja oznacza pobieranie binarek, czego lokalnie nie robimy.
6. **Testy repo nie zależą od tego środowiska**: `npm run test:integration` (= `test:e2e`) startuje własny serwer i schemat na przebieg, więc działa tak samo lokalnie i w CI. Środowisko z tego skilla służy eksploracji UI (om-integration-tests krok 6) i QA (`om-auto-qa-pr`).

## Pomiar (weryfikacja zimny/ciepły)

Zapisywany w `notes` deskryptora przy każdym zimnym starcie. Weryfikacja 2026-10-27 (Git Bash na Windows): zimny 343 s (z `next build`), ciepły 4 s (ten sam `runId`, bez buildu), `touch lib/...` → `status` = stale, `down` dwa razy bez błędu, schemat usunięty. Wariant `.ps1` sprawdzony tylko parserem PowerShell (0 błędów) — uruchomienie z `-ExecutionPolicy Bypass` zablokowała polityka agenta; do potwierdzenia ręcznie przy pierwszym użyciu w PowerShell.
