# Audyt – wykrywacz generycznego wyglądu (Prompt B)

Data: 2026-10-19
Zakres: `lekcja-06/ekran-bez-ds.html`, `app/page.tsx`, `app/globals.css` (+ `app/layout.tsx` dla kontekstu)
Odniesienie: `.ai/specs/product-brief.md`, `.ai/specs/research/decisions/` (N02, D03, D04, D12), `.ai/specs/2026-10-19-public-mentor-share-page.md`
Design system: brak (`globals.css` – tylko `--background` / `--foreground` z create-next-app).

**Metoda.** `ekran-bez-ds.html` otwarty we wbudowanej przeglądarce (lokalny serwer statyczny) i zmierzony skryptem przy 1440, 768, 375 i 320 px: kontrast z wartości obliczonych (`getComputedStyle`, wzór WCAG), rozmiary celów z `getBoundingClientRect`, długość linii jako liczba znaków w wyrenderowanym wierszu, fokus sprawdzony klawiszem Tab. `app/page.tsx` **nie był renderowany** (brak uruchomionej aplikacji), więc jego kontrastu i rozmiarów nie zmierzono – oceniony tylko z kodu. Stanów bez JavaScriptu nie testowałem przez wyłączenie JS; wnioski z kodu (oznaczone).

---

## Krok 1. Znaki generycznego wyglądu

| Znak | Wynik | Gdzie / co widać |
|---|---|---|
| Indygo/fiolet jako kolor akcji bez uzasadnienia w marce | **występuje** | `ekran-bez-ds.html:14` `--accent: #3b5bdb` (to dokładnie „indigo 7” z palety Open Color), użyty w logo (l. 31), tagach (l. 41), awatarze (l. 37), zaznaczonym terminie (l. 58), przycisku (l. 64). Odpowiednik w `app/page.tsx:5` – `text-blue-600` / `dark:text-blue-400`. Brief i decyzje nie zawierają żadnej marki ani koloru. |
| Gradient w tekście nagłówka | nie występuje | – |
| Gradient w tle / na przycisku | nie występuje | – |
| Ciemnogranatowe tło z poświatą | nie występuje | – |
| Duże zaokrąglenia i pigułki na większości elementów | nie występuje (na większości) | Pigułki tylko na tagach (`border-radius: 999px`, l. 41) i okrągły awatar (l. 37); reszta 6–12 px. W `app/page.tsx:4` `rounded-3xl` na jedynej karcie. |
| Karty z cieniem jako jedyny sposób oddzielenia treści | **występuje (odpowiednik)** | HTML: dwie białe karty z ramką 1 px na szarym tle (`.card`, l. 35) – jedyny podział strony, cieni brak. `app/page.tsx:4` – karta `shadow-sm` na `bg-zinc-50`. |
| Karta w karcie | **występuje** | W `.card` siedzą obramowane boksy: linki pracy (`.work a`, l. 43), szara notka (`.note`, l. 46), kafle długości sesji (`.option span`, l. 50), czipy terminów (l. 57). |
| Półprzezroczyste, rozmyte panele | nie występuje | – |
| Pigułka z nowością/liczbą nad nagłówkiem | **występuje (odpowiednik)** | `app/page.tsx:5–7` – „ROZWIJAJ SIĘ W IT”: niebieski, wersaliki, `tracking-[0.2em]` nad H1 (eyebrow zamiast pigułki). W HTML nie występuje. |
| Wyróżnione kolorem słowo w nagłówku | nie występuje | – |
| Para przycisków „Zacznij za darmo” / „Zobacz demo” | nie występuje | – |
| Rząd wielkich liczb | nie występuje | Ceny 20 px bold to dane, nie ozdobnik. |
| Trzy identyczne karty z ikoną | nie występuje | – |
| Karty unoszące się nad pierwszym ekranem | nie występuje | – |
| Logo jako kolorowy kwadrat z literą/ikoną | nie występuje | Logo to tekst „DevMentor” w kolorze akcentu (l. 31, 73). |
| Awatar z inicjałami na kolorowym tle | **występuje** | `ekran-bez-ds.html:37, 81` – „MN” na `#edf1ff`, 72 px. Model danych strony (DTO: `displayName, publicWorkUrl, description, price25Minor, price50Minor, currency, slug`) nie ma zdjęcia – awatar jest czystą dekoracją. |
| Emoji zamiast ikon | nie występuje | Strzałka „↗” (l. 102, 106) to znak Unicode z `aria-hidden`, nie emoji. |
| Iskierki jako symbol AI | nie występuje | – |
| Ikony na kolorowym tle przy nagłówkach | nie występuje | – |
| Obietnice, które nic nie mówią o produkcie | **występuje** | `app/page.tsx:11–14` „Portal, który pomaga rozwijać umiejętności programistyczne. Znajdź wiedzę, inspirację i wsparcie na każdym etapie swojej drogi w IT.” + `layout.tsx` metadata. Sprzeczne z zakresem 1.0 (płatne sesje tekstowe; baza wiedzy to Later – N03; brak katalogu – D03). |
| Liczby, opinie, oceny, nazwy, których nie ma w danych | **występuje** | `ekran-bez-ds.html`: mentorka „Marta Nowak” (brak w briefie i na liście 50 kandydatów – nikt nie był kontaktowany), „Ten years… two migrations… six teams… Discord most weeks” (l. 95), ceny 120/220 zł (l. 119, 123; spec ma przykład 150/280 zł), adresy `github.com/martanowak`, `martanowak.dev`, domena `devmentor.app` (l. 74), tagi technologii (l. 88–91), konkretne terminy (l. 130–141). |

