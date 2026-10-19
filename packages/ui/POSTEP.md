# POSTĘP – design system DevMentor (`packages/ui`)

Prompt: `lekcja-06/prompt-storybook.md`. Stan na 2026-10-19.

| Etap | Stan |
|---|---|
| 0. Inwentaryzacja i plan | zakończony, zatwierdzony 2026-10-19 |
| 1. Fundamenty | zakończony, zatwierdzony 2026-10-19 (commit c21f37a) |
| 2. Komponenty bazowe | zakończony, S1–S17 rozstrzygnięte 2026-10-19 (commity 5d09a9f, 32f559f, ce6412a) |
| 3. Komponenty produktu, wzorce, ekrany | zakończony; C1–C14, S18–S20 rozstrzygnięte 2026-10-19 (commity b6da955, 8986564, 869c487) |
| 4. Strony, które uczą | zakończony 2026-10-19 (Start here, Components, How to choose, Usage and accessibility, Content, What to avoid, What is missing, Contributing, Epics E01/E02; docs/design-system.md + AGENTS.md) |
| 5. Sprawdzenie i raport | nie rozpoczęty |

W etapie 0 zapisano wyłącznie ten plik.

## Etap 1 – co powstało (2026-10-19)

- **Workspace:** root `package.json` ma `"workspaces": ["packages/*"]`; pakiet `@devmentor/ui` eksportuje źródła (`.` → `src/index.ts`, `./styles.css`, `./tokens.css`). Dowód: tymczasowy komponent kliencki z pakietu zaimportowany w `app/page.tsx` → `next build` OK (komponent w `.next/server/app/index.html`, CSS pakietu w chunku) i `next dev` OK (GET / 200 z komponentem). Dowód usunięty, `app/page.tsx` bez zmian. Plan B niepotrzebny; `transpilePackages` niepotrzebne.
- **Zależności** (dokładne wersje, tylko z planu): `radix-ui` 1.8.1, `class-variance-authority` 0.7.1, `tailwind-merge` 3.7.0, `clsx` 2.1.1, `lucide-react` 1.58.0; dev: `storybook`, `@storybook/react-vite`, `addon-docs`, `addon-a11y`, `addon-vitest`, `eslint-plugin-storybook` 10.6.2, `vitest` i `@vitest/browser-playwright` 5.0.5, `playwright` 1.64.1, `vite` 8.3.4, `@tailwindcss/vite` i `tailwindcss` 4.3.3, `remark-gfm` 4.0.1, `geist` 1.8.1. Chromium Playwrighta zainstalowany (`chromium-1248`).
- **Tokeny:** `src/styles/tokens.css` – warstwa surowa (`--raw-*`), semantyczna (`--ds-*`, każdy ze źródłem w komentarzu), komponentowa (`list-row-padding-y`, `chat-message-gap`, `icon-size-sm/md`); oba motywy (`prefers-color-scheme` + `data-theme` na `<html>`); reduced motion → 0 ms; mapowanie na Tailwinda przez `@theme inline` (`bg-surface-page`, `text-muted`, `border-control`, `outline-focus-ring`, `gap-in-group`, `p-inside-panel`, `text-heading-page`, `font-strong`, `rounded-control`, `max-w-text`, `size-icon-sm`, `ease-standard`…).
- **Aplikacja:** `app/globals.css` wg pkt 7 (import tokenów, `@source`, aliasy `--background`/`--foreground` → tokeny, usunięte Arial i stary blok dark). Root `tsconfig.json`: `exclude` + `packages`. `.gitignore`: `node_modules/`, `**/storybook-static/`. `eslint.config.mjs`: `eslint-plugin-storybook` + ignor `**/storybook-static/**`.
- **Storybook** (`.storybook/`): framework react-vite, Tailwind przez `@tailwindcss/vite`, `remark-gfm`, a11y `test: 'error'`, przełącznik motywu w pasku (Light / Dark / System → `data-theme` na `<html>`, także na stronach MDX), fonty Geist lokalnie, reset domyślnej palety/skal Tailwinda tylko w Storybooku, marka „DevMentor” (tytuł, karta przeglądarki), wyłączone: checklista startowa, „What's new”, powiadomienia o wersji (`--no-version-updates`), telemetria.
- **Foundations (7 stron MDX):** Color (role z wartościami z przeglądarki + tabela kontrastu mierzona w obu motywach), Typography, Spacing and layout, Shape and depth, Motion, Icons, Themes. Każda reguła ma źródło lub oznaczenie „proposal”.
- **Story-test** `Foundations/Color › Contrast check`: mierzy 21 par w obu motywach i kończy się błędem poniżej progu.
- **Skrypty** (`packages/ui`): `storybook`, `build-storybook`, `test`, `test:themes` (`scripts/test-themes.mjs`), `check:tokens` (`scripts/check-tokens.mjs`), `typecheck`, `lint`; w root przekierowania `storybook`, `build-storybook`, `test:storybook`, `test:storybook:themes`, `check:tokens`, `typecheck:ui`.

### Etap 1 – co sprawdzone

| Sprawdzenie | Wynik |
|---|---|
| `npm run build-storybook` | OK |
| Strony Foundations w zbudowanym Storybooku (przeglądarka) | 7/7 renderują się; tabele MDX są tabelami HTML, brak surowych `|---` |
| Tabela kontrastu | 21 par × 2 motywy, 0 poniżej progu; wartości zgodne z `tokeny.md` (np. 16,74 / 18,11) |
| Przełącznik motywu | `data-theme` na `<html>` w iframe zmienia się z paska (Light ↔ Dark) na stronie MDX; `--ds-surface-page` = `#0c0a09` w ciemnym |
| Fonty | Geist 400/600 i Geist Mono 400 załadowane lokalnie |
| Klasy spoza tokenów w Storybooku | `bg-zinc-900 p-4 rounded-xl text-white` nie daje żadnego stylu; klasy tokenów dają właściwe wartości |
| `npm run test:themes` | jasny 1/1, ciemny 1/1 |
| Test negatywny kontrastu | `text-muted` = stone-400 w jasnym → story-test FAIL (3 pary); przywrócone |
| Test negatywny a11y | tymczasowa story z pustym przyciskiem → FAIL `button-name`; usunięta |
| `npm run check:tokens` | OK (3 linie z jawnym `check-tokens-ignore` w parserze kolorów bloku dokumentacji) |
| Test negatywny `check:tokens` | tymczasowy `src/tmp-violation.tsx` → exit 1, wykryte hex, `rgb(`, `bg-zinc-900`, `text-white`, `p-[13px]`; plik usunięty |
| `npm run typecheck` (pakiet), `npm run lint` (root, obejmuje pakiet) | OK |
| `npm test` (istniejące node:test) | 7/7 |
| `next build` z nowym `globals.css` | OK |

