# Tokeny: DevMentor

- Data: 2026-10-19. Źródło decyzji: `lekcja-06/referencje.md` (R01.x, R02.x, A01–A07, K1–K6, DK1–DK4). Zdecydował: K. Marczak (delegacja do agenta-koordynatora), 2026-10-19.
- Warstwy: **surowe** (paleta i skale – używane wyłącznie w pliku tokenów) → **semantyczne** (nazwy wg celu, nigdy wg wyglądu; tylko tych używają komponenty) → **komponentowe** (tylko gdzie potrzebne).
- Motywy: jasny i ciemny wg `prefers-color-scheme` (DK4); ręczny przełącznik później przez atrybut motywu w Storybooku – te same nazwy semantyczne, inne wartości.
- Kontrast liczony wg WCAG 2.x (luminancja względna sRGB). Progi: tekst ≥ 4,5:1, elementy interfejsu i fokus ≥ 3:1. Wszystkie używane pary przechodzą (lista niżej).

## Istniejące tokeny (`app/globals.css`, create-next-app)

| Istniejący | Mapowanie | Zmiana wartości | Uzasadnienie |
|---|---|---|---|
| `--background` | → `surface-page` (alias zostaje do migracji) | jasny `#ffffff` → `#fafaf9`; ciemny `#0a0a0a` → `#0c0a09` | ciepła baza zamiast neutralnej (DK1, R01.4) |
| `--foreground` | → `text-primary` (alias zostaje do migracji) | jasny `#171717` → `#1c1917`; ciemny `#ededed` → `#f5f5f4` | j.w. |
| `--font-sans` / `--font-mono` (Geist, Geist Mono) | → `font-ui` / `font-mono` | bez zmiany; `body { font-family: Arial… }` do usunięcia przy wdrożeniu | DK2 – świadoma decyzja zamiast domyślnej |

## Warstwa surowa (tylko w pliku tokenów)

| Token | Wartość |
|---|---|
| `stone-50` / `100` / `200` / `400` / `500` / `600` / `800` / `900` / `950` | `#fafaf9` / `#f5f5f4` / `#e7e5e4` / `#a8a29e` / `#78716c` / `#57534e` / `#292524` / `#1c1917` / `#0c0a09` |
| `white` | `#ffffff` |
| `terracotta-300` / `400` / `600` / `800` | `#f0875a` / `#e8794a` / `#b4441c` / `#9a3412` |
| `green-400` / `green-700` | `#4ade80` / `#15803d` |
| `rose-400` / `rose-700` | `#fb7185` / `#be123c` |
| `space-1…7` | 4 / 8 / 12 / 16 / 24 / 32 / 48 px |
| `size-14` / `16` / `20` / `24` | 14 / 16 / 20 / 24 px |
| `radius-4` | 4 px |
| `ms-120` / `ms-180` / `ms-240` | 120 / 180 / 240 ms |

## Warstwa semantyczna i komponentowa

