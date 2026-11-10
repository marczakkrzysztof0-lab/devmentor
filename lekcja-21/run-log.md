# Lekcja 21 — run log: wypłaty mentorów (E04-S01, #22 + #25), flow wielomodelowy

Data: 2026-11-10. Worktree: `C:\Users\KMarczak\projekty\devmentor-l21`, gałąź `lekcja-21-multi-model` (z origin/main 900c844).

## Dlaczego ręcznie, a nie `om-implement-feature-multi-optimized`
Runtime skilla odmawia adapterów CLI na natywnym Windows („require WSL”), brak kluczy API DeepSeek/Zen. Ten sam flow odtworzony ręcznie: orkiestrator (spec, ocena uwag) → 2 rodziny recenzentów na świeżym kontekście (spec ×3 rundy) → jeden implementer → 2 rodziny recenzentów (kod ×3 rundy) → walidacja.

## Skład modeli (2026-11-10)
| Rola | Model / narzędzie | Id modelu zgłoszony przez CLI |
|---|---|---|
| Orkiestrator | Claude Code (sesja-subagent) | claude-opus-5-5 |
| Recenzent A (rodzina OpenAI) | `codex exec --ephemeral --sandbox read-only` (codex-cli 0.162.1) | gpt-6-luna (z nagłówka `model:` w wyjściu Codex) |
| Recenzent B (rodzina Anthropic, świeży kontekst) | planowo `claude -p --model opus …` (Claude Code 2.1.299) — **niedostępne**: `Failed to authenticate: OAuth session expired and could not be refreshed`, `claude auth status` → loggedIn: false (wymaga logowania przez człowieka). Zastępczo: świeży subagent `general-purpose` z `model: opus` przez narzędzie Agent orkiestratora (nowy kontekst, dostaje tylko prompt recenzji + pliki repo, bez rozumowania orkiestratora) | claude-opus-5-5 (opus w tej sesji) |
| Implementer | Codex `codex exec --ephemeral --sandbox workspace-write` (bez fallbacku — patrz niżej) | gpt-6-luna |

## Fazy (czas lokalny, CET)
| Faza | Start | Koniec | Czas |
|---|---|---|---|
| Analiza kodu + spec v1 (orkiestrator) | 07:33 | 07:39 | 6 min |
| Spec — runda 1 (Codex + Claude równolegle) | 07:39 | 07:47 | 8 min (Codex 2 min, Claude 2,5 min, ocena + poprawki 5 min) |
| Spec — runda 2 | 07:47 | 07:51 | 4 min (Codex 1 min, Claude 3,6 min) |
| Spec — runda 3 | 07:51 | 07:55 | 4 min (Codex 1 min, Claude 2,8 min) |

## Uwagi do specyfikacji — tabela ustaleń

Surowe wyniki: `reviews/spec-r{1,2,3}-{codex,claude}.json` (+ `spec-r1-claude-cli-auth-error.json` — nieudane wywołanie `claude -p`). Każde ustalenie sprawdziłem w kodzie / briefie przed decyzją.

### Runda 1
| Recenzent | Waga | Teza (skrót) | Werdykt | Działanie |
|---|---|---|---|---|
| Codex | blocker | zwrot zapisany między sprawdzeniem a utworzeniem transferu → wypłata zwróconego | real | `refunds.list` pod claimem + flaga `refunded_after_payout` po sukcesie |
| Codex | major | odczyt z API z lokalnym zegarem może nadpisać nowszy webhook; `<=` przepuszcza remis | real | ścisły warunek, `asOf` przed wywołaniem, remis → resync |
| Claude | blocker | częściowe / zewnętrzne zwroty nie trafiają do `payments` (webhook.mjs:127-130, 176-180) → wypłata w całości | real | OQ10: `payments.refund_seen_at` ustawiane w webhooku |
| Claude | blocker | nowy klucz idempotencji przy każdej próbie (też po wygaśnięciu dzierżawy) → dwa transfery | real | `key_version`, take-over przed create |
| Claude | major | `amount*bps` przepełnia `integer` (500000×10000) | real (sprawdzone: PRICE_MAX_ZLOTY=5000) | `bigint` + testy |
| Claude | major | bez `source_transaction` → `balance_insufficient` przez dni, limit prób wyczerpany | real | `source_transaction = latest_charge` |
| Claude | major | `transferring` na 5. próbie zostaje na zawsze | real | take-over/`lease_expired` |
| Claude | minor | sekret wybierany w `handleStripeWebhook`, nie w route | real (webhook.mjs:45) | poprawione miejsce |
| Claude | minor | równoległe `accounts.create` → 409, nie to samo konto | real | blokada + błąd do ponowienia |
| Claude | minor | brak `cancelled` w DS, `held` liczone tylko z wierszy payouts | real | definicja w `summary.mjs` |
| Claude | nit | `/mentor/payouts` przed pierwszym płatnym zapytaniem | real | przekierowanie na `/mentor` |

