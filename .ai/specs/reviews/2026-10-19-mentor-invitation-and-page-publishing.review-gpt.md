# Architectural Review: Mentor invitation, sign-in and page publishing

**Werdykt: resolve a direction call first.** Spec jest spójna z modelem pilota i podziałem na #14–#16, ale trzy oznaczone jako wymagające potwierdzenia decyzje dotyczące uwierzytelniania, waluty i wymaganych cen wpływają na architekturę lub zakres. Przed wdrożeniem właściciel powinien je zatwierdzić albo zmienić projekt.

## Decision needed

- **Q1 — logowanie:** zatwierdzić sesje bez hasła i ręcznie wysyłane przez założyciela linki logowania, czy wybrać inną metodę? To określa model dostępu i odzyskiwania konta.
- **Q2–Q3 — waluta i ceny:** potwierdzić PLN oraz obowiązek podania obu cen przed publikacją. Brief pozostawia walutę otwartą, a zależne specyfikacje zakładają oba warianty długości; decyzje te trafiają do schematu i ograniczeń publikacji.

## Findings

- **High: link logowania nie ma określonego bezpiecznego sposobu realizacji.** Spec opisuje `redeemSignInLink(token)`, ale nie mówi, czy kliknięcie w `/sign-in/[token]` najpierw wyświetla stronę potwierdzenia, czy od razu zużywa token. W przeciwieństwie do zaproszeń, których obsługa jawnie nie może zużywać tokenu przez `GET`, brak tej reguły grozi unieważnieniem linku przez skaner poczty. Opisz potwierdzenie i zużycie tokenu wyłącznie w akcji użytkownika; aktualizację `used_at` wykonaj atomowo tak, by równoczesne żądania nie mogły utworzyć wielu sesji.

- **Medium: wygenerowany slug może ujawniać fragment adresu e-mail.** Q6 proponuje slug z lokalnej części adresu, np. `anna-k`, a spec przeznacza go do publicznego URL i przewiduje jego niezmienność po publikacji. To może ujawnić dane lub prywatny identyfikator, którego mentor nie chciał publikować. Generuj neutralny slug albo wymagaj, by mentor wybrał go przed publikacją; nie używaj adresu e-mail jako domyślnej publicznej nazwy.

- **Medium: kryterium 20 minut zamienia prowizoryczny cel w twardą bramkę QA.** D08 nazywa cel prowizorycznym, ale UI/UX mówi, że przekroczenie czasu „fails QA (blocking)”, a wyjątek pozostawia właścicielowi na PR. To przenosi decyzję produktową do procesu QA i może blokować wydanie na podstawie niezweryfikowanego celu. Traktuj pomiar jako obserwację pilota albo jawnie uzgodnij próg oraz zasady wyjątku przed użyciem go jako kryterium blokującego.

- **Low: część specyfikacji nadmiernie uszczegóławia implementację i testy.** Opis każdego pola, komunikatu, testu migracji oraz szczegółów transakcji powtarza się między rozwiązaniem, UX, scenariuszami błędów i planem. To utrudnia odróżnienie wymagań od propozycji implementacyjnych, a te ostatnie mogą się zestarzeć. Zachowaj nietypowe wymagania produktu i granice bezpieczeństwa, a powtarzające się szczegóły przenieś do jednego miejsca albo skróć.

Historie użytkowników dobrze odróżniają zaproszonego mentora, powracającego użytkownika i osobę bez dostępu; zawierają cel i rezultat, więc pomagają uniknąć projektu jako płaskiego CRUD-a. Historia publikacji mogłaby wyraźniej pokazać, co mentor widzi po zapisaniu wersji roboczej i po nieudanej publikacji, ale spec opisuje zachowanie formularza i błędy w UX.

## Review limits

Sprawdzono spec, lokalny skill `om-spec-writing`, `SDLC.md`, `BACKWARD_COMPATIBILITY.md`, `package.json`, brief produktu, decyzje D03/D08/D09, specyfikację schematu, dostępności i strony publicznej oraz obecny szkielet `app/`, `lib/`, `scripts/` i `tests/`. Repo nie zawiera jeszcze implementacji bazy ani uwierzytelniania, więc ocena architektury opiera się na kontraktach i zależnych specyfikacjach; nie weryfikowano działania kodu.