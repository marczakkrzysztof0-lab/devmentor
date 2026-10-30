# Architectural Review: When someone does not show, money goes where the rules say, automatically

**Werdykt: revise.** Reguła rozliczania jest zgodna z R15 i D11, a proponowane blokowanie wiersza dobrze adresuje wyścig z czatem. Przed implementacją trzeba jednak usunąć rozbieżność dostępu do treści czatu oraz doprecyzować obsługę niepowodzenia zwrotu i granice endpointu zadań.

## Decision needed

- Potwierdzić oznaczone w specyfikacji wybory produktowe: co liczy się jako wiadomość, brak okresu karencji, odbiorcy e-maili, brak nowej akcji anulowania po akceptacji oraz brak sporu w aplikacji.
- Potwierdzić, że dostęp dewelopera do czatu kończy się 30 dni po terminie, podczas gdy mentor zachowuje dostęp przez cały czas widoczności zapytania. Specyfikacja czatu wskazuje ten okres jako założenie oczekujące na potwierdzenie.

## Findings

- **High: Rozbieżny czas dostępu do historii czatu.** Specyfikacja czatu przewiduje dostęp dewelopera do `/r/{token}` przez 30 dni po terminie, a mentora do czasu, gdy zapytanie jest widoczne; tutaj wynik rozliczenia i status zwrotu mają być widoczne na tych samych stronach, bez określenia, jak długo. Źródło: `2026-10-30-live-text-session-chat.md` Q3 i kontrakt tokenu #17 → strony mogą po czasie pokazywać różne informacje o tej samej sesji, a dłuższy dostęp mentora do jej treści nie ma uzasadnionej granicy retencji → określić wspólną politykę retencji i zachowania stron po wygaśnięciu tokenu, zgodną z R04.

- **High: Brak rozstrzygniętej ścieżki dla zwrotu, który po 24 godzinach przechodzi w `failed`.** Specyfikacja opisuje automatyczne zlecenie pełnego zwrotu, a następnie komunikat „skontaktujemy się”, lecz jednocześnie pozostawia obsługę ręczną i właściciela operacyjnego w Q05. Źródło: `2026-10-19-stripe-card-payment-refund-and-webhook.md` Q10 oraz brief Q05/D12 → dla R09 ścieżka kończy się bez gwarancji wykonania zwrotu ani określonej odpowiedzialności → opisać stan końcowy, widok dla dewelopera i przekazanie do ręcznej obsługi; nie przedstawiać `failed` jako spełnienia automatycznego zwrotu.

- **Medium: Kontrakt i testy nie wiążą jednoznacznie endpointu zadań z autoryzacją istniejącej trasy.** Nowe zadanie ma zostać dodane do rejestru i korzystać z endpointu #24, ale plan testów wymienia wywołanie „jobs endpoint” bez testu autoryzacji dla tego zadania ani potwierdzenia, że nie powstaje osobna, słabiej chroniona trasa. Źródło: spec #24, `app/api/internal/jobs/route.ts`, `lib/jobs/registry.mjs` → błędna integracja mogłaby udostępnić rozliczanie bez wymaganej ochrony `Bearer CRON_SECRET` → wskazać wyłącznie istniejący endpoint i dodać test, że uruchomienie zadania przechodzi przez jego obecne sprawdzenie autoryzacji.

- **Medium: Nieokreślone zachowanie przy częściowej awarii w obrębie przebiegu zadania.** Każda sesja ma osobną transakcję, a refund i e-mail są zapisywane z wynikiem; spec nie rozstrzyga, czy błąd bazy lub outboxu dla jednej sesji kończy cały przebieg, czy pozwala rozliczać następne. Źródło: kontrakt `settleEnded` i plan testów → pojedynczy błąd może opóźnić zwroty pozostałych zakończonych sesji albo zostać pominięty w wyniku i monitoringu → zdefiniować izolację błędów per sesja, liczniki/błędy raportowane przez zadanie i test awarii po wcześniejszym poprawnym rozliczeniu.

- **Low: Status `session_ended` nie ma przypisanego warunku integralności danych.** Migracja wymusza `settled_at` dla trzech statusów końcowych, ale kontrakt stron dodaje `session_ended` jako widok zaakceptowanego zapytania po terminie; nie mówi, czy to wyłącznie stan wyliczany, ani jak traktować `accepted` z niepustym `settled_at`. Źródło: sekcje Data Model, API Contracts i `lib/requests/view.mjs` → błędna kombinacja statusu i znacznika może pokazać niespójny wynik rozliczenia → jawnie określić, że `session_ended` jest wyłącznie stanem pochodnym i zachować invariant `settled_at IS NULL` dla `accepted`.

## Review limits

Przegląd obejmował wskazane specyfikacje, brief, istniejące moduły płatności, żądań i zadań, migracje oraz trasy `/r`, `/mentor` i endpoint zadań. Nowe moduły czatu i rozliczeń są opisane jako przyszłe, więc ich faktycznych zapytań SQL, konfiguracji wdrożenia i testów nie dało się zweryfikować.
