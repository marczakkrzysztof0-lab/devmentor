# Kompatybilność wsteczna – DevMentor

Projekt jest przed wersją 1.0 i nie ma jeszcze zewnętrznych konsumentów. Większość powierzchni może się więc zmieniać swobodnie. Ten plik wymienia to, co już dziś jest kontraktem, i to, co nim zostanie, gdy powstanie.

## Chronione powierzchnie (dziś)

| Powierzchnia | Gdzie | Co jest zmianą łamiącą | Wymagana ścieżka |
|---|---|---|---|
| Publiczne URL-e stron | `app/**/page.tsx` (dziś: `/`) | usunięcie lub zmiana ścieżki strony | przekierowanie (`redirects` w `next.config.ts`) w tym samym PR |
| Skrypty npm | `package.json` → `scripts` (`dev`, `build`, `start`, `lint`, `test`) | usunięcie lub zmiana znaczenia skryptu | stary skrypt zostaje jako alias co najmniej do kolejnego wydania; aktualizacja README i `.ai/agentic.config.json` |
| Bramka walidacji | `.ai/agentic.config.json` → `validation.commands`, `.github/workflows/ci.yml` | usunięcie kroku albo osłabienie bramki | uzasadnienie w PR i zgoda maintainera; `SDLC.md` aktualizowany razem z configiem |
| Zmienne środowiskowe | README → „Zmienne środowiskowe” (`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`) | zmiana nazwy lub znaczenia zmiennej | stara nazwa czytana jako fallback przez jedno wydanie, nota w README |
| Konfiguracja pipeline’u agentów | `.ai/agentic.config.json`, `.ai/trackers/`, etykiety z `SDLC.md` | zmiana nazwy lub usunięcie etykiety, klucza configu albo ścieżki | ponowne uruchomienie `om-setup-agent-pipeline`; nigdy nie usuwamy ani nie zmieniamy nazw istniejących etykiet |

## Przyszłe powierzchnie (gdy powstaną)

- **Schemat bazy i migracje (PostgreSQL)**: tylko zmiany addytywne (nowe kolumny z domyślną wartością). Zmiana nazwy, usunięcie albo zawężenie typu wymaga migracji w dwóch krokach (dodaj → przenieś dane → usuń w kolejnym wydaniu), testu migracji w górę i w dół oraz planu rollbacku w PR.
- **Route handlers / API (`app/api/**`)**: odpowiedzi mogą zyskiwać opcjonalne pola. Usunięcie lub zmiana typu pola albo statusu HTTP wymaga wersjonowania lub okresu deprecjacji.
- **Webhooki płatności i zdarzenia**: nazwy zdarzeń i kształt payloadu są kontraktem. Obsługa musi być idempotentna.
- **Uprawnienia ról (mentee, mentor, admin)**: zawężenie uprawnień to zmiana `risk-high` (patrz `SDLC.md`).

## Zasady

- Złamanie chronionej powierzchni bez opisanej ścieżki to **blocker** w review (`om-code-review`).
- Skille implementujące muszą ostrzec, gdy zmiana narusza ten plik.
- Gdy powstaje nowa powierzchnia z listy „przyszłe”, przenieś ją do tabeli „dziś” w tym samym PR.