Wynik: 8 z 21 znaków występuje (w tym 3 jako odpowiedniki). To „wiele naraz” w rozumieniu zadania.

## Krok 2. Błędy UX i dostępności

| Błąd | Wynik | Szczegóły |
|---|---|---|
| Kontrast tekstu < 4,5:1 (duży < 3:1) | nie występuje (HTML, zmierzone) | Minimum: tagi i inicjały `#3b5bdb` na `#edf1ff` = 5,03:1; `.note` `#5b6475` na `#f6f7f9` = 5,56:1; muted na bieli 5,96:1; przycisk biały na `#3b5bdb` 5,67:1; placeholder (domyślny przeglądarki `#757575`) 4,61:1. `app/page.tsx` – nie zmierzono. |
| Kontrast elementów interfejsu < 3:1 | **występuje** | Ramka pola pytania i niezaznaczonych czipów terminów/kafli długości `#e2e5ea` na bieli = **1,26:1** (l. 50, 57, 61); ramka karty na tle 1,18:1 (dekoracyjna – dopuszczalne). Granica pola tekstowego i nieaktywnych opcji jest praktycznie niewidoczna. |
| Klikalne < 24×24 px | nie występuje (zmierzone) | Najmniejsze: czipy terminów 59×35 px przy 1440/768/320. Przycisk 330×46 (1440), 238×65 (320). |
| Pole tylko z placeholderem | nie występuje | `label for="question"` (l. 144) jest widoczna. Grupy radio nie mają `fieldset/legend` – nagłówki H2 nie są programowo powiązane z grupą (przypuszczenie co do odczytu czytnikiem). |
| Kolor jako jedyny nośnik stanu | **występuje** | Wybrana długość = tylko ramka w kolorze akcentu + jasne tło (l. 52); wybrany termin = tylko wypełnienie kolorem (l. 58). Brak znacznika, tekstu, ikony „wybrane”. |
| Brak stanów (ładowanie, pusto, błąd) | **występuje** | Brak „Brak wolnych terminów w najbliższych 14 dniach”, brak „Nie udało się wczytać terminów — odśwież stronę”, brak „Nie ma takiej strony mentora” – wszystkie wymagane w specyfikacji (UI/UX, stories 3–4). |
| Niewidoczny fokus | nie występuje (sprawdzone Tabem) | Linki: domyślny `outline: auto`; radio: 2 px w kolorze akcentu (l. 53, 59); pole: 2 px (l. 62). |
| Linie > 75 znaków | **występuje** | Przy **768 px** (jedna kolumna, tekst 671 px): opis 92–97 znaków, notka 101, lista warunków 85. Przy **1440 px**: notka `.note` 81 znaków (13 px). Przy 320 px max 39. |
| Komunikaty błędów nie mówią, co zrobić | **występuje** | Jedyna walidacja to natywne `required` na polu pytania (komunikat przeglądarki). Wybór terminu nie jest wymagany – formularz da się wysłać bez terminu, bez żadnego komunikatu. |
| Treść znika / nieczytelna bez JS | **występuje** (z kodu, nie testowane z wyłączonym JS) | Bez JS przycisk dalej pokazuje „120 zł” po wybraniu 50 min (l. 160–165) – błędna cena przed płatnością. Formularz nie ma `action`/`method`, więc bez JS wysyła GET na ten sam adres – **treść pytania trafia do query stringu URL**. |

