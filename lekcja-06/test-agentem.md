# Test design systemu agentem — ekran „Wypłaty mentora” (/mentor/payouts, #22)

Data: 2026-10-19. Gałąź: `lekcja-06-design-system`. Bez commita.

Źródła przeczytane: `AGENTS.md`, `docs/design-system.md`, `packages/ui/docs/guide/*.mdx`, `docs/foundations/SpacingAndLayout.mdx`, `Typography.mdx` (fragmenty), MDX komponentów (Button, Alert, StatusText, Panel, List), wzorce `GroupedList`, `DetailView`, `RequestStatusPage`, kod `src/components/*`, `src/product/shared/*`, `src/product/e01/Mentor.tsx` (MentorNav), `src/product/e02/*`, `.storybook/screens.tsx`, `fixtures.ts`, `helpers.tsx`, `scripts/check-tokens.mjs`. Brief i backlog tylko jako treść (D07, R13, D12, Q01).
Nie czytano (zgodnie z zakazem): `packages/ui/POSTEP.md`, `lekcja-06/*` — mimo że `docs/design-system.md` odsyła do nich jako źródeł reguł.

## Pliki

- `packages/ui/src/product/e04/MentorPayouts.tsx` — ekran (nieeksportowany).
- `packages/ui/src/product/e04/MentorPayouts.stories.tsx` — 18 story („Product/E04 Mentor payout/Screens”).

**Decyzja o ścieżce:** zamiast sugerowanego `src/product/payouts/` użyto `src/product/e04/`, bo Contributing.mdx („What a new component must have”, pkt 1) każe trzymać kod produktu w `src/product/<epic>/`, a istniejące foldery to `e01/`, `e02/`. Story leży obok ekranu, a nie w `src/product/screens/` + `.storybook/screens.tsx` (tam są kompozycje ekranów E01/E02), bo test pozwala zapisać tylko dwa pliki. To odstępstwo od przykładu, nie od reguły — reguły dla „ekranu” jako takiego nie ma (luka D5).

## Krok 1. Decyzje

