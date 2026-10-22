# Lekcja 10: context engineering w DevMentorze

Data: 2026-10-22. Wykonał agent (Claude Code, Opus) w imieniu Krzysztofa. Decyzje podjęte przez delegację są oznaczone **[delegacja]**.

## 1. Pomiar AS / IS i TO BE

Narzędzie: `/context` w świeżej sesji Claude Code 2.1.299 uruchomionej w katalogu repozytorium (`claude -p "/context"`), ten sam model (Opus 5.5). Liczby porównujemy tylko w obrębie tego narzędzia.

| Co mierzymy | AS / IS (przed) | TO BE (po) |
|---|---|---|
| Zajętość okna przed pierwszym promptem | 29,1 tys. | 29,8 tys. |
| System prompt + narzędzia systemowe | 2,1 + 16,8 tys. | bez zmian |
| Pliki pamięci (`AGENTS.md` + `CLAUDE.md`) | 300 | 984 |
| Główny `AGENTS.md` | 296 tokenów / 955 B / 14 linii | 979 tokenów / 2448 B / 45 linii |
| Pliki `AGENTS.md` przy modułach (ładowane na żądanie) | 0 | 2 (`packages/ui`, `db`), łącznie ~1,1 KB |
| Opisy skilli | 9,9 tys. (42 skille `om-*` + 4 wbudowane) | 9,9 tys. |
| Serwery MCP włączone w projekcie | 0 (brak `.mcp.json`) | 0 |
| Pik kontekstu na starcie sesji | nie (pkt 5) | do sprawdzenia po kilku nowych sesjach |

**Wniosek: start sesji urósł o ~700 tokenów, i to jest świadomy wybór.** W lekcji `AGENTS.md` miał 12 tys. tokenów, więc router dawał oszczędność. Nasz `AGENTS.md` miał 296 tokenów i zawierał tylko blok Next.js oraz jedno zdanie o design systemie. Nie było w nim komend, granic ani routingu, czyli informacji, które według lekcji przechodzą test „czy bez tej linijki agent zrobiłby to inaczej”. Router to dodał. Zgodnie z zakończeniem lekcji: jeśli liczby się nie poprawiły, optymalizowaliśmy nie ten etap. **U nas drogim etapem są opisy skilli (9,9 tys., 33× więcej niż `AGENTS.md`), nie pliki instrukcji.**

## 2. Przegląd `AGENTS.md` (metoda `eliminate-no-op`, ręcznie)

Skill `eliminate-no-op` przeczytałem z GitHuba (`pat-lewczuk/skills`) i zastosowałem jego metodę bez instalowania. Nie uruchamiałem też jego skryptu `analyze.py`, bo to kod zewnętrzny, a do pliku z 2 dyrektywami wystarczyło ręczne przejście.

| Dyrektywa (przed) | Werdykt | Kod / uzasadnienie |
|---|---|---|
| Blok `nextjs-agent-rules` („This is NOT the Next.js you know…”) | KEEP | Counter-default: model zna starszy Next.js. Blok generuje `next dev`, więc usunięcie i tak wraca |
| „Before building or changing any UI, read `docs/design-system.md` …” | MOVE → wiersz routingu „UI in `app/` or `packages/ui`” | Dotyczy tylko zadań UI. Opis zawartości pliku w nawiasie był no-opem (agent zobaczy ją po otwarciu) |

Nie było martwych odwołań, duplikatów ani nieaktualnych reguł. Plik był za mały, żeby coś zgnić. Główny problem był odwrotny: brak informacji, których agent nie zgadnie.

Dodane, bo przechodzą test „czy bez tej linijki agent zrobiłby to inaczej”:

- **Komendy**: `npm run setup` (baza), `npm test` wymaga Postgresa, `lint` + `build` przed oddaniem, e2e po buildzie, `check:agents`.
- **Granice**: zakaz czytania `.env*` z wyjątkiem wzorców (spójne z regułami `deny` z lekcji 09); język UI.
- **Routing**: 8 typów zadań → konkretne pliki.
- **Wzorcowe przykłady**: server action + formularz (`app/mentor/availability/`), moduł zapytań do bazy + test, migracja + test, komponent UI.

## 3. Task Driven Context Routing (metoda `task-router`)

Skill `task-router` przeczytałem z GitHuba i przeszedłem jego 5 kroków ręcznie, bez instalowania.

1. **Discover**: jednostki `app/` + `lib/` (aplikacja), `packages/ui` (design system), `db/migrations` (baza), `tests/`. Komendy z `package.json` i `.github/workflows/ci.yml`.
2. **Split**: reguły UI z treścią specyficzną dla pakietu (stories jako testy z axe, `check:tokens`, `typecheck:ui`, `POSTEP.md`) trafiły do `packages/ui/AGENTS.md`. Konwencje migracji i harness testów DB trafiły do `db/AGENTS.md`. Obok każdego jest `CLAUDE.md` z samym `@AGENTS.md`. `app/`, `lib/` i `tests/` nie dostały plików, bo nie mają treści, której nie ma w routingu albo w specyfikacjach (zasada „plik tylko przy realnej treści”).
3. **Route**: tabela w głównym `AGENTS.md`: Bug fix, New feature, Refactor, Review, UI, Database, Product question, Agent config.
4. **Check**: `npm run check:agents` (`scripts/check-agents.mjs`, bez zależności) pilnuje budżetu (root ≤ 150 linii / 12 KB, moduł ≤ 120 linii / 8 KB, ostrzeżenie od 80%), istnienia każdej ścieżki w backtickach i tego, że każdy `CLAUDE.md` zawiera wyłącznie `@AGENTS.md`. Ma testy w `npm test` (`tests/check-agents.test.mjs`) i jest wpięty w CI (job `lint`). Wynik: 3 pliki `AGENTS.md`, 3 `CLAUDE.md`, 0 błędów.
5. **Luki** (potrzeba bez dokumentu, więc bez wiersza w routingu): brak dokumentu „jak debugować” (logi, typowe błędy Postgresa/Dockera na Windows), brak opisu wdrożenia (projekt jeszcze się nie wdraża).

