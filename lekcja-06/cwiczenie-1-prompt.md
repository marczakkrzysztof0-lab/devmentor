# Ćwiczenie 1 – prompty (wariant „własny projekt bez aplikacji”)

Nasze repo nie ma jeszcze ekranów produktu, więc zgodnie z lekcją najpierw agent buduje jeden ekran z briefu bez design systemu, a potem drugi agent (nowa rozmowa) sprawdza go wykrywaczem.

## Prompt A – Ekran z briefu bez design systemu

```text
Zbuduj jeden ekran z briefu .ai/specs/product-brief.md:
publiczna strona mentora pod linkiem do udostępnienia (/m/{slug}) – kim jest mentor,
link do publicznej pracy, opis, ceny sesji 25 i 50 minut, wolne terminy i pole na pytanie.
Nie używaj design systemu ani biblioteki komponentów z projektu.
Zrób go tak, jak zrobiłbyś domyślnie. Treść weź z briefu.
Zapisz jako jeden plik lekcja-06/ekran-bez-ds.html i nic więcej nie zmieniaj.
```

## Prompt B – Wykrywacz generycznego wyglądu

```text
# Zadanie

Sprawdź interfejs pod kątem generycznego wyglądu i typowych błędów UX.
Niczego nie zmieniaj w plikach. Twoim wynikiem jest raport.

Generyczny wygląd to wybory, których nikt świadomie nie podjął: wartości
domyślne bibliotek, najczęstsze wzorce z internetu, wymyślone treści i dane.
Pojedynczy element nie musi być błędem. Problem to wiele takich elementów naraz.

# Co sprawdzasz

- Pliki lub katalogi z interfejsem: lekcja-06/ekran-bez-ds.html, app/page.tsx, app/globals.css
- Adres uruchomionej aplikacji, jeśli jest: brak
- Design system, jeśli istnieje: brak (app/globals.css ma tylko domyślne zmienne z create-next-app)
- Dane produktu i marka: .ai/specs/product-brief.md, .ai/specs/research/decisions/ (m.in. N02 – bez ocen), specyfikacja strony mentora .ai/specs/2026-10-19-public-mentor-share-page.md

# Krok 1. Znaki generycznego wyglądu

Przy każdym znaku napisz: występuje / nie występuje / nie da się sprawdzić.
Liczy się też odpowiednik: ten sam efekt w innej formie. Jeśli występuje,
podaj plik i linię albo opis elementu na ekranie.

Kolor: indygo lub fiolet jako kolor akcji bez uzasadnienia w marce; gradient
w tekście nagłówka; gradient w tle albo na przycisku; ciemnogranatowe tło z poświatą.
Kształt i głębia: duże zaokrąglenia i pigułki na większości elementów; karty
z cieniem jako jedyny sposób oddzielenia treści; karta w karcie; półprzezroczyste,
rozmyte panele.
Układ: pigułka z nowością albo liczbą nad nagłówkiem; wyróżnione kolorem słowo
w nagłówku; para przycisków w stylu „Zacznij za darmo” i „Zobacz demo”; rząd
wielkich liczb; trzy identyczne karty z ikoną; karty unoszące się nad pierwszym ekranem.
Ozdobniki: logo jako kolorowy kwadrat z literą albo ikoną; awatary z inicjałami
na kolorowym tle; emoji zamiast ikon; iskierki jako symbol AI; ikony na kolorowym
tle przy nagłówkach.
Tekst i dane: obietnice, które nic nie mówią o produkcie; liczby, opinie, oceny,
nazwy klientów i firm, których nie ma w danych produktu.

# Krok 2. Błędy UX i dostępności

Sprawdzaj przy szerokościach 1440, 768 i 320 px, jeśli masz przeglądarkę.
- kontrast tekstu poniżej 4,5 : 1, dużego tekstu i elementów interfejsu poniżej 3 : 1
  (bez przeglądarki: policz z wartości w kodzie i napisz, czego nie dało się zmierzyć)
- klikalne elementy mniejsze niż 24 × 24 px (wyjątek odstępu z WCAG 2.5.8)
- pola formularza bez widocznej etykiety (tylko placeholder)
- kolor jako jedyny nośnik informacji o stanie
- brak stanów: ładowanie, pusto, błąd
- niewidoczny fokus przy obsłudze klawiaturą
- linie tekstu dłuższe niż 75 znaków (przy jakiej szerokości)
- komunikaty błędów, które nie mówią, co zrobić
- treść, która znika albo jest nieczytelna bez JavaScriptu

# Krok 3. Policz rozrzut wartości

Unikalne: kolory tekstu, rozmiary fontu, promienie, wartości odstępów (i ile spoza
siatki 4 px), kolory wpisane na sztywno (hex, rgb, hsl, oklch, klasy palety
Tailwinda, arbitralne wartości Tailwinda) poza plikiem tokenów.

# Wynik

1. Tabela najważniejszych znalezisk, najwyżej 15 wierszy: znak lub błąd | gdzie |
co widać | dlaczego to problem (generyczny wygląd / UX / dostępność) | czym zastąpić |
pewność (sprawdzone / przypuszczenie).
2. Pozostałe znaleziska jako krótka lista.
3. Liczby z kroku 3.
4. Pięć decyzji, które trzeba podjąć, żeby ten interfejs przestał wyglądać jak średnia.
Przy każdej: token, komponent czy zasada.

Zasady: nie zgaduj; nie oceniaj gustu, oceniaj uzasadnienie w produkcie; nie zmieniaj plików projektu.
```

Po raporcie: „Zapisz ten raport do lekcja-06/audyt.md. Niczego poza tym plikiem nie zmieniaj.”
