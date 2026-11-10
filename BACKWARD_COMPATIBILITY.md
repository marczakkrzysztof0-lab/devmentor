# Kompatybilność wsteczna – DevMentor

Od wydania 1.0.0 (2026-11-10) powierzchnie z tabeli poniżej są kontraktem: zmiana łamiąca wymaga opisanej ścieżki, wpisu w [UPGRADE_NOTES.md](UPGRADE_NOTES.md) z migracją i wycofaniem oraz wzmianki w [CHANGELOG.md](CHANGELOG.md). Wersje numerujemy semantycznie: zmiana łamiąca bez okresu przejściowego podbija wersję główną (2.0.0), nowa funkcja pomniejszą (1.1.0), poprawka łatkę (1.0.1). Ten plik wymienia to, co jest kontraktem dziś, i to, co nim zostanie, gdy powstanie.

## Chronione powierzchnie (dziś)

| Powierzchnia | Gdzie | Co jest zmianą łamiącą | Wymagana ścieżka |
|---|---|---|---|
| Publiczne URL-e stron | `app/**/page.tsx` (dziś: `/`, `/mentor`, `/mentor/availability`, `/mentor/requests`, `/mentor/requests/[id]`, `/mentor/payouts`, `/m/[slug]`, `/r/[token]`) | usunięcie lub zmiana ścieżki strony | przekierowanie (`redirects` w `next.config.ts`) w tym samym PR |
| Linki zaproszeń i logowania | `/invite/[token]`, `/sign-in/[token]` | zmiana ścieżki albo formatu tokenu — już wysłane linki (14 dni / 72 h) przestają działać | stara ścieżka obsługiwana (przekierowanie) co najmniej przez czas ważności wysłanych linków |
| Link do udostępnienia mentora | `/m/[slug]` (strona od fazy 5, #16; status 404 dla nieopublikowanych w `proxy.ts`) | zmiana sluga opublikowanej strony albo trasy `/m/` — linki udostępnione przez mentorów prowadzą do 404 | slug po publikacji jest niezmienny; zmiana trasy tylko z przekierowaniem ze starej |
| Link do zapytania dewelopera | `/r/[token]` (#17; token 32 B base64url, w bazie tylko SHA-256, ważny 30 dni po terminie; 404 i `Referrer-Policy: no-referrer` w `proxy.ts`) | zmiana ścieżki albo formatu tokenu — linki z e-maili i z powrotu ze Stripe przestają działać | stara ścieżka obsługiwana (przekierowanie) co najmniej 30 dni po ostatnim terminie |
| Link do zapytania w e-mailu mentora | `/mentor/requests/[id]` (#18; link w już wysłanych e-mailach `mentor_new_request`) | zmiana ścieżki — linki z wysłanych e-maili przestają działać | stara ścieżka obsługiwana (przekierowanie) co najmniej do czasu wygaśnięcia zapytań z wysłanych e-maili |
| Webhooki płatności | `POST /api/webhooks/stripe` (#24): zdarzenia checkout/refund/dispute oraz `account.updated`, `transfer.created`, `transfer.reversed`, `transfer.updated`; Connect używa opcjonalnego `STRIPE_CONNECT_WEBHOOK_SECRET` i tego samego URL | zmiana adresu, usunięcie obsługi zdarzenia, utrata idempotencji (`stripe_events`) | nowy adres równolegle ze starym, zmiana w panelu Stripe w tym samym wydaniu; obsługa zawsze idempotentna |
| Zadania okresowe | `POST/GET /api/internal/jobs` (#24, `Bearer CRON_SECRET`), wywoływane przez cron hostingu i monitor | zmiana ścieżki, metody, autoryzacji albo pól zdrowia (`stale`, `failedRefunds`, `failedPayouts`, `payoutsNeedingAttention`); nazwy zadań, w tym `payouts.transferOwed`, są częścią kontraktu operacyjnego | stara ścieżka równolegle do zmiany konfiguracji crona i monitora |
| API czatu sesji | `GET/POST /api/r/session` (token w nagłówku `X-Request-Token`), `GET/POST /api/mentor/requests/[id]/session` (#20); wołane przez otwarte strony sesji | zmiana ścieżki, nagłówka tokenu, kształtu odpowiedzi (`phase`, `messages[].seq`, `hasMore`…) albo kodów błędów — otwarte karty przestają odświeżać czat | pola tylko dodawane; zmiana łamiąca = nowa ścieżka obok starej przez czas trwania najdłuższej sesji (50 min) po wdrożeniu |
| Ciasteczko sesji mentora | `dm_session` (`lib/auth/mentor-auth.mjs`) | zmiana nazwy lub formatu — wylogowuje wszystkich mentorów | tylko świadomie, z notą w PR; mentorzy logują się ponownie linkiem z `mentor:sign-in-link` |
| Skrypty npm | `package.json` → `scripts` (`dev`, `build`, `start`, `lint`, `test`, `test:e2e`, `setup`, `db:migrate`, `db:rollback`, `mentor:invite`, `mentor:sign-in-link`, `jobs`) | usunięcie lub zmiana znaczenia skryptu | stary skrypt zostaje jako alias co najmniej do kolejnego wydania; aktualizacja README i `.ai/agentic.config.json` |
| Bramka walidacji | `.ai/agentic.config.json` → `validation.commands`, `.github/workflows/ci.yml` | usunięcie kroku albo osłabienie bramki | uzasadnienie w PR i zgoda maintainera; `SDLC.md` aktualizowany razem z configiem |
| Schemat bazy i migracje (PostgreSQL) | `db/migrations/*.sql` (dziś 0001–0009) | zmiana nazwy lub usunięcie tabeli/kolumny, zawężenie typu albo ograniczenia (`NOT NULL`, `CHECK`, `UNIQUE`), edycja już wykonanej migracji | tylko zmiany addytywne (nowe kolumny z wartością domyślną lub nullable); zmiana łamiąca w dwóch krokach (dodaj → przenieś dane → usuń w kolejnym wydaniu); test migracji w górę i w dół; plan rollbacku w PR; poprawka = nowa migracja |
| Zmienne środowiskowe | README → „Zmienne środowiskowe” (`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_CONNECT_WEBHOOK_SECRET`, `PAYMENT_CURRENCIES`, `PLATFORM_COMMISSION_BPS`, `CRON_SECRET`, `SMTP_URL`, `EMAIL_FROM`) | zmiana nazwy lub znaczenia zmiennej | stara nazwa czytana jako fallback przez jedno wydanie, nota w README |
| Konfiguracja pipeline’u agentów | `.ai/agentic.config.json`, `.ai/trackers/`, etykiety z `SDLC.md` | zmiana nazwy lub usunięcie etykiety, klucza configu albo ścieżki | ponowne uruchomienie `om-setup-agent-pipeline`; nigdy nie usuwamy ani nie zmieniamy nazw istniejących etykiet |

## Przyszłe powierzchnie (gdy powstaną)

- **Route handlers / API (`app/api/**`)**: odpowiedzi mogą zyskiwać opcjonalne pola. Usunięcie lub zmiana typu pola albo statusu HTTP wymaga wersjonowania lub okresu deprecjacji.
- **Zdarzenia płatności dla kolejnych historii** (`lib/payments/subscribers.mjs`: `payment.succeeded`, `payment.expired`, `refund.succeeded`, `refund.failed`): dziś wewnętrzne; gdy staną się zewnętrzne, nazwy i kształt będą kontraktem.
- **Wynik sesji dla wypłat (#22)**: zarobione przez mentora = płatności zapytań w stanach `held` i `mentee_no_show` (`requests.status`, 0008); `mentor_no_show` jest zawsze zwracane. Zmiana znaczenia tych stanów zmienia kwoty wypłat.
- **Uprawnienia ról (mentee, mentor, admin)**: zawężenie uprawnień to zmiana `risk-high` (patrz `SDLC.md`).

## Zasady

- Złamanie chronionej powierzchni bez opisanej ścieżki to **blocker** w review (`om-code-review`).
- Skille implementujące muszą ostrzec, gdy zmiana narusza ten plik.
- Gdy powstaje nowa powierzchnia z listy „przyszłe”, przenieś ją do tabeli „dziś” w tym samym PR.
- PR ze zmianą schematu bazy, zmiennych środowiskowych albo konfiguracji Stripe/crona dopisuje sekcję w `UPGRADE_NOTES.md` dla najbliższego wydania (aktualizacja + wycofanie).
