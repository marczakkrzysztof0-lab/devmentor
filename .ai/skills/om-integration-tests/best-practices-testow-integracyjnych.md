# Dobre praktyki scenariuszy testów integracyjnych (DevMentor)

Źródło: materiały kursu AI Tech Leaders, lekcja 12 („Best practices pisania scenariuszy testów integracyjnych”). Poniżej streszczenie własnymi słowami, dopasowane do DevMentora.

1. **Zachowanie, nie implementacja.** Sprawdzamy rezultat widoczny dla użytkownika lub innego systemu (np. status zapytania „Opłacone”), a nie to, że funkcja została wywołana N razy — inaczej test pęka przy poprawnym refaktoringu.
2. **Jeden scenariusz = jeden przypadek biznesowy.** Płatność, anulowanie i zwrot to trzy scenariusze, nie jeden.
3. **Given–When–Then.** Każdy scenariusz zapisany jako stan początkowy, akcja, oczekiwany rezultat.
4. **Determinizm.** Bez losowych danych bez ziarna, bez zależności od „teraz” (zegar wstrzyknięty/ustawiony), bez współdzielonych danych, bez `wait(5000)` (czekamy na konkretny stan), bez zależności od kolejności testów i od niestabilnych usług zewnętrznych.
5. **Niezależność.** Test sam tworzy dane, wykonuje scenariusz, weryfikuje i sprząta (u nas: jednorazowy schemat `dm_migtest_*`).
6. **Dane przygotowane najkrótszą drogą.** Seed przez warstwę danych/CLI, a przez UI przechodzimy tylko testowany fragment — chyba że celem jest cała ścieżka.
7. **Weryfikacja na właściwym poziomie.** UI, odpowiedź HTTP, wiersz w bazie, zdarzenie, wywołanie integracji — tylko to, co potwierdza dany scenariusz.
8. **Integracje zewnętrzne pod kontrolą.** Stripe/poczta przez fake adapter lub tryb testowy; test sprawdza treść wysłanego żądania (kwota, waluta, identyfikator). Własnych współpracujących komponentów nie mockujemy.
9. **Ścieżki negatywne i graniczne.** Złe dane, brak uprawnień, brak zasobu, konflikt/powtórzenie, timeout i błąd integracji, wartości graniczne.
10. **Idempotencja.** Powtórzony webhook/żądanie nie zmienia wyniku drugi raz.
11. **Stabilne selektory.** Kolejność: rola + dostępna nazwa → etykieta → widoczny tekst → `data-testid`. Nigdy selektory strukturalne CSS.
12. **Konkretne asercje.** Dokładny status, kwota, waluta, komunikat — nie „odpowiedź OK”.
13. **Helpery nie ukrywają kroków.** Małe funkcje o jednej odpowiedzialności; z treści testu ma być widać, co zrobił użytkownik.
14. **Nazwa = akcja + warunek + rezultat.** Np. „odrzuca webhook, gdy podpis jest niepoprawny”.
15. **Przegląd człowieka.** AI pisze szkic; oczekiwany wynik musi wynikać ze specyfikacji, nie z przypuszczenia modelu. Scenariusz w Markdownie ma być czytelny dla QA.
