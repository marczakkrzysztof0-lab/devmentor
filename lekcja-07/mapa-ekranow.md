# Mapa ekranów: E01, strona mentora pod linkiem (prototyp)

- Data: 2026-10-20 · Status: **zatwierdzona 2026-10-20** (K. Marczak przez delegację do koordynatora; decyzje przy lukach w sekcji 4)
- Zakres: #23 (fundament danych, bez ekranów), #14, #15, #16 (numery z `.ai/specs/backlog.md`)
- Źródła: specyfikacje `.ai/specs/2026-10-19-*` (#23, #14, #15, #16), brief (`Future state (1.0): mentor goes from invitation to first paid session`, krok 1 przepływu developera), decyzje D03, D04, D07, D08, D09, D12, N02, design system `packages/ui` (stories S1–S6, `docs/design-system.md`)
- Identyfikatory s01–s07 są stałe. Nowe ekrany dostają kolejne numery, a numery usuniętych ekranów nie wracają do użycia.

## 0. Historie i kryteria, których dotyczy przepływ

| Historia | Kryteria / ustalenia używane w mapie (skrót) |
|---|---|
| **#23** E01-S01-T01, fundament danych | `invitations` (email, token_hash, expires_at, accepted_at, revoked_at, mentor_id), `mentors`, `mentor_pages` (slug 3–40 znaków `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`, publikacja wymaga nazwy, linku do pracy i opisu, R03). Email mentora jest kopiowany z zaproszenia. Brak ekranów. |
| **#14** E01-S01, zaproszenie, logowanie, edytor, publikacja | **14-A1** link zaproszenia: GET pokazuje tylko przycisk „Akceptuję zaproszenie” i datę ważności (14 dni) · **14-A2** akceptacja tworzy mentora, szkic strony ze slugiem `mentor-xxxxxx` i sesję, potem przekierowuje do `/mentor` · **14-A3** link wygasły, odwołany, użyty albo nieznany daje jeden neutralny komunikat „Ten link jest nieaktywny — poproś zespół o nowy” · **14-A4** zaproszenie już przyjęte, a ta sama mentorka jest zalogowana: przekierowanie do `/mentor` · **14-A5** zaproszenie na email, który ma już konto mentora: odmowa z „ask for a sign-in link” · **14-L1** link logowania (72 h, jednorazowy): przycisk „Zaloguj”, dwa równoczesne kliknięcia dają jedną sesję · **14-S1** `/mentor` bez sesji: „Dostęp tylko przez zaproszenie — poproś zespół o link do logowania”, bez formularza i bez rejestracji (story 4, D09) · **14-S2** sesja 30 dni, wygasła lub odwołana oznacza wylogowanie, jest też `signOut()` · **14-E1** jeden formularz: nazwa (2–80), link do pracy (http/https, ≤500), opis (≤2000, czysty tekst), ceny 25/50 min w zł (20–5000, obie wymagane, D12), slug z pełnym URL · **14-E2** „Zapisz szkic” przyjmuje dane częściowe, „Opublikuj” waliduje całość · **14-E3** błędy przy polach, dane zostają, fokus na pierwszym błędnym polu · **14-E4** slug zajęty: „Ten adres jest zajęty” · **14-E5** po publikacji slug jest zablokowany, a edycje muszą zostawić stronę publikowalną · **14-E6** wynik publikacji: link, przycisk Kopiuj, fokus na linku, wskazówka „Wklej go tam, gdzie ludzie już cię pytają” · **14-E7** brak pól wypłat, banku, podatków i ocen (R13, N02), brak prowizji (Q4) · **14-T** cel 20 minut od zaproszenia do linku (D08, obserwacja) · **14-F** founder tylko przez CLI `mentor:invite` / `mentor:sign-in-link`, bez UI |
| **#15** E01-S02, dostępność | **15-A1** strefa czasowa wstępnie z przeglądarki, edytowalna · **15-A2** okna tygodniowe: dzień + od/do co 30 min, „+ okno”, ×, Zapisz; zapis zastępuje cały zestaw i od razu działa (także na szkicu) · **15-A3** po zapisie podgląd 10 najbliższych terminów w strefie mentora · **15-A4** zmiana strefy przy zapisanych oknach: ostrzeżenie „Okna zachowają godziny…” i przycisk „Zapisz i zmień strefę” · **15-A5** brak okien: „Nie masz dostępności — nikt nie może wybrać terminu” w edytorze z linkiem (story 3) · **15-A6** błąd serwera: niezapisany zestaw zostaje na ekranie · **15-R** terminy tylko z okien (R06), siatka :00/:30, horyzont 14 dni, minimum 3 h wyprzedzenia, max 21 okien, okno 30 min daje tylko 25 min |
| **#16** E01-S03, publiczna strona `/m/{slug}` | **16-A1** kolejność: tożsamość → link do pracy → opis → ceny → terminy (R03, R07) · **16-A2** terminy pogrupowane po dniach, przełącznik 25/50, czysty tekst bez przycisku „Zarezerwuj” (Q1), strefa widza w nagłówku, fallback „UTC” · **16-A3** brak terminów: „Brak wolnych terminów w najbliższych 14 dniach” · **16-A4** szkic albo nieznany slug: „Nie ma takiej strony mentora”, zero danych mentora (Q4) · **16-A5** błąd ładowania terminów: „Nie udało się wczytać terminów — odśwież stronę”, profil i ceny zostają · **16-A6** brak ocen, opinii, liczników, katalogu, wyszukiwarki, „podobnych mentorów”; `/m` i `/m?search=` dają 404 (R14, N02, D03) · **16-A7** telefon 375 × 812: tożsamość, praca i ceny na pierwszym ekranie · **16-A8** opis do 2000 znaków bez ucinania |
| Brief | Przepływ mentora: zaproszenie od foundera (D09) → link do pracy, opis, ceny, dostępność w 20 min bez danych wypłat (R13, D08) → udostępnienie linku (D03). Kroki 4–5 (zapytania, wypłaty) są poza E01. Developer, krok 1: otwiera link i widzi link do pracy, opis, ceny 25/50 i wolne terminy (R03, R07, R14). |

## 1. Ekrany

Legenda stanów: **D** domyślny · **P** pusty · **Ł** ładowanie · **B** błąd · **BD** brak dostępu · **K** konflikt · **Z** wynik zewnętrznej usługi. W E01 nie ma zewnętrznej usługi (bez maila i bez Stripe; linki wysyła founder ręcznie), dlatego Z = „nie dotyczy” na wszystkich ekranach.

| ID | Ekran | Rola | Stany (źródło) | Historia lub kryterium | Komponenty DS |
|---|---|---|---|---|---|
| **s01** | Zaproszenie `/invite/[token]` | Mentor przed akceptacją (niezalogowany). Inna rola: każdy z linkiem widzi to samo, bo token jest jedyną kontrolą. Zalogowany mentor: patrz L5. | **D** ważny link: „… zaprasza cię do DevMentora”, ważność, przycisk „Akceptuję zaproszenie” (14-A1) · **Ł** akceptowanie, przycisk `loading` (14-A2, DS S1) · **B** brak sieci, Alert (DS C6) · **BD** link wygasły, odwołany, użyty lub nieznany: neutralny komunikat (14-A3) · **K1** zaproszenie przyjęte, ta sama mentorka zalogowana: przekierowanie do s04 (14-A4) · **K2** email ma już konto mentora (14-A5, L4) · **K3** zalogowany inny mentor (L5, brak kryterium) · **P** nie dotyczy · **Z** nie dotyczy | #14 story 1, 4, 5; 14-A1…A5 | `PageLayout narrow`, `InvitationPanel kind="invite"` (`Button primary`, `Alert`), `AccessMessage inactive-link` (`StateMessage not-found`) |
| **s02** | Logowanie linkiem `/sign-in/[token]` | Mentor z kontem bez sesji (nowe urządzenie). Inna rola: każdy z linkiem widzi to samo. | **D** ważny: „Zaloguj się do DevMentora”, ważność 72 h, przycisk „Zaloguj” (14-L1) · **Ł** logowanie (DS) · **B** brak sieci (DS C6) · **BD** link użyty, wygasły lub nieznany (14-A3) · **K** podwójne kliknięcie lub dwie karty: jedna sesja, druga próba trafia na BD (14-L1) · **K2** już zalogowany (L5, brak kryterium) · **P / Z** nie dotyczy | #14 story 3; 14-L1, 14-A3 | `PageLayout narrow`, `InvitationPanel kind="sign-in"`, `AccessMessage inactive-link` |
| **s03** | Brak dostępu `/mentor` i `/mentor/availability` bez sesji | Każdy bez sesji mentora: developer, ktoś, kto zgaduje URL, mentor z wygasłym ciasteczkiem. Brak rejestracji. | **BD** brak sesji: „Dostęp tylko przez zaproszenie — poproś zespół o link do logowania” (14-S1) · **BD** sesja wygasła lub odwołana przy wejściu (14-S2) · **BD** `/mentor/availability` bez sesji (L14) · **D** = BD (ekran ma tylko ten stan) · **P / Ł / B / K / Z** nie dotyczy | #14 story 3, 4; 14-S1, 14-S2 | `PageLayout narrow`, `AccessMessage invitation-only` (`StateMessage not-found`) |
| **s04** | Edytor strony `/mentor` | Zalogowany mentor, tylko własna strona (mentor z sesji, nigdy z danych wejściowych). Bez sesji: s03. Developer i founder nie mają tu wstępu. | **Ł** wczytywanie sesji i strony (Suspense, #14 Architecture; DS bez kompozycji, D9) · **P** pierwsza wizyta: pusty szkic, slug zastępczy, baner „Nie masz dostępności” (14-A2, 15-A5, L9, L15) · **D** szkic częściowo wypełniony, slug proponowany z imienia (14-E1, story 2) · **D** szkic zapisany: „Szkic zapisany — strona nie jest jeszcze widoczna” (14-E2) · **B** błędy pól: brakujące pole nazwane, zły URL, cena poza 20–5000, zły format slugu, fokus na pierwszym (14-E3) · **Ł** publikowanie (DS S4) · **K** slug zajęty przy publikacji (14-E4) · **D** opublikowano: panel z linkiem, Kopiuj, „Skopiowano.”, fokus na linku (14-E6) · **D** opublikowana, edycja: slug zablokowany, „Zapisz zmiany”, potem „Zmiany są już na twojej stronie — link się nie zmienił” (14-E5, story 3) · **B** edycja po publikacji czyści wymagane pole: odmowa, strona live bez zmian (14-E5) · **D** opublikowana bez dostępności: baner (15-A5) · **B** błąd serwera (DS) · **B** brak sieci (DS C6) · **BD** sesja wygasła w trakcie zapisu (L6, brak kryterium) · **Z** nie dotyczy | #14 story 2, 3; #15 story 3; 14-E1…E7 | `PageLayout` + `MentorNav current="page"`, `NoAvailabilityNotice` (`Alert info` + `TextLink`), `MentorPageForm` (`FormField`, `TextInput suffix="zł"`, `TextInput readOnly` dla slugu, `Textarea maxLength=2000`, `Button primary` + `secondary`, `Alert`), `ShareLinkPanel` (`Panel`, `CopyField`), `Skeleton` |
| **s05** | Dostępność `/mentor/availability` | Zalogowany mentor, tylko własne okna. Bez sesji: s03. | **Ł** wczytywanie okien (DS bez kompozycji, D9) · **P** pierwsza wizyta: strefa z przeglądarki, pusty tydzień, baner i pusty podgląd (15-A1, 15-A5) · **D** okna ustawione + podgląd 10 terminów w strefie mentora, „25 lub 50 min” / „tylko 25 min” (15-A2, 15-A3) · **Ł** zapisywanie (DS) · **D** zapisano: „Dostępność zapisana”, nowy podgląd (15-A3) · **D** zmiana strefy: ostrzeżenie + „Zapisz i zmień strefę” (15-A4) · **P** usunięte wszystkie okna i zapisane: brak terminów (15 story 2, 3) · **B** błąd zapisu, zestaw zostaje (15-A6) · **B** brak sieci (DS C6) · **B** ponad 21 okien (15-R, L16) · **B** brak strefy w przeglądarce (L15) · **BD** sesja wygasła przy zapisie (L6) · **K** nie dotyczy (zapis zastępuje cały zestaw; konflikt z zapytaniami to E02, Q7) · **Z** nie dotyczy | #15 story 1–3; 15-A1…A6, 15-R | `PageLayout` + `MentorNav current="availability"`, `AvailabilityEditor` (`FormField` + `Select groups` strefy, `List`, `Select` od/do, `Button secondary` „+ okno”, `IconButton` ×, `Button primary`, `Alert`), `NoAvailabilityNotice`, `SlotPreview` (`List`, `ListRow`) |
| **s06** | Publiczna strona mentora `/m/{slug}` (opublikowana) | Developer (anonimowy, bez konta), ale też każdy z linkiem, w tym sam mentor i founder: wszyscy widzą to samo. Brak logowania i brak różnic między rolami. | **D** terminy, długość 25: nazwa, link do pracy (pełny host), opis, ceny „25 min — 150 zł”, „50 min — 280 zł”, terminy po dniach (16-A1, 16-A2) · **D** przełączone na 50: znikają terminy, w których 50 min się nie mieści (16 story 2) · **D** widz w innej strefie (Londyn: 17:00 zamiast 18:00) (#15 story 4) · **D** strefa niedostępna: „(czas UTC)” (16-A2) · **D** opis 2000 znaków (16-A8) · **D** telefon 375 px (16-A7) · **P** brak terminów w 14 dniach: profil i ceny zostają (16-A3, #15 story 3) · **Ł** ładowanie sekcji terminów (16 Q5, DS S6) · **B** błąd ładowania terminów (16-A5) · **B** brak sieci przy terminach (DS `offline`, spoza spec) · **BD** nie dotyczy (strona publiczna) · **K** cena zmieniona w trakcie oglądania: widz widzi starą do odświeżenia (16 Edge, niewidoczne w E01) · **Z** nie dotyczy | #16 story 1–3; 16-A1…A3, A5…A8; brief, krok 1 developera | `PageLayout narrow`, `MentorIdentity`, `MentorDescription`, `PriceList`, `LengthToggle` (`RadioGroup segmented`), `SlotList selectable={false}` (`Skeleton`, `StateMessage empty/error`); **brak kompozycji ekranu tylko z #16**, jest tylko S6 z `RequestForm` (L1, D1) |
| **s07** | Nie ma takiej strony mentora: `/m/{slug}` szkic lub nieznany, `/m`, `/m?search=…` | Każdy. Zero danych mentora, bez podpowiedzi, czy slug istnieje. | **BD** szkic (mentor jeszcze nie opublikował) (16-A4) · **BD** nieznany slug / literówka (16-A4) · **BD** `/m` i `/m?search=react`: brak katalogu (16-A6) · **D** = BD · **P / Ł / B / K / Z** nie dotyczy | #16 story 4, 5; 16-A4, 16-A6 | `PageLayout narrow`, `MentorNotFound` (`StateMessage not-found`) |

Poza mapą, bo to nie są ekrany: founder (CLI `mentor:invite`, `mentor:sign-in-link`, L11), `/` (L19), `signOut` (L7). Zapytania, płatność, `/r/{token}` i wypłaty to E02 i E04.

## 2. Scenariusze do przełączania w prototypie

To kontrolki prototypu, a nie funkcje produktu. Panel jest widoczny tylko w prototypie.

| # | Kontrolka | Wartości | Ekrany |
|---|---|---|---|
| C1 | Rola / widok | mentorka Anna (z sesją) · mentorka Anna (bez sesji) · developer Kuba (anonim) · founder Oliwia (symulowany CLI, L11) | wszystkie |
| C2 | Link zaproszenia | ważny · wygasł · odwołany · już użyty · nieznany token · email ma już konto (L4) | s01 |
| C3 | Wynik kliknięcia w linku („Akceptuję zaproszenie”, „Zaloguj”) | sukces → s04 · długo trwa (pending) · brak sieci | s01, s02 (kontrolka prototypu, nie zachowanie produktu; pytanie 5 z budowy, 2026-10-20) |
| C4 | Link logowania | ważny · użyty · wygasł (po 72 h) · nieznany · podwójne kliknięcie (druga karta) | s02 |
| C5 | Sesja | aktywna · brak · wygasła przy wejściu · wygasa przy najbliższym zapisie (L6) · zalogowany inny mentor przy otwarciu linku (L5) | s01–s05 |
| C6 | Stan strony Anny | pusty szkic (pierwsza wizyta) · szkic wypełniony · opublikowana · opublikowana bez dostępności | s04, s06/s07 |
| C7 | Wynik zapisu / publikacji strony | ok · slug zajęty · błąd pola z serwera · błąd serwera · brak sieci · długo trwa | s04 |
| C8 | Dostępność Anny | brak okien · wt 18–20 + czw 12–13 · okno dziś w ciągu 3 h (dzisiejsze terminy znikają, następne są za tydzień; przemianowane 2026-10-20, P2, Z38) | s04, s05, s06 |
| C9 | Wynik zapisu dostępności | ok · błąd serwera · brak sieci · długo trwa · przekroczone 21 okien | s05 |
| C10 | Strefa przeglądarki | Europe/Warsaw · Europe/London · niedostępna lub błędna (→ UTC / L15) | s05, s06 |
| C11 | Sekcja terminów na s06 | gotowe · ładowanie · błąd · brak sieci | s06 |
| C12 | Adres publiczny | `/m/anna-k` · `/m/piotr-n` (bez dostępności) · `/m/ewa-szkic` (szkic) · `/m/annak2` (literówka) · `/m` · `/m?search=react` | s06, s07 |
| C13 | Długi opis | 3 zdania · 2000 znaków | s06 |
| C14 | Zegar demo | stały „teraz” (niżej) · „+1 dzień” (pokazuje przesuwanie się okna 14 dni) | s05, s06 |
| C15 | Szerokość | 1024 · 375 · 320 px | wszystkie |

## 3. Konta i dane demo (wszystko fikcyjne)

**Stały „teraz”:** poniedziałek **19.10.2026, 19:00 Europe/Warsaw** (`2026-10-19T17:00:00Z`), ten sam co w `packages/ui/.storybook/fixtures.ts` i w #15 story 4. Zmiana czasu 25.10.2026 (CEST → CET) mieści się w horyzoncie 14 dni, więc prototyp pokazuje też przypadek DST.

| Rola | Konto | Dane |
|---|---|---|
| Mentor | **Anna K.**, `anna@example.com`, sesja aktywna | slug `anna-k` (przed publikacją zastępczy `mentor-q7k2ma`), link do pracy `https://github.com/annak`, opis z fixtures („Migrowałam dwa duże projekty na server components…”), ceny **150 zł / 25 min**, **280 zł / 50 min** (PLN, D12), strefa Europe/Warsaw, okna **wtorek 18:00–20:00**, **czwartek 12:00–13:00** (#15 story 1). Pierwsze terminy: wt 20.10 18:00, 18:30, 19:00 (25/50), 19:30 (tylko 25); czw 22.10 12:00 (25/50), 12:30 (tylko 25); dalej 27.10 i 29.10. Horyzont 14 dni kończy się 2.11.2026, 19:00, więc 3.11 jest poza nim (poprawione 2026-10-20, P1, Z37). |
| Developer | **Kuba**, bez konta (anonim), strefa przeglądarki Europe/Warsaw; wariant Londyn (Europe/London: wt 18:00 Warszawa = 17:00) | otwiera `/m/anna-k` z „Discorda” (#16 story 1) |
| Founder / operator | **Oliwia** (founder A), bez konta w UI | symulowane polecenia `npm run mentor:invite -- anna@example.com` → link ważny do **2.11.2026, 19:00** (14 dni); `npm run mentor:sign-in-link -- anna@example.com` → ważny do **22.10.2026, 19:00** (72 h) |

Dane pomocnicze. To nie są konta ról, tylko strony potrzebne do stanów:
- **Piotr N.**, `/m/piotr-n`, opublikowana, ceny 120 / 220 zł, bez okien (#15 story 3, #16 story 3). Opis to fikcyjny tekst demo (pytanie 6 z budowy, przyjęte jako dane demo 2026-10-20).
- **Ewa** (szkic), `/m/ewa-szkic`, nieopublikowana, więc s07 (#16 story 4; w spec ten przykład to „/m/piotr”, ale Piotr z #15 ma już opublikowaną stronę, dlatego rozdzielamy osoby).
- Tokeny: `/invite/demo-valid`, `/invite/demo-expired`, `/invite/demo-used`, `/sign-in/demo-valid`, `/sign-in/demo-used`. Prototyp przełącza ich stan kontrolkami C2 i C4.
- Bazowy URL: `http://localhost:3000`, jak w fixtures.

## 4. Luki w specyfikacji

Przy każdej luce jest pytanie do właściciela produktu (Krzysztof Marczak) i rekomendacja. Niczego nie rozstrzygam sam.

| # | Luka (typ) | Pytanie | Rekomendacja i uzasadnienie |
|---|---|---|---|
| **L1** | Sprzeczność spec ↔ DS: #16 Q1 mówi, że terminy są czystym tekstem bez przycisku, a DS S6 pokazuje `/m/[slug]` od razu z `RequestForm` i płatnością (#17). | Czy prototyp E01 pokazuje s06 w wersji #16 (bez formularza zapytania), czy od razu z formularzem #17? | **Wersja #16, bez formularza.** E01 kończy się na decyzji developera. #16 Q1 zakazuje martwego „Zarezerwuj”, a formularz bez płatności byłby atrapą E02. Komponenty (`PriceList`, `LengthToggle`, `SlotList selectable={false}`) są gotowe. |
| **L2** | Kryterium bez danych: #14 story 1 mówi „Founder X invited you”, ale `invitations` (#23) i CLI nie zapisują, kto zaprasza. DS ma fallback „Zespół DevMentora”. | Czy zaproszenie podaje imię foundera? Jeśli tak, skąd je brać? | **Ogólnie: „Zespół DevMentora zaprasza cię do DevMentora”.** Działa bez zmiany schematu i CLI. Ciepły kontakt (D09) i tak wie od kogo, bo dostaje link osobiście. |
| **L3** | Sprzeczność w #14: story 4 mówi, że ponownie użyty, przyjęty już link pokazuje „invitation only”, a UI/UX mówi, że użyty link daje „Ten link jest nieaktywny — poproś zespół o nowy”. | Który komunikat pokazać dla przyjętego już zaproszenia (bez sesji)? | **„Ten link jest nieaktywny…”.** Sekcja UI/UX jest bardziej szczegółowa, mamy jeden komunikat dla wszystkich złych linków i nie zdradzamy powodu. |
| **L4** | Sprzeczność w #14: `acceptInvitation` dla istniejącego emaila „odmawia z ‘ask for a sign-in link’”, a UI/UX daje jeden neutralny komunikat bez szczegółów. | Czy ten przypadek ma osobny komunikat („Masz już konto — poproś o link do logowania”)? | **Ten sam neutralny komunikat.** CLI i tak blokuje ponowne zaproszenie (to tylko druga linia obrony), a osobny tekst zdradzałby, że email ma konto. |
| **L5** | Stan bez kryterium: link zaproszenia lub logowania otwarty, gdy jest aktywna sesja **innego** mentora, albo link logowania otwarty przez już zalogowanego. #14 opisuje tylko „zaproszenie przyjęte + ta sama osoba zalogowana”. | Co się dzieje w takim przypadku: zamiana sesji, odmowa czy przekierowanie? | **Ważny link zawsze pokazuje swój przycisk.** Kliknięcie kończy starą sesję i zaczyna nową, bo token jest dowodem tożsamości. Link logowania otwarty przez tego samego, już zalogowanego mentora przekierowuje do `/mentor` bez zużycia tokenu. To najprostsze i spójne z 14-A4. |
| **L6** | Stan bez kryterium: sesja wygasa lub zostaje odwołana w trakcie edycji (s04, s05). Spec mówi tylko, że akcje są odrzucane, a nie co widzi mentor. | Co pokazać, gdy zapis odrzucono z powodu braku sesji? | **Dane zostają w formularzu + `Alert danger` „Sesja wygasła — poproś zespół o link do logowania”, bez automatycznego przekierowania.** Mentor nie traci wpisanego tekstu (zasada 14-E3 i 15-A6). |
| **L7** | Kryterium bez ekranu: `signOut()` jest w kontrakcie #14, ale ani UI/UX, ani DS nie mówią, gdzie jest przycisk i dokąd prowadzi. | Czy prototyp i 1.0 mają „Wyloguj”? Jeśli tak, gdzie i co widać potem? | **Link „Wyloguj” w `MentorNav`, po nim s03.** Funkcja już jest w spec, a na cudzym komputerze to jedyny sposób zamknięcia sesji. Komunikat s03 można zostawić, bo mówi, jak wrócić. |
| **L8** | Stan bez kryterium: gdzie opublikowany mentor znajduje swój link przy kolejnej wizycie? Panel linku jest tylko zaraz po publikacji, a po publikacji podpowiedź przy slugu nie pokazuje pełnego URL (a #14 UI/UX mówi „slug field shows the full share URL”). | Czy link z „Kopiuj” jest widoczny w edytorze zawsze po publikacji? | **Tak: `ShareLinkPanel` stale nad formularzem opublikowanej strony, bez przenoszenia fokusu przy powrocie.** Udostępnianie linku to krok 3 przepływu mentora (D03), a mentor wraca po tydzień później (story 3). |
| **L9** | Sprzeczność spec ↔ DS: #14 daje szkicowi slug `mentor-xxxxxx` i proponuje slug z imienia do pierwszej publikacji. DS S4 „first visit” pokazuje pusty slug, a gdy slug nie jest pusty, traktuje go jako ręcznie zmieniony i przestaje proponować. | Co widzi mentor w polu adresu przy pierwszej wizycie i kiedy przestaje działać propozycja z imienia? | **Pole pokazuje `mentor-xxxxxx`, a propozycja z imienia nadpisuje je, dopóki mentor sam nie edytuje pola.** Zgodne z #14 Q6; DS wymaga flagi „slug zastępczy” (D4). |
| **L10** | Sprzeczność zakresu: `MentorNav` w E01 ma pozycję „Zapytania” i licznik „1 zapytanie czeka” (E02), a w E01 nie ma zapytań. | Czy w prototypie E01 nawigacja pokazuje „Zapytania”? | **Nie: tylko „Strona” i „Dostępność”, bez licznika.** Link do nieistniejącego ekranu albo fałszywy licznik zafałszowałyby test 20 minut. |
| **L11** | Rola bez ekranu: founder działa tylko przez CLI (#14 Q5), a prototyp musi jakoś zacząć przepływ. | Jak prototyp pokazuje krok foundera? | **Kontrolka prototypu C1/C2 „wygeneruj link” z symulowanym wynikiem CLI. To nie jest ekran produktu.** Spec wyklucza admin UI, więc ekran foundera dodałby funkcję, której nie ma. |
| **L12** | Decyzja niepodjęta: komunikaty s01–s03 mówią „poproś zespół”, ale nie podają kanału, a zasada DS mówi, że `StateMessage` = dlaczego + następny krok. | Czy podać kontakt (email lub Discord zespołu)? | **W pilocie nie.** Mentorzy to ciepłe kontakty, które znają founderów (D09). Przed wyjściem poza pilot trzeba podjąć decyzję i dopisać adres. |
| **L13** | Decyzja niepodjęta: mentor nie widzi, jak wygląda jego strona przed publikacją (szkic daje s07). Podglądu nie ma w materiałach. | Czy mentor ma podgląd strony przed publikacją? | **Nie w 1.0, bez nowej funkcji.** Po publikacji link w panelu otwiera prawdziwą stronę, a edycje są od razu widoczne (story 3). Warto odnotować jako obserwację z pilota. |
| **L14** | Stan bez kryterium: #14 opisuje `/mentor` bez sesji, a #15 dla `/mentor/availability` mówi tylko „behind getCurrentMentor()”, bez treści. | Czy `/mentor/availability` bez sesji pokazuje to samo co s03? | **Tak, s03.** Jeden komunikat dla całego panelu mentora. |
| **L15** | Stan bez kryterium: #15 wypełnia strefę z przeglądarki, ale nie mówi, co gdy przeglądarka jej nie poda albo poda strefę spoza listy. #16 ma taki fallback tylko po stronie widza. | Jaka strefa domyślna u mentora, gdy przeglądarka jej nie podaje? | **Europe/Warsaw z widocznym polem do zmiany.** Pilot jest polski (#14 Q9, D12 PLN), a strefa i tak jest edytowalna przed zapisem. |
| **L16** | Kryterium bez stanu: limit 21 okien (#15 API) nie ma komunikatu ani zachowania w UI. | Co widzi mentor przy próbie dodania 22. okna? | **Przycisk „+ okno” z `disabledReason` „Maksymalnie 21 okien w tygodniu”.** Zgodne z zasadą DS B3 i blokuje błąd, zanim trafi na serwer. |
| **L17** | Sprzeczność spec ↔ DS: link logowania jest ważny 72 h (#14 Q7, grill), a story DS S2 pokazuje ważność 24 h („20.10.2026, 19:00” przy teraz 19.10 19:00). | Potwierdzić 72 h. | **72 h, czyli ważny do 22.10.2026, 19:00; poprawić dane w story.** Decyzja z grilla jest późniejsza i zatwierdzona. |
| **L18** | Sprzeczność danych: #15 story 3 mówi, że Piotr ma opublikowaną stronę bez dostępności, a #16 story 4 „/m/piotr przed publikacją” daje 404. To ta sama osoba w dwóch wykluczających się stanach. | Czy prototyp może rozdzielić te przykłady na dwie osoby? | **Tak: Piotr = opublikowana bez okien, Ewa = szkic** (sekcja 3). Zmienia się tylko dane demo, zachowanie zostaje. |
| **L19** | Kryterium bez ekranu: #16 story 5 mówi, że na `/` nie ma listy, ale nigdzie nie opisano, co `/` pokazuje. | Czy `/` jest w prototypie, a jeśli tak, z jaką treścią? | **Poza prototypem E01.** `/` zostaje takie jak dziś (szkielet). Żaden przepływ E01 tam nie prowadzi, a każda treść byłaby nową funkcją. |
| **L20** | Rozjazd spec ↔ DS: #15 story 3 przypisuje baner „Nie masz dostępności” opublikowanej stronie, a DS pokazuje go też na szkicu przy pierwszej wizycie. | Czy baner widać już na szkicu? | **Tak.** Dostępność działa na szkicu (#15 Q5), a baner prowadzi do kroku z celu 20 minut. |
| **L21** | Decyzja niepodjęta: niezapisane zmiany przy przejściu „Strona” ↔ „Dostępność” (s04/s05) nie mają kryterium. | Czy ostrzegać przed utratą niezapisanych zmian? | **Nie w 1.0.** Tego nie ma w materiałach. Obie strony mają jeden przycisk zapisu, a rzadkie przejścia warto obserwować w pilocie. Jeśli właściciel zdecyduje inaczej, trzeba dopisać kryterium. |

### Decyzje (2026-10-20, K. Marczak przez delegację do koordynatora)

- **L1:** przyjęta rekomendacja: s06 w wersji #16, bez formularza zapytania.
- **L2:** przyjęta: „Zespół DevMentora zaprasza cię do DevMentora”.
- **L3:** przyjęta: „Ten link jest nieaktywny — poproś zespół o nowy”.
- **L4:** przyjęta: ten sam neutralny komunikat.
- **L5:** przyjęta: ważny link zamienia sesję; własny link logowania przy aktywnej sesji przekierowuje do `/mentor` bez zużycia.
- **L6:** przyjęta: dane zostają w formularzu, `Alert` „Sesja wygasła…”, bez przekierowania.
- **L7:** przyjęta: „Wyloguj” w `MentorNav`, po nim s03.
- **L8:** przyjęta: `ShareLinkPanel` stale nad formularzem opublikowanej strony.
- **L9:** przyjęta: slug zastępczy, propozycja z imienia do ręcznej edycji pola.
- **L10:** przyjęta: nawigacja tylko „Strona” i „Dostępność”, bez licznika.
- **L11:** przyjęta: kontrolka prototypu z symulowanym CLI.
- **L12:** przyjęta **tylko dla pilotażu** (ciepłe kontakty, bez kanału kontaktu). **Otwarte na później:** przed wyjściem poza pilotaż potrzebny kanał kontaktu.
- **L13:** przyjęta: bez podglądu przed publikacją w 1.0.
- **L14:** przyjęta: s03.
- **L15:** przyjęta: domyślnie Europe/Warsaw, pole edytowalne.
- **L16:** przyjęta: „+ okno” z `disabledReason` „Maksymalnie 21 okien w tygodniu”.
- **L17:** przyjęta: 72 h (ważny do 22.10.2026, 19:00).
- **L18:** przyjęta: Piotr (opublikowana bez okien) i Ewa (szkic).
- **L19:** przyjęta: `/` poza prototypem E01.
- **L20:** przyjęta: baner widoczny także na szkicu.
- **L21:** przyjęta: bez ostrzeżenia o niezapisanych zmianach w 1.0.

### Przeniesienie do specyfikacji (2026-10-20, K. Marczak przez delegację)

- L1–L21, uwagi W1–W4 i pytania z budowy prototypu przeniesione do specyfikacji #14, #15, #16, #23 (oraz dopiski w #17, #18) jako zmiany Z1–Z41. Każda zmiana w spec ma źródło (L/W/Z/P/H).
- Pytania z budowy: P1 (horyzont 14 dni, dane 3.11 poprawione w sekcji 3), P2 (C8 przemianowane), P3 (dwie karty linku logowania → `/mentor`), P4 (baner dostępności nad panelem linku, dopóki brak okien), 5 (C3 dotyczy s01 i s02, kontrolka prototypu), 6 (opis Piotra N. to dane demo).
- Wyniki person (H1–H11) trafiły do specyfikacji wyłącznie jako pytania do sprawdzenia w pilocie [SYNTHETIC].

## 5. Luki w design systemie

Decyzja 2026-10-20: D1–D12 zostają jako luki, DS nie poprawiamy teraz. Prototyp obchodzi je po swojej stronie. Wszystkie wpisane do `packages/ui/docs/guide/WhatIsMissing.mdx` (2026-10-20).

| # | Luka | Dotyczy | Propozycja (do decyzji, nie robię) |
|---|---|---|---|
| D1 | Brak kompozycji ekranu `/m/[slug]` tylko z #16 (bez `RequestForm`). S6 łączy #16 i #17. | s06, L1 | Story „S6 · #16 only” z `PriceList` + `LengthToggle` + `SlotList selectable={false}`. |
| D2 | `MentorNav` ma stałą listę z „Zapytania”, nie da się ukryć sekcji, której jeszcze nie ma. | s04, s05, L10 | Prop `sections` lub ukrywanie pozycji. |
| D3 | Brak kontrolki „Wyloguj” (w `MentorNav` ani nigdzie indziej). | s04, s05, L7 | Pozycja „Wyloguj” w `MentorNav` (`TextLink` lub `Button secondary` jako formularz). |
| D4 | `MentorPageForm` traktuje niepusty slug startowy jako ręcznie zmieniony, więc slug zastępczy `mentor-xxxxxx` wyłącza propozycję z imienia. | s04, L9 | Prop `slugIsPlaceholder`. |
| D5 | `SaveMentorPageResult` i `SaveAvailabilityResult` nie mają kodu „brak sesji”. `SaveAvailabilityResult` nie ma też błędów pól (limit okien, zła strefa). | s04, s05, L6, L16 | Kod `unauthorized` + komunikat. `errors` w wyniku dostępności. |
| D6 | `ShareLinkPanel` pojawia się tylko zaraz po publikacji, a po publikacji podpowiedź przy slugu nie pokazuje pełnego URL. | s04, L8 | Prop `shareUrl` w `MentorPageForm` dla opublikowanej strony (panel bez autofokusu). |
| D7 | Story S2 ma ważność linku logowania 24 h zamiast 72 h. | s02, L17 | Poprawić dane story. |
| D8 | `AvailabilityEditor` nie ma limitu 21 okien ani `disabledReason` na „+ okno”. Dni są indeksowane 0–6 (pon = 0), a spec używa ISO 1–7 (pon = 1), więc aplikacja potrzebuje mapowania. | s05, L16 | Limit + `disabledReason`; udokumentować mapowanie dni. |
| D9 | Brak kompozycji stanu ładowania (`Skeleton`) dla s04 i s05. Brak story „brak sieci” dla S2 i S5 (komponenty to obsługują, stories tego nie pokazują). | s02, s04, s05 | Dodać stories stanów. |
| D10 | `AccessMessage` ma tylko tytuł, bez następnego kroku i bez miejsca na kontakt. Wariant dla „konto już istnieje” nie istnieje (potrzebny tylko, jeśli L4 zostanie rozstrzygnięte inaczej). | s01–s03, L4, L12 | Zależnie od decyzji L4 i L12. |
| D11 | W S5 przy pustym stanie ten sam tekst „Nie masz dostępności…” pojawia się dwa razy (baner + pusty podgląd). | s05 | W pustym podglądzie zostawić tylko baner albo krótszy tekst. |
| D12 | `RadioGroup` (`LengthToggle` 25/50): strzałka przenosi fokus, ale nie zaznacza opcji (`evidence/raport.json`, budowa prototypu 2026-10-20). Wzorzec WAI-ARIA radio wymaga zaznaczenia. | s06 | Strzałka zaznacza i filtruje listę; przed #16 faza 2 (Z41). |

## 6. Liczby

- **Ekrany: 7** (s01–s07)
- **Stany: 56** (według tabeli w sekcji 1, bez pozycji „nie dotyczy”; w s03 i s07 „D = BD” to ten sam stan, liczony raz): s01 7 · s02 6 · s03 3 · s04 14 · s05 12 · s06 11 · s07 3
- **Scenariusze do przełączania: 15** kontrolek (C1–C15)
- **Luki w specyfikacji: 21** (L1–L21): sprzeczności 8 (L1, L3, L4, L9, L10, L17, L18, L20), stany bez kryterium 6 (L5, L6, L8, L14, L15, L16), kryteria bez ekranu 4 (L2, L7, L11, L19), decyzje niepodjęte 3 (L12, L13, L21)
  - rozstrzygnięte: 21 z 21; otwarte na później: 1 (L12, kanał kontaktu przed wyjściem poza pilotaż)
- **Luki w design systemie: 12** (D1–D12; D12 dopisana 2026-10-20 po budowie prototypu), wszystkie zostają otwarte (nie poprawiamy DS teraz)

> Mapa zatwierdzona 2026-10-20 z decyzjami z sekcji 4.
