# DevMentor

Marketplace mentoringowy dla programistów. Działa podobnie do Preply, ale zamiast nauczycieli języków są tu doświadczeni developerzy. Prowadzą sesje 1:1, code review, przygotowanie do rozmów rekrutacyjnych i pomagają przy wyborze ścieżki kariery.

> **Status:** początkowy etap. W repozytorium jest na razie szkielet aplikacji Next.js. Baza danych, uwierzytelnianie i logika marketplace'u są dopiero planowane.

## Spis treści

- [Założenia produktu](#założenia-produktu)
- [Stack technologiczny](#stack-technologiczny)
- [Wymagania](#wymagania)
- [Szybki start (Windows)](#szybki-start-windows)
- [Baza danych (Docker)](#baza-danych-docker)
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
| Baza danych | PostgreSQL (lokalnie w Dockerze) |
| Linting | ESLint 9 (`eslint-config-next`) |

> ⚠️ **Next.js 16 różni się od wcześniejszych wersji.** API, konwencje i struktura plików mogą wyglądać inaczej niż w starszych tutorialach. Zanim zaczniesz pisać kod, zajrzyj do dokumentacji dołączonej do pakietu w `node_modules/next/dist/docs/` (patrz [`AGENTS.md`](./AGENTS.md)).

## Wymagania

- **Windows 10/11**
- **Node.js** 20.9 lub nowszy (zalecana wersja LTS)
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

`npm run setup` instaluje zależności, tworzy `docker-compose.yml` i `.env.example` (jeśli ich nie ma), uruchamia bazę i tworzy `.env.local` z szablonu. Można go bezpiecznie uruchomić ponownie: pomija wykonane kroki, nie nadpisuje istniejących plików i nie restartuje działającej bazy. Gdy Docker nie działa, kończy się czytelnym komunikatem.

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

# 5. Uruchom serwer deweloperski
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
| `npm run setup` | Instalator środowiska lokalnego (idempotentny) |

## Struktura projektu

```
devmentor/
├── app/                 # App Router: strony, layouty, route handlers
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── public/              # Pliki statyczne
├── .agents/skills/      # Skille dla agentów AI (patrz skills-lock.json)
├── AGENTS.md            # Instrukcje dla agentów AI
├── next.config.ts
├── tsconfig.json
└── eslint.config.mjs
```

W miarę rozwoju projektu dojdą katalogi m.in. na schemat i migracje bazy danych, współdzielone komponenty UI oraz logikę domenową (mentorzy, rezerwacje, płatności).

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