| # | Decyzja | Kategoria | Źródło / założenie |
|---|---|---|---|
| 1 | Ramka: `PageLayout` szerokości `wide` | REGUŁA | `PageLayout.tsx` (doc prop `width`: „wide: mentor lists and editors”), design-system.md tabela komponentów |
| 2 | `MentorNav` na górze (ekran mentora, bez sidebaru) | REGUŁA | design-system.md „If… then use…” (switching mentor views → MentorNav), SpacingAndLayout „No sidebar” |
| 3 | Aktywna pozycja nawigacji | ZGADUJĘ | `MentorSection` = `requests \| page \| availability`, brak „Wypłaty”. Użyto `current="requests"` → `aria-current` wskazuje złą stronę |
| 4 | Licznik „N zapytań czeka na decyzję” tylko w nawigacji | PRZYKŁAD | `RequestsScreen` w `.storybook/screens.tsx` (zasada R01.6 jest, ale wartość licznika na innym ekranie — przykład) |
| 5 | Wzorzec ekranu: stan + kwota + lista | ZGADUJĘ | Brak wzorca „podsumowanie konta + lista”. Złożono Detail view (stan na górze) + Grouped list |
| 6 | Jeden `h1` „Wypłaty” | REGUŁA | Typography.mdx: „One page heading per screen” |
| 7 | Stan konfiguracji jako pierwsza rzecz pod nagłówkiem, słowami | REGUŁA | DetailView.mdx Rules wiersz 1; StatusText.mdx |
| 8 | Stan pod `h1` (nie w `h1`) | PRZYKŁAD | `RequestDecision` (pod h1) vs `RequestStatusView` (w h1) — dwa przykłady, brak reguły kiedy który |
| 9 | Górny blok w `max-w-text` | PRZYKŁAD | `RequestDecision` (`article max-w-text`) |
| 10 | Kwoty jako `dl` z liniami 1 px | REGUŁA | HowToChoose.mdx „label–value facts → RequestSummary-style dl”. Komponentu brak — skopiowano klasy z `RequestSummary` |
| 11 | Wyróżnienie kwoty „Do wypłaty” (`text-heading-section font-strong`) | ZGADUJĘ | Brak zasady dla „kwoty głównej/salda” |
| 12 | Każda kwota przez `Amount` (Geist Mono, pl-PL) | REGUŁA | Content.mdx „Formats”, design-system.md |
| 13 | Kwota po prowizji i grosze | ZGADUJĘ | `formatMoney` zaokrągla do pełnych złotych; prowizja nieustalona (Q01). Dane przykładowe = ceny brutto 150/280 zł, bez zdania o prowizji |
| 14 | Jedna akcja główna `Button primary` | REGUŁA | Button.mdx §5, design-system.md |
| 15 | Etykieta „Skonfiguruj wypłaty w Stripe” / „Uzupełnij dane w Stripe” (czasownik + obiekt, bez kwoty) | REGUŁA | Content.mdx „Buttons: verb + object”; brak kwoty, bo pieniądze nie ruszają w tym kroku (założenie) |
| 16 | `Button` (akcja serwera → przekierowanie), nie `TextLink` | PRZYKŁAD | `RequestForm` (Stripe Checkout: `loading` + Spinner „Przekierowujemy do płatności…”). Reguła mówi „navigation → TextLink” |
| 17 | Zapowiedź opuszczenia DevMentora („Otworzy się strona Stripe…”) | ZGADUJĘ | `TextLink external` ma ikonę i sr-only, `Button` nie ma odpowiednika |
| 18 | Stany „w toku” i „gotowe” bez akcji głównej | ZGADUJĘ | SpacingAndLayout: „every screen has one primary action” vs DetailView: „decided object shows no action buttons” |
| 19 | „W toku”: secondary „Odśwież stan” | PRZYKŁAD | `RequestStatusView` (payment_pending + „Odśwież”) |
| 20 | „Gotowe”: secondary „Otwórz panel wypłat w Stripe” | ZGADUJĘ | Brak specyfikacji #22 |
| 21 | „Wymagane uzupełnienie”: `StatusText tone="waiting"` | REGUŁA | StatusText.mdx §5 „waiting: someone has to act”; Alert.mdx: brak tonu ostrzegawczego (S10) |
| 22 | Teksty czterech stanów konfiguracji | ZGADUJĘ | Wzór „stan — co to znaczy dla ciebie” jest regułą (Content.mdx), konkretne słowa — zgadnięte |
| 23 | Lista sesji: `List` + `ListRow`, pogrupowana | REGUŁA | HowToChoose.mdx „many items of one kind”, GroupedList.mdx |
| 24 | Grupy „Do wypłaty” → „Wypłacone” | ZGADUJĘ | Kolejność grup zdefiniowana tylko dla zapytań (#18) |
| 25 | Wiersz: „Kuba · 25 min”, meta: termin · kwota | PRZYKŁAD | `RequestList`; kwota w meta — założenie |
| 26 | Słowa stanu wypłaty w wierszu (Wstrzymane — czeka na dane do wypłaty / Do wypłaty / Wypłata w drodze / Wypłacone) | ZGADUJĘ | Brak słownika stanów wypłat |
| 27 | Sortowanie od najnowszej | PRZYKŁAD | `RequestList` (grupa „Zakończone” odwrócona) |
| 28 | Wiersze bez `href` (brak strony szczegółów sesji) | ZGADUJĘ | Brak zasady, kiedy wiersz musi prowadzić dalej |
| 29 | Godziny w wierszach bez nazwy strefy | PRZYKŁAD | `RequestList` — sprzeczne z Content.mdx („zone named nearby”) |
| 30 | Ładowanie: `Skeleton` | REGUŁA | HowToChoose.mdx „Skeleton and spinner” |
| 31 | Nagłówek widoczny podczas ładowania/błędu, 6 linii szkieletu | PRZYKŁAD | `RequestsScreen` / `RequestList` |
| 32 | Błąd wczytania: `StateMessage error` + „Odśwież”, bez częściowych danych | REGUŁA | GroupedList.mdx Rules, StateMessage API |
| 33 | Brak opłaconych pytań: `StateMessage empty` (dlaczego + następny krok) z `CopyField` linku | REGUŁA | Content.mdx „Empty states”; przykład `RequestList` |
| 34 | Funkcja jeszcze niedostępna: `StateMessage` zamiast przycisku z `disabledReason` | ZGADUJĘ | Brak zasady dla „jeszcze niedostępne” — oba komponenty pasują |
| 35 | Opłacone pytanie, ale zero zakończonych sesji: `StateMessage empty` pod treścią | ZGADUJĘ | Brak zasady dla pustej podsekcji obok innej treści |
| 36 | Powrót od Stripe (zakończony): `Alert success` | REGUŁA | Alert.mdx §5 „success: it worked and there is a next step” |
| 37 | Powrót przerwany: `Alert info` | REGUŁA | Alert.mdx §5 (brak warning, „info with clear words covers it”) |
| 38 | Miejsce komunikatu powrotu: pod stanem, nad kwotami | ZGADUJĘ | Alert „next to the work” — nie mówi, co jest „pracą” na takim ekranie |
| 39 | Nieudane otwarcie Stripe: `Alert danger` co się stało + co zrobić + że nic się nie zmieniło | REGUŁA | Content.mdx „Errors”, Alert.mdx §8 (money) |
| 40 | Tekst braku sieci poza formularzem | ZGADUJĘ | `NETWORK_MESSAGE` kończy się „Wpisane dane zostały w formularzu” — nie pasuje |
| 41 | Blokada podwójnego kliknięcia, `loading`, Spinner przy przekierowaniu | PRZYKŁAD | `RequestForm` |
| 42 | `aria-live="polite"` na bloku stanu | PRZYKŁAD | `RequestStatusView` |
| 43 | Odstępy: `gap-between-sections` sekcje, `gap-between-groups` w górnym bloku, `gap-in-group` w nagłówku i grupach | REGUŁA | SpacingAndLayout.mdx tabela relacji |
| 44 | Kolory tylko przez komponenty/tokeny, brak własnych | REGUŁA | design-system.md „Forbidden in components” |
| 45 | Telefon: przycisk główny nie `fullWidth` | ZGADUJĘ | `fullWidth` opisany tylko dla `/m/{slug}`; prop jest boolean, nie responsywny |
| 46 | 320 px: jedna kolumna, zawijanie | REGUŁA | UsageAndAccessibility.mdx „Layout at different widths” |
| 47 | Dużo pozycji (40): pełna lista, bez stronicowania | ZGADUJĘ | Limit („ostatnie 30 dni”) jest tylko dla zapytań |
| 48 | Polski, neutralny płciowo, bez wykrzykników i emoji | REGUŁA | Content.mdx (C12), design-system.md |
| 49 | Dane przykładowe z briefu/specyfikacji (Anna K., Kuba, Ola, 150/280 zł) | REGUŁA | Contributing.mdx pkt 5 |
| 50 | Brak pól bankowych, hostowana strona Stripe | REGUŁA | Brief D07, R13 (treść); `InvitationPanel` „no bank fields” |
| 51 | Kod w `src/product/e04/` | REGUŁA | Contributing.mdx pkt 1 |
| 52 | Story obok ekranu, nazwy „S10 Payouts · …” | PRZYKŁAD | `E02Screens.stories.tsx` (nazwy S6–S9); numer S10 i lokalizacja — założenie |

**Suma: REGUŁA 23 · PRZYKŁAD 12 · ZGADUJĘ 17 (razem 52).**

## Krok 2. Zbudowany ekran

Stany w story (18): ładowanie, błąd wczytania, brak opłaconych pytań, pierwsza konfiguracja, pierwsza konfiguracja bez zakończonej sesji, otwieranie Stripe (przekierowanie), oczekiwanie na link, błąd linku, brak sieci, w toku u Stripe, gotowe, wymagane uzupełnienie, powrót zakończony (→ w toku), powrót zakończony (→ gotowe), powrót przerwany, 40 sesji, telefon 375 px, 320 px.

Sprawdzenia (z katalogu głównego):
- `npm run check:tokens` → **OK**, 0 znalezisk; 11 linii „ignored” to istniejące wcześniej przykłady w `docs/guide/StartHere.mdx`, `WhatToAvoid.mdx`, `.storybook/blocks/contrast.ts` — żadna z nowych plików.
- `npm run typecheck:ui` → **OK** (za pierwszym razem 3 błędy typów w story: `fn()` w `meta.args` zawęża typ; poprawione przez jawny typ `OpenStripeResult` i owinięcie nadpisań w `fn`).
- Dodatkowo: `eslint packages/ui/src/product/e04` → czysto; `vitest --project=storybook src/product/e04` → 18/18 (render, play, axe) w jasnym motywie. `test:themes` nie uruchamiano.

## Luki

### A. Brakujący komponent

| # | Luka | Co zgadłem i gdzie | Co dopisać do design systemu |
|---|---|---|---|
| A1 | Lista „etykieta–wartość” (`dl` z liniami 1 px) istnieje tylko wewnątrz `RequestSummary` | Skopiowałem klasy `RequestSummary` do bloku kwot (`MentorPayouts.tsx`, `dl`) | To już drugie użycie → wg Contributing kwalifikuje się na prymityw (np. `SummaryList`/`FactList`) z dokumentacją; do tego czasu opisać markup jako wzorzec w HowToChoose |
| A2 | `MentorNav` nie ma pozycji „Wypłaty”, `current` jest wymagany i zamknięty typem | `current="requests"` — błędny `aria-current` (decyzja 3) | Zdecydować, czy „Wypłaty” to czwarta pozycja nawigacji (R02.6 mówi o trzech ekranach) albo pozwolić na `current` opcjonalny; dopisać do MentorNav docs |
| A3 | Brak „kwoty głównej / salda” | `Amount` w `dd` z `text-heading-section font-strong` (decyzja 11) | Reguła typograficzna dla kwoty, która jest głównym faktem ekranu (rozmiar, czy w `dl` czy jako linia stanu) |
| A4 | Brak wspólnego mechanizmu „akcja serwera → przekierowanie do dostawcy” | Przepisałem logikę z `RequestForm` (pending, redirecting, Spinner, blokada podwójnego kliknięcia) | Wzorzec „Redirect to a hosted provider page” (Stripe Checkout, Stripe Connect onboarding): etykieta, zapowiedź opuszczenia strony, stan oczekiwania, błąd, brak sieci, powrót |

### B. Brakujący stan

| # | Luka | Co zgadłem i gdzie | Co dopisać |
|---|---|---|---|
| B1 | Ton ostrzegawczy (Alert/StatusText) — „dostawca prosi o uzupełnienie, wypłaty wstrzymane” | `StatusText waiting` + przycisk główny (decyzje 21, 37) | WhatIsMissing każe wrócić z propozycją przy „an expiring link or similar” — to jest ten przypadek; rozstrzygnąć warning albo zapisać, że `waiting` + primary to odpowiedź |
| B2 | Ekran w stanie, w którym nie ma nic do zrobienia (w toku, gotowe) | Brak primary, secondary „Odśwież stan” / „Otwórz panel wypłat w Stripe” (decyzje 18–20) | Zasada: „gdy nie ma akcji, ekran nie ma primary” jako wyjątek od K1/K6 |
| B3 | „Funkcja jeszcze niedostępna” (warunek biznesowy, R13) | `StateMessage kind="empty"` + `CopyField` (decyzje 33–34) | Wskazać: `StateMessage empty` vs `Button disabledReason` — kiedy który; ew. opisać w StateMessage.mdx jako przypadek „not yet available” |
| B4 | Powrót od zewnętrznego dostawcy (sukces / przerwanie / wygasły link) | `returnFrom` + `Alert success` / `Alert info` pod stanem (decyzje 36–38) | Stany powrotu we wzorcu z A4; RequestStatusPage pokrywa tylko powrót z płatności dewelopera |
| B5 | Pusta podsekcja obok innej treści (są kwoty/stan, nie ma sesji) | `StateMessage empty` pod blokiem górnym (decyzja 35) | Zasada dla pustej sekcji wewnątrz strony (StateMessage zakłada, że zastępuje cały region) |
| B6 | Dużo danych bez limitu | 40 wierszy bez stronicowania (decyzja 47) | Reguła limitu/„pokaż starsze” dla list historycznych (GroupedList ma tylko „last 30 days” dla zapytań) |

### C. Brakująca zasada (kiedy czego używać)

| # | Luka | Co zgadłem i gdzie | Co dopisać |
|---|---|---|---|
| C1 | **Kwoty z groszami.** `formatMoney`/`Amount` zawsze zaokrąglają do pełnych złotych; kwota należna po prowizji (D12: prowizja konfigurowalna, Q01 otwarte) może mieć grosze — zaokrąglenie przekłamie pieniądze | Dane przykładowe tylko w pełnych złotych; nie pokazałem prowizji (decyzja 13) | Reguła w Content.mdx „Formats”: kiedy grosze (wypłaty, prowizja), opcja w `Amount`; plus zdanie, jak pokazać prowizję |
| C2 | `Button` vs `TextLink`, gdy przycisk tworzy link po stronie serwera i wyprowadza poza produkt | `Button` jak w `RequestForm` + zdanie „Otworzy się strona Stripe…” (decyzje 16–17) | Wiersz w HowToChoose: „leaves DevMentor for a hosted provider page → Button primary + hint”; jak zapowiadać wyjście (Button nie ma `external`) |
| C3 | Kolejność i nazwy grup dla list innych niż zapytania | „Do wypłaty” → „Wypłacone”, od najnowszych (decyzje 24, 27) | Ogólna reguła GroupedList: grupy „wymaga działania → w toku → zakończone” niezależnie od obiektu |
| C4 | Kiedy `ListRow` bez `href` | Wiersze sesji statyczne (decyzja 28) | Zdanie w List.mdx: wiersz bez detalu jest statyczny, nie dorabiać linku |
| C5 | Słownik stanów wypłat i konfiguracji | Własne teksty (decyzje 22, 26) | Brak specyfikacji #22 — po jej napisaniu dodać słowa do Content.mdx (jak dla zapytań) |
| C6 | Komunikat „brak sieci” dla akcji poza formularzem | Własny tekst bez „Wpisane dane zostały w formularzu” (decyzja 40) | Drugi wariant `NETWORK_MESSAGE` dla akcji bez formularza w `shared/form.ts` i Content.mdx |
| C7 | Przycisk główny na telefonie | Naturalna szerokość (decyzja 45) | Reguła `fullWidth` dla wszystkich ekranów < 768 px albo „tylko /m/{slug}”; prop jest boolean — jak robić responsywnie bez klas spoza systemu |
| C8 | Gdzie i jak budować ekran (nie komponent) | Folder `src/product/e04/`, story obok (decyzje 51–52) | Contributing opisuje tylko komponenty; brak zasady dla kompozycji ekranu (`.storybook/screens.tsx` + `src/product/screens/*Screens.stories.tsx` vs komponent ekranu w `src/product/<epic>/`) |

### D. Niejasna albo sprzeczna dokumentacja

| # | Sprzeczność | Co wybrałem | Co poprawić |
|---|---|---|---|
| D1 | SpacingAndLayout: „every screen has one primary action” vs DetailView: „decided object shows its result and no action buttons” | Brak primary w stanach „w toku”/„gotowe” | Ujednolicić: „one primary action at most” |
| D2 | Stan w `h1` (RequestStatusPage, `RequestStatusView`) vs `h1` = obiekt, stan pod nim (DetailView, `RequestDecision`) | Pod `h1` | Reguła: kiedy stan jest nagłówkiem strony |
| D3 | Content.mdx: czas „with the zone named nearby” vs `RequestList` bez strefy w wierszach | Jak `RequestList` (bez strefy) | Zasada dla list mentora (strefa raz nad listą albo wcale) |
| D4 | `docs/design-system.md` każe szukać źródeł w `lekcja-06/referencje.md`, `tokeny.md` i `POSTEP.md`; kody (R01.5, K1, K6, P18, S10, C12…) bez nich są nieczytelne. WhatIsMissing wiąże #22 z POSTEP.md | Interpretowałem reguły z samego zdania obok kodu | Źródła potrzebne agentowi przenieść do pakietu (np. słownik kodów w Storybooku) albo jasno napisać, że kod źródła nie jest potrzebny do stosowania reguły |
| D5 | Lokalizacja: zadanie sugeruje `src/product/payouts/`, pakiet ma `src/product/<epic>/` (e01, e02), a ekrany jako kompozycje w `.storybook/screens.tsx` | `src/product/e04/` | Patrz C8 |
| D6 | `AGENTS.md` zaczyna się blokiem o Next.js, który nie dotyczy `packages/ui` | Pominąłem | Zaznaczyć, że blok dotyczy `app/`, nie pakietu UI |
| D7 | `Alert` „info: worth knowing before acting” vs rola „brak warning — info covers it”: info ma dwa znaczenia (neutralna informacja i ostrzeżenie) | `info` dla przerwanego powrotu | Patrz B1 |

## Wartości wpisane na sztywno

`npm run check:tokens` — OK, 0 znalezisk w nowych plikach (11 „ignored” to stare, świadome przykłady w dokumentacji). Nowe pliki nie mają kolorów, odstępów, promieni, `style=`, klas palety ani wartości arbitralnych. Na sztywno są tylko teksty UI (brak specyfikacji #22) i przykładowy URL Stripe w story.

## Zamknięcie luk (2026-10-19)

Decyzje: K. Marczak przez delegację, 2026-10-19 (zapis w `packages/ui/POSTEP.md`). Każda luka ma zasadę w dokumentacji albo wpis w „What is missing”.

| Luka | Co zrobiono | Gdzie |
|---|---|---|
| A1 | Nowy prymityw `DescriptionList` (13 sekcji + stories); `RequestSummary` i szkic E04 go używają; przykład reguły „drugie użycie” | `src/components/description-list/*`, `docs/guide/Contributing.mdx` |
| A2 | `MentorNav.current` opcjonalne; „Wypłaty” jako 4. pozycja → What is missing | `src/product/e01/Mentor.tsx`, `E01Components.mdx`, `WhatIsMissing.mdx` |
| A3 | Zasada: główna kwota ekranu = `DescriptionList` `emphasis` (jedna) | `Typography.mdx`, `DescriptionList.mdx` |
| A4 | Wzorzec „Redirect to hosted provider page” + `HostedRedirectAction`, `HostedReturnNotice`; E04 ich używa; `RequestForm` (własna implementacja) → What is missing | `src/patterns/HostedRedirect.*`, `src/product/shared/HostedRedirect.tsx` |
| B1, D7 | Ton `attention` w `Alert` i `StatusText` (ikona trójkąta + słowa, bez nowego koloru); zasada info / waiting / attention / danger; E04 zaktualizowany | `Alert.mdx`, `StatusText.mdx`, `HowToChoose.mdx`, `Content.mdx` |
| B2, D1 | Zasada: najwyżej jedna akcja główna; brak, gdy nie ma nic do zrobienia | `SpacingAndLayout.mdx`, `DetailView.mdx` |
| B3 | Zasada: „jeszcze niedostępne” (warunek biznesowy) → `StateMessage empty`; jedna akcja czekająca na dane → `disabledReason` | `HowToChoose.mdx`, `StateMessage.mdx` |
| B4 | Stany powrotu od dostawcy w nowym wzorcu (completed → success, interrupted → attention) | `src/patterns/HostedRedirect.mdx` |
| B5 | Zasada: pusta podsekcja → `StateMessage` w tej sekcji, poziom nagłówka niżej | `StateMessage.mdx` |
| B6 | Limit długich list historycznych → What is missing (pytanie; propozycja: 30 dni + „Pokaż starsze”) | `WhatIsMissing.mdx`, `GroupedList.mdx` |
| C1 | `formatMoney`/`Amount`: grosze, gdy kwota niepełna („134,50 zł”), pełne bez „,00”; zasada Formats; 2 testy | `src/product/shared/format.ts`, `Amount.stories.tsx`, `Content.mdx` |
| C2 | Zasada: wyjście do dostawcy = `HostedRedirectAction` (Button + zapowiedź), nie `TextLink` | `HowToChoose.mdx`, wzorzec |
| C3 | Zasada kolejności grup: wymaga działania → w toku → zakończone | `GroupedList.mdx` |
| C4 | Zasada: `href` tylko, gdy istnieje strona szczegółów | `List.mdx` |
| C5 | Słownik stanów wypłat i prowizja → What is missing (pytanie do spec #22, Q01) | `WhatIsMissing.mdx`, `Content.mdx` |
| C6 | Trzy komunikaty braku sieci: formularz, akcja, wczytywanie (`LoadState` „offline” w `SlotList` i `RequestList` + stories) | `src/product/shared/form.ts`, `Content.mdx` |
| C7 | Zasada `fullWidth`: tylko akcja główna wąskich stron dewelopera | `Button.mdx` |
| C8, D5 | Konwencja ścieżek: prymitywy, produkt `e<NN>`, ekrany jako kompozycje, szkice nieeksportowane | `Contributing.mdx`, `docs/design-system.md` |
| D2 | Zasada: h1 = obiekt; tylko `/r/{token}` ma stan w h1 | `DetailView.mdx`, `RequestStatusPage.mdx`, `Typography.mdx` |
| D3 | `RequestList` nazywa strefę raz nad listą; zasada w Content i Grouped list | `MentorRequests.tsx`, `Content.mdx` |
| D4 | Słowniczek kodów źródeł (R01.x, A0x, K, DK, P/S/C/T, D/N/R z briefu, #) z plikami | `docs/design-system.md`, `docs/guide/StartHere.mdx` |
| D6 | Zdanie: blok Next.js w `AGENTS.md` dotyczy `app/`, nie `packages/ui` | `docs/design-system.md` |
| Ekran E04 | Szkic nieeksportowany, tytuł „(draft)”, wpis w What is missing („wymaga specyfikacji #22”) | `src/product/e04/*`, `WhatIsMissing.mdx` |
