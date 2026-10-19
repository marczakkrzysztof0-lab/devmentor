# Architectural Review: Stripe card payment, refund operation and payment webhook

**Werdykt: revise.** Kierunek płatności przez Stripe pasuje do D04, a historie obejmują więcej niż CRUD: rozstrzygają wyścigi, retry i późne płatności. Spec nie definiuje jednak bezpiecznie granic transakcji dla refundów i webhooków, a część zachowań koliduje z kontraktami #17 i briefem produktu.

## Findings

- **Critical: blokada refundu nie obejmuje wywołania Stripe.** Spec proponuje `SELECT ... FOR UPDATE SKIP LOCKED`, a następnie wywołanie Stripe. Blokada w transakcji DB nie może bezpiecznie obejmować zewnętrznego wywołania, a commit zwalnia ją przed żądaniem; równoległy worker może więc wykonać drugi refund. **Doprecyzować** trwałe przejęcie pracy (np. claim z lease i atomowym zwiększeniem numeru próby), obsługę wygaśnięcia claimu oraz idempotency key stabilny dla ponawiania tej samej próby po timeoutach.

- **High: `refund_status = 'pending'` wyłącza retry, choć Stripe może pozostawić refund oczekujący.** Po mapowaniu odpowiedzi Stripe `pending` spec ustawia stan lokalny `pending`, ale worker wybiera tylko `requested`; jeśli nie nadejdzie `refund.updated`, refund utknie. **Dodać** reconciliację/polling dla refundów `pending` i określić, jak przechodzą do stanu końcowego.

- **High: polityka wygaśnięcia Checkout zakłada, że nie doszło do obciążenia.** #17 mówi, że porzucenie płatności nic nie kosztuje i zwalnia slot; tu sukces po lokalnym `expired` wymaga refundu, ale otwarty Checkout może zostać opłacony tuż przed wygaśnięciem albo webhook może przyjść po zwolnieniu terminu. **Opisać** atomowy porządek wygaśnięcia, synchronizację przed zwolnieniem slotu i deterministyczne zachowanie późnego sukcesu względem ponownej rezerwacji terminu.

- **High: `openCheckout` może wygasić płatność po błędzie, mimo że Stripe utworzył sesję.** Przy timeoutie odpowiedź Stripe może zaginąć; retry z tym samym kluczem może odzyskać istniejącą sesję, ale spec każe oznaczyć płatność jako `expired`, co uruchamia `payment.expired` i zwalnia slot. **Rozróżnić** błędy definitywne od niejednoznacznych; nie ustawiać stanu terminalnego, dopóki nie zostanie ustalone, czy sesja istnieje i czy można ją opłacić.

- **High: `syncCheckout(sessionId)` nie ma kontroli powiązania sesji z płatnością ani żądaniem.** #17 jawnie wymaga ignorowania `session_id` należącego do innej płatności, a API spec przyjmuje sam identyfikator sesji. **Wymagać** oczekiwanego `paymentId`/żądania z capability tokenu i sprawdzać zgodność sesji, kwoty, waluty oraz płatności przed przejściem stanu.

- **High: webhook nie określa atomowo przetwarzania zdarzeń refundowych.** Ledger deduplikuje `event_id`, lecz nie definiuje mapowania zdarzeń Stripe do konkretnej płatności/refundu, weryfikacji PaymentIntent/charge ani reguł przy współbieżnych `charge.refunded` i `refund.updated`. Spec także dopuszcza `charge.refunded` do finalizacji, gdy istnieje wiele refundów zewnętrznych. **Dodać** korelację i walidację kwoty/waluty oraz określić, które zdarzenie i stan są autorytatywne; odrzucać lub odkładać niejednoznaczne przypadki.

- **High: założenie o braku danych wrażliwych w logach jest sprzeczne z zapisem pełnego komunikatu błędu Stripe.** `refund_last_error` przechowuje „code + message”, a reguła logowania zabrania jedynie danych karty. **Zapisywać** ograniczony kod błędu i bezpieczny identyfikator żądania; nie utrwalać ani nie logować surowych komunikatów Stripe bez uzasadnienia i sanitacji.

- **Medium: historii „refund samego dnia” nie gwarantuje próg porażki po 24 godzinach.** D05 obiecuje automatyczny zwrot bez zgłoszenia, a spec po 24 godzinach przenosi refund do terminalnego `failed` bez dalszego retry. **Ustalić**, czy po 24 h wymagane jest alertowanie/operatorowy proces naprawy i ponownego uruchomienia, oraz jak użytkownik widzi nierozwiązany zwrot.

- **Medium: spójność konfiguracji walut pozostaje nieokreślona mimo decyzji w #14.** #14 ma otwarte pytanie o walutę, a spec domyślnie ustawia `PAYMENT_CURRENCIES=PLN` i deklaruje zgodność z #14. To może rozjechać walutę strony, kwotę i środowisko Stripe. **Wskazać** wspólny kontrakt konfiguracyjny i wymagać zgodności z walutą konkretnej strony/mentora przy tworzeniu płatności.

- **Medium: harmonogram `npm run jobs` i cronowy endpoint pozostawiają brakujący operational contract.** Endpoint jest wrażliwą powierzchnią, ale `CRON_SECRET` nie ma wymogu długości/entropii, rotacji ani limitu czasu; lokalny polling co 60 s miesza zadanie developerskie z produkcyjnym schedulerem. **Określić** bezpieczną walidację sekretu i timeout/limit wykonania; konkretny scheduler może pozostać wdrożeniowym wyborem.

- **Low: spec opisuje szczegóły implementacji więcej niż wymaga kontrakt.** Wiele testów enumeruje konkretne wewnętrzne wywołania, a `job_runs.last_result` i każda komenda `npm run jobs` tworzą dodatkową powierzchnię bez powiązania z potrzebą użytkownika. **Zostawić** kryteria testowe dla gwarancji pieniężnych i kontraktów, a pozostałe szczegóły przenieść do planu implementacji tylko tam, gdzie są niezbędne.

## Review limits

Przejrzano spec, AGENTS.md, CLAUDE.md, SDLC.md, BACKWARD_COMPATIBILITY.md, `package.json`, brief i decyzje D04/D05/D11 oraz specyfikacje #17 i #19. Kod płatności jeszcze nie istnieje; nie weryfikowano zachowania Stripe SDK ani wykonania testów.