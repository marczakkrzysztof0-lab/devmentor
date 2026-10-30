# E03 — decyzje do przeglądu (⚠)

Data: 2026-10-30 (lekcja 11, autonomiczny run). Właściciel decyzji: Krzysztof Marczak.

Specyfikacje: `2026-10-30-live-text-session-chat.md` (#20, E03-S01) i `2026-10-30-no-show-settlement.md` (#21, E03-S02).
Każda pozycja poniżej to wybór, którego nie da się wyprowadzić z briefu (`product-brief.md`), D01–D12 ani specyfikacji
E01/E02. Implementacja jest zbudowana na rekomendacji; zmiana którejkolwiek to mała, lokalna poprawka (kolumna „Koszt
zmiany”). Do potwierdzenia: odpowiedź „Potwierdzam wszystkie ⚠ E03” albo numer + inna odpowiedź.

## Czat (#20)

| # | Pytanie | Rekomendacja (przyjęta) | Dlaczego | Koszt zmiany |
|---|---|---|---|---|
| C1 (Q1) | Jak „na żywo”? | Odpytywanie co 3 s (GET z kursorem), bez WebSocket/SSE | Działa na każdym hostingu Next.js, bez nowej zależności; ten sam rytm co odświeżanie płatności na `/r/{token}` | Średni: wymiana transportu za tym samym API |
| C2 (Q2) | Kiedy można pisać? | Tylko w terminie `[start, koniec)` wg zegara bazy; bez wcześniejszego wejścia i bez minut zapasu | Jedno okno dla pisania i dla reguły no-show (R15) — nie ma o co się spierać | Mały: stała |
| C3 (Q3) | Czy czat jest czytelny po sesji? (pytanie z #20) | Tak, tylko do odczytu, tylko dwie strony: deweloper póki link `/r/{token}` ważny (30 dni po terminie), mentor na stronie zapytania | Odpowiedź to to, za co deweloper zapłacił; R04 dotyczy osób trzecich | Mały |
| C4 (Q4) | Edycja / usuwanie wiadomości? | Nie — wiadomość jest ostateczna | Wiadomości są dowodem dla no-show (#21) | Średni (historia zmian) |
| C5 (Q5) | Format wiadomości | Zwykły tekst z zachowaniem wcięć (kod), bez Markdown, bez klikalnych linków, bez załączników; 1–4000 znaków | Najmniejsza bezpieczna powierzchnia; bez przechowywania plików | Średni |
| C6 (Q7) | Przypomnienie na start sesji? | Brak w tej specyfikacji | Najmniej nowej powierzchni; czy przypomnienia zmniejszają no-show — pytanie do pilota (A01) | Mały: nowy szablon + zadanie |
| C7 (Q10) | Jak długo trzymamy wiadomości? | W 1.0 razem z zapytaniem, bez automatycznego usuwania; prośby o usunięcie ręcznie do czasu Q04 | Q04 (właściciel prawny) otwarte; automatyczne usuwanie skasowałoby dowód przy ewentualnym sporze (Q05) | Mały–średni |
| C8 (Q11) | Limit zapytań na endpoint z tokenem? | Bez limitu per IP w 1.0 (token 256 bitów, odpowiedź ograniczona do 200 wiadomości) | Brak infrastruktury limitów w aplikacji; ryzyko to koszt, nie dostęp | Mały na poziomie hostingu |

## No-show (#21)

| # | Pytanie | Rekomendacja (przyjęta) | Dlaczego | Koszt zmiany |
|---|---|---|---|---|
| N1 (Q1) | Co to znaczy „napisał w czasie sesji”? | Co najmniej jedna zapisana wiadomość tej strony w terminie; dowolna treść, nawet „cześć” | Ocena treści wymaga człowieka, a nie ma właściciela sporów (Q05) | Mały: reguła w jednej funkcji |
| N2 (Q3) | Kiedy rozliczamy? | Zadanie `sessions.settleEnded` przy każdym wywołaniu zadań (co 5 min); bez okresu karencji po terminie | „Tego samego dnia” (R09) z zapasem; karencja przeczyłaby C2 | Mały: stała |
| N3 (Q4) | Kto dostaje e-mail? | Deweloper przy `mentor_no_show` (zwrot) i `mentee_no_show` (płatność zostaje u mentora); bez e-maila przy sesji odbytej; mentor nie dostaje e-maili (widzi wynik na liście) | Pieniądze dewelopera ruszają się w obu przypadkach no-show; mentor wie, czy pisał | Mały: szablon |
| N4 (Q5) | Czy mentor może odwołać zaakceptowaną sesję? | Nie ma nowej akcji — mentor, który nie może przyjść, po prostu nie pisze → automatyczny pełny zwrot | R11 zamyka anulowanie po akceptacji; R09/R15 już zwracają przy nieobecności mentora | Średni: nowa ścieżka pieniędzy |
| N5 (Q6) | Spory („mentor tylko się przywitał”) | Bez sporów w aplikacji; ręcznie w panelu Stripe (D12), wynik w aplikacji ostateczny | Brak właściciela sporów (Q05) | Duży: nowy przepływ |
| N6 (Q8) | Jak długo strony pokazują wynik i czat? | Jak C3/C7: deweloper 30 dni po terminie; mentor na liście 30 dni po rozliczeniu, potem tylko przez adres szczegółów | Jedna reguła dla czatu i wyniku | Mały |

## Ryzyka produktowe do świadomego przyjęcia

- **R15 „jedna wiadomość wystarczy”:** mentor, który napisze jedno słowo, zatrzymuje płatność, gdy deweloper się nie pojawi
  (to R15 zgodnie z D11). Eksport pilotażu (D10) może liczyć `mentee_no_show` na mentora.
- **Link `/r/{token}` = poświadczenie (D12):** kto ma przekazany link, pisze w czacie jako deweloper.
- **Zwrot, który ostatecznie się nie udaje (po 24 h):** obsługa ręczna przez założycieli; nazwany właściciel kolejki —
  nadal otwarte Q05.

## Nie wymaga decyzji (wynika z istniejących ustaleń)

Sesja = zaakceptowane zapytanie (kontrakt #18); czat na istniejących stronach `/r/{token}` i `/mentor/requests/{id}`;
komunikat „tylko tekst” na każdym ekranie sesji (R02, N01); reguła rozliczenia dokładnie wg R15 + D11; powód zwrotu
`mentor_no_show` był już w 0005; zwroty, ponowienia i zdrowie zadań z #24.