| Token | Warstwa | Wartość (jasny / ciemny) | Pochodzenie | Gdzie używać | Gdzie nie używać |
|---|---|---|---|---|---|
| `surface-page` | semantyczna (mapuje `--background`) | `stone-50 #fafaf9` / `stone-950 #0c0a09` | DK1, R01.4 | tło stron | jako tło przycisków i pól |
| `surface-panel` | semantyczna | `white #ffffff` / `stone-900 #1c1917` | DK1, R01.3 | pola formularza, pole pisania czatu, edytor strony mentora | do „kart z cieniem” (A01) |
| `surface-code` | semantyczna | `stone-100 #f5f5f4` / `stone-800 #292524` (T1, 2026-10-19; wcześniej `stone-900`, równe `surface-panel`) | R01.2, T1 | bloki kodu w pytaniu i czacie | zwykły tekst, wyróżnianie akapitów |
| `text-primary` | semantyczna (mapuje `--foreground`) | `stone-900 #1c1917` / `stone-100 #f5f5f4` | DK1 | treść, nagłówki, kod | na `action-primary-fill` |
| `text-muted` | semantyczna | `stone-600 #57534e` / `stone-400 #a8a29e` | R02.3, R01.1 | godziny wiadomości, podpowiedzi pod polami, metadane wierszy | treść pytania, ceny, stany |
| `text-on-action` | semantyczna | `white #ffffff` / `stone-950 #0c0a09` | DK1 | etykieta na przycisku głównym i wybranym przełączniku 25/50 | gdziekolwiek poza `action-primary-fill` |
| `text-link` | semantyczna | `terracotta-600 #b4441c` / `terracotta-400 #e8794a` | DK1, R01.5 | linki (np. „Publiczna praca”) | nagłówki, ozdobne wyróżnienia słów (A01) |
| `border-divider` | semantyczna | `stone-200 #e7e5e4` / `stone-800 #292524` | R01.3 | linia 1 px między wierszami list | jako jedyny wskaźnik stanu lub granica pola (dekoracyjna, < 3:1) |
| `border-control` | semantyczna | `stone-500 #78716c` / `stone-500 #78716c` | R01.3, WCAG 1.4.11 | obramowanie pól, niewybranego przełącznika 25/50 | separatory wierszy |
| `action-primary-fill` | semantyczna | `terracotta-600 #b4441c` / `terracotta-400 #e8794a` | DK1, R01.5, P18 | jedna główna akcja na ekran („Zapłać 150 zł i wyślij pytanie”, „Akceptuję”), wybrany przełącznik | drugi przycisk na tym samym ekranie, tła sekcji, gradienty |
| `action-primary-fill-hover` | semantyczna | `terracotta-800 #9a3412` / `terracotta-300 #f0875a` | DK1 | hover/pressed głównej akcji | stan spoczynku |
| `focus-ring` | semantyczna | `terracotta-600 #b4441c` / `terracotta-400 #e8794a` | WCAG 2.4.7 | obrys fokusu 2 px z odstępem `surface-page` | ozdobne obrysy |
| `status-success-text` | semantyczna | `green-700 #15803d` / `green-400 #4ade80` | DK1 (zieleń dla sukcesu), P19 | słowo stanu „Opłacone”, „Zaakceptowane” | akcje, linki |
| `status-danger-text` | semantyczna | `rose-700 #be123c` / `rose-400 #fb7185` | spec #16–#18 (stany błędów) | komunikaty błędów („Nie udało się wczytać terminów…”) | akcje; nigdy bez słów (blisko barwy akcji) |
| `font-ui` | semantyczna | Geist (`next/font`) | DK2 | cały tekst interfejsu | kod, kwoty, slugi |
| `font-mono` | semantyczna | Geist Mono (`next/font`) | DK2, R01.2 | kod, ścieżki plików, ceny i kwoty („150 zł”), slugi `/m/anna-k` | zwykłe zdania, nagłówki |
| `text-meta` | semantyczna | `size-14` / interlinia 1.4 | R02.3, R01.1 | godziny, podpowiedzi, metadane | treść pytania i czatu |
| `text-body` | semantyczna | `size-16` / `leading-body` 1.5 | P2 | treść, pytanie, czat, pola | metadane |
| `text-heading-section` | semantyczna | `size-20` / `leading-heading` 1.3 | R01.5 | nagłówki sekcji („Czeka na decyzję”) | treść |
| `text-heading-page` | semantyczna | `size-24` / `leading-heading` 1.3 | R01.5 | jeden nagłówek strony (imię mentora, stan `/r/`) | więcej niż raz na ekranie |
| `space-inline` | semantyczna | `space-1` 4 px | relacja: element–jego etykieta/opis | ikona–tekst, pole–podpowiedź | między elementami listy |
| `space-in-group` | semantyczna | `space-2` 8 px | relacja: w grupie | imię–godzina, etykieta–pole, sloty jednego dnia | między grupami |
| `space-inside-panel` | semantyczna | `space-4` 16 px | relacja: wewnątrz panelu | padding pól, bloków kodu, pola pisania | odstęp między sekcjami |
| `space-between-groups` | semantyczna | `space-5` 24 px | relacja: między grupami | dni w liście slotów, pola formularza | wewnątrz grupy |
| `space-between-sections` | semantyczna | `space-7` 48 px | relacja: między sekcjami | tożsamość → ceny → terminy na `/m/{slug}` | listy gęste (K1) |
| `space-page-gutter` | semantyczna | `space-4` 16 px (< 768 px) / `space-6` 32 px (≥ 768 px) | K2 | margines boczny strony | wewnątrz komponentów |
| `radius-control` | semantyczna | `radius-4` 4 px | A01 (bez dużych zaokrągleń i pigułek) | przyciski, pola, bloki kodu | kształty pigułek, awatary |
| `border-width-hairline` | semantyczna | 1 px | R01.3 | separatory, obramowania pól | fokus (2 px) |
| `duration-control` | semantyczna | `ms-120` (0 ms przy reduced motion) | DK3 | hover, przełącznik 25/50, przycisk | wejście okien |
| `duration-menu` | semantyczna | `ms-180` (0 ms przy reduced motion) | DK3 | rozwijane listy (strefa czasowa, godziny) | przyciski |
| `duration-dialog` | semantyczna | `ms-240` (0 ms przy reduced motion) | DK3 | potwierdzenie „Na pewno?” | wiadomości czatu (pojawiają się od razu, R02.2) |
| `list-row-padding-y` | komponentowa (lista) | `space-2` 8 px | R01.1, K1 | wiersze `/mentor/requests`, dni Dostępności | strona `/m/{slug}`, czat |
| `chat-message-gap` | komponentowa (czat) | `space-3` 12 px | R02.1, K1 (luźniej w sesji) | odstęp między wiadomościami | listy |