### Etap 1 – czego nie sprawdziłem

- Wyglądu aplikacji po zmianie `globals.css` w przeglądarce (tylko `next build`); `app/page.tsx` nadal używa klas palety i `rounded-3xl` (do „What is missing”).
- Szerokości 320/768/1440 i obsługi klawiaturą w Storybooku – sens ma dopiero przy komponentach (etap 2 i 5).
- Trybu „System” przy ciemnym motywie systemu (sprawdzone tylko wymuszone Light/Dark).
- CI (`.github/workflows/ci.yml`) nie uruchamia jeszcze testów Storybooka ani `check:tokens` – nie zmieniałem workflow.

### Etap 1 – odstępstwa od planu

- Jedna konfiguracja ESLint w root (obejmuje `packages/ui`) zamiast osobnej w pakiecie – prościej, ten sam zestaw reguł.
- npm 11 zostawia pakiety Storybooka w `packages/ui/node_modules`, a `storybook` podnosi do root; dlatego `main.ts` podaje framework i dodatki jako ścieżki bezwzględne (wzorzec Storybooka dla monorepo).
- `lucide-react` przypięte do 1.58.0 (1.59.0 miało 2 dni).
- Dodane tokeny komponentowe `icon-size-sm` 16 px i `icon-size-md` 20 px (z decyzji P1).

## Etap 3 – co powstało i co sprawdzone (2026-10-19)

**Komponenty produktu** (`@devmentor/ui/product`, nowy eksport w `package.json`):