### Runda 2
| Recenzent | Waga | Teza (skrót) | Werdykt | Działanie |
|---|---|---|---|---|
| Codex | major | sprawdzenie zwrotów pomija `failed`/`canceled` wbrew „any refund row” | real (częściowo — wspólny predykat; ostatecznie przyjęte dosłownie w R3) | jeden predykat |
| Codex | major | down migracji może skasować `failed` po niejednoznacznym transferze | real | down odmawia przy `attempts > 0` |
| Codex | major | brak jawnych testów denied read / denied write (AGENTS.md) | real | dopisane trzy kontrole na dwóch kontach |
| Claude | major | Stripe zapamiętuje też 500 pod kluczem → ten sam klucz powtarza błąd | real | podbicie klucza po otrzymanej odpowiedzi błędu po take-over; fake odtwarza zapamiętane błędy |
| Claude | major | porównanie zegara Stripe z naszym (skew) | real | brak porównań między zegarami |
| Claude | major | konto `pending` nigdy nie odczytane ponownie bez webhooka Connect | real | okresowy resync w zadaniu + odczyt przy każdej wizycie |
| Claude | minor | `refund.failed` ustawiałby `refund_seen_at`, a `refunds.list` go pomija | real | jeden predykat |
| Claude | minor | `FOR UPDATE` na `mentors` blokuje FK przy nowych zapytaniach | real (0006 FK) | blokada doradcza → w R3 placeholder |
| Claude | minor | konto tylko z `transfers` w PL może wymagać umowy recipient | real (niezweryfikowane ryzyko, tania poprawka) | `card_payments`+`transfers` |
| Claude | minor | dzierżawa 5 min za krótka na 4 wywołania Stripe | real | 15 min + kontrola pozostałego czasu |
| Claude | minor | DS bez `cancelled` (niedokończona poprawka R1) | real | uzupełnione |
| Claude | minor | BACKWARD_COMPATIBILITY bez nowej zmiennej i endpointu Connect | real | uzupełnione |
| Claude | nit | indeks nie obsługuje kandydatów | real | dwa indeksy |
| Claude | nit | `transfer.updated` niespójnie | real | jawnie na liście |

### Runda 3
| Recenzent | Waga | Teza (skrót) | Werdykt | Działanie |
|---|---|---|---|---|
| Codex | major | `>=` przepuszcza starsze zdarzenie z tej samej sekundy | real | ścisłe `>` |
| Codex | major | predykat zwrotów zawęża brief („any refund row”) | real | dosłownie: każdy zwrot w dowolnym stanie |
| Claude | major | `>=` (to samo co Codex F1) | duplikat | — |
| Claude | major | niejednoznaczny wynik na ostatniej próbie → `failed` mimo istniejącego transferu | real | końcowy take-over; `transfer.created` adoptuje `failed` |
| Claude | major | take-over po `transfer_group` niepewny przy `source_transaction` | real (ryzyko API) | lista po `destination` + `metadata.payout_id` |
| Claude | minor | „odczyt zawsze stosowany” vs „stary odczyt przegrywa” | real | odczyt odrzucany, gdy w trakcie przyszedł webhook |
| Claude | minor | stały klucz `accounts.create` powtarza błąd 24 h | real | `create_key_version`, parametry bez e-maila |
| Claude | minor | transakcja trzymana w trakcie wywołania Stripe | real | placeholder zatwierdzony przed wywołaniem |

