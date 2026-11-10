# Karta dowodu — L21, wypłaty mentorów (E04-S01 #22 + E04-S01-T01 #25)

| Pole | Treść |
|---|---|
| Wymaganie / hipoteza | Mentor po pierwszym opłaconym pytaniu konfiguruje wypłaty w Stripe Connect Express; pieniądze za sesje `held` i `mentee_no_show` (bez zwrotów) trafiają do niego dokładnie raz, minus prowizja z migawki płatności. Hipoteza lekcji: flow wielomodelowy (jeden implementer, recenzenci z dwóch rodzin na świeżym kontekście, 3+3 rundy) daje kod pieniędzy, który przechodzi bramkę i ręczne sprawdzenie bez poprawek człowieka. |
| Zakres i ryzyko | risk-high (pieniądze, idempotencja, współbieżność, dostęp między kontami). 39 plików, +3578/−91 poza `lekcja-21/`: migracja 0009, `lib/payouts/*`, webhook, zadanie w `lib/jobs`, `/mentor` i `/mentor/payouts`, DS `e04`, testy unit/DB/e2e. Poza zakresem: prowizja (Q01), spory, przepływy operatora w panelu Stripe, prawdziwe klucze. |
| Baza i docelowy commit | Baza `origin/main` 900c844. Docelowy commit: gałąź `lekcja-21-multi-model`, commit PR-a (hash w PR). |
| Środowisko / seed / konto / czas | Windows 11, Node + Next 16 build produkcyjny, Postgres w Dockerze (`devmentor-db`), fałszywy Stripe `tests/e2e/fake-stripe-server.mjs`. Konta: mentorzy z zaproszeń tworzeni przez skrypt (A i B), deweloper „Kuba”. Viewport 390×844, `pl-PL`, Europe/Warsaw. 2026-11-10, 07:33–10:28 i 16:10–17:13. |
| Sprawdzenie | Bramka: `npm run lint`, `tsc --noEmit`, `typecheck:ui`, `check:tokens`, `size`, `npm test`, `npm run build`, `npm run test:e2e` (cały zestaw). Ręcznie: `lekcja-21/qa/manual-check.e2e.mjs` (Playwright, dwa konta mentorów, prawdziwa ścieżka: płatność → akceptacja → wiadomości obu stron → zadanie rozliczenia → onboarding → zadanie wypłat). |
| Oczekiwane zachowanie | Przed płatnością brak wzmianki o wypłatach, `/mentor/payouts` przekierowuje na `/mentor`. Po płatności prośba na górze `/mentor`. Porzucony onboarding: komunikat „nie jest dokończona”, pieniądze `held_for_payout`, brak wywołań transferu. Mentor B nie widzi ani nie zmienia konta A. Po onboardingu „Wypłaty gotowe”, zadanie przelewa 135 zł raz; drugie uruchomienie nic nie robi. |
| Rzeczywisty wynik i miejsce dowodu | Lint 0 błędów i 0 ostrzeżeń; `npm test` 792/792; build OK; e2e 97/97; ręczne sprawdzenie 21/21 kroków OK (`qa/manual-check-result.json`, zrzuty `qa/01…10-*.png`, log `qa/manual-check-run.txt`). Uwagi recenzentów i werdykty: `run-log.md`, surowe odpowiedzi `reviews/*-claude.json`, `reviews/*-codex.json`. |
| Czego to nie dowodzi | Nie dowodzi zachowania prawdziwego Stripe (Connect, transfery, `account.updated` w trybie testowym — tylko fałszywy serwer). Nie sprawdza paginacji `transfers.list` (fałszywy serwer jej nie ma) ani dwóch przypadków z spec: zapytanie wstawiane w trakcie onboardingu i brak konfiguracji płatności (zapisane jako znane luki w spec). Testy Storybook w przeglądarce nie uruchamiają się lokalnie (port wykluczony przez Windows), dowodem będzie job CI `storybook`. Nie ma ręcznego werdyktu człowieka z telefonu — zrzuty z Playwright przy 390 px. |
| Decyzja i osoba | Do scalenia po zielonym CI (zgoda Krzysztofa Marczaka z 2026-11-09 na scalanie w ramach kursu). Orkiestrator: Claude (Opus 5.5). |

