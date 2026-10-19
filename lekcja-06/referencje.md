# Referencje: DevMentor

- Data: 2026-10-19
- Kto wybierał: wybór kart: Oliwia Zielińska (founder A, rola UX wg RACI); karty R01, R02, A01. Obserwacje, podział na cechy i propozycje P1–P30: agent. Status „przyjęte” nadaje Krzysztof Marczak.
- Zdecydował (wszystkie statusy i rozstrzygnięcia w tym pliku): K. Marczak (delegacja do agenta-koordynatora), 2026-10-19.
- Słowa charakteru: konkretny, czytelny, spokojny, ciepły (P1–P4, przyjęte)
- Antycharakter: generyczny, hałaśliwy, bezbarwny, oceniający, szkolny (P5–P9, przyjęte)

Wszystkie obserwacje to parafraza, bez zrzutu (P30 odrzucone; patrz Luki).

## Referencje

| # | Referencja | Źródło | Kto wybrał | Obserwacja | Bierzemy | Nie bierzemy | Robimy zamiast tego | Dlaczego pasuje do produktu | Rodzina | Waga | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R01.1 | GitHub | strona repozytorium i lista pull requestów (parafraza, bez zrzutu) | Oliwia Z. | Lista pozycji jedna pod drugą; każdy wiersz to jedna rzecz w 1–2 liniach (tytuł, numer, autor, czas, etykiety); na ekranie kilkanaście wierszy, tekst się nie zlewa. Nie wiadomo: wysokość wiersza, odstępy, rozmiar pisma. | Dużo informacji na ekranie przy zachowanej czytelności | – (R01.4–R01.6) | – | Listy mentora: `/mentor/requests`, 7 wierszy dni w Dostępności, sloty po dniach. Mentorzy i deweloperzy znają GitHuba („my GitHub is my profile”). Na publicznej stronie mentora na telefonie nieuzasadnione – patrz K2. | kompozycja i gęstość | musi być | przyjęte (zakres: K1, K2) |
| R01.2 | GitHub | j.w. | Oliwia Z. | Kod, nazwy plików i ścieżki złożone pismem o stałej szerokości znaków, innym niż reszta interfejsu. Nie wiadomo: bloki czy kod w linii. | Kod i nazwy plików innym fontem (monospace) | – | – | Pytania i czat zawierają kod i konfigurację („wkleję yamla”, A08); mentor czyta pytanie przed akceptacją (R05). | typografia | musi być | przyjęte |
| R01.3 | GitHub | j.w. | Oliwia Z. | Wiersze rozdziela pozioma linia ok. 1 px w jasnym, niskokontrastowym kolorze; wiersze nie są kartami z cieniem. | Cienkie linie między wierszami | – | – | Podział bez kart z cieniem i szkła (przeciwieństwo A01). | komponenty | musi być | przyjęte |
| R01.4 | GitHub | j.w. | Oliwia Z. | Interfejs prawie cały w chłodnej szarości, kolor tylko w drobnych elementach. | – | Wszystko szare, mało ciepła | Ciepła neutralna baza + jeden kolor akcji spoza fioletu/indygo (P17); wartości: decyzja „Kolor” niżej | Ciepło z bazy i tonu słów, nie z gradientów (A01) | kolor | musi być | przyjęte |
| R01.5 | GitHub | j.w. | Oliwia Z. | Wiele elementów o podobnej wadze; nie widać, co główne. | – | Trudno się zorientować, co najważniejsze | Jedna główna akcja na ekran opisana konkretem („Zapłać 150 zł i wyślij pytanie”, „Akceptuję” / „Odrzucam”); stan zawsze na górze (`/r/{token}`); kolejność strony mentora wg spec #16 (P18) | Specyfikacje #16–#18 już tego wymagają; D08: 5 minut od linku do opłaconego pytania | kompozycja i gęstość | musi być | przyjęte |
| R01.6 | GitHub | j.w. | Oliwia Z. | Przy wierszach kolorowe etykiety, liczniki, ikony stanu. | – | Kolorowe etykiety-pigułki i liczniki przy każdym wierszu (P19) | Stan słowem („Czeka na decyzję”); jedyny licznik: „N zapytań czeka na decyzję” na `/mentor` (P19) | Statusy w specyfikacjach są zdaniami; pigułki to znak A01 | komponenty | musi być | przyjęte |
| R02.1 | Slack | widok kanału z wątkiem (parafraza, bez zrzutu) | Oliwia Z. | Środek ekranu to chronologiczna lista wiadomości, pole pisania pod nią, reszta po bokach. Nie wiadomo: proporcje kolumn. | Rozmowa w centrum ekranu | – (R02.4–R02.7) | – | Sesja to czat tekstowy 25/50 min (R01, R02 briefu). Ekran #20 nie ma jeszcze specyfikacji. | kompozycja i gęstość | warto | przyjęte |
| R02.2 | Slack | j.w. | Oliwia Z. | Pole pisania stale widoczne na dole; wysłana wiadomość pojawia się od razu. | Szybko się pisze i odpisuje | – | Ctrl/Cmd+Enter wysyła, Enter = nowa linia, podpowiedź pod polem (P27, K4) | Płatne minuty; deweloperzy chcą odpowiedzi w 20 min – godzinę | ruch i reakcja | warto | przyjęte |
| R02.3 | Slack | j.w. | Oliwia Z. | Przy wiadomości (lub grupie) imię autora i godzina. | Widać, kto co napisał i kiedy | – | – | R15: kto pisał w slocie decyduje o zwrocie; mentor widzi tylko imię (#17 Q5) | komponenty | warto | przyjęte |
| R02.4 | Slack | j.w. | Oliwia Z. | Liczniki nieprzeczytanych przy wielu kanałach, powiadomienia o wielu zdarzeniach. | – | Za dużo powiadomień | Tylko e-maile transakcyjne z #17/#18 + jeden licznik na `/mentor`; bez push, dźwięków, marketingu (P20) | „chcę odpowiedzieć na pytanie i mieć spokój” | ruch i reakcja | warto | przyjęte |
| R02.5 | Slack | j.w. | Oliwia Z. | Emoji w wiadomościach, reakcjach, nazwach kanałów. | – | Emoji wszędzie | Zero emoji w interfejsie, statusach i mailach; w czacie bez pickera i reakcji; wpisanych nie blokujemy (P21) | Ton rzeczowy („robiłem upgrade ingress-nginx na 1.28”) | ton wypowiedzi | warto | przyjęte |
| R02.6 | Slack | j.w. | Oliwia Z. | Lewy pasek z wieloma sekcjami. | – | Bałagan w bocznym pasku | Bez bocznego paska; mentor: górna nawigacja (Zapytania, Strona, Dostępność); deweloper bez nawigacji (P22) | Mentor ma 3 ekrany (#14, #15, #18); deweloper jest gościem (D12) | kompozycja i gęstość | warto | przyjęte |
| R02.7 | Slack | j.w. | Oliwia Z. | Wątek otwiera się w osobnej kolumnie. | – | Wątki, reakcje, kanały (P23) | Sesja to jedna liniowa rozmowa dwóch osób (P23) | Sesja 1:1, 25/50 min; N05 | komponenty | warto | przyjęte |

## Decyzje poza referencjami

Nie są referencjami (brak trzeciej karty) – to decyzje z uzasadnieniem. Zdecydował: K. Marczak (delegacja do agenta-koordynatora), 2026-10-19.

| # | Decyzja | Uzasadnienie | Przegląd |
|---|---|---|---|
| DK1 | Kolor: ciepła neutralna baza (ciepłe szarości typu stone/piasek, nie chłodny szary) + jeden kolor akcji: palona pomarańcz / terakota. Biały tekst na wypełnieniu akcji ≥ 4,5:1 w jasnym motywie; ciemny motyw ma własną, jaśniejszą wartość. Zieleń zostaje dla sukcesu. Wartości: `lekcja-06/tokeny.md`. | R01.4 (mało ciepła), K3; daleko od fioletu/indygo AI (A01) i korporacyjnego błękitu | po pilocie |
| DK2 | Typografia: Geist (tekst interfejsu) + Geist Mono (kod, ścieżki plików, ceny i kwoty, slugi). Ładowane przez `next/font`, bez CDN. | R01.2; świadoma decyzja zamiast domyślnej wartości szkieletu (body ma dziś Arial) | do przeglądu po pilocie |
| DK3 | Ruch: trzy czasy – kontrolki ok. 120 ms, menu ok. 180 ms, okna dialogowe ok. 240 ms; wszystkie wyłączone przy `prefers-reduced-motion`. | R02.2 (szybka reakcja), P3 (spokojny) | po pilocie |
| DK4 | Dwa motywy: jasny i ciemny wg preferencji systemu; ręczny przełącznik później w Storybooku. | szkielet ma już `prefers-color-scheme`; GitHub i Slack mają oba motywy | – |

## Antyreferencje

| # | Wygląd | Dlaczego nie | Podpis do uniknięcia | Źródło |
|---|---|---|---|---|
| A01 | Typowa strona startupu AI – **generyczny wygląd AI** | „Wygląda jak wszystko inne” | Ekran: fioletowy/indygo gradient, szklane półprzezroczyste karty, iskierki; gradient w tekście nagłówka, ciemnogranatowe tło z poświatą, duże zaokrąglenia i pigułki prawie wszędzie, karty z cieniem jako jedyny podział, pigułka z nowością nad nagłówkiem, para „Zacznij za darmo” + „Zobacz demo”, trzy identyczne karty z ikoną, awatary z inicjałami na kolorowym tle. Kod: `bg-gradient-to-*` z `from-purple-*`/`from-violet-*`/`from-indigo-*`, `bg-clip-text`, `backdrop-blur-*`, `bg-white/10`, `shadow-xl`/`shadow-2xl`, `rounded-2xl`/`rounded-3xl` na większości elementów, ikona `Sparkles`, ✨ | gust (karta) + rozszerzenie podpisu z `lekcja-06/cwiczenie-1-prompt.md` (P10, przyjęte) |
| A02 | Platforma kursowa | „I don't want a course, I want an answer”; „nie chcę się uczyć helma, chcę żeby ingress wstał”; N05 | Paski postępu, % ukończenia, odznaki, certyfikaty, „Moduł 1/5”, „ścieżka nauki”, „mentorship journey” | badania (P11, przyjęte) |
| A03 | Marketplace z ocenami (Codementor, Preply) | N02, R03; „każdy ma pięć gwiazdek”, „kazdy ma 4.9”, „nie róbcie ocen. serio” | Gwiazdki, „4.9/5”, „(123 opinie)”, „Top mentor”, sortowanie po ocenie, karuzela opinii; pola `rating`, `review`, `stars` | badania (P12, przyjęte) |
| A04 | Katalog mentorów z wyszukiwarką | D03, R14; „nie wsadzajcie mnie na listę obok ludzi, których nie znam” | Wyszukiwarka, filtry, siatka kart mentorów, „Polecani mentorzy”, „Zobacz innych”; `/m` i `/m?search=` → 404 (spec #16) | badania (P13, przyjęte) |
| A05 | Subskrypcja i relacja (model MentorCruise) | N05; „jak to subskrypcja, to nie otworzę drugi raz”, „nie chcę relacji” | Tabela 3 planów, „/miesiąc”, „Wybierz plan”, okres próbny, „Obserwuj mentora” | badania (P14, przyjęte) |
| A06 | Narzędzie do rozmów wideo | N01, R02 briefu; porażka z mikrofonem w Codementorze | Ikony kamery i mikrofonu, „Dołącz do rozmowy”, podgląd kamery, test audio | badania (P15, przyjęte) |
| A07 | Bramka przed pytaniem: rejestracja, ukryta cena | „nie że zakładam konto, weryfikacja maila”, „chce znac cene zanim cokolwiek napisze”; D08, R07 | Rejestracja lub weryfikacja e-maila przed pytaniem, „Zapytaj o cenę”, cena po zalogowaniu, pole hasła na `/m/{slug}` | badania (P16, przyjęte) |

## Konflikty i rozstrzygnięcia

| Konflikt | Referencje | Rozstrzygnięcie | Kto zdecydował |
|---|---|---|---|
| K1. Gęsto (GitHub) czy spokojnie, rozmowa w centrum (Slack) | R01.1 vs R02.1, „spokojny” | Gęstość zależna od strefy: gęsto na listach mentora (zapytania, dostępność, sloty); luźno na ekranie sesji i szczegółach pytania (P24) | K. Marczak (delegacja do agenta-koordynatora), 2026-10-19 |
| K2. Gęstość vs strona mentora na telefonie | R01.1 vs spec #16 (375 × 812) | Wygrywa spec: na `/m/{slug}` tożsamość, publiczna praca i ceny na pierwszym ekranie 375 px (P25) | K. Marczak (delegacja do agenta-koordynatora), 2026-10-19 |
| K3. Ciepło vs kolorowość | R01.4 vs A01, R02.5 | Ciepło z bazy i tonu słów, nie z gradientu, emoji czy iskierek; jeden kolor akcji (P26, DK1) | K. Marczak (delegacja do agenta-koordynatora), 2026-10-19 |
| K4. Szybkie wysyłanie vs wklejanie kodu | R02.2 vs R01.2 | Ctrl/Cmd+Enter wysyła, Enter = nowa linia, podpowiedź pod polem (P27) | K. Marczak (delegacja do agenta-koordynatora), 2026-10-19 |
| K5. Rozmowa w centrum vs obowiązkowa informacja na ekranie sesji | R02.1 vs R02 briefu, czas slotu | Jedna cienka linia nad czatem „Czat tekstowy · 12:30–12:55”, nic więcej stale widocznego (P28) | K. Marczak (delegacja do agenta-koordynatora), 2026-10-19 |
| K6. Dużo informacji vs „nie wiadomo, co najważniejsze” | R01.1 vs R01.5 | Gęstość tylko w listach; każdy ekran ma jedną główną akcję i stan na górze (P18) | K. Marczak (delegacja do agenta-koordynatora), 2026-10-19 |

## Luki

Kolor, typografia, ruch i tryb ciemny są rozstrzygnięte (DK1–DK4). Zostaje:

- **Obserwacje bez zrzutów:** wszystkie są parafrazą (P30 – zrzuty – odrzucone w tej iteracji). Do weryfikacji, gdy pojawią się obrazy.
- **Kształt i głębia:** brak pozytywnej referencji dla zaokrągleń i obramowań; mały promień w tokenach wynika tylko z A01 (unikać dużych zaokrągleń i pigułek).
- **Krzywa ruchu (easing) i ikony:** brak referencji i decyzji.
- **Ekran sesji (#20):** brak specyfikacji; R02.1–R02.3, K4, K5 czekają na nią.
- **Wygląd e-maili:** treść jest w specyfikacjach, wyglądu brak.
- **Ręczny przełącznik motywu:** odłożony do Storybooka (DK4).
- **Waga A01:** karta jej nie podaje.
- **Ton wypowiedzi:** przyjęty jak w treściach specyfikacji – konkretne kwoty i stany, bez wykrzykników i marketingu, po polsku (P29); brak referencji zewnętrznej.

## Obrazy

Brak. Propozycja zrzutów (P30) odrzucona w tej iteracji (K. Marczak (delegacja do agenta-koordynatora), 2026-10-19). Obserwacje pozostają oznaczone „parafraza, bez zrzutu”.
