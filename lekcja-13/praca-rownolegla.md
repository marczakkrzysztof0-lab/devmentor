# Lekcja 13 — praca równoległa: klasyfikacja backlogu, automatyzacja, podsumowanie

Data: 2026-10-27. Zadanie domowe lekcji 13 na DevMentorze.

## 1. Backlog z typem pracy (14 zadań)

Dwa pytania do każdego zadania: czy jest rozłączne i czy da się je sprawdzić bez mojej uwagi (CI, testy). Typ jest etykietą `praca: …` na zgłoszeniu w GitHubie.

| Zgłoszenie | Zadanie | Typ | Dlaczego |
|---|---|---|---|
| #37 | Zamknąć zrealizowane zgłoszenia E01 | równolegle | utrzymanie, nic się nie merguje |
| #38 | Uwagi minor z review PR #5 | równolegle | mały diff, weryfikuje CI |
| #26, #27, #28 | Research E06 (plany zbierania danych) | równolegle | wynik to dokument, czyta się szybko; same rozmowy z ludźmi i tak robi człowiek |
| #24 | Stripe: płatność, zwrot, webhook | sekwencyjnie | ścieżka krytyczna — reszta E02/E03 na nim stoi |
| #17 | Zapytanie opłacone z góry | sekwencyjnie | zależy od #24, ten sam model danych |
| #18, #19 | Akceptacja/odrzucenie, anulowanie | sekwencyjnie | dwa zadania na tym samym module (`requests` + `payments`) — idą jedno po drugim |
| #21 | Pieniądze przy niestawiennictwie | sekwencyjnie | zależy od #20 i #24 |
| #20 | Sesja na czacie tekstowym | 2–3 naraz | osobny moduł; najpierw specyfikacja |
| #25 | Onboarding wypłat Stripe | 2–3 naraz | rozłączny moduł (Connect); najpierw specyfikacja i Q01/Q05 |
| #22 | Wypłata dla mentora | interaktywnie | otwarte pytania H6/H8, decyzje produktowe |
| #39 | Usunięcie nieużywanych skilli `om-*` | interaktywnie | decyzja właściciela, potem mechaniczny PR |

Rozkład: 6 równolegle, 6 sekwencyjnie, 2 po 2–3 naraz, 2 interaktywnie. Wniosek: E02–E03 to w większości jedna ścieżka krytyczna, więc dokładanie agentów do ficzerów nie przyspieszy projektu; zrównoleglać opłaca się utrzymanie i research.

Praktyka z tego samego dnia: L11 (E02 cz. 1, #24 + #17) i L12 (testy integracyjne) szły równolegle w osobnych worktree, a ja w tym czasie robiłem tę lekcję — WIP = 2 agentów + 1 strumień interaktywny. Część druga E02 (#18, #19) czeka na scalenie części pierwszej, zgodnie z tabelą.

## 2. Narzędzie (Cezar albo alternatywa)

Nie uruchomiony. Blokady:

- Cezar działa na Linuksie, macOS i WSL2; ten komputer to Windows bez skonfigurowanego WSL2 (ten sam problem co z sandboksem w lekcji 09).
- `npx cezar-cli` uruchamia kod z npm, a agenci w worktree dostają pełny dostęp do powłoki (Codex w trybie auto: `danger-full-access`) — według zasad z lekcji 09 najpierw trzeba przeczytać kod i odpalić to w izolacji (WSL2/VM), nie na komputerze z dostępem do poczty i Slacka firmy.
- Do decyzji w WLC: zgoda na narzędzie i na pracę agentów 24/7 (VPS albo maszyna zespołu), kto naciska „merge”.

Zamiast tego: kolejka i limit WIP przez to, czego już używam — zgłoszenia GitHub z etykietami SDLC (`in-progress`, `review`, `merge-queue`), skille `om-auto-*` w osobnych worktree, zaplanowane zadania Claude (jednorazowe przebiegi o ustalonej godzinie) i GitHub Actions jako nocna zmiana.

## 3. Automatyzacja: „Nocna zmiana”

`.github/workflows/nightly-maintenance.yml` — codziennie 01:30 UTC (i ręcznie: `workflow_dispatch`):

1. `npm audit --json` + `npm outdated --json`,
2. `scripts/nightly-report.mjs` buduje raport (podsumowanie przebiegu w Actions) i utrzymuje **jedno** zgłoszenie „Nocna zmiana: podatności w zależnościach” z etykietą `dependencies`: zakłada je albo dopisuje komentarz, gdy są podatności moderate+, zamyka, gdy znikną,
3. zgłoszenie podejmuje rano agent: `/om-auto-fix-issue <nr>` (check → wynik do agenta, nie powiadomienie do mnie).

Wyniki: zakładka Actions → „Nocna zmiana” (podsumowanie przebiegu) i zgłoszenie z etykietą `dependencies`. Testy logiki: `tests/nightly-report.test.mjs`.

## 4. Jak pracuję dziś i co chcę zmienić (szkic — do potwierdzenia przez Krzysztofa)

Dziś: jedna długa sesja na lekcję (do ~950 tys. tokenów), w której jestem koordynatorem, a cięższe kroki zlecam subagentom; po każdej fazie zatrzymanie i mój przegląd. Review innym modelem (Codex) wywołuję ręcznie. Powiadomienia (Slack, poczta) obsługuję na bieżąco obok pracy z agentami.

Co zmienić:

1. Jeden blok dziennie na odbiór kolejki PR-ów i zgłoszeń z `review`/`needs you`, zamiast reagowania na każde zakończenie agenta.
2. Utrzymanie i research zlecać wieczorem (zaplanowane zadania, nocna zmiana), ficzery tylko od gotowej specyfikacji i najwyżej dwa naraz.
3. Mierzyć czas od zgłoszenia do scalenia i liczbę PR-ów, które wróciły po review — nie liczbę agentów.