## Porównanie z E02 (L11)

Zastrzeżenie: to różne zadania. E02 to płatność kartą, zwroty i webhook, a E04-S01 to wypłaty. Liczby pokazują rząd wielkości, nie dowodzą przewagi.

| | E02 (L11, pojedynczy agenci) | E04-S01 (L21, flow wielomodelowy) |
|---|---|---|
| Rozmiar | 2 PR: #40 +6095/−233 (82 pliki) i #46 +2529/−27 (72 pliki) | 1 zmiana: +3578/−91 (39 plików) |
| Czas maszynowy | ok. 4 h 10 min (#40 15:11–18:30, #46 równolegle 17:15–19:20) | ok. 4 h (07:33–10:28 i 16:10–17:13; pauza na prośbę Krzysztofa nie liczona) |
| Czas Krzysztofa | uruchomienie, przegląd, scalenie (bez pomiaru) | ok. 10 min: instalacja skilli, pauza i wznowienie. Przegląd PR jeszcze przed nim |
| Specyfikacja | osobno w L05 | w tym samym przebiegu, 3 rundy recenzji przez 2 rodziny modeli (ok. 22 min) |
| Recenzje kodu | 1 runda Codex na PR | 3 rundy, Codex + Claude na świeżym kontekście |
| Uwagi | bez zestawienia | spec: Codex 7 (7 trafnych), Claude 26 (25 trafnych, 1 duplikat); kod: Codex 6 (6 trafnych, jedna z obniżoną wagą), Claude 33 (30 trafnych, 2 duplikaty, 1 halucynacja) |
| Koszt | subskrypcje, bez pomiaru tokenów | subskrypcje (ChatGPT dla Codex, Claude), więc dodatkowy koszt w dolarach praktycznie zero. Tokeny: implementer Codex ok. 1,48 mln (17 pakietów; pakiet 4 przerwany pauzą, bez pomiaru), recenzenci Codex 0,57 mln, recenzenci Claude ok. 1,02 mln, orkiestrator ok. 0,40 mln w pierwszej części + sesja główna (bez pomiaru) |

Skład modeli (2026-11-10): orkiestrator Claude Opus 5.5; implementer Codex CLI 0.162.1 (`codex exec --sandbox workspace-write`, model zgłoszony przez CLI: gpt-6-luna; w `.ai/agentic.config.json` wpisany `gpt-5.6-sol`, ale runtime harnessu na natywnym Windows nie działa, więc CLI użyło swojego domyślnego modelu); recenzent OpenAI: ten sam Codex w trybie `read-only`; recenzent Anthropic: świeży subagent Claude Opus 5.5 (planowany `claude -p` nie był zalogowany).

## Co z tego wynika

- Dwie rodziny modeli znajdowały różne rzeczy. Codex zgłaszał mało uwag, ale wszystkie trafne (m.in. e2e ustawiające `held` przez SQL, które ukrywało, że scenariusz nie przechodzi prawdziwej ścieżki). Claude zgłaszał szerzej (API Stripe, zgodność ze spec, czego testy nie dowodzą) i raz się pomylił.
- Liczba uwag nie spadła do zera w rundzie 3 (11 uwag, w tym 2 realne problemy bezpieczeństwa pieniędzy). Trzy rundy to minimum dla kodu pieniędzy, a nie zapas.
- Implementer najlepiej działał na wąskich pakietach (jeden plik, 4–9 testów). Duże pakiety Codex sam przerywał jako niekompletne.
- Pułapka Windows: Codex dwa razy edytował pliki przez PowerShell i zepsuł kodowanie polskich znaków. Po każdym pakiecie potrzebna jest kontrola krzaków, a w poleceniu wymóg `apply_patch`.
- Orkiestrator poprawił sam trzy rzeczy: kodowanie po pakietach 6b i 8a oraz kolejność kroków w teście e2e. Wszystko jest opisane w `run-log.md`.
