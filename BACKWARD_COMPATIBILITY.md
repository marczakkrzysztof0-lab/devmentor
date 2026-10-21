# Kompatybilność wsteczna – DevMentor

Projekt jest przed wersją 1.0 i nie ma jeszcze zewnętrznych konsumentów. Większość powierzchni może się więc zmieniać swobodnie. Ten plik wymienia to, co już dziś jest kontraktem, i to, co nim zostanie, gdy powstanie.

## Chronione powierzchnie (dziś)

| Powierzchnia | Gdzie | Co jest zmianą łamiącą | Wymagana ścieżka |
|---|---|---|---|
| Publiczne URL-e stron | `app/**/page.tsx` (dziś: `/`, `/mentor`, `/mentor/availability`, `/m/[slug]`) | usunięcie lub zmiana ścieżki strony | przekierowanie (`redirects` w `next.config.ts`) w tym samym PR |
| Linki zaproszeń i logowania | `/invite/[token]`, `/sign-in/[token]` | zmiana ścieżki albo formatu tokenu — już wysłane linki (14 dni / 72 h) przestają działać | stara ścieżka obsługiwana (przekierowanie) co najmniej przez czas ważności wysłanych linków |
| Link do udostępnienia mentora | `/m/[slug]` (strona od fazy 5, #16; status 404 dla nieopublikowanych w `proxy.ts`) | zmiana sluga opublikowanej strony albo trasy `/m/` — linki udostępnione przez mentorów prowadzą do 404 | slug po publikacji jest niezmienny; zmiana trasy tylko z przekierowaniem ze starej |
| Ciasteczko sesji mentora | `dm_session` (`lib/auth/mentor-auth.mjs`) | zmiana nazwy lub formatu — wylogowuje wszystkich mentorów | tylko świadomie, z notą w PR; mentorzy logują się ponownie linkiem z `mentor:sign-in-link` |
| Skrypty npm | `package.json` → `scripts` (`dev`, `build`, `start`, `lint`, `test`, `test:e2e`, `setup`, `db:migrate`, `db:rollback`, `mentor:invite`, `mentor:sign-in-link`) | usunięcie lub zmiana znaczenia skryptu | stary skrypt zostaje jako alias co najmniej do kolejnego wydania; aktualizacja README i `.ai/agentic.config.json` |
| Bramka walidacji | `.ai/agentic.config.json` → `validation.commands`, `.github/workflows/ci.yml` | usunięcie kroku albo osłabienie bramki | uzasadnienie w PR i zgoda maintainera; `SDLC.md` aktualizowany razem z configiem |
| Schemat bazy i migracje (PostgreSQL) | `db/migrations/*.sql` (dziś 0001–0003) | zmiana nazwy lub usunięcie tabeli/kolumny, zawężenie typu albo ograniczenia (`NOT NULL`, `CHECK`, `UNIQUE`), edycja już wykonanej migracji | tylko zmiany addytywne (nowe kolumny z wartością domyślną lub nullable); zmiana łamiąca w dwóch krokach (dodaj → przenieś dane → usuń w kolejnym wydaniu); test migracji w górę i w dół; plan rollbacku w PR; poprawka = nowa migracja |
| Zmienne środowiskowe | README → „Zmienne środowiskowe” (`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`) | zmiana nazwy lub znaczenia zmiennej | stara nazwa czytana jako fallback przez jedno wydanie, nota w README |
| Konfiguracja pipeline’u agentów | `.ai/agentic.config.json`, `.ai/trackers/`, etykiety z `SDLC.md` | zmiana nazwy lub usunięcie etykiety, klucza configu albo ścieżki | ponowne uruchomienie `om-setup-agent-pipeline`; nigdy nie usuwamy ani nie zmieniamy nazw istniejących etykiet |

## Przyszłe powierzchnie (gdy powstaną)

- **Route handlers / API (`app/api/**`)**: odpowiedzi mogą zyskiwać opcjonalne pola. Usunięcie lub zmiana typu pola albo statusu HTTP wymaga wersjonowania lub okresu deprecjacji.
- **Webhooki płatności i zdarzenia**: nazwy zdarzeń i kształt payloadu są kontraktem. Obsługa musi być idempotentna.
- **Uprawnienia ról (mentee, mentor, admin)**: zawężenie uprawnień to zmiana `risk-high` (patrz `SDLC.md`).

## Zasady

- Złamanie chronionej powierzchni bez opisanej ścieżki to **blocker** w review (`om-code-review`).
- Skille implementujące muszą ostrzec, gdy zmiana narusza ten plik.
- Gdy powstaje nowa powierzchnia z listy „przyszłe”, przenieś ją do tabeli „dziś” w tym samym PR.