| Epik | Komponenty | Ekrany |
|---|---|---|
| wspólne | `formatMoney`/`formatTime`/`formatDay`/`formatDayFull`/`displayUrl`, `Amount` (kwoty w Geist Mono), `PageLayout` | wszystkie |
| E01 (#14–#16) | MentorIdentity, MentorDescription, PriceList, LengthToggle, SlotList, MentorNotFound, MentorNav, InvitationPanel, AccessMessage, MentorPageForm, ShareLinkPanel, NoAvailabilityNotice, AvailabilityEditor, SlotPreview | S1–S6 |
| E02 (#17–#19) | RequestForm, RequestStatusView, RequestSummary, QuestionText, SaveLinkBox, QuestionCopyBox, CancelRequest, CancelNotPossible, RequestList, RequestDecision, RequestNotFound | S6–S9 |

- Stany danych (gdzie mają sens): ładowanie, pusto, błąd, częściowe dane, dużo danych (30 zapytań, 10 dni × 16 terminów), długie teksty (opis 2000 znaków, długie imiona i adresy), 320 px.
- Formularze: stany odpowiedzi akcji przez asynchroniczne `fn()` z kodami ze specyfikacji – sukces, oczekiwanie (podwójne kliknięcie ignorowane), błąd pola (fokus na pierwszym błędzie; w grupie radio – na zaznaczonej opcji), błąd serwera, brak sieci; #17 także `slot_taken`, `price_changed`, `checkout_failed`, `payments_unavailable`.
- **Wzorce (8, każdy z MDX i stories na stan):** Form (8 stanów), Grouped list (5), Detail view (3), Confirm irreversible decision (3), Request status page (5), Share link (3), Invitation-only gate (4), Time-zone-aware slots (5, w tym zmiana czasu 25.10).
- **Ekrany S1–S9 na pełny ekran:** 56 stories (E01: 21, E02: 35) + dwie strony „Screens state map” (tabela ekran → trasa → specyfikacja → stan → link do story), generowane skryptem `npm run state-map` z indeksu zbudowanego Storybooka. Kompozycje ekranów w `.storybook/screens.tsx` (tylko Storybook) – składają wyłącznie komponenty z pakietu.
- Strony dokumentacji: „E01 … Components” i „E02 … Components” (tabela: komponent, ekran, stany, reguły ze źródłami, API).
- Zmiany w bazie: `RadioGroup` dostał `groups` (nagłówki dni na liście terminów; nagłówki ukryte przed czytnikiem, data zawsze w tekście opcji – spec #16); `StatusText` – ikona 20 px wyśrodkowana na pierwszej linii (`h-lh`) zamiast 16 px przesuniętej w dół; `Textarea` – licznik S14.
- Dane: tylko ze specyfikacji (Anna K., Kuba, Ola, Oliwia – founder z briefu; 150/280/180 zł; okna wt 18–20, czw 12–13; „teraz” = pon. 19.10.2026 19:00 Europe/Warsaw jak w #15).

| Sprawdzenie (po partii C) | Wynik |
|---|---|
| typecheck pakietu, `npm run lint` | OK |
| `check:tokens` | OK |
| `test:themes` | jasny 278/278, ciemny 278/278 (axe + 92 play functions łącznie) |
| `build-storybook` | OK; 278 stories, 37 stron dokumentacji |
| `next build`, `npm test` (7/7) | OK |
| Przeglądarka | S6 (kolejność: tożsamość → praca → opis → długość z cenami → terminy), S7 (stan na górze, „Zapisz ten link” jako treść główna), S8 (grupy, jeden licznik – w nawigacji); 12 stron wzorców i produktu renderuje się (tabele, płótna, 56 linków w mapach stanów) |
| Test S6 przy 375 px | opcja „50 min — 280 zł” mieści się w pierwszych 812 px (K2, #16) |

**Czego nie sprawdziłem:** czytnika ekranu na żywo; integracji z prawdziwymi server actions (tylko mocki z kodami ze specyfikacji); linków z map stanów kliknięciem (sprawdzona tylko obecność i format); ekranów przy 768 i 1440 px poza wybranymi.

**Propozycje treści do decyzji (C1–C14)** – teksty, których specyfikacje nie podają:

| # | Gdzie | Tekst |
|---|---|---|
| C1 | brak sieci (wszystkie formularze) | „Brak połączenia z internetem — sprawdź sieć i spróbuj ponownie. Wpisane dane zostały w formularzu.” |
| C2 | błąd serwera w edytorze | „Nie udało się zapisać po naszej stronie — spróbuj ponownie za chwilę. Wpisane dane zostały w formularzu.” |
| C3 | edytor po zapisie | „Szkic zapisany — strona nie jest jeszcze widoczna” / „Zmiany są już na twojej stronie — link się nie zmienił” |
| C4 | dostępność | „Dostępność zapisana”; „Nie udało się zapisać dostępności — spróbuj ponownie. Twoje okna zostały na ekranie.” |
| C5 | #17 `slot_not_offered` | „Tego terminu nie ma już w ofercie — wybierz inny” |
| C6 | #17 `page_unavailable` | „Ten mentor nie przyjmuje teraz zapytań. Nic nie zostało pobrane.” |
| C7 | #17 `payments_unavailable` | „Płatności są chwilowo niedostępne — spróbuj za chwilę. Nic nie zostało pobrane.” |
| C8 | pod przyciskiem płatności | „Płacisz z góry. Jeśli mentor odrzuci pytanie albo nie zdecyduje przed terminem, zwrot jest automatyczny.” (D05) |
| C9 | odmowy #18 poza „deweloper anulował” | „To pytanie jest już zaakceptowane / odrzucone”, „Termin już się zaczął — nie można już zdecydować”, „Termin minął — zwrot został zlecony automatycznie” |
| C10 | brak dostępu do zapytania | „Nie ma takiego zapytania albo nie masz do niego dostępu” |
| C11 | stany listy „Zakończone” | „Zakończone — odrzucone / przeterminowane / anulowane” |
| C12 | etykiety pól edytora i podpowiedzi | „Imię i nazwisko” (Tak zobaczy cię deweloper, np. Anna K.), ~~„Co już robiłeś”~~ → „Twoje doświadczenie” (decyzja C12), „Adres strony” |
| C13 | imiona w pytaniach dialogów | imię w mianowniku poza pytaniem („Odrzucić to pytanie?” + „Kuba, jutro 12:30.”) – polska odmiana nie jest generowana |
| C14 | format dnia | „dziś”, „jutro”, inaczej „czw. 22.10”; czytnik: „jutro, wtorek 20.10, 18:00” |

**Inne propozycje:** S18 – nagłówek „Ceny” nad `PriceList` (spec go nie nazywa); S19 – `RequestStatusView` ogłasza zmianę stanu przez `aria-live="polite"`; S20 – na S6 ceny pokazuje przełącznik długości (bez osobnej `PriceList`, żeby nie dublować kwot).

## Etap 2 – co powstało i co sprawdzone (2026-10-19)

**Komponenty bazowe (18 stron dokumentacji, eksport z `@devmentor/ui`):**

| Partia | Komponenty | Commit |
|---|---|---|
| 1 | Button, IconButton, TextLink, Spinner, FormField + Label, TextInput | 5d09a9f |
| 2 | Textarea, Select, RadioGroup (list, segmented), Panel, List + ListRow, StatusText | 32f559f |
| 3 | Alert, ConfirmDialog, StateMessage, Skeleton, CodeBlock + InlineCode, CopyField | (ten commit) |

- Każda strona ma 13 sekcji (sprawdzone w zbudowanym Storybooku: 13 nagłówków sekcji na każdej z 18 stron, tabele MDX jako HTML, tabela API z react-docgen).
- Stories: 95 (Primitives) + 1 (Foundations) = 96; w każdym komponencie Playground, warianty, macierz stanów (`data-preview-state` – te same klasy `hover:`/`focus-visible:`/`focus-within:`/`active:`, w CSS Storybooka `@custom-variant`), długa treść / 320 px, test interakcji. Testów z play function: 23 (22 komponentowe + kontrast).
- Komponenty bez stanów interaktywnych (Panel, StatusText, StateMessage, Skeleton) mają story „States (static)” z wyjaśnieniem, dlaczego macierz nie dotyczy; CopyField pokazuje stany „skopiowano” i „schowek zablokowany” w dwóch testach.
- **Wyjątek a11y (opisany):** `Select › Open list` – reguła `aria-hidden-focus` wyłączona tylko w tej story (Radix ukrywa resztę strony i pułapkuje fokus w liście; WAI-ARIA listbox). Pozostałe 95 stories: axe bez naruszeń w obu motywach.
- Zmiany infrastruktury: `cn` z `tailwind-merge` znającym nazwy tokenów; `check:tokens` wykrywa też numeryczne odstępy (`p-4`, `gap-2`) i pomija warianty arbitralne (`data-[state=checked]:`); Storybook nie resetuje już domyślnej skali odstępów (wartości 0 – `min-w-0`, `inset-0` – muszą działać tak samo jak w aplikacji); `optimizeDeps` dla stabilnego pierwszego uruchomienia testów; favicon produktu (P9); tokeny `border-action-primary-fill-hover` i `border-status-danger` (mapowanie istniejących wartości, bez nowych kolorów).
- Dane w przykładach: tylko imiona, kwoty, teksty i adresy ze specyfikacji (Anna K., Kuba, Ola, 150/280/180 zł, „Ten termin właśnie się zajął…”); adres aplikacji z `.env.example` (`http://localhost:3000`).

| Sprawdzenie (po partii 3) | Wynik |
|---|---|
| `npm run typecheck` (pakiet) | OK |
| `npm run lint` (root) | OK |
| `npm run check:tokens` | OK (3 opisane linie ignorowane w parserze bloku kontrastu) |
| `npm run test:themes` | jasny 96/96, ciemny 96/96 |
| `npm run build-storybook` | OK |
| `next build` (aplikacja) | OK |
| Przeglądarka | 18 stron komponentów: 13 sekcji, tabele, API; dialog w ciemnym motywie (portal dostaje motyw z `<html>`), dialog przy 320 px (przyciski w kolumnie, akcja na górze); macierze stanów Button i RadioGroup; favicon i tytuł „DevMentor” |

**Czego nie sprawdziłem:** czytnika ekranu na żywo (tylko role/nazwy w testach), Safari/Firefox (testy tylko w Chromium), trybu „System” przy ciemnym motywie systemu, wszystkich stories na 768 i 1440 px (sprawdzane wybiórczo).

## Etap 2 – różnice wobec domyślnej bazy shadcn

Baza: shadcn/ui (styl „new-york”, Tailwind 4) na `radix-ui`. Od Radix bierzemy zachowanie i dostępność; wygląd w całości z tokenów. Komponenty napisane na wzór plików shadcn (ta sama budowa: `cva` + `cn` + prymitywy Radix), bez CLI shadcn – CLI dodaje `tw-animate-css` i domyślne zmienne (`--primary`, `--ring`…), które i tak trzeba by usunąć (zasada 6). Pochodzenie zapisane też w notatce technicznej (strona „Contributing”, etap 4).

Oznaczenia: **źródło** = decyzja z materiałów; **S#** = propozycja agenta (materiały milczą), do zbiorczej decyzji po etapie.

| Cecha | Domyślnie w shadcn | U nas | Źródło |
|---|---|---|---|
| Wysokość kontrolki (przycisk, pole, select) | 36 px (`h-9`) | 40 px wynikające z tokenów: interlinia 24 px + `py-in-group` 2 × 8 px; bez osobnego tokenu wysokości | S1 (propozycja; ≥ 24 × 24 px – WCAG 2.5.8; telefon na `/m/{slug}` – K2) |
| Promień | `rounded-md` (6 px), pigułki w badge, koła w awatarze | `rounded-control` 4 px wszędzie; jedyny wyjątek: okrągły wskaźnik radia (konwencja kontrolki) | A01; wyjątek radia – S2 |
| Obramowanie pól | `border-input` (jasny, ok. 1,3 : 1) | `border-control` 1 px (4,59 : 1) | R01.3, WCAG 1.4.11 |
| Cień | `shadow-xs` na polach i przycisku outline, `shadow-lg` na menu i dialogu | brak; menu i dialog oddzielone `border-control` i tłem `surface-scrim` | P2, A01 |
| Fokus | `ring-[3px] ring-ring/50` (półprzezroczysty, wartość arbitralna) | `outline-2 outline-offset-2 outline-focus-ring` (2 px, pełny kolor, odstęp) | WCAG 2.4.7, tokeny.md reguła 11 |
| Padding przycisku i pola | `px-4 py-2` / `px-3 py-1` | `px-inside-panel py-in-group` (16 / 8 px) | tokeny.md (relacje odstępów) |
| Typografia kontrolek | `text-sm font-medium` (14 px / 500) | `text-body` 16 px; przycisk i etykieta `font-strong` 600 | P2 (wagi 400/600), P7 (etykieta 600); 16 px w polu – S3 (zapobiega powiększaniu na iOS, czytelność) |
| Warianty przycisku | default, destructive, outline, secondary, ghost, link; 4 rozmiary | `primary` (jedna główna akcja), `secondary`; jeden rozmiar; link to osobny `TextLink` | R01.5, P18; brak `destructive`: kolor błędu bliski akcji (tokeny.md) – S4 |
| Hover / wciśnięty | `bg-primary/90` (przezroczystość) | primary → `action-primary-fill-hover`; secondary → `bg-surface-code` | DK1 (hover/pressed); secondary – S5 |
| Zablokowany | `opacity-50`, `pointer-events-none`, bez wyjaśnienia | `bg-surface-code text-muted border-control` (czytelny kontrast), przyczyna zawsze tekstem obok (`aria-describedby`); w trakcie wysyłania zamiast blokady – stan „ładowanie” | Prompt (zablokowany z wyjaśnieniem); spec #17 (blokada podwójnego wysłania); wygląd – S6 |
| Ładowanie | brak | `Spinner` + niezmieniona etykieta, `aria-busy`, kliknięcia ignorowane | spec #17 („Button disabled while submitting”) |
| Błąd pola | `aria-invalid:border-destructive` + ring | `border-status-danger` + komunikat słowami pod polem (`aria-describedby`), fokus na pierwszym błędzie | spec #14, #17; WCAG 3.3.1, 1.4.1 |
| Tło pola | `bg-transparent` | `bg-surface-panel`; tylko do odczytu: `bg-surface-code` | tokeny.md (`surface-panel` dla pól); read-only – S7 |
| Menu selecta | animacje `tw-animate-css` (zoom, slide) | tylko przezroczystość, `duration-menu`, 0 ms przy reduced motion | DK3, P7 |
| Stan wybrany (radio, 25/50) | kropka w kółku / brak segmentów | radio: kropka + tekst; segment 25/50: `action-primary-fill` + `text-on-action` + ikona `Check` (nie tylko kolor) | tokeny.md (przełącznik 25/50), WCAG 1.4.1, audyt (kolor jedynym nośnikiem) |
| Badge | pigułka z kolorem | `StatusText`: słowo stanu, opcjonalna ikona, bez tła i pigułki | R01.6, P19, A01 |
| Szkielet | `animate-pulse` | statyczny blok `bg-surface-code` + tekst dla czytnika „Wczytywanie…” | P7 / Motion („nic nie rusza się samo”); S8 |
| Spinner | `animate-spin` | obrót tylko w trakcie oczekiwania, zatrzymany przy reduced motion, zawsze z tekstem | DK3; S9 |
| Alert | ramka + ikona, wariant destructive | tło `surface-code`, bez ramki (ramka tylko na tym, co się klika – Shape and depth), ikona + słowa; `role="alert"` tylko dla błędów | A01, audyt; S10 |
| Dialog potwierdzenia | `shadow-lg`, `rounded-lg`, przyciski „Cancel” / „Continue” | bez cienia, `border-control`, 4 px; „Wróć” (fokus startowy) + czasownik z obiektem („Odrzucam pytanie”) | P2, prompt (potwierdzenie), P4; fokus na rezygnacji – S11 |
| Pole wymagane / opcjonalne | brak konwencji | wymagane bez znaku; opcjonalne opisane słowem „(opcjonalnie)” przy etykiecie | S12 (formularze produktu mają prawie same pola wymagane – spec #14, #17) |
| Pole bez zmiany przy najechaniu | `hover:border-ring` (zależnie od wersji) | pola i trigger selecta bez zmiany na hover | S13 (pole nie musi „zapraszać” do kliknięcia; spokojny – P3) |
| Licznik znaków | brak | tylko przy limicie ze specyfikacji, od 80 % limitu, ogłaszany z opóźnieniem (polite) | S14 (zmienione przez koordynatora 2026-10-19) |
| Wiersz listy jako link | brak | „stretched link”: cały wiersz klikalny, w DOM jeden link na wiersz | S15 |
| Kolorowanie składni | brak | brak – paleta ma jeden kolor akcji i kolory statusów | S16 (DK1) |
| Zablokowany schowek w CopyField | brak | link zaznaczony + instrukcja „skopiuj go ręcznie (Ctrl+C)” | S17 |
| Podgląd stanów w dokumentacji | brak | w Storybooku warianty `hover:`, `focus-visible:`, `active:` działają też dla `data-preview-state` (te same klasy, inna reguła tylko w CSS Storybooka) | prompt (etap 2) |

## Inwentaryzacja repozytorium

- npm 11.19.0, Node 24.21.0, `package-lock.json` w katalogu głównym, brak `workspaces`.
- Next.js 16.4.0 (App Router, `cacheComponents`, `partialPrefetching`), React 19.3.0, TypeScript 5.9.3.
- Tailwind 4.3.3 przez loader `@tailwindcss/turbopack` w `next.config.ts` (bez `postcss.config`).
- Style: tylko `app/globals.css` (create-next-app: `--background`, `--foreground`, `@theme inline`, ciemny motyw przez `prefers-color-scheme`, `body { font-family: Arial }`).
- Fonty: Geist i Geist Mono przez `next/font/google` w `app/layout.tsx` (`--font-geist-sans`, `--font-geist-mono`).
- Komponenty: brak. `app/page.tsx` używa klas palety (`zinc-*`, `blue-*`), `rounded-3xl`, `shadow-sm`, `tracking-[0.2em]` (audyt: znaki A01).
- Storybook, tokeny w kodzie, `components.json`, `packages/`: brak. Testy: `node --test` (`tests/*.test.mjs`). CI: `.github/workflows/ci.yml`.
- `tsconfig.json` w katalogu głównym obejmuje `**/*.ts(x)` (objąłby też `packages/ui`); ESLint root (`eslint-config-next`) też. `.gitignore` ignoruje tylko `/node_modules` (główny).

## Decyzje z materiałów (źródło)

1. Charakter: konkretny, czytelny, spokojny, ciepły (P1–P4). Antycharakter: generyczny, hałaśliwy, bezbarwny, oceniający, szkolny (P5–P9).
2. Gęsto w listach mentora, wiersze 1–2 linie (R01.1); wiersze dzieli linia 1 px, nie karta z cieniem (R01.3).
3. Geist w interfejsie, Geist Mono dla kodu, ścieżek, kwot i slugów (R01.2, DK2).
4. Ciepła baza stone + jeden kolor akcji terakota, zieleń tylko dla sukcesu; ciepło z bazy i słów, nie z gradientów (R01.4, DK1, K3).
5. Jedna główna akcja na ekran z konkretem („Zapłać 150 zł i wyślij pytanie”), stan zawsze na górze (R01.5, P18, K6).
6. Stan słowem, bez pigułek i liczników; jedyny licznik „N zapytań czeka na decyzję” (R01.6, P19).
7. Tylko maile transakcyjne, zero emoji, bez bocznego paska: mentor ma górną nawigację (Zapytania, Strona, Dostępność), deweloper żadnej (R02.4–R02.6, P20–P22).
8. Antyreferencje: A01 generyczny AI, A02 kurs, A03 oceny, A04 katalog i wyszukiwarka, A05 subskrypcja, A06 wideo, A07 bramka przed pytaniem.
9. Gęstość według strefy (K1); na `/m/{slug}` przy 375 px tożsamość, praca i ceny na pierwszym ekranie (K2); czat: Ctrl/Cmd+Enter wysyła, linia „Czat tekstowy · 12:30–12:55” (K4, K5 – E03, poza zakresem).
10. Ruch 120/180/240 ms, 0 ms przy reduced motion (DK3); dwa motywy (DK4); jeden promień 4 px (A01); wszystkie pary kontrastu ≥ progów (tokeny.md).

## Zatwierdzone decyzje

Zdecydował: K. Marczak (delegacja do agenta-koordynatora), 2026-10-19.

| # | Decyzja | Status |
|---|---|---|
| P1 | Ikony `lucide-react`, 16 i 20 px, zawsze z tekstem; jedyny wyjątek „×” z `aria-label` | przyjęte |
| P2 | Scrim `stone-950` 60 %; dialog bez cienia, obramowanie 1 px, promień 4 px; wagi 400/600; easing `cubic-bezier(0.2, 0, 0, 1)` | przyjęte propozycje |
| P3 | Pakiet `geist` lokalnie, tylko w `packages/ui` (Storybook); aplikacja przy `next/font` | przyjęte |
| P4 | „Lista pogrupowana według stanu” zamiast listy z filtrami; „potwierdzenie nieodwracalnej decyzji” zamiast potwierdzenia usunięcia; ogólna lista z filtrami → „What is missing” | przyjęte |
| P5 | Checkbox, przełącznik, menu, popover, podpowiedź, zakładki, awatar, toast i czat E03 → „What is missing” | przyjęte |
| Plan | Workspace `@devmentor/ui` (plan B, jeśli dowód nie przejdzie); wersje i skrypty jak niżej | przyjęte |
| Pkt 7 | Zmiany w `app/globals.css` w całości | przyjęte |
| Etap 1 | Instalacja z rejestru npm (tylko pakiety z planu) + Chromium dla Playwrighta; po etapie lokalny commit bez push | przyjęte |
| P6 | Maks. szerokość treści `--ds-width-page` 1024 px, do lewej; tekst `max-w-text` 65ch | przyjęte |
| P7 | Etykieta pola 600; animujemy tylko kolor, przezroczystość i małe przesunięcia | przyjęte |
| P8 | `data-theme` dozwolony na dowolnym elemencie (próbki w dokumentacji) | przyjęte |
| P9 | Favicon Storybooka = `app/favicon.ico`; ukryty nagłówek sr-only Storybooka zostaje | przyjęte |
| P10 | `check:tokens`, `typecheck:ui`, `test:storybook:themes` w CI – w etapie 5 | przyjęte |
| Etap 2 | Partie po ok. 6 komponentów bez czekania na „dalej”; po każdej partii sprawdzenia + lokalny commit; propozycje rozstrzygane zbiorczo po etapie | przyjęte (koordynator) |
| S1–S13 | Jak w tabeli różnic wobec shadcn (S4: „Odrzucam” nie jest destrukcyjne – pełny zwrot – brak wariantu danger; S10: wrócić z propozycją, jeśli w etapie 3 pojawi się realna potrzeba ostrzeżenia) | przyjęte |
| S14 | **Zmiana:** licznik znaków tylko gdy specyfikacja definiuje limit; pokazywany od 80 % limitu, ogłaszany czytnikowi z opóźnieniem (`aria-live="polite"`); bez limitu – bez licznika. Limity ze specyfikacji: pytanie 4000 (#17), opis mentora 2000 (#14) | przyjęte ze zmianą |
| S15–S17 | Jak w tabeli | przyjęte |
| Etap 3 | Partie bez czekania na „dalej”; po każdej sprawdzenia + lokalny commit | przyjęte (koordynator) |
| C1–C8, C10, C11, C13, C14 | Treści jak w tabeli etapu 3 | przyjęte |
| C9 | Przyjęte z warunkiem: „zwrot został zlecony” tylko, gdy `refund_status` oznacza zlecony zwrot; inaczej „Termin minął — zwrot zostanie zlecony automatycznie” (spec #18). Wdrożone: `refusalMessage(code, refundStatus)`, stan „przeterminowane” zależny od `refundStatus`; 4 stories na oba warianty | przyjęte z warunkiem |
| C12 | **Zmiana:** pole „Twoje doświadczenie” (podpowiedź: „Np. upgrade ingress-nginx do 1.28, migracja do TypeScript 5. …”); zasada Content: teksty UI bez form zależnych od płci (2. osoba w czasie teraźniejszym, rzeczowniki, formy bezosobowe) – propozycja koordynatora, przyjęta. Przejrzane wszystkie teksty; poprawione m.in. „pisałeś” → „w trakcie pisania pytania”, „sprawdziłeś / utknąłeś” → „Co próbujesz zrobić, co już działa, a co nie?”, „Mentor właśnie zaakceptował” → „Pytanie zostało właśnie zaakceptowane”, „Mentor nie odpowiedział” → „Brak odpowiedzi mentora”, „deweloper anulował” → „zapytanie zostało anulowane przez dewelopera”, „wysłaliśmy go też na Twój e-mail” → „kopia jest też w e-mailu z potwierdzeniem” (odchodzi od dosłownych tekstów #17–#19) | przyjęte ze zmianą |
| S18, S19 | Nagłówek „Ceny” nad PriceList; `aria-live` w RequestStatusView | przyjęte |
| S20 | Przyjęte pod warunkiem: obie ceny widoczne bez interakcji i w pierwszych 812 px przy 375 px – spełnione (etykiety opcji przełącznika „25 min — 150 zł” / „50 min — 280 zł”; test S6 „phone 375 px” sprawdza dolną krawędź opcji 50 min ≤ 812 px); osobna PriceList na S6 niepotrzebna | przyjęte (warunek spełniony) |
| Etap 4–5 | Etap 4 + commit, od razu etap 5 pkt 1–4 i 6; pkt 5 – tylko opis ekranu do testu agentem | przyjęte (koordynator) |

## Otwarte pytania (do decyzji Krzysztofa)

P1–P10 rozstrzygnięte (sekcja „Zatwierdzone decyzje”). Historia pytań etapu 1 poniżej; propozycje etapu 2 – w sekcji „Etap 2 – różnice wobec shadcn” (S1–S17, do zbiorczej decyzji).

| # | Pytanie | Moja rekomendacja (propozycja) |
|---|---|---|
| P6 | Maksymalna szerokość treści – brak w materiałach. | `--ds-width-page` 1024 px (64rem), treść wyrównana do lewej; tekst ciągły `max-w-text` 65ch (z promptu). |
| P7 | Waga etykiety pola i zasada „animujemy tylko kolor, przezroczystość i małe przesunięcia”. | Etykieta 600 (`font-strong`); animacje bez zmian układu. |
| P8 | `data-theme` także na dowolnym elemencie (próbka motywu wewnątrz strony). | Tak – `@theme inline` już to obsługuje; używane tylko w dokumentacji. |
| P9 | Favicon i ukryty nagłówek „Storybook” dla czytników ekranu w panelu Storybooka (zasada 10). Produkt nie ma logo. | Favicon: `app/favicon.ico` przez `staticDirs`; nagłówek sr-only zostawić (to część interfejsu Storybooka, niewidoczna). |
| P10 | CI: dodać `check:tokens`, `typecheck:ui` i `test:storybook:themes` do `.github/workflows/ci.yml`? | Tak, w etapie 5 (wymaga `npx playwright install --with-deps chromium` w CI). |

## Baza komponentów

shadcn/ui na Radix (podana). Bierzemy zachowanie i dostępność Radix (pakiet `radix-ui`), kod komponentów kopiujemy przez CLI shadcn i przepisujemy wygląd na tokeny. Nie bierzemy domyślnego wyglądu shadcn ani `tw-animate-css` (ruch z tokenów DK3).

## Plan techniczny (przyjęty 2026-10-19)

**Gdzie.** Workspace npm `packages/ui`, nazwa `@devmentor/ui`, aplikacja zostaje w katalogu głównym. Root `package.json`: `"workspaces": ["packages/*"]`.

**Czy to działa z Next 16 / Turbopack** (sprawdzone w dokumentacji `node_modules/next/dist/docs`, nie uruchomione):
- `transpilePackages.md`: Turbopack sam transpiluje pakiety workspace npm (oba routery) – `transpilePackages` niepotrzebne; dodanie `@devmentor/ui` nie szkodzi (zabezpieczenie).
- `turbopack.md`: root Turbopacka wykrywany po `package-lock.json` w katalogu głównym, więc `packages/ui` leży w nim – bez `turbopack.root` i bez `turbopackAdditionalRoots`. Symlink (na Windows junction) `node_modules/@devmentor/ui` → `packages/ui` jest wewnątrz roota.
- Pakiet eksportuje źródła TS (`exports` → `./src/index.ts`, `./styles.css`), bez kroku budowania. Komponenty z Radix mają własne `"use client"`. `react`/`react-dom` jako `peerDependencies` – jedna kopia z roota.
- Wymagana konfiguracja w aplikacji (dozwolona przez zasadę 11): `@source "../packages/ui/src"` w `app/globals.css`, `"exclude": ["node_modules", "packages"]` w root `tsconfig.json`, `packages/**` w ignorach root ESLint (pakiet ma własny `tsconfig` i lint), `node_modules` i `storybook-static` w `.gitignore`.
- Ryzyka: nie sprawdzone empirycznie. Pierwszy krok etapu 1 to dowód: import jednego komponentu w aplikacji + `next build` i `next dev`. Jeśli się nie uda – alternatywa: ten sam katalog `packages/ui` bez workspace, alias `@devmentor/ui` w `tsconfig.paths` i `turbopack.resolveAlias`, zależności Storybooka w root `devDependencies`. Ścieżki dla lekcji 7 bez zmian.

**Storybook i dodatki** (najnowsze stabilne z npm, 2026-10-19):

| Pakiet | Wersja | Po co |
|---|---|---|
| `storybook`, `@storybook/react-vite` | 10.6.2 | framework bez Next – pakiet UI nie importuje `next/*` |
| `@storybook/addon-docs` | 10.6.2 | strony MDX, autodocs |
| `@storybook/addon-a11y` | 10.6.2 | axe; `a11y: { test: 'error' }` w preview |
| `@storybook/addon-vitest`, `vitest`, `@vitest/browser-playwright`, `playwright` | 10.6.2, 5.0.5, 5.0.5, 1.64.1 | stories jako testy, play functions (Chromium) |
| `vite`, `@tailwindcss/vite` | 8.3.4, 4.3.3 | Tailwind 4 w Storybooku (ta sama wersja co aplikacja) |
| `remark-gfm` | 4.0.1 | tabele w MDX (zasada 8) |
| `eslint-plugin-storybook` | 10.6.2 | lint stories |
| `radix-ui`, `class-variance-authority`, `tailwind-merge`, `clsx` | 1.8.1, 0.7.1, 3.7.0, 2.1.1 | baza shadcn (zależności pakietu) |
| `lucide-react`, `geist` | 1.58.x, 1.8.1 | po decyzji P1, P3 |
| CLI `shadcn` | 4.22.1 przez `npx`, nie zależność | dodawanie komponentów; po każdym użyciu kontrola `package.json` |

**Symulowanie API:** bez MSW. Aplikacja nie ma API po stronie klienta – formularze to server actions (`startRequest`, `acceptRequest`, `declineRequest`, `cancelRequest`). Komponenty formularzy przyjmują akcję jako prop; stories podają asynchroniczne `fn()` ze `storybook/test` zwracające kody ze specyfikacji (sukces, oczekiwanie, `field`, `slot_taken`, `price_changed`, `checkout_failed`, brak sieci).

**Motywy:** tokeny w `packages/ui/src/styles/tokens.css` (warstwy surowa → semantyczna → komponentowa, `@theme`); ciemny motyw przez `prefers-color-scheme` i przez `[data-theme="dark"]` / `[data-theme="light"]` na `<html>` (zasada 9). Reset palety Tailwinda (`--color-*: initial`) tylko w CSS Storybooka, żeby nie zepsuć `app/page.tsx`.

**Skrypty** (`packages/ui`): `storybook` (dev, port 6006), `build-storybook`, `test` (vitest, projekt storybook), `test:themes` (ten sam zestaw z `THEME=light` i `THEME=dark`), `lint`, `typecheck`, `check:tokens` (kolory spoza tokenów, klasy palety, wartości arbitralne – kod wyjścia 1). W root: przekierowania `npm run <skrypt> -w @devmentor/ui`.

**Storybook bez śladów bazy:** tytuł i logo „DevMentor”, wyłączone checklista startowa i powiadomienia o nowej wersji, pochodzenie (shadcn/Radix) tylko w notatce technicznej w „Contributing”.

## Komponenty z ekranów (propozycja)

Ekrany: S1 `/invite/[token]`, S2 `/sign-in/[token]`, S3 `/mentor` bez sesji (#14); S4 edytor `/mentor` (#14, #15); S5 `/mentor/availability` (#15); S6 `/m/[slug]` (#16) + formularz (#17); S7 `/r/[token]` (#17, #18, #19); S8 `/mentor/requests`, S9 `/mentor/requests/[id]` (#18). #23 i #24 bez ekranów (Stripe Checkout hostowany).

**Primitives (17):** Button (primary, secondary; ładowanie) – wszystkie · IconButton – S5 · TextLink – S4, S6, S8 · FormField (etykieta, podpowiedź, błąd, wymagane/opcjonalne) + Label – S4, S5, S6 · TextInput (z sufiksem „zł”, tylko do odczytu) – S4, S6 · Textarea – S4, S6 · Select – S5 · RadioGroup (lista i segmentowy 25/50) – S6 · Panel – S4, S7 · List + ListRow (linia 1 px) – S5, S6, S8 · StatusText (stan słowem) – S7, S8, S9 · Alert (inline) – S4, S5, S6, S7, S9 · ConfirmDialog (AlertDialog Radix) – S7, S9 · StateMessage (pusto, błąd, nie istnieje) – S1–S3, S6, S8 · Skeleton – S6 (Suspense slotów, propozycja) · Spinner – S6, S7 · CodeBlock / InlineCode – S7, S9 · CopyField – S4, S7, S8.

**Product E01:** MentorNav (+ licznik oczekujących) – S4, S5, S8, S9 · InvitationPanel – S1, S2 · InactiveLinkMessage – S1, S2, S3 · MentorPageForm – S4 · ShareLinkPanel – S4 · NoAvailabilityNotice – S4 · AvailabilityEditor (DayRow, WindowRow, TimeZoneSelect, zmiana strefy) – S5 · SlotPreview – S5 · MentorIdentity (imię + PublicWorkLink) – S6 · MentorDescription – S6 · PriceList – S6 · LengthToggle – S6 · SlotList (dzień w tekście, strefa w nagłówku) – S5, S6 · MentorNotFound – S6.

**Product E02:** RequestForm (długość → termin → imię → pytanie → „Zapłać X zł…”) – S6 · RequestStatusHeader (wszystkie stany #17–#19) – S7 · RequestSummary (termin w strefie widza, kwota) – S7, S9 · QuestionText (tekst + kod) – S7, S9 · SaveLinkBox – S7 · CancelRequest (z potwierdzeniem) – S7 · RefundStatus – S7 · RequestList + RequestRow (Czeka na decyzję, Zaakceptowane, Zakończone) – S8 · RequestDecision (Akceptuję / Odrzucam + skutki) – S9.

**Patterns:** Form (S4, S6; stany API) · Grouped list (S8; zamiast listy z filtrami – P4) · Detail view + „nie istnieje albo brak dostępu” (S9, S7, S6) · Confirm irreversible decision (S7, S9; zamiast usuwania – P4) · Request status page (S7) · Share link (S4, S7) · Invitation-only gate (S1–S3) · Time-zone-aware slots (S5, S6).

## Drzewo menu Storybooka (propozycja)

```
DevMentor
├─ Start here · Components · How to choose · Usage and accessibility · Content
│  · What to avoid · What is missing · Contributing
├─ Epics
│  ├─ E01 Mentor page by share link
│  └─ E02 Paid request and mentor decision
├─ Foundations: Color · Typography · Spacing and layout · Shape and depth · Motion · Icons · Themes
├─ Primitives: (17 komponentów, alfabetycznie)
├─ Product
│  ├─ E01 Mentor page: komponenty + Screens (Invitation, Sign-in, Editor, Availability, Share page)
│  └─ E02 Paid request: komponenty + Screens (Request form, Request status, Requests list, Request detail)
└─ Patterns: Form · Grouped list · Detail view · Confirm irreversible decision · Request status page
   · Share link · Invitation-only gate · Time-zone-aware slots
```

Szacunek: ok. 55 stron dokumentacji (8 przewodników, 2 epiki, 7 fundamentów, ok. 38 stron komponentów) i ok. 280 stories (primitives ok. 110, produkt ok. 100, wzorce ok. 30, ekrany ok. 40), w tym ok. 60 testów interakcji.

## Istniejący „design system” – `app/globals.css` (przyjęte, wdrożone w etapie 1)

| Element | Propozycja | Uzasadnienie |
|---|---|---|
| `--background`, `--foreground` | zostają jako aliasy, wskazują na `surface-page` i `text-primary` | tokeny.md: „alias zostaje do migracji” |
| ich wartości (`#ffffff`/`#171717`, `#0a0a0a`/`#ededed`) | zmienić na stone (`#fafaf9`/`#1c1917`, `#0c0a09`/`#f5f5f4`) przez import tokenów z pakietu | DK1, R01.4 |
| `@theme inline` z `--font-sans` / `--font-mono` | zostaje; `font-ui` i `font-mono` z pakietu wskazują na te same zmienne `next/font` | DK2 |
| `@media (prefers-color-scheme: dark)` | zostaje (w pliku tokenów), plus selektory `[data-theme]` | DK4, zasada 9 |
| `body { font-family: Arial… }` | usunąć | tokeny.md, audyt: dwie domyślne decyzje typograficzne obok siebie |
| nowe linie | `@import "@devmentor/ui/styles.css"` i `@source "../packages/ui/src"` | podłączenie konfiguracji (zasada 11) |
| `app/page.tsx` (klasy palety, `rounded-3xl`) | bez zmian w tej pracy; wpis do „What is missing” | zasada 11; strona główna poza E01–E02 |

## Następny krok

1. Decyzje o treściach C1–C14 i propozycjach S18–S20 (sekcja „Etap 3”).
2. Etap 4 – strony, które uczą: Start here, Components, How to choose, Usage and accessibility, Content, What to avoid, What is missing (w tym: checkbox, przełącznik, menu, popover, podpowiedź, zakładki, awatar, toast, combobox stref, czat E03, ogólna lista z filtrami, migracja app/page.tsx), Contributing, strony epików; plik dla agentów docs/design-system.md + odwołanie w AGENTS.md.