### Sumy (spec)
| Recenzent | Ustaleń | Real | Halucynacje | Duplikaty | Poza zakresem |
|---|---|---|---|---|---|
| Codex (gpt-6-luna) | 7 | 7 | 0 | 0 | 0 |
| Claude (opus, świeży) | 26 | 25 | 0 | 1 | 0 |

Obserwacja: Codex zgłaszał mniej, ale każde trafione (2–3 na rundę); Claude szerzej (API Stripe, zgodność z repo). Liczba uwag spadała (11 → 14 → 8), ale ich waga nie spadła do zera — runda 3 nadal znalazła realne problemy z exactly-once, więc nie było podstaw do wcześniejszego zatrzymania.

### Koszt recenzji spec
| Recenzent | R1 | R2 | R3 |
|---|---|---|---|
| Codex (tokeny, subskrypcja → $ marginalnie 0) | 55 679 | 58 001 | 53 798 |
| Claude subagent (tokeny subagenta; brak `total_cost_usd`, bo nie przez `claude -p`) | 144 392 | 158 722 | 142 252 |

## Implementacja — wybór implementera
Sondy sandboksa Codex (`workspace-write`) 07:56–08:05: `node --test` działa, połączenie z Postgresem na localhost działa (`db ok 1`), `npm.cmd` działa; `docker` odmowa dostępu (niepotrzebny — baza już stoi), skrypt PowerShell `npm.ps1` zablokowany (UnauthorizedAccess; wystarcza `npm.cmd`/Git Bash). Pierwsza sonda pokazała brak `node_modules` w worktree — to był brak `npm ci` po mojej stronie, nie sandbox. Wniosek: Codex może pisać kod i uruchamiać testy jednostkowe i DB → implementerem zostaje Codex, fallback na Claude niepotrzebny (zresztą `claude -p` niezalogowane).
Środowisko: kontener `devmentor-db` z głównego klonu już działał na 5432 — `npm run setup` w worktree zgłosił konflikt nazwy; używam istniejącego kontenera, `npm run db:migrate` w worktree OK. Prompt implementera: `lekcja-21/implementer-prompt.md` (spec, brief, lista plików, reguły repo, bramka; bez rozumowania orkiestratora).

| Faza | Start | Koniec | Czas |
|---|---|---|---|
| Przygotowanie środowiska (npm ci, baza, sondy Codex) | 07:55 | 08:01 | 6 min |
| Implementacja — Codex, pakiet 1 (cała specyfikacja) | 08:01 | 08:45 | 44 min (267 070 tokenów) |
| Walidacja 1 (orkiestrator: lint, test, build, tokens, size, e2e) | 08:46 | 08:50 | 4 min |
| Code review — runda 1 (Codex + Claude równolegle) | 08:50 | 08:54 | 4 min (Codex 1,5 min / 103 030 tok.; Claude 3,3 min / 168 026 tok.) |
| Poprawki 1 — Codex (10 zadań z dowodami) | 08:55 | 09:22 | 27 min (139 222 tok.) — sam zgłosił „implementation incomplete” |
| Poprawki 2 — Codex, dwa wąskie pakiety równolegle (2a czytelność kodu, 2b testy DB) | 09:24 | … | … |

### Walidacja 1 (08:46–08:50)
lint 0 błędów; `npm test` 745/745; build OK (`/mentor/payouts` w trasach); `typecheck:ui` OK; `check:tokens` OK; `size` w limitach; **e2e `mentor-payouts` CZERWONE** (`/135 zł/` vs NBSP); `test:storybook` — NIE URUCHOMIONE lokalnie: vitest browser nasłuchuje na stałym porcie 63315, który na tej maszynie jest w zakresie wykluczonym przez Windows (`netsh … excludedportrange`: 63246–63345) → `listen EACCES`; flagi `--browser.api.port` nie pomogły; storybook sprawdza job CI `storybook`. (Implementer Codex zgłosił te same ograniczenia: build — brak dostępu do Google Fonts w sandboksie, storybook — EACCES.)