Dodatkowo sprawdzone przy 375×812 i 320×720 (specyfikacja: przy 375×812 tożsamość, praca publiczna i ceny mają się zmieścić na pierwszym ekranie): link do pracy zaczyna się na **685 px**, ceny na **1094 px** (375 px); przy 320 px – 817 i 1225 px. Ceny są ~1,3–1,7 ekranu niżej. Brak poziomego przewijania przy 320 px.

---

## 1. Najważniejsze znaleziska (15)

| # | Znak lub błąd | Gdzie | Co widać | Dlaczego to problem | Czym zastąpić | Pewność |
|---|---|---|---|---|---|---|
| 1 | Wymyślone dane mentora | `ekran-bez-ds.html:73–141` | Marta Nowak, bio z liczbami, ceny 120/220 zł, adresy, tagi, terminy | Generyczny wygląd + ryzyko produktu: strona zaufania pokazuje dane, których nie ma w żadnym źródle | Dane wyłącznie z DTO; w makiecie jawnie oznaczone przykładowe dane ze specyfikacji (Anna K., 150/280 zł) | sprawdzone |
| 2 | Słowo „ratings” na stronie | `ekran-bez-ds.html:110` | „There are no ratings here; check my public work instead.” | Łamie test AC N02 ze specyfikacji (HTML nie może zawierać „rating/ocen/opini/★”); przypomina o czymś, czego produkt świadomie nie ma | Usunąć zdanie; zaufanie budować samym linkiem do pracy | sprawdzone |
| 3 | Kolejność treści niezgodna ze specyfikacją | `ekran-bez-ds.html:94–108` | Opis przed „Public work” | Specyfikacja: „Order on the page is a requirement” – tożsamość → praca → opis → ceny → terminy | Link do pracy bezpośrednio pod imieniem | sprawdzone |
| 4 | Ceny poza pierwszym ekranem na telefonie | układ jednokolumnowy < 820 px | Ceny na 1094 px przy 375×812 | UX: R07 i D08 (5 minut od linku do zapłaty); deweloper przychodzi z Discorda na telefonie | Na mobile ceny tuż pod tożsamością i linkiem; opis zwijany niżej (bez obcinania treści) | sprawdzone |
| 5 | Indygo jako kolor akcji bez marki | `:14`, `page.tsx:5` | `#3b5bdb` / `blue-600` | Generyczny wygląd – wartość z gotowej palety | Token `--color-action` w `globals.css` wybrany świadomie | sprawdzone |
| 6 | Linki pracy prowadzą gdzie indziej niż pokazują | `ekran-bez-ds.html:100–106` | Tekst `github.com/martanowak`, `href="https://github.com/"`; tekst `martanowak.dev`, `href="https://example.com/"`; dwa linki zamiast jednego `publicWorkUrl`; brak `rel="nofollow … ugc"` | UX/zaufanie: spec wymaga pełnej widocznej nazwy hosta, dokąd prowadzi link | Jeden link: widoczny host = `href`, `rel="nofollow noopener ugc"` | sprawdzone |
| 7 | Kolor jedynym nośnikiem wyboru | `:52`, `:58` | Wybrana opcja różni się tylko kolorem | Dostępność (WCAG 1.4.1) | Znacznik ✓ / pogrubienie / tekst „wybrano” + kolor | sprawdzone |
| 8 | Niewidoczne granice pola i opcji | `:50, :57, :61` | Ramka `#e2e5ea` – 1,26:1 | Dostępność (WCAG 1.4.11, wymagane 3:1) | Token ramki kontrolki ≥ 3:1 (np. ok. `#8a93a3`) | sprawdzone |
| 9 | Brak stanów pustych/błędu/404 | cały plik | Tylko szczęśliwa ścieżka | UX: trzy stany wymagane w specyfikacji | Komponenty stanu z tekstami ze specyfikacji | sprawdzone |
| 10 | Bez JS błędna cena i pytanie w URL | `:114`, `:159–166` | Przycisk „120 zł” przy 50 min; GET z treścią pytania | UX + prywatność | Cena jako tekst przy zaznaczonej opcji (bez JS); `method="post"` i prawdziwy `action` | przypuszczenie (z kodu, nie testowane bez JS) |
| 11 | Długość 25/50 nie filtruje terminów, brak strefy czasowej | `:116–142`, `:153` | Wszystkie terminy niezależnie od długości; „Times shown in your time zone” bez nazwy strefy | UX: story 2 i wymóg „strefa w nagłówku” | Lista filtrowana po długości; nagłówek „Najbliższe terminy (twoja strefa: Europe/Warsaw)” | sprawdzone |
| 12 | Język angielski | `:2` `lang="en"`, cała treść | Strona po angielsku | Specyfikacja Q6: treść po polsku, ceny przez `Intl.NumberFormat('pl-PL')` | Polskie copy, `lang="pl"` | sprawdzone |
| 13 | Awatar z inicjałami + tagi-pigułki | `:37, :41, :81, :87–92` | „MN” na kolorze, 4 czipy technologii | Generyczny wygląd; pól nie ma w DTO | Usunąć; imię + link do pracy jako nagłówek tożsamości | sprawdzone |
| 14 | Karta w karcie jako jedyny podział | `:35, :43, :46, :50` | Ramki w ramkach | Generyczny wygląd; hierarchię niosą ramki, nie typografia | Sekcje rozdzielone odstępem i nagłówkiem; ramka tylko na kontrolkach | sprawdzone |
| 15 | Pusta obietnica na stronie głównej | `app/page.tsx:5–14`, `layout.tsx` | „Rozwijaj się w IT”, „wiedzę, inspirację i wsparcie” | Generyczny wygląd + sprzeczność z 1.0 (N03, D03 – brak katalogu, wejście tylko z linku) | Jedno zdanie, co produkt robi w 1.0, lub minimalna strona bez marketingu | sprawdzone |

