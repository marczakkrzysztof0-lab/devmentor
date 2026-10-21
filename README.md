# DevMentor

Marketplace mentoringowy dla programistów. Działa podobnie do Preply, ale zamiast nauczycieli języków są tu doświadczeni developerzy. Prowadzą sesje 1:1, code review, przygotowanie do rozmów rekrutacyjnych i pomagają przy wyborze ścieżki kariery.

> **Status:** początkowy etap. W repozytorium jest szkielet aplikacji Next.js oraz schemat bazy danych z migracjami (`db/migrations/`). Uwierzytelnianie i logika marketplace'u są dopiero planowane.

## Spis treści

- [Założenia produktu](#założenia-produktu)
- [Stack technologiczny](#stack-technologiczny)
- [Wymagania](#wymagania)
- [Szybki start (Windows)](#szybki-start-windows)
- [Baza danych (Docker)](#baza-danych-docker)
- [Migracje bazy](#migracje-bazy)
- [Zmienne środowiskowe](#zmienne-środowiskowe)
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

`npm run setup` instaluje zależności, tworzy `docker-compose.yml` i `.env.example` (jeśli ich nie ma), uruchamia bazę, tworzy `.env.local` z szablonu i wykonuje migracje bazy (`npm run db:migrate`, z krótkim ponawianiem, gdy baza jeszcze startuje). Można go bezpiecznie uruchomić ponownie: pomija wykonane kroki, nie nadpisuje istniejących plików i nie restartuje działającej bazy. Gdy Docker nie działa, kończy się czytelnym komunikatem.

### Kroki ręczne (alternatywa)

Poniższe polecenia działają w PowerShellu. Pliki `docker-compose.yml` i `.env.example` utwórz wcześniej z treści w sekcjach [Baza danych (Docker)](#baza-danych-docker) i [Zmienne środowiskowe](#zmienne-środowiskowe).

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

PostgreSQL uruchamiamy lokalnie przez Docker Compose. Plik `docker-compose.yml` nie jest w repozytorium. Tworzy go `npm run setup` z tej konfiguracji:

```yaml
services:
  db:
    image: postgres:17
    container_name: devmentor-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: devmentor
      POSTGRES_PASSWORD: devmentor
      POSTGRES_DB: devmentor
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

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
- **Numeracja jest wspólna dla wszystkich specyfikacji** (np. 0001 – magazyn danych, 0002–0003 – logowanie i ceny mentora, 0004 – dostępność). Przed dodaniem pliku sprawdź, który numer jest wolny.
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

## Zmienne środowiskowe

Konfiguracja lokalna trafia do pliku `.env.local`, który nie jest commitowany. Szablon `.env.example`:

```dotenv
# Baza danych
DATABASE_URL="postgresql://devmentor:devmentor@localhost:5432/devmentor"

# Adres aplikacji
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> `.gitignore` ignoruje pliki `.env*` z wyjątkiem `.env.example` (reguła `!.env.example`), więc szablon można commitować.

Zmienne z prefiksem `NEXT_PUBLIC_` trafiają do przeglądarki. **Nie trzymaj w nich sekretów.**

## Skrypty npm

| Polecenie | Opis |
|-----------|------|
| `npm run dev` | Serwer deweloperski z hot reloadem |
| `npm run build` | Build produkcyjny |
| `npm run start` | Uruchomienie buildu produkcyjnego |
| `npm run lint` | ESLint |
| `npm test` | Testy (`node:test`) |
| `npm run setup` | Instalator środowiska lokalnego (idempotentny, wykonuje też migracje) |
| `npm run db:migrate` | Wykonanie oczekujących migracji bazy |
| `npm run db:rollback` | Cofnięcie ostatniej migracji — tylko lokalnie / w testach |

## Struktura projektu

```
devmentor/
├── app/                 # App Router: strony, layouty, route handlers
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── db/migrations/       # Migracje bazy (NNNN_<nazwa>.sql)
├── lib/                 # Logika domenowa (.mjs)
├── packages/ui/         # Design system @devmentor/ui (Storybook)
├── public/              # Pliki statyczne
├── scripts/             # Instalator (setup.mjs) i migracje (db-migrate.mjs)
├── tests/               # Testy node:test (tests/db/ – testy z bazą)
├── .agents/skills/      # Skille dla agentów AI (patrz skills-lock.json)
├── AGENTS.md            # Instrukcje dla agentów AI
├── next.config.ts
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