### Code review — runda 1
| Recenzent | Waga | Teza (skrót) | Werdykt | Działanie |
|---|---|---|---|---|
| Codex | blocker | e2e czerwone — strona pokazuje 0 zł po zadaniu | real (bramka czerwona), ale błędna diagnoza: 0 zł to poprawne „Do wypłaty”, wypłata 135 zł była na stronie | zadanie dla implementera z wyjściem testu |
| Codex | major | brak testów risk-high (porażki, ponowienia, lease, wyścigi zwrotów, webhook, dostęp) | real | jak niżej |
| Claude | blocker | e2e: regex ze zwykłą spacją, `formatMoney` daje NBSP | real (sprawdzone w logu: „Wypłacone do tej pory 135 zł”) | poprawka regexu + asercje w bazie |
| Claude | blocker | brak większości testów z tabeli „Edge cases → tests” | real (4 testy DB) | pakiet testów |
| Claude | major | zwrot anuluje `failed` po niejednoznacznej próbie bez take-over | real (transfers.mjs:26) | take-over przed anulowaniem |
| Claude | major | błąd odczytu wypłat wywraca `/mentor` | real (page.tsx:59 bez try/catch) | wrapper z try/catch |
| Claude | major | DS niezgodny ze spec (`action_required`, `in_transit`, brzmienie, brak stories) | real (grep) | poprawka DS |
| Claude | major | kod pieniędzy zminifikowany w jednolinijkowce | real | pakiet czytelności |
| Claude | minor | akcja ignoruje `{ok:false}`, `redirect` zamiast `{ok,url}` | real | poprawione |
| Claude | minor | `resyncAccounts` czyta `deps.deadline` | real | poprawione |
| Claude | minor | `hasAnyRefund` z mylącymi parametrami, logika zdublowana w webhooku | real | poprawione |
| Claude | nit | `UP_TO_0008` zawiera 0009 | real | poprawione |

Sumy CR1: Codex 2 (2 real, 0 halucynacji; 1 z błędną diagnozą przyczyny), Claude 10 (10 real).

### Obserwacja o implementerze
Codex w jednym przebiegu napisał całość (działającą end-to-end: e2e przeszło poza regexem), ale w stylu „zminifikowanym” i z minimalnymi testami (4 testy DB zamiast ~30 wymaganych). Pakiet poprawek z 10 zadaniami zrobił w części i sam to zgłosił. Zmiana taktyki: zamiast jednego dużego zadania — dwa wąskie pakiety równolegle na rozłącznych plikach (kod vs testy), jak w trybie „optimized workers”. Kryterium fallbacku na Claude (sandbox nie uruchamia potrzebnych poleceń) nie zaszło.
| Poprawki 2a — Codex, czytelność kodu + stories `PayoutSetupPrompt` | 09:23 | 09:52 | 29 min (153 736 tok.) — zrobione |
| Poprawki 2b — Codex, testy (duży pakiet) | 09:52 | 10:00 | 8 min (49 013 tok.) — pierwszy start równoległy nie ruszył (drugi proces w tle w jednym wywołaniu); ponowiony osobno; sam zgłosił „incomplete” (2 testy) |
| Walidacja 2 (build + e2e: payouts, settlement, requests, editor) | 09:53 | 10:05 | 12 min — e2e 21/21 |
| Poprawki 3 — Codex, 4 małe pakiety testów równolegle (osobne pliki) | 10:01 | 10:16 | 15 min (t1 56 357, t2 110 032, t3 93 412, t4 47 731 tok.) — kompletne; t1 zgłosił 2 todo „BUG” |
| Sprawdzenie ręczne (Playwright, 390 px, dwa konta) | 10:06 | 10:28 | 22 min (w tym 2 przebiegi z wyścigiem mojego skryptu względem strumieniowania `<Suspense>`) |
| Poprawki 4 — Codex, błąd podbicia klucza po 5xx | 10:18 | … | … |

