# DevMentor

Marketplace mentoringowy dla programistów. Działa podobnie do Preply, ale zamiast nauczycieli języków są tu doświadczeni developerzy. Prowadzą sesje 1:1, code review, przygotowanie do rozmów rekrutacyjnych i pomagają przy wyborze ścieżki kariery.

> **Status:** początkowy etap. Działają: zaproszenia mentorów, linki logowania, sesje, edytor i publikacja strony mentora (`/mentor`) oraz tygodniowa dostępność (`/mentor/availability`). Publiczna strona mentora `/m/{slug}` pokazuje profil i ceny (wolne terminy dojdą w fazie 6), a reszta marketplace'u jest planowana.

## Spis treści

- [Założenia produktu](#założenia-produktu)
- [Stack technologiczny](#stack-technologiczny)
- [Wymagania](#wymagania)
- [Szybki start (Windows)](#szybki-start-windows)
- [Baza danych (Docker)](#baza-danych-docker)
- [Migracje bazy](#migracje-bazy)
- [Zmienne środowiskowe](#zmienne-środowiskowe)
- [Mentorzy: zaproszenia i logowanie](#mentorzy-zaproszenia-i-logowanie)
- [Skrypty npm](#skrypty-npm)
- [Struktura projektu](#struktura-projektu)
- [Praca z agentami AI (Claude Code i Codex)](#praca-z-agentami-ai-claude-code-i-codex)
- [Porównanie agentów](#porównanie-agentów)
- [Konwencje](#konwencje)

## Założenia produktu

**Role użytkowników**

| Rola | Co może zrobić |
|------|----------------|
| **Mentee** (uczący się) | Wyszukuje mentorów, rezerwuje sesje, płaci, wystawia opinie |
| **Mentor** | Prowadzi profil, ustala stawkę i dostępność, prowadzi sesje, wypłaca środki |
| **Admin** | Weryfikuje mentorów, moderuje treści, obsługuje spory i zwroty |

**Kluczowe funkcje (MVP)**

- Profile mentorów: stack technologiczny, seniority, języki, stawka godzinowa, opinie
- Wyszukiwarka z filtrami (technologia, cena, dostępność, język, ocena)
- Kalendarz dostępności i rezerwacja sesji z obsługą stref czasowych
- Płatności, pakiety sesji i prowizja platformy
- Wiadomości między mentorem a mentee
- Oceny i opinie po zakończonej sesji
- Lekcja próbna w obniżonej cenie

**Poza MVP (na później)**

- Wbudowane wideo i współdzielony edytor kodu
- Ścieżki nauki i zadania domowe
- Subskrypcje (stała liczba sesji w miesiącu)

## Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Framework | [Next.js](https://nextjs.org) 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Język | TypeScript 5 |
| Baza danych | PostgreSQL 17 (lokalnie w Dockerze) |
| Dostęp do bazy i migracje | `pg` + `node-pg-migrate` (migracje w czystym SQL, bez ORM) |
| Linting | ESLint 9 (`eslint-config-next`) |

> ⚠️ **Next.js 16 różni się od wcześniejszych wersji.** API, konwencje i struktura plików mogą wyglądać inaczej niż w starszych tutorialach. Zanim zaczniesz pisać kod, zajrzyj do dokumentacji dołączonej do pakietu w `node_modules/next/dist/docs/` (patrz [`AGENTS.md`](./AGENTS.md)).

## Wymagania

- **Windows 10/11**
- **Node.js** 20.12 lub nowszy (zalecana wersja LTS)
- **npm** (instaluje się razem z Node.js)
- **Docker Desktop** z backendem WSL 2
- **Git**
- Opcjonalnie: [Claude Code](https://claude.com/claude-code) i/lub [Codex CLI](https://github.com/openai/codex)

## Szybki start (Windows)

Zalecana ścieżka: jedno polecenie instalatora (wymaga działającego Docker Desktop).

```powershell
git clone <url-repozytorium> devmentor
cd devmentor
npm run setup
npm run dev
```

`npm run setup` instaluje zależności, sprawdza pliki `docker-compose.yml` i `.env.example` (są w repozytorium), tworzy `.env.local` z szablonu, uruchamia bazę i wykonuje migracje bazy (`npm run db:migrate`, z krótkim ponawianiem, gdy baza jeszcze startuje). Można go bezpiecznie uruchomić ponownie: pomija wykonane kroki, nie nadpisuje istniejących plików i nie restartuje działającej bazy. Gdy Docker nie jest zainstalowany albo nie działa, kończy się czytelnym komunikatem (plik `.env.local` jest już wtedy utworzony, a po ponownym uruchomieniu zostaje tylko baza i migracje).

### Kroki ręczne (alternatywa)

Poniższe polecenia działają w PowerShellu. Pliki `docker-compose.yml` i `.env.example` są w repozytorium.

```powershell
# 1. Sklonuj repozytorium
git clone <url-repozytorium> devmentor
cd devmentor

# 2. Zainstaluj zależności
npm install

# 3. Uruchom bazę danych (wymaga działającego Docker Desktop)
docker compose up -d

# 4. Skonfiguruj zmienne środowiskowe
Copy-Item .env.example .env.local

# 5. Wykonaj migracje bazy
npm run db:migrate

# 6. Uruchom serwer deweloperski
npm run dev
```

Aplikacja będzie dostępna pod adresem [http://localhost:3000](http://localhost:3000).

## Baza danych (Docker)

PostgreSQL uruchamiamy lokalnie przez Docker Compose. Konfiguracja jest w pliku [`docker-compose.yml`](docker-compose.yml) w repozytorium: Postgres 17, kontener `devmentor-db`, użytkownik, hasło i baza `devmentor`, port `5432`, dane w wolumenie `pgdata`.

> Drugi klon repozytorium w innym katalogu to osobny projekt Compose, ale z tą samą nazwą kontenera `devmentor-db` i tym samym portem. Jeśli `docker compose up -d` zgłasza konflikt nazwy, sprawdź `docker ps -a` i zatrzymaj albo usuń stary kontener.

Przydatne polecenia:

```powershell
docker compose up -d          # uruchom bazę w tle
docker compose ps             # sprawdź status
docker compose logs -f db     # pokaż logi
docker compose down           # zatrzymaj (dane zostają w wolumenie)
docker compose down -v        # zatrzymaj i USUŃ dane
docker exec -it devmentor-db psql -U devmentor   # konsola psql
```

**Typowe problemy na Windows**

- *Port 5432 jest zajęty*: lokalnie działa już instalacja PostgreSQL. Zatrzymaj usługę `postgresql-x64-*` w `services.msc` albo zmień mapowanie portu na `"5433:5432"`.
- *`docker` nie jest rozpoznawane jako polecenie*: Docker Desktop nie jest uruchomiony albo trzeba otworzyć terminal ponownie.

## Migracje bazy

Schemat bazy zmieniamy wyłącznie migracjami w czystym SQL, uruchamianymi przez `node-pg-migrate` (wrapper `scripts/db-migrate.mjs`). Historia wykonanych migracji jest w tabeli `pgmigrations`.

- **Pliki:** `db/migrations/NNNN_<nazwa>.sql`, każdy z sekcjami `-- Up Migration` i `-- Down Migration`. Każda migracja wykonuje się w osobnej transakcji.
- **Numeracja jest wspólna dla wszystkich specyfikacji.** Przed dodaniem pliku sprawdź, który numer jest wolny. Dziś w repozytorium:
  - `0001_mentors_invitations_pages` – mentorzy, zaproszenia, strony mentorów;
  - `0002_mentor_sign_in` – sesje mentorów (`mentor_sessions`) i linki logowania (`mentor_sign_in_links`);
  - `0003_mentor_page_prices` – ceny 25 i 50 min w groszach, waluta (`currency`, dziś zawsze PLN); publikacja wymaga obu cen.

  Następna planowana: 0004 – dostępność.
- **Nie edytuj wykonanej migracji.** Narzędzie nie wykrywa zmian w już wykonanym pliku — każdą poprawkę dodaj jako nową migrację.
- **`next build` nigdy nie uruchamia migracji.** Wykonujesz je jawnie poleceniem `npm run db:migrate` (robi to też `npm run setup`).

```powershell
npm run db:migrate     # wykonaj wszystkie oczekujące migracje
npm run db:rollback    # cofnij jedną, ostatnią migrację (TYLKO lokalnie / w testach)
npm run db:migrate -- --help   # pomoc
```

> ⚠️ **`npm run db:rollback` służy wyłącznie do pracy lokalnej i testów.** Gdy w bazie są prawdziwe dane, zmianę cofamy nową migracją naprawczą (forward-fix), a nie rollbackiem.

Skrypty czytają `DATABASE_URL` z `.env.local` (zmienna ustawiona w środowisku ma pierwszeństwo). Gdy baza nie odpowiada, kończą się komunikatem z podpowiedzią `docker compose up -d`.

**Testy z bazą:** `npm test` uruchamia testy migracji i schematu (`tests/db/`) w jednorazowym schemacie `dm_migtest_*`, który na końcu jest usuwany — schemat `public` i dane deweloperskie zostają nietknięte. Gdy baza nie działa, testy z bazą są pomijane z komunikatem; przy `CI=true` kończą się błędem.

**Testy end-to-end:** `npm run test:e2e` uruchamia `tests/e2e/*.e2e.mjs` w Playwright (Chromium, ten sam co w Storybooku — nic nie trzeba doinstalowywać) na `next start`. Najpierw zrób `npm run build`. Każdy przebieg dostaje własny schemat `dm_migtest_*`, migrowany na starcie i usuwany na końcu. Bez bazy zachowuje się jak `npm test`. Pomoc: `npm run test:e2e -- --help`.

**Sprawdzanie typów:** samodzielne `npx tsc --noEmit` na świeżym klonie wymaga wcześniej `npx next typegen` (albo `npm run build` / `npm run dev`), bo typy tras (`PageProps`, `LayoutProps`) generuje Next.js.

## Zmienne środowiskowe

Konfiguracja lokalna trafia do pliku `.env.local`, który nie jest commitowany. Szablon to plik [`.env.example`](.env.example) w repozytorium: opis każdej zmiennej (baza, adres aplikacji, Stripe w trybie testowym, `CRON_SECRET`, SMTP) jest w komentarzach w tym pliku. `npm run setup` kopiuje go do `.env.local`, jeśli ten jeszcze nie istnieje.

> `.gitignore` ignoruje pliki `.env*` z wyjątkiem `.env.example` (reguła `!.env.example`), więc szablon jest commitowany.

Zmienne z prefiksem `NEXT_PUBLIC_` trafiają do przeglądarki. **Nie trzymaj w nich sekretów.** Klucze Stripe, `CRON_SECRET` i `SMTP_URL` nigdy nie mają tego prefiksu.

## Płatności i zapytania (E02)

Deweloper na `/m/{slug}` wybiera długość i termin, wpisuje imię i pytanie, płaci kartą w Stripe Checkout i wraca na prywatną stronę `/r/{token}`. Zapytanie trafia do mentora dopiero po wpłacie.

- **Tylko tryb testowy Stripe.** Do lokalnych prób: klucze testowe w `.env.local`, webhook przez Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (podaje `whsec_…` do `STRIPE_WEBHOOK_SECRET`). Karty testowe: `4242 4242 4242 4242` (sukces), `4000 0000 0000 0002` (odmowa), `4000 0025 0000 3155` (3-D Secure).
- **Zadania okresowe** (rekonsyliacja płatności, wygasanie zapytań bez decyzji `requests.lapseOverdue`, ponawianie zwrotów, wysyłka e-maili): lokalnie `npm run jobs` (co 60 s woła `POST /api/internal/jobs`); na hostingu cron co 5 min z nagłówkiem `Authorization: Bearer $CRON_SECRET`. `GET /api/internal/jobs` (ta sama autoryzacja) zwraca zdrowie: `stale: true`, gdy któreś zadanie nie biegło od 30 min, i `failedRefunds` — cel dla monitora.
- **Sesja = czat tekstowy (#20, E03).** Zaakceptowane zapytanie ma czat na `/r/{token}` (deweloper) i `/mentor/requests/{id}` (mentor): pisać można tylko w terminie `[start, koniec)` wg zegara bazy, strona odpytuje serwer co 3 s, po terminie czat jest tylko do odczytu. Wiadomości (tabela `session_messages`) są niezmienne — ich czas to dowód dla reguły nieobecności (#21).
- **E-maile** idą przez outbox w bazie; bez `SMTP_URL` lądują w logu serwera (lokalne QA).
- **Testy** używają fałszywego klienta Stripe (`tests/payments/fake-stripe.mjs`), a e2e — lokalnego fałszywego serwera Stripe (`tests/e2e/fake-stripe-server.mjs`, `STRIPE_API_BASE_URL` przyjmowane tylko dla localhost). Prawdziwe klucze nie są potrzebne.

## Mentorzy: zaproszenia i logowanie

Mentorów zapraszają założyciele z wiersza poleceń. Nie ma haseł ani samodzielnej rejestracji.

```powershell
npm run mentor:invite -- anna@example.com         # link zaproszenia
npm run mentor:sign-in-link -- anna@example.com   # link logowania dla istniejącego mentora
npm run mentor:invite -- --help                   # pomoc
```

| Polecenie | Link | Ważność | Uwagi |
|-----------|------|---------|-------|
| `mentor:invite` | `/invite/<token>` | 14 dni, jednorazowy | odmawia, gdy mentor z tym adresem już istnieje (wtedy wyślij link logowania) |
| `mentor:sign-in-link` | `/sign-in/<token>` | 72 h, jednorazowy | tylko dla istniejącego mentora, np. po zmianie urządzenia |

- Link jest budowany z `NEXT_PUBLIC_APP_URL`, a skrypt potrzebuje też `DATABASE_URL` (czyta `.env.local`).
- W bazie zapisujemy tylko hash SHA-256 tokenu, więc linku nie da się później odczytać. Skopiuj go od razu i **wyślij osobiście** (mail, komunikator) wyłącznie tej osobie.
- Po przyjęciu zaproszenia albo użyciu linku logowania mentor ma sesję zapisaną w bazie (ciasteczko `dm_session`, 30 dni, bez przedłużania). „Wyloguj” w edytorze kończy sesję.

> ⚠️ **Bramka wydania:** nie wysyłamy zaproszeń prawdziwym mentorom, dopóki nie zostanie scalona publiczna strona mentora z wolnymi terminami (#16, faza 2). Do tego czasu `/m/{slug}` pokazuje tylko profil i ceny.

**Adresy (URL)**

| Adres | Co to jest |
|-------|------------|
| `/invite/[token]` | Przyjęcie zaproszenia: zakłada konto mentora i loguje. Samo otwarcie linku niczego nie zużywa. |
| `/sign-in/[token]` | Logowanie jednorazowym linkiem. Samo otwarcie linku niczego nie zużywa. |
| `/mentor` | Edytor strony mentora: szkic, publikacja, link do udostępnienia; baner „Nie masz dostępności”, gdy brak okien. Nawigacja: „Strona”, „Dostępność” i „Wyloguj”. |
| `/mentor/availability` | Tygodniowe okna dostępności w strefie mentora (strefa z przeglądarki przy pierwszej wizycie), podgląd 10 najbliższych terminów. |
| `/mentor/requests` | Zapytania mentora (#18): lista z licznikiem, „Zapytania” w nawigacji na wszystkich ekranach mentora. |
| `/mentor/requests/[id]` | Szczegóły zapytania i decyzja mentora: akceptacja albo odmowa (zwrot automatyczny); link z e-maila `mentor_new_request`. |
| `/m/[slug]` | Publiczna strona mentora (link do udostępnienia): imię, praca publiczna, opis, ceny 25/50 min, formularz zapytania opłaconego z góry (każdy wolny termin to wybór w formularzu, #17). Slug jest stały po publikacji. Szkic, nieznany slug, `/m` i `/m?search=…` → 404 „Nie ma takiej strony mentora” (sprawdzane w `proxy.ts`). Każda odpowiedź `/m/*` ma `noindex, nofollow`; aplikacja nigdzie nie listuje mentorów. |
| `/r/[token]` | Prywatna strona zapytania dewelopera (powrót ze Stripe, link z e-maila): stan płatności i zapytania, termin, kwota, pytanie; stany accepted / declined / overdue / lapsed ze stanem zwrotu; przycisk „Anuluj i odzyskaj” (#19, także po starcie terminu, do akceptacji). Nieznany albo wygasły (30 dni po terminie) token → 404; `Referrer-Policy: no-referrer`, `noindex`. |
| `GET/POST /api/r/session` | Czat sesji dewelopera (#20): token z linku `/r/{token}` tylko w nagłówku `X-Request-Token`; `GET ?after=<seq>` — nowe wiadomości + faza sesji, `POST {"body":"…"}` — wiadomość (tylko w terminie). |
| `GET/POST /api/mentor/requests/[id]/session` | Czat sesji mentora (#20): mentor z ciasteczka sesji. |
| `POST /api/webhooks/stripe` | Webhook płatności Stripe (podpis `Stripe-Signature`, tylko tryb testowy). |
| `POST/GET /api/internal/jobs` | Zadania okresowe i ich zdrowie (`Authorization: Bearer $CRON_SECRET`). |

## Skrypty npm

| Polecenie | Opis |
|-----------|------|
| `npm run dev` | Serwer deweloperski z hot reloadem |
| `npm run build` | Build produkcyjny |
| `npm run start` | Uruchomienie buildu produkcyjnego |
| `npm run lint` | ESLint |
| `npm run check:agents` | Pliki dla agentów: budżet `AGENTS.md`, istnienie ścieżek z routingu, `CLAUDE.md` tylko z `@AGENTS.md` |
| `npm test` | Testy (`node:test`) |
| `npm run test:e2e` | Testy end-to-end (Playwright, Chromium) na `next start` z jednorazowym schematem bazy. Wymaga wcześniejszego `npm run build` |
| `npm run setup` | Instalator środowiska lokalnego (idempotentny, wykonuje też migracje) |
| `npm run db:migrate` | Wykonanie oczekujących migracji bazy |
| `npm run db:rollback` | Cofnięcie ostatniej migracji — tylko lokalnie / w testach |
| `npm run jobs` | Lokalny scheduler zadań okresowych: co 60 s `POST /api/internal/jobs` (`-- --once` jeden raz) |
| `npm run mentor:invite -- <email>` | Link zaproszenia mentora (tylko dla założycieli) |
| `npm run mentor:sign-in-link -- <email>` | Jednorazowy link logowania dla istniejącego mentora (tylko dla założycieli) |

## Struktura projektu

```
devmentor/
├── app/                 # App Router: strony (/, /invite, /sign-in, /mentor, /m), layouty, akcje serwera
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── db/migrations/       # Migracje bazy (NNNN_<nazwa>.sql)
├── lib/                 # Logika domenowa (.mjs)
├── packages/ui/         # Design system @devmentor/ui (Storybook)
├── public/              # Pliki statyczne
├── scripts/             # Instalator (setup.mjs), migracje (db-migrate.mjs), linki mentorów (mentor-links.mjs), e2e (test-e2e.mjs)
├── tests/               # Testy node:test (tests/db/ – z bazą, tests/e2e/ – Playwright)
├── .agents/skills/      # Skille dla agentów AI (patrz skills-lock.json)
├── AGENTS.md            # Instrukcje dla agentów AI
├── next.config.ts
├── proxy.ts             # Proxy Next.js: 404 przed renderem dla /m/* bez opublikowanej strony
├── tsconfig.json
└── eslint.config.mjs
```

W miarę rozwoju projektu dojdzie logika domenowa (mentorzy, rezerwacje, płatności) w `lib/`.

## Praca z agentami AI (Claude Code i Codex)

Projekt rozwijamy z pomocą **Claude Code** i **Codex**. Kilka zasad, które pomagają obu narzędziom:

- **`AGENTS.md`** to wspólne instrukcje dla agentów. Codex czyta go automatycznie. Claude Code domyślnie czyta `CLAUDE.md`, więc warto dodać `CLAUDE.md` z jedną linią `@AGENTS.md`. Wtedy oba narzędzia korzystają z jednego źródła instrukcji.
- Blok w `AGENTS.md` dotyczący Next.js generuje i odtwarza `next dev`. Nie usuwaj go, tylko commituj razem z resztą zmian.
- **`.agents/skills/`** zawiera skille agentów. Ich wersje są przypięte w `skills-lock.json`.
- Agenci uruchamiają polecenia w PowerShellu na Windowsie. W instrukcjach i skryptach wybieraj polecenia wieloplatformowe (`npm run ...`, `docker compose ...`) zamiast składni typowej tylko dla basha.
- Przed oddaniem zmian agent powinien uruchomić `npm run lint` i `npm run build`.

## Porównanie agentów

Oba agenty dostały to samo zadanie: *„Dodaj na stronie głównej nagłówek DevMentor i krótki opis portalu”*.

| | Claude Code | Codex |
|---|-------------|-------|
| **Zmienione pliki** | 1 | 2 |
| **Treść** | Dłuższa i bardziej szczegółowa | Krótsza |
| **Czy pytał** | Nie, działał bez dodatkowych pytań | Tak, pytał o preferowany styl |
| **Czas** | _TODO_ | _TODO_ |

**Wnioski:** _TODO: który agent sprawdził się lepiej i dlaczego._

## Konwencje

- **Gałęzie:** `main` to gałąź główna. Pracujemy na branchach `feature/...` i `fix/...` i scalamy je przez Pull Request.
- **Commity:** krótki opis w trybie rozkazującym, np. `Add mentor profile page`.
- **TypeScript:** tryb `strict`, bez `any` tam, gdzie da się tego uniknąć.
- **Sekrety:** nigdy nie trafiają do repozytorium. Trzymamy je wyłącznie w `.env.local`.
