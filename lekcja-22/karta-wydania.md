# Karta wydania 1.0.0 (lekcja 22)

Data: 2026-11-10. Release manager: Krzysztof Marczak (wykonanie: agent Claude Code). Poprzednia wersja: `v0.1.0` (900c844, tag założony wstecznie na ostatnim `main` sprzed wypłat). Wydanie: `v1.0.0` z `main` po scaleniu PR wydaniowego.

## 1. Zakres wydania

Repo jednoosobowe, więc kolejka jest mała. Przegląd zrobiony metodą `om-auto-manage-issues` / `om-merge-buddy` (odczyt Issues i PR przez `gh`, bez zmian etykiet).

| Co | Decyzja | Dlaczego |
|---|---|---|
| Otwarte PR | brak, nic do scalenia przed wydaniem | kolejka pusta po #61 |
| #61 E04-S01 wypłaty (#22, #25) | w 1.0 | jedyna zmiana od `v0.1.0`, CI 7/7 |
| #10 epik E03, #11 epik E04 | zamknięte przez PR wydaniowy | wszystkie ich historie (#20, #21 / #22, #25) zamknięte |
| #57, #58 bezpieczeństwo linków i sesji | poza 1.0, znane ograniczenia | czekają na decyzję właściciela, tryb pilotażowy |
| #59 404 → 500 pod `next start -H 127.0.0.1` | poza 1.0 | dotyczy tylko środowiska QA |
| #53 podatności moderate | poza 1.0 | `node-pg-migrate` → `glob` → `minimatch` (tylko CLI migracji na wzorcach z repo) i narzędzia dev; poprawka cofa `node-pg-migrate` do 7.6.1 (zmiana łamiąca) |
| #12 E06, #13 E07, #26–#28, #39 | poza 1.0 | pilotaż/badania/Later, nie kod wydania |

Zmiany łamiące: brak (migracja 0009 tylko dodaje kolumnę i tabele).

## 2. Dokumenty wydania

- `CHANGELOG.md`: wpisy 1.0.0 i 0.1.0 w formacie `om-auto-update-changelog` (sekcje z emoji, numer PR, autor po weryfikacji commitów: wszystkie commity od @marczakkrzysztof0-lab, agentów AI nie wymieniamy). Highlights napisane na podstawie PR, nie wymyślone.
- `UPGRADE_NOTES.md`: 0.1.0 → 1.0.0 (migracja, zmienna, Connect webhook, nowe zadanie i pola zdrowia), aktualizacja, wycofanie, ścieżka awaryjna.
- `BACKWARD_COMPATIBILITY.md`: kontrakt obowiązuje od 1.0, numeracja semver, nowa zasada „PR ze zmianą schematu/zmiennych dopisuje UPGRADE_NOTES”.
- `package.json`: 1.0.0.

## 3. QA przed wydaniem

| Sprawdzenie | Wynik |
|---|---|
| `npm run lint` | 0 błędów, 1 ostrzeżenie (istniejące, `tests/db/payouts-access.test.mjs:89`) |
| `npm test` z Postgresem | 792/792 |
| `npm run build` (v1.0.0 i v0.1.0) | OK / OK |
| CI na PR wydaniowym | patrz PR (build, date-guards, e2e, lint, storybook, test, tokens) |
| Próba aktualizacji i wycofania na osobnej bazie `devmentor_l22_rel` | OK, logi `proba-wydania.log`, `proba-wydania-2.log` |
| Smoke HTTP obu wersji | OK (tabela niżej) |

Ręczny przegląd UI wypłat zrobiony w L21 (21/21 przy 390 px, mentorzy A i B) i nie zmienił się od tamtej pory; 1.0 nie zmienia kodu aplikacji.

## 4. Próba aktualizacji, wycofania i odtworzenia z taga

Baza: osobna `devmentor_l22_rel` w kontenerze `devmentor-db`. Dane próbne: 1 mentor, 1 płatność `succeeded`, 1 zapytanie `held` (rozliczone, czyli należy się wypłata).

| Krok | Kod | Działanie | Wynik |
|---|---|---|---|
| 1 | `v0.1.0` | `db:migrate` na czystej bazie + dane | 0001–0008, dane 1/1/1 |
| 2 | `v1.0.0` | `db:migrate` | wykonano 0009; `refund_seen_at` i 2 tabele wypłat są; dane 1/1/1 |
| 3 | `v1.0.0` | wypłata z `attempts=1`, `db:rollback` | odmowa `0009 down: payout attempt may have moved money`, kod 1, schemat i wypłata nietknięte |
| 4 | `v0.1.0` | `db:migrate` na schemacie 0009 | „Brak migracji do wykonania”, kod 0 |
| 10 | `v0.1.0` | `next start` na schemacie 0009 z wypłatą | `/` 200, `/m/…` 404, `/mentor` 200, `/mentor/payouts` 404, 0 błędów w logu |
| 5 | `v1.0.0` | bez prób wypłat: `db:rollback` | cofnięto 0009; kolumna i tabele usunięte; dane 1/1/1 |
| 6 | `v0.1.0` | `db:migrate` | nic do zrobienia, 0001–0008 |
| 7 | `v0.1.0` | `build` + `next start` (odtworzenie z taga) | `/` 200, `/m/…` 404, `/mentor` 200, `/mentor/payouts` 404 |
| 8 | `v1.0.0` | `db:migrate` (powrót w przód) + `build` + `next start` | 0009 ponownie; `/` 200, `/m/…` 404, `/mentor` 200, `/mentor/payouts` 200 |

Wniosek: z `v1.0.0` da się wrócić do `v0.1.0` z taga na dwa sposoby, opisane w `UPGRADE_NOTES.md`: pełne wycofanie (kod 1.0 cofa 0009, potem kod 0.1.0), gdy nie było prób wypłat, albo samo cofnięcie kodu, gdy były (schemat 0009 zostaje, 0.1.0 go ignoruje). Migracja w dół nie pozwala zgubić danych wypłat.

Wpadka w samej próbie: przy pierwszym smoke 1.0 nie zatrzymał się serwer 0.1.0 na porcie 3022, więc `next start` 1.0 padł na `EADDRINUSE`, a curl trafił w starą wersję. Wykryte, bo `/mentor/payouts` dawał 404 tam, gdzie miał być 200. Powtórzone na porcie 3023. Lekcja do automatyzacji w L24: smoke ma sprawdzać wersję (np. nagłówek albo endpoint z numerem wersji), a nie tylko kody HTTP.

## 5. Wydanie

1. PR wydaniowy z „Fixes” (issue wydania, #10, #11), zielone CI, scalenie do `main`.
2. Tag `v1.0.0` (z adnotacją) na commicie scalenia, push tagów `v0.1.0` i `v1.0.0`.
3. GitHub Release `v1.0.0` z wpisem 1.0.0 z `CHANGELOG.md` i odnośnikiem do `UPGRADE_NOTES.md`; `v0.1.0` jako release historyczny (nie „latest”).
4. Odtworzenie poprzedniej wersji: `git checkout v0.1.0` → sprawdzone w krokach 6–7.

Na później (L24): akcja GitHub Actions do wydań, wdrożenie na serwer, smoke z numerem wersji.