### Wnioski z pakietów testowych
- 4 wąskie pakiety (jeden plik, lista 4–9 testów) zakończyły się kompletnie w 13–15 min każdy; ten sam zakres jako jeden pakiet — 2 próby, obie przerwane przez Codex („incomplete”). Rozmiar pakietu miał większy wpływ niż sformułowanie.
- Test-autor znalazł realny błąd: po otrzymanym 5xx `key_version` nie był podbijany (Stripe odtwarzałby zapamiętany błąd w nieskończoność). Drugi „BUG” okazał się zamierzonym zachowaniem (natychmiastowy take-over po niejednoznacznym wyniku) — spec doprecyzowany, test przepisany.
- Testy DB po pakietach: access 4, jobs 2, money 9, onboarding 3, schema 1, transfer 9, webhook 7 (+ unit `tests/payouts`).

### Sprawdzenie ręczne — wynik
Skrypt `lekcja-21/qa/manual-check.e2e.mjs` (uruchamiany przez `npm run test:e2e --`), wynik `qa/manual-check-result.json`, zrzuty `qa/01…08-*.png`. Wszystkie 14 kroków OK: brak wzmianki o wypłatach przed płatnością; prośba po pierwszej płatności; zapytania działają; `/mentor` i `/mentor/payouts` bez poziomego przewijania przy 390 px; wstrzymane 135 zł; porzucony onboarding → pieniądze `held_for_payout`, przycisk dostępny ponownie; mentor B na `/mentor/payouts?stripe=return&account=<konto A>` → przekierowanie na `/mentor`, bez danych A, nic nie utworzone, konto A bez zmian; po onboardingu „Wypłaty gotowe”; zadanie → 135 zł wypłacone, drugie uruchomienie → nadal 1 transfer.
Uwagi z ręcznego sprawdzenia (do poprawek): (1) po porzuceniu onboardingu nagłówek stanu mówi „Stripe sprawdza dane — Nic nie trzeba robić”, a pod spodem „nie wszystko zostało dokończone — dokończ” — sprzeczny komunikat dla `pending` bez `details_submitted`; (2) prośba o wypłaty na `/mentor` jest pod całym formularzem strony (przy 390 px trzeba przewinąć ~1300 px) — „clear prompt” z briefu słabo spełniony; (3) `/mentor/payouts` ma `MentorNav` bez „Wyloguj”.

## Wznowienie po pauzie (KM, 10.11 ~10:30 → 16:10) — orkiestrator: sesja główna
- Poprawka 4 (klasyfikacja 5xx / `key_bump_due`) okazała się dokończona przed zatrzymaniem: `payouts-transfer.test.mjs` 10/10, 0 todo.
- Poprawki 5 — Codex, 16:15–16:21 (45 702 tok.): 3 uwagi z ręcznego sprawdzenia (`pending` porzucony vs weryfikacja przez `detailsSubmitted`, prośba nad formularzem `/mentor`, „Wyloguj” + licznik na `/mentor/payouts`) + martwa gałąź `false ?` + „Odśwież stan” bez akcji. Walidacja 3: lint 0, `npm test` 778/778, build OK, typecheck:ui OK, e2e payouts+settlement 2/2.

## Code review — runda 2 (16:25–16:35)
Codex `codex exec --sandbox read-only` (194 609 tok.), Claude świeży subagent opus (215 836 tok., 6 min). Ten sam prompt `reviews/code-review-r2-prompt.md` (diff + spec + brief + reguły repo + dowody walidacji; bez uzasadnień implementatora).