## 2. Pozostałe znaleziska

- Linie tekstu > 75 znaków przy 768 px (92–101) i notka 81 znaków przy 1440 px – brak `max-width` w `ch` dla akapitów.
- Formularz można wysłać bez wybranego terminu; brak własnego komunikatu błędu.
- `alert('Demo: next step…')` (l. 114) – martwy przycisk; spec Q1: „No dead Book button ships”.
- Terminy jako wybieralne radio – spec Q1 przewiduje w tym kroku zwykły tekst (radio dopiero z #17). Pole pytania pojawia się na tej stronie (prompt A o nie prosił, ale specyfikacja przenosi je do #17).
- Grupy radio bez `fieldset`/`legend` – nagłówki H2 nie są ich nazwą dostępną (przypuszczenie co do odczytu czytnikiem).
- Eyebrow nad H1 na `app/page.tsx` (wersaliki, rozstrzelony, niebieski) – odpowiednik „pigułki nad nagłówkiem”.
- `globals.css:24` ustawia `body { font-family: Arial }`, a `layout.tsx` ładuje Geist – dwie domyślne decyzje typograficzne obok siebie (Geist działa tylko tam, gdzie jest klasa `font-sans`).
- Tytuł strony „Marta Nowak – DevMentor” – spec: „{displayName} — DevMentor” (półpauza zamiast pauzy; drobne).
- Nagłówek z fałszywym adresem `devmentor.app/m/marta-nowak` – domeny nie ma w danych.
- Brak `noindex` w `<head>` (spec Q2) – dotyczy makiety, w aplikacji to metadata.
- `app/page.tsx` – nie mierzono kontrastu ani rozmiarów (aplikacja nie była uruchomiona).

## 3. Rozrzut wartości (krok 3)

| Miara | `ekran-bez-ds.html` | `app/page.tsx` |
|---|---|---|
| Unikalne kolory tekstu | **4** zadeklarowane (`#1d2330`, `#5b6475`, `#3b5bdb`, `#fff`) + 1 domyślny placeholder `#757575` | **6** klas (3 jasne: `blue-600`, `zinc-950`, `zinc-600`; 3 ciemne: `blue-400`, `zinc-50`, `zinc-400`) |
| Unikalne rozmiary fontu | **7** zadeklarowanych (12, 13, 14, 16, 20, 24, 26 px) + 13,33 px z domyślnego `<small>` = **8** wyrenderowanych | **4** (`text-sm`, `text-lg`, `text-5xl`, `sm:text-6xl`) |
| Unikalne promienie | **6** (6, 8, 10, 12 px, 999 px, 50%) – spoza siatki 4 px: 6, 10 | **1** (`rounded-3xl`) |
| Unikalne odstępy (padding/margin/gap/offset, bez 0/auto) | **11** (2, 3, 4, 6, 8, 10, 12, 14, 16, 20, 24 px) – **5 spoza siatki 4 px**: 2, 3, 6, 10, 14 | **5** (16, 24, 32, 64, 96 px – `mb-4`, `px-6`/`mt-6`, `px-8`, `py-16`/`sm:px-16`, `py-24`) – 0 spoza siatki |
| Kolory wpisane na sztywno poza plikiem tokenów | **9 wystąpień**: 7 hex w lokalnym `:root` strony (nie ma pliku tokenów projektu, to zmienne lokalne pliku) + `#fff` ×2 poza zmiennymi (l. 58, 64) | **10 klas palety Tailwinda** (`bg-zinc-50`, `dark:bg-black`, `bg-white`, `dark:bg-zinc-950`, `text-blue-600`, `dark:text-blue-400`, `text-zinc-950`, `dark:text-zinc-50`, `text-zinc-600`, `dark:text-zinc-400`) + 1 wartość arbitralna (`tracking-[0.2em]`) |

`app/globals.css` (jedyny „plik tokenów”): 4 hex (`#ffffff`, `#171717`, `#0a0a0a`, `#ededed`) – żaden nie jest używany przez `ekran-bez-ds.html` ani przez klasy w `app/page.tsx`; obie powierzchnie omijają tokeny w 100%.

## 4. Pięć decyzji, żeby interfejs przestał wyglądać jak średnia

1. **Token – kolor akcji i ramki kontrolek.** Wybrać świadomie jeden kolor akcji (z uzasadnieniem w produkcie, np. neutralny ciemny + jeden akcent tylko dla „Zapłać”), zapisać jako `--color-action` i `--color-control-border` (≥ 3:1) w `app/globals.css`; zakaz klas palety i hexów w komponentach. Decyduje właściciel produktu (marki brak w materiałach).
2. **Komponent – „Dowód pracy” (PublicWorkLink) jako centrum tożsamości.** Imię + jeden link z pełnym hostem (`href` = widoczny tekst, `rel="nofollow noopener ugc"`) bezpośrednio pod imieniem, zamiast awatara z inicjałami i tagów. To wizualny odpowiednik N02 („my GitHub is my profile”), a nie ozdobnik.
3. **Komponent – Cennik i terminy (PriceToggle + SlotList).** Prawdziwa grupa radio z `legend`, znacznik wyboru niezależny od koloru, terminy filtrowane po długości, strefa czasowa w nagłówku, cena widoczna bez JS, plus trzy stany ze specyfikacji (pusto, błąd wczytania, brak strony). Na 375×812 ceny na pierwszym ekranie.
4. **Zasada – treść tylko z danych.** Na ekranie wolno pokazać wyłącznie pola z DTO (`displayName`, `publicWorkUrl`, `description`, ceny, `currency`, terminy); copy po polsku; zero słów o ocenach (test N02); makiety tylko z przykładami oznaczonymi jako przykładowe (ze specyfikacji). Strona główna – jedno zdanie o tym, co robi 1.0, bez obietnic.
5. **Token – skala typografii, odstępów i promieni.** 4 rozmiary fontu, odstępy wyłącznie z siatki 4 px, 2 promienie (kontrolka / brak), szerokość tekstu max ~65ch; sekcje dzielone odstępem i nagłówkiem zamiast karty w karcie – ramka tylko na elementach, które się klika lub wypełnia.