## 4. Skille

| Pomiar | Wynik |
|---|---|
| Liczba skilli w projekcie | 42 (`.claude/skills/`, identyczna kopia w `.agents/skills/` dla Codexa) |
| Opisy (limit 1024 znaki) | 139–498 znaków, wszystkie w limicie |
| Opisy mówiące **kiedy** | większość ma „Use for …” / „Use when …”. Bez sygnału „kiedy”: m.in. `om-merge-buddy` (tylko streszczenie działania) |
| Treść `SKILL.md` (≈ 5 tys. tokenów / 500 linii) | wszystkie < 300 linii. Największe ~20,6 KB (≈ 5 tys. tokenów): `om-auto-fix-issue`, `om-auto-review-pr`, `om-setup-agent-pipeline`, czyli na granicy rekomendacji |
| Stare, skeszowane wersje | brak w projekcie. Globalnie `~/.claude/skills/` zawiera tylko zsynchronizowane skille organizacji |

**[delegacja]** Skilli nie edytujemy ani nie usuwamy dziś. To skille Open Mercato przypięte w `skills-lock.json`, a lekcja 11 (kodowanie autonomiczne) korzysta z `om-auto-*`. Edycja rozjechałaby je z wersją źródłową.

## 5. Historia sesji (zamiast Context Scope)

Context Scope to zewnętrzny program z GitHuba. Zgodnie z zasadą z lekcji 09 („nie uruchamiaj kodu, którego nie przejrzałeś”) nie instalowałem go. Zamiast niego krótki skrypt czytał z plików sesji `~/.claude/projects/` **wyłącznie liczbowe pola `usage`** (bez treści rozmów): kontekst na pierwszym wywołaniu, po 5 wywołaniach, maksimum.

| Projekt | Sesje | Start (mediana) | Maks. (mediana) | Pik na starcie? |
|---|---|---|---|---|
| `projekty/devmentor` | 11 | 43,6 tys. | 55,9 tys. | **nie** w długich sesjach: przyrost w pierwszych 5 wywołaniach to 7–31% całego przyrostu. Krótkie sesje (4–10 wywołań, testy z lekcji 09) nie dają wniosku |
| `drugi-mozg` (sesje kursu, z których powstaje DevMentor) | 115 | ~80 tys. | **sesje do 959 tys. tokenów** | nie (0–2%), ale kontekst rośnie bez końca: 923 wywołania w jednej sesji |

Najważniejsze znalezisko jest więc po stronie sposobu pracy, a nie repozytorium. Kurs prowadzimy w jednej, wielodniowej sesji, która dochodzi do okna 1 mln tokenów. To głęboko w strefie context rot (lekcja: jakość spada od ~300 tys.).

## 6. Subagenci

W tym projekcie subagentów używamy świadomie przez prompt i skille. W lekcji 08 implementacja szła w trybie „subagent na zadanie”, a review robił inny model (Codex). Zgodnie z lekcją to narzędzie jakości, nie oszczędności, i tak zostaje.

## 7. Co ładuje się zawsze, a co na żądanie

- **Zawsze**: system prompt i narzędzia (~19 tys., poza naszym wpływem), opisy 42 skilli (9,9 tys.), główny `AGENTS.md` (~1 tys.).
- **Na żądanie**: `packages/ui/AGENTS.md` i `db/AGENTS.md` (gdy agent pracuje w katalogu), pliki z tabeli routingu, treść `SKILL.md` i jej referencje, specyfikacje.

## 8. Znaleziska i co wdrażamy w przyszłym tygodniu

| # | Znalezisko | Wdrażam w przyszłym tygodniu? |
|---|---|---|
| 1 | Sesje kursu rosną do ~950 tys. tokenów (context rot) | **TAK**: każda lekcja w nowej sesji. Stan przenosi tracker i `track.md`, nie historia rozmowy |
| 2 | Opisy skilli to 9,9 tys. tokenów na starcie, 33× więcej niż `AGENTS.md` | **TAK, po lekcji 11**: lista skilli nieużywanych w DevMentorze (kandydaci: `om-ux-*`, `om-apply-upgrade-notes`, `om-setup-discovery-pipeline`, `om-merge-buddy`) i decyzja o usunięciu przez PR ze zmianą `skills-lock.json` |
| 3 | Router dodał ~700 tokenów na starcie | obserwacja: po kilku sesjach sprawdzić, czy spadła liczba odczytów przy pierwszych krokach (brak piku to cel) |
| 4 | Brak dokumentu „jak debugować” (luka z routingu) | nie teraz: dopiero gdy pojawi się pierwszy powtarzalny problem |
| 5 | `om-merge-buddy` bez sygnału „kiedy” w opisie | nie: skill zewnętrzny, zgłosić autorom przy okazji |