| Recenzent | Waga | Teza (skrót) | Werdykt | Działanie |
|---|---|---|---|---|
| Codex F1 | major | sumy łączą różne waluty | real, obniżone do minor — waluta mentora nie zmienia się w aplikacji (Q2, edytor ignoruje `currency`) | poprawka 6c: sumy tylko w walucie strony + test; zapis w spec |
| Codex F2 | major | e2e ustawia `held` SQL-em, nie sprawdza `/mentor/requests` | real | poprawka 6c |
| Codex F3 | minor | testy w jednolinijkowcach | real | poprawka 6c |
| Claude F1 | major | `key_bump_due` nadpisywany przez błąd innego wywołania niż `transfers.create` | real (sprawdzone: `writeFailure` zawsze pisze `$5`) | poprawka 6a |
| Claude F2 | major | ponowne przejęcie + zwrot → `cancelled` bez sprawdzenia istniejącego transferu | real (sprawdzone: transfers.mjs 178–203 przed `findExistingTransfer`) | poprawka 6a |
| Claude F3 | major | `held_for_payout` przy `ready` bez „Do wypłaty”; brak stories failed/cancelled | real (spec l.103) | poprawka 6b |
| Claude F4 | major | zapytanie kandydatów z `now()` bazy, test nadpisuje `next_attempt_at` | real (sprawdzone) | poprawka 6a |
| Claude F5 | major | ręczne sprawdzenie sprzed poprawek 5, mentor B bez płatności | real | ponowię sprawdzenie po poprawkach 6 |
| Claude F6 | major | testy pieniędzy zminifikowane | real (duplikat Codex F3) | poprawka 6c |
| Claude F7 | minor | `pending`+submitted mówi „nic nie rób”, a Stripe może chcieć danych | real | poprawka 6b (zostaje drugorzędny przycisk) |
| Claude F8 | minor | prośba przed h1 poza `notice`; martwa gałąź; nagłówek pliku | real | poprawka 6b |
| Claude F9 | minor | `next/navigation` w pakiecie DS bez zależności `next` | real (sprawdzone package.json) | poprawka 6b: wrapper w `app/` |
| Claude F10 | minor | e2e „135 zł” nie dowodzi sumy wypłaconych | real | poprawka 6c |
| Claude F11 | minor | brak części testów z tabeli przypadków | real | 6a: obie kolejności, webhook→job; paginacja fake — poza zakresem (dług, zapis w spec) |
| Claude F12 | minor | zegar bazy vs aplikacji w `accounts.mjs` | real | poprawka 6a |
| Claude F13 | nit | styl webhook/accounts (cyrylica w JSDoc), duplikat story | real | 6a/6b |

Sumy CR2: Codex 3 (3 real, 0 halucynacji, 1 obniżona waga), Claude 13 (13 real, 0 halucynacji, 1 duplikat z Codex). Liczba uwag nie spadła (CR1 12 → CR2 16), bo poprawki 5 dodały UI, a Claude dostał prośbę o sprawdzenie, czego testy nie dowodzą.

## Poprawki 6 (16:32–16:45) — 3 wąskie pakiety Codex równolegle + 2 dokładki
| Pakiet | Start | Koniec | Tokeny | Wynik |
|---|---|---|---|---|
| 6a logika wypłat (Claude F1, F2, F4, F11 część, F12, F13 część) | 16:32 | 16:43 | 101 224 | kompletne, 22/22 testów |
| 6b UI (Claude F3, F7, F8, F9, F13 część) | 16:32 | 16:35 | 45 501 | **nieudane** — edycja przez PowerShell `ReadAllText/WriteAllText` zostawiła dosłowne `` `r`n `` i krzaki (cp1250) w 36 liniach `MentorPayouts.tsx`; Codex sam to zgłosił. Kodowanie naprawione przez orkiestratora mechanicznie (cp1250→utf-8 na liniach z krzakami) |
| 6b2 dokończenie UI (zakaz PowerShell, tylko `apply_patch`) | 16:38 | 16:41 | 53 922 | kompletne |
| 6c testy + waluta + e2e przez prawdziwe rozliczenie | 16:32 | 16:37 | 94 997 | częściowe: 3 pliki testów nadal zminifikowane, 1 linia e2e z krzakami (naprawiona) |
| 6c2 przeformatowanie 3 plików testów | 16:39 | 16:42 | 63 140 | kompletne, 15/15 przed i po |

Walidacja 4: lint 0 błędów (2 ostrzeżenia), tsc, typecheck:ui, check:tokens OK, `npm test` 789/789, build OK, e2e 96/97 — porażka `mentor-payouts.e2e.mjs`: (1) Codex wstawił sprawdzenie „przekierowanie przed płatnością” PO płatności; (2) sesję rozliczał bez wiadomości → reguła daje słusznie `mentor_no_show` + zwrot, nic do wypłaty. To błędy testu, nie aplikacji (uwaga Codex F2 trafiona: test z SQL-owym `held` ukrywał, że scenariusz nie przechodzi prawdziwej ścieżki). Poprawione przez orkiestratora w teście (przeniesienie sprawdzenia, obie strony piszą w terminie jak w `session-settlement.e2e.mjs`) → e2e payouts 1/1.
Wniosek: na Windows Codex czasem edytuje przez PowerShell i psuje UTF-8 — w każdym pakiecie wymóg `apply_patch` + kontrola krzaków po każdym pakiecie.

