# Zadanie

Rozpisz mapę ekranów dla przepływu, z którego powstanie klikalny prototyp.
Niczego jeszcze nie buduj. Twoim wynikiem jest plik z mapą i lista luk
w specyfikacji.

# Materiały

- Przepływ: Epik 01 DevMentora, strona mentora pod linkiem: zaproszenie
i logowanie mentora linkiem od foundera, edytor strony (dane, link do pracy,
opis, ceny 25/50 min), dostępność tygodniowa i podgląd terminów, publikacja
i link do udostępnienia, publiczna strona mentora /m/{slug} oglądana przez
developera (bez ocen, bez katalogu). Historie #23 (fundament danych, bez
ekranów), #14, #15, #16 (numery z .ai/specs/backlog.md).
- Brief: .ai/specs/product-brief.md (Key flows: „Future state (1.0): mentor goes
from invitation to first paid session” i krok 1 przepływu developera)
- Backlog i specyfikacje: .ai/specs/backlog.md oraz
.ai/specs/2026-10-19-data-store-and-first-schema-migration.md,
.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md,
.ai/specs/2026-10-19-mentor-weekly-availability-and-open-slots.md,
.ai/specs/2026-10-19-public-mentor-share-page.md
- Persony i badania: .ai/specs/research/ (wywiady i decyzje D01–D12, N01–N05;
personas.md nie ma w tym repo)
- Design system: packages/ui (@devmentor/ui i @devmentor/ui/product; Storybook
w packages/ui/.storybook; ekrany S1–S6 E01 już są jako stories w
packages/ui/.storybook/screens.tsx), zasady dla agentów w docs/design-system.md
i AGENTS.md
- Gdzie zapisać mapę: lekcja-07/mapa-ekranow.md

# Jak pracujesz

1. Wypisz historie i kryteria akceptacji, które dotyczą tego przepływu,
z ich numerami.
2. Rozpisz ekrany. Każdy dostaje stały identyfikator (s01, s02 i tak dalej),
którego potem nie zmieniasz, bo do niego będą przypięte komentarze.
3. Dla każdego ekranu wypisz stany, które go dotyczą: domyślny, pusty,
ładowanie, błąd, brak dostępu, konflikt i wynik zewnętrznej usługi. Przy
każdym stanie podaj historię albo kryterium, z którego wynika.
4. Role: kto widzi ekran (mentor, developer, founder/operator) i co zobaczy
ktoś niezalogowany albo z inną rolą.
5. Scenariusze do przełączania w prototypie: które wyniki trzeba umieć
wywołać ręcznie (np. link zaproszenia wygasł, link logowania zużyty, sesja
wygasła, błąd zapisu). To będą kontrolki prototypu, nie funkcje produktu.
6. Dane demo: jakie konta (po jednym na rolę), jakie dane z briefu (nazwy,
ceny, terminy) i jaki stały „teraz” dla zegara demo. Wszystko fikcyjne.
7. Przy każdym ekranie: z których komponentów design systemu się składa.
Czego brakuje, wpisz jako lukę w design systemie.
8. Luki w specyfikacji, czyli najważniejsza część:
- kryterium, które nie ma ekranu albo stanu,
- stan, którego przepływ potrzebuje, a którego nie opisuje żadne kryterium,
- sprzeczność między specyfikacją, briefem i design systemem,
- decyzja, której nikt nie podjął.
Nie rozstrzygaj sam. Przy każdej luce zapisz pytanie do właściciela produktu
i swoją rekomendowaną odpowiedź z uzasadnieniem.
9. Nie dodawaj funkcji, których nie ma w materiałach, nawet jeśli „zwykle są”
w takich aplikacjach (np. oceny, katalog, wideo). Jeśli uważasz, że czegoś
brakuje, zapisz to jako pytanie.

# Wynik

Plik mapy, w tym układzie:
1. Tabela: ID | ekran | rola | stany | historia lub kryterium | komponenty DS.
2. Scenariusze do przełączania.
3. Konta i dane demo.
4. Luki w specyfikacji, każda z pytaniem i rekomendacją.
5. Luki w design systemie.
6. Liczby: ekrany, stany, luki.

Na koniec zatrzymaj się i poczekaj, aż zatwierdzę mapę.
