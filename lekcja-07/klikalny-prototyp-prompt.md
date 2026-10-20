# Zadanie

Zbuduj klikalny prototyp przepływu z zatwierdzonej mapy ekranów. Prototyp
pokazuje, jak aplikacja będzie wyglądać i działać, zanim powstanie kod
produkcyjny. Korzystają z niego dwie strony: właściciel produktu albo klient,
który klika i komentuje, i developer, który buduje z niego prawdziwe ekrany.

# Materiały

- Mapa ekranów: lekcja-07/mapa-ekranow.md (zatwierdzona, z decyzjami L1–L21)
- Szary prototyp ze skilla om-mockup-prototype:
.ai/prototypes/discovery/mentor-onboarding/revision-001/index.html
i README.md z tego samego katalogu
- Design system: packages/ui (@devmentor/ui, @devmentor/ui/product; Storybook
w packages/ui/.storybook), plik dla agentów docs/design-system.md, AGENTS.md
- Brief i specyfikacje: .ai/specs/product-brief.md oraz specyfikacje Epiku 01:
.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md (#14),
.ai/specs/2026-10-19-mentor-weekly-availability-and-open-slots.md (#15),
.ai/specs/2026-10-19-public-mentor-share-page.md (#16); fundament danych #23:
.ai/specs/2026-10-19-data-store-and-first-schema-migration.md
- Silnik przeglądu (komentarze): lekcja-07/silnik-przegladu/
- Gdzie zapisać prototyp: prototypes/strona-mentora/ (kod źródłowy, commitowany)
- Jak ma działać podgląd: Storybook design systemu serwuje pliki statyczne
(staticDirs, np. packages/ui/.storybook/public). Zbuduj prototyp tak, żeby
otwierał się pod adresem /prototypes/strona-mentora/index.html, czyli wynik
budowania zapisz w packages/ui/.storybook/public/prototypes/strona-mentora/.
To wynik budowania, nie kod design systemu: nie commituj go (.gitignore).
- Zakres: ekrany s01–s07 z mapy ekranów, czyli Epik 01. Z szarego prototypu
weź tylko kroki zaproszenia, logowania, edytora, publikacji i dostępności oraz
zapisane tam reguły i założenia (zapytania, decyzje i wypłaty należą do E02/E04
i nie wchodzą do tego prototypu).

# Jak pracujesz

Przepływ, ekrany i założenia bierzesz z szarego prototypu i mapy ekranów,
wygląd z design systemu, a szczegóły zachowania ze specyfikacji.

Etapami od 0 do 3. Po każdym etapie pokaż, co zrobiłeś i co sprawdziłeś,
i poczekaj na moje „dalej”. Postęp zapisuj w POSTEP.md w katalogu prototypu,
żeby dało się wrócić w nowej sesji.

# Zasady, których nie wolno złamać

1. Ekrany składasz z komponentów i tokenów design systemu. Nie dodajesz
kolorów, odstępów ani nowych komponentów. Jeśli czegoś brakuje, zbuduj
najprostszą wersję z tokenów, oznacz ją w kodzie jako lukę i wpisz do
raportu.
2. Identyfikatory ekranów z mapy się nie zmieniają.
3. Dane są fikcyjne i biorą się z briefu: nazwy, ceny, terminy. Żadnych
wymyślonych liczb użytkowników, ocen ani opinii. Zegar demo ma stały „teraz”.
4. Nic nie udaje prawdziwej usługi. Płatność, e-mail i logowanie przez
zewnętrzny serwis to symulacje: napisz to na ekranie i nie zbieraj
prawdziwych danych kart ani haseł.
5. Kontrolki scenariuszy (wynik zewnętrznej usługi, błąd następnego żądania,
wygaśnięcie sesji, zmiana konta) są w pasku przeglądu, osobno od nawigacji
produktu.
6. Każdy przycisk coś robi albo ma dopisek, że w prototypie nie działa.
Żadnych martwych kliknięć.
7. Reguły z briefu i specyfikacji mają pierwszeństwo przed tym, co „zwykle
jest” w takich aplikacjach. Nie dodawaj funkcji spoza mapy (np. ocen,
katalogu, rozmów wideo) bez mojej zgody.
8. Nie zmieniaj kodu aplikacji ani design systemu i niczego nie usuwaj.
Prototyp żyje w swoim katalogu i nie jest importowany przez aplikację.

# Etap 0. Plan

Pokaż: technologię i sposób uruchomienia (np. React i Vite w katalogu
prototypu, z komponentami z pakietu design systemu), kolejność budowy ekranów,
listę kontrolek scenariuszy, konta demo, komponenty design systemu dla każdego
ekranu i luki w design systemie. Niczego jeszcze nie buduj.

# Etap 1. Szkielet i ścieżka bez błędów

- Uruchom prototyp tak, jak ustaliliśmy w materiałach.
- Podłącz silnik przeglądu według jego README: tryb komentarzy, mapa ekranów,
tryb prezentacji, przycisk „Back”. W komentarzach wpisz nazwę prototypu
jako prototypeId. Dopasuj mostek kolorów do tokenów design systemu.
- Pasek przeglądu: wybór ekranu, przełącznik motywu, oznaczenie „Prototyp”.
- Ekrany ścieżki, na której wszystko się udaje, od pierwszego do ostatniego.

# Etap 2. Stany, role i scenariusze

- Wszystkie stany z mapy, każdy osiągalny kliknięciem albo kontrolką scenariusza.
- Konta demo dla każdej roli i przełączanie między nimi.
- Bramki dostępu: „zaloguj się”, „ta strona wymaga innej roli”.
- Wpisane dane zostają po błędzie; wybór zostaje po nieudanej operacji.

# Etap 3. Uczciwość i sprawdzenie

- Przy każdym ekranie krótka notatka: numery historii, co jest symulacją,
czego prototyp nie rozstrzyga.
- README prototypu: jak uruchomić, konta demo, scenariusze i sekcja
„Ograniczenia symulacji”.
- Testy nawigacji między ekranami.
- Sprawdzenie w przeglądarce: 320 i 1440 px, jasny i ciemny motyw, obsługa
klawiaturą, każdy przycisk i każda kontrolka scenariusza.

Raport: co zbudowałeś, co sprawdziłeś, czego nie sprawdziłeś, luki w design
systemie i pytania do specyfikacji, które wyszły przy budowie.