## Code review — runda 3 (16:52–17:00), ostatnia
Codex read-only (109 147 tok.), Claude świeży subagent opus (192 956 tok., 4,5 min). Prompt `reviews/code-review-r3-prompt.md`; recenzenci nie dostali wyników rund 1–2.

| Recenzent | Waga | Teza (skrót) | Werdykt | Działanie |
|---|---|---|---|---|
| Codex F1 | major | refund + nieudane wyszukanie transferu → `cancelled`, może ukryć wypłacony transfer | real (sprawdzone transfers.mjs 182–196) | 8a: błąd wyszukania → ponowienie, nie anulowanie |
| Claude F1 | major | test „refund on reclaimed payout” nie dochodzi do nowej gałęzi (idzie przez `cancelRefunded`) | real | 8a: test z `transferring` + wygasłą dzierżawą |
| Claude F2 | major | brak jednolinijkowego „Wypłaty gotowe” + link na `/mentor` (spec l.111) | real (grep) | 8b |
| Claude F3 | minor | to samo co Codex F1 | duplikat | — |
| Claude F4 | minor | e2e nie sprawdza wartości „Wypłacone do tej pory” | real (6c tego nie zrobił) | 8b |
| Claude F5 | minor | brak testu porzucenia próby przy < 2 min dzierżawy | real | 8a |
| Claude F6 | minor | brak testów: timeout `accounts.create`, równoległe zapytanie przy onboardingu, brak konfiguracji płatności | real | 8a: timeout `accounts.create`; reszta — dług w spec |
| Claude F7 | minor | pozycje w innej walucie pokazane z walutą strony | real | 8a: pozycje filtrowane do waluty sum |
| Claude F8 | minor | sprzeczny komunikat `refresh`+submitted, brak story `transferring`, martwa gałąź | real | 8b |
| Claude F9 | nit | cyrylica w JSDoc `accounts.mjs` | **halucynacja** — grep po cyrylicy w całym kodzie pusty (naprawione w 6a) | odrzucone |
| Claude F10 | nit | migracja 0009 bez nagłówka | real | 8a |

Sumy CR3: Codex 1 (1 real), Claude 10 (8 real, 1 duplikat, 1 halucynacja — stan sprzed poprawek 6a? nie: recenzent czytał aktualny kod, więc to błąd odczytu).

## Poprawki 8 (16:58–17:03) i walidacja końcowa (17:04–17:13)
8a logika + testy (60 410 tok.): błąd wyszukania transferu przy zwrocie → ponowienie, test przejęcia po wygasłej dzierżawie (test mutacyjny: bez gałęzi pada), test < 2 min dzierżawy, timeout `accounts.create`, pozycje tylko w walucie sum, nagłówek migracji (2 linie z krzakami — naprawione przez orkiestratora). 8b UI + e2e (47 288 tok.): „Wypłaty gotowe” + link na `/mentor`, spójny komunikat `refresh`, story `transferring`, e2e sprawdza wartości „Wypłacone do tej pory” 135 zł i „Do wypłaty” 0 zł. Pakiet 7 (50 195 tok.): skrypt ręcznego sprawdzenia przez prawdziwą ścieżkę, mentor B z własną płatnością i kontem.
Walidacja 5: lint 0 błędów / 0 ostrzeżeń, tsc, typecheck:ui, check:tokens, size OK, `npm test` 792/792, build OK, e2e 97/97, ręczne sprawdzenie 21/21 (`qa/manual-check-result.json`). Storybook w przeglądarce — tylko CI.
Karta dowodu i porównanie z E02: `karta-dowodu.md`. Surowe logi Codex (`reviews/*.log`, `*.stderr.txt`, `val*.txt`, ok. 25 MB) zostają lokalnie, poza PR.