Liczba tokenów semantycznych i komponentowych: 35 (2 zmapowane z istniejących: `surface-page`, `text-primary`; 33 nowe). Fonty Geist/Geist Mono były już w szkielecie – teraz nazwane semantycznie.

## Pary kolorów i kontrast (oba motywy)

| Para (tekst/element na tle) | Jasny | Ciemny | Próg | Wynik |
|---|---|---|---|---|
| `text-primary` / `surface-page` | 16,74 | 18,11 | 4,5 | OK |
| `text-primary` / `surface-panel` | 17,49 | 16,03 | 4,5 | OK |
| `text-primary` / `surface-code` | 16,03 | 13,90 | 4,5 | OK |
| `text-muted` / `surface-page` | 7,30 | 7,83 | 4,5 | OK |
| `text-muted` / `surface-panel` | 7,63 | 6,93 | 4,5 | OK |
| `text-muted` / `surface-code` | 6,99 | 6,01 | 4,5 | OK |
| `text-on-action` / `action-primary-fill` | 5,55 | 6,83 | 4,5 | OK |
| `text-on-action` / `action-primary-fill-hover` | 7,31 | 7,83 | 4,5 | OK |
| `text-link` / `surface-page` | 5,31 | 6,83 | 4,5 | OK |
| `text-link` / `surface-panel` | 5,55 | 6,05 | 4,5 | OK |
| `text-link` / `surface-code` | 5,09 | 5,25 | 4,5 | OK |
| `status-success-text` / `surface-page` | 4,80 | 11,34 | 4,5 | OK |
| `status-success-text` / `surface-panel` | 5,02 | 10,04 | 4,5 | OK |
| `status-danger-text` / `surface-page` | 6,02 | 7,34 | 4,5 | OK |
| `status-danger-text` / `surface-panel` | 6,29 | 6,50 | 4,5 | OK |
| `border-control` / `surface-page` (UI) | 4,59 | 4,12 | 3 | OK |
| `border-control` / `surface-panel` (UI) | 4,80 | 3,65 | 3 | OK |
| `action-primary-fill` / `surface-page` (granica przycisku, UI) | 5,31 | 6,83 | 3 | OK |
| `focus-ring` / `surface-page` (UI) | 5,31 | 6,83 | 3 | OK |
| `focus-ring` / `surface-code` (UI, T1) | 5,09 | 5,25 | 3 | OK |
| `border-control` / `surface-code` (UI, pole tylko do odczytu, T1) | 4,40 | 3,16 | 3 | OK |
| `border-divider` / `surface-page` | 1,20 | 1,30 | – | dekoracyjny separator, nie niesie informacji; nie wolno go używać jako granicy pola ani wskaźnika stanu |

