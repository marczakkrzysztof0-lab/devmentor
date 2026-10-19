# Przegląd architektoniczny: Developer cancels for a full refund until the mentor accepts

**Werdykt: revise.** Główna reguła anulowania odbiega od aktywnej decyzji D05, a opis zachowania po rozpoczęciu terminu jest niespójny z kontraktem anulowania.

## Ustalenie potrzebnej decyzji

Brak. D05 rozstrzyga, że deweloper może anulować z pełnym zwrotem aż do akceptacji mentora.

## Ustalenia

- **High: Anulowanie jest błędnie ograniczone do czasu przed rozpoczęciem terminu.** D05 dopuszcza anulowanie do chwili akceptacji; spec ukrywa przycisk po `slot_start` i zwraca `lapsed` dla oczekującego zgłoszenia po tej chwili. Skutek: deweloper traci możliwość anulowania w okresie między rozpoczęciem terminu a uruchomieniem zadania `lapseOverdue`, mimo że mentor jeszcze nie zaakceptował. Usuń warunek `slot_start > now()` z anulowania i przycisku, albo uzgodnij z właścicielem decyzji zmianę D05; jasno określ wyścig anulowania z lapse i wspólną idempotentną obsługę zwrotu.

- **Medium: Opis wyniku wyścigu z lapse nie zgadza się z kontraktem.** Warunkowy `UPDATE` w proponowanym rozwiązaniu nie zwraca `lapsed`, jeśli zadanie już zmieniło status; zwróci zero wierszy, a późniejsze ponowne odczytanie może wykazać `lapsed`. Kontrakt wymienia `lapsed`, lecz nie wyjaśnia, czy jest to odmowa, czy informacja o istniejącym zwrocie. Skutek: implementacja może pokazać błąd mimo już zleconego zwrotu. Zdefiniuj odpowiedź dla `lapsed` i wymagany stan strony tak, by pokazywała status zwrotu.

- **Low: Plan testów opisuje zbyt szczegółowy mechanizm synchronizacji.** Test ma odpytywać `pg_stat_activity` i czekać na konkretny `wait_event_type`. To wiąże test z detalem Postgresa, choć wymagane zachowanie można zweryfikować kontrolowanym blokowaniem transakcji i sprawdzeniem wyniku. Skutek: test jest kruchy i trudniejszy do uruchomienia w środowiskach z innymi uprawnieniami. Opisz warunek testu i oczekiwane wyniki, pozostawiając szczegół synchronizacji implementacji.

## Ograniczenia przeglądu

Przejrzano specyfikację, `AGENTS.md`, `CLAUDE.md`, `SDLC.md`, `BACKWARD_COMPATIBILITY.md`, `package.json`, brief produktu, D05 oraz powiązane specyfikacje #17, #18 i #24. W repozytorium nie ma jeszcze implementacji tej funkcji; nie oceniano działania kodu ani nie uruchamiano testów.