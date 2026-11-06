# Architectural Review: Mentor i deweloper prowadzą sesję jako czat tekstowy na żywo w zarezerwowanym terminie

**Werdykt: revise.** Kierunek pasuje do D02, R02, R04, R15 i N01, ale kontrakt współbieżności nie gwarantuje poprawnego kursora, a granica między autoryzacją tokenem, odczytem treści i retencją po sesji wymaga doprecyzowania. Te kwestie wpływają też na rozliczenie opisane w specyfikacji no-show.

## Decision needed

- Czy treść czatu ma pozostać dostępna po wygaśnięciu `/r/{token}`? Specyfikacja chat uzależnia dostęp dewelopera od ważności linku (30 dni po sesji), a specyfikacja settlement zakłada dostęp do wyniku i czatu na tej stronie; brief pozostawia właściciela zasad prywatności i retencji otwarte w Q04.
- Kto jest właścicielem treści sesji, okresu jej przechowywania i obsługi próśb o usunięcie? To decyzja produktowo-prawna wymagana przez Q04, szczególnie wobec R04 i A08.

## Findings

- **Critical: Blokada wiersza requestu nie gwarantuje kolejności `seq` zgodnej z commitami.** Spec używa kolumny `bigint identity` i blokady requestu, ale sekwencje PostgreSQL przydzielane są poza transakcją i nie są cofane ani porządkowane według commitów; dwa inserty mogą uzyskać numery w innej kolejności niż zatwierdzenia. Klient pobierający `seq > after` może wtedy pominąć wiadomość, a settlement może ją zobaczyć w odmiennym porządku → przydzielaj sekwencję pod tą samą blokadą, np. przez licznik per request aktualizowany transakcyjnie, albo oprzyj kursor na gwarantowanym porządku i opisz jego współbieżność.

- **High: Specyfikacja settlement nie respektuje zamierzonej kolejności blokad w wyścigu post–settlement.** Chat opisuje, że settlement czeka na post, a post po blokadzie settlementu odczyta stan i zostanie odrzucony. Jednak settlement używa `FOR UPDATE SKIP LOCKED`, więc wiersz z aktywnym postem ma zostać pominięty, a nie blokować; dodatkowo spec chat nie definiuje kolejności blokowania względem zmiany statusu. To zagraża regule R15, gdy obie operacje ścigają się → uzgodnij jeden protokół blokowania w obu specyfikacjach i określ zachowanie testami integracyjnymi dla obu kolejności.

- **High: Odczyt po stronie dewelopera nie ma wystarczająco precyzyjnego kontraktu autoryzacji dla prywatnej treści.** Spec wymaga tokenu w nagłówku i 404 dla nieuprawnionych, co wspiera R04, ale nie określa limitu prób, limitu rozmiaru odpowiedzi, ochrony przed powtarzanym odpytywaniem ani wykluczenia nagłówka z logów i telemetrii. Token jest jedynym poświadczeniem dostępu do treści. E02 wiąże dostęp z hashem tokenu i terminem 30 dni po `slot_end` (`lib/requests/view.mjs`), a BACKWARD_COMPATIBILITY.md wymaga stabilności kontraktów API → dopisz reguły redakcji tokenu, rate limiting oraz maksymalną stronę odpowiedzi także przy dużym `hasMore`; zapewnij, że dostęp do listy i czatu korzysta z tego samego sprawdzenia tokenu i ważności.

- **High: Retencja wiadomości nie ma reguły zgodnej z okresem życia requestu.** Migracja ustawia `ON DELETE RESTRICT`, a deweloper traci dostęp po 30 dniach, lecz spec nie określa, co dzieje się z samą treścią ani z requestami usuwanymi w ramach operacji prywatności. R04 zakazuje udostępniania poza stronami, ale nie rozstrzyga retencji; Q04 pozostaje otwarte → zdefiniuj retencję i usuwanie/anonimizację przed wdrożeniem migracji, łącznie z wpływem na request i wymagane dowody R15.