Uwaga: `status-danger-text` i `action-primary-fill` mają bliską barwę (1,13:1 między sobą) – stąd reguła: błąd zawsze słowami, nigdy sam kolor.

## Decyzje, które nie są tokenami

**Reguły**
1. Jedna główna akcja na ekran (`action-primary-fill`); stan zawsze pierwszym elementem (`/r/{token}`) – R01.5, P18.
2. Stan pisany słowem; bez pigułek i liczników przy wierszach; jedyny licznik „N zapytań czeka na decyzję” na `/mentor` – R01.6, P19.
3. Zero emoji w interfejsie, statusach i mailach – R02.5, P21.
4. Tylko e-maile transakcyjne z #17/#18; bez push, dźwięków, marketingu – R02.4, P20.
5. Gęstość wg strefy: gęsto w listach mentora, luźno w sesji i na szczegółach pytania – K1.
6. `/m/{slug}` na 375 × 812: tożsamość, publiczna praca i ceny na pierwszym ekranie – K2.
7. Ciepło z bazy i tonu słów; zakaz gradientów, `backdrop-blur`, kart z cieniem jako jedynego podziału, iskierek – K3, A01.
8. `font-mono` dla kodu, ścieżek, kwot i slugów; reszta `font-ui` – DK2.
9. Wszystkie animacje 0 ms przy `prefers-reduced-motion`; wiadomości czatu bez animacji wejścia – DK3, R02.2.
10. Ton: konkretne kwoty i stany, bez wykrzykników i marketingu, po polsku – P29.
11. Cele dotyku ≥ 24 × 24 px (WCAG 2.5.8); fokus zawsze widoczny (`focus-ring`, 2 px).
12. Zakazy z antyreferencji: bez ocen, wyszukiwarki mentorów, planów subskrypcji, pasków postępu, ikon kamery, bramki rejestracji przed pytaniem – A02–A07.

**Cechy komponentów**
- Lista (zapytania, dni, sloty): wiersze rozdzielone `border-divider` 1 px, bez kart; `list-row-padding-y` – R01.1, R01.3.
- Wiadomość czatu: imię autora + godzina (`text-meta`, `text-muted`) – R02.3; jedna liniowa rozmowa, bez wątków, reakcji i pickera emoji – R02.7, P21.
- Pole pisania czatu: stale na dole; Enter = nowa linia, Ctrl/Cmd+Enter wysyła, podpowiedź pod polem – R02.2, K4.
- Nagłówek sesji: jedna cienka linia „Czat tekstowy · 12:30–12:55”, nic więcej stale widocznego – K5.
- Nawigacja: mentor – górna, 3 pozycje (Zapytania, Strona, Dostępność); deweloper – brak; bez bocznego paska – R02.6.
- Blok kodu: `surface-code`, `font-mono`, `radius-control`, `space-inside-panel` – R01.2.
- Przełącznik 25/50: wybrany = `action-primary-fill` + `text-on-action`; niewybrany = `border-control` – R01.5.