- **High: Walidacja `Origin` z `APP_BASE_URL` może być zawodna przy proxy i środowiskach wdrożeniowych.** Spec wymaga dokładnej zgodności nagłówka `Origin` z konfiguracją, ale nie opisuje zachowania przy braku `Origin`, wielu hostach ani zaufanym reverse proxy; błędna konfiguracja może odrzucać prawidłowe posty albo dopuścić niepożądany origin. `proxy.ts` nie obejmuje nowych `/api` tras, więc ochrona spoczywa na handlerach → zdefiniuj kanoniczne źródło origin dla produkcji i lokalnego środowiska, zachowanie przy braku nagłówka oraz testy żądań cross-site dla obu endpointów.

- **Medium: Limit 500 wiadomości nie jest atomowo egzekwowany samą blokadą requestu, jeśli istnieją inne ścieżki zapisu.** Spec mówi, że wszystkie wiadomości przechodzą przez `postSessionMessage`, lecz nie ustanawia tego jako niezmiennika bazy ani nie wskazuje testu konkurencyjnych prób przy limicie. Dwa równoległe inserty mogą przekroczyć limit, jeśli któraś ścieżka ominie wspólny lock → wykonuj sprawdzenie i insert w jednej transakcji pod wspólną blokadą oraz dodaj test graniczny z równoległymi postami; rozważ ograniczenie insertów do jednego modułu/roli bazy.

- **Medium: Spec nie definiuje stabilnego zachowania paginacji przy równoczesnym dopisywaniu wiadomości.** `GET` zwraca do 200 elementów z `hasMore`, ale nie określa, czy `after` odnosi się do ostatniej zwróconej wiadomości ani jak UI pobiera kolejne strony, zanim wznowi polling. Wraz z wymaganiem braku pominięć może dojść do luk lub powtórek → określ niezmienny kursor, kolejność, deduplikację i algorytm dociągania stron; uwzględnij przypadek ponad 200 wiadomości.

- **Medium: Powiązanie autora z osobą i nazwą wyświetlaną nie jest ustalone jako migawkowe.** Model przechowuje jedynie rolę `mentor`/`mentee`, a kontrakt zwraca `authorName`; spec nie mówi, czy nazwa jest pobierana z aktualnego profilu, czy zapisana przy wiadomości. To może zmienić kontekst historycznej rozmowy lub wyświetlić dane spoza uzgodnionego zakresu R04 → zdefiniuj źródło nazwy i minimalny zakres danych; nie zapisuj adresu e-mail ani dodatkowych danych osobowych w treści wiadomości.

- **Medium: Testowalność wymaganych czasów i barier bezpieczeństwa jest opisana zbyt ogólnie.** Są scenariusze brzegowe, lecz implementacja planu nie wylicza testów dla czasu DB przy granicy `[slot_start, slot_end)`, odczytu obcej sesji, wygasłego tokenu, origin/CSRF, limitów i równoległych insertów. Wzorce E02 używają transakcji, warunkowych przejść stanu i testów bazodanowych → dopisz konkretne testy DB/API oraz testy integracyjne współbieżności przed uznaniem specyfikacji za gotową.

- **Low: Deklaracja o czasie zapisu jako dowodzie no-show jest nieprecyzyjna.** `created_at DEFAULT now()` w PostgreSQL oznacza czas rozpoczęcia transakcji, nie czas inserta ani commit. Przy długiej transakcji post rozpoczęty przed końcem slotu może zostać zatwierdzony po nim, a czas nadal wygląda na wcześniejszy → nazwij i ustal semantykę znacznika czasu z settlement (czas transakcji, statement lub commit) oraz przetestuj przypadek opóźnionego commitu; nie przedstawiaj go jako dowodu dokładnego czasu doręczenia.

## Review limits

- Przejrzano brief, obie specyfikacje z 2026-10-30, specyfikacje E02 dotyczące żądania, akceptacji i płatności/zwrotów oraz wskazane moduły aplikacji i bazy.
- Nie weryfikowano działania aplikacji ani migracji w uruchomionej bazie.
