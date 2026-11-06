# Epik 01 — stan implementacji (lekcja 08)

Gałąź: `lekcja-08-epik-01` (tylko lokalne commity, bez push). Start: 2026-10-21.

Specyfikacje (kolejność realizacji):

1. `.ai/specs/2026-10-19-data-store-and-first-schema-migration.md` (#23)
2. `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` (#14)
3. `.ai/specs/2026-10-19-mentor-weekly-availability-and-open-slots.md` (#15)
4. `.ai/specs/2026-10-19-public-mentor-share-page.md` (#16)

Wszystkie ⚠ potwierdzone przez właściciela (rekord D12, `.ai/specs/research/decisions/D12-lesson-05-spec-defaults-confirmed.md`). Zmiany Z1–Z41 i F1–F3 są już wpisane w treść specyfikacji.

## Jak wznowić pracę w nowej sesji

1. `git checkout lekcja-08-epik-01`, przeczytaj ten plik i specyfikację bieżącej fazy.
2. Baza: Docker Desktop + `npm run setup` (tworzy `docker-compose.yml`, `.env.example`, `.env.local`, uruchamia `postgres:17`; od fazy 1 także migracje).
3. Następne zadanie = pierwsze `[ ]` poniżej. Po każdej fazie STOP: raport dla Krzysztofa i czekanie na „dalej”.

## Zasady dla każdego zadania (subagent)

- Przed kodem Next.js przeczytaj właściwy przewodnik w `node_modules/next/dist/docs/` (Next 16, `cacheComponents: true`; m.in. `01-app/02-guides/authentication-with-cache-components.md`, `server-actions.md`, `forms.md`, `data-security.md`).
- UI tylko z `@devmentor/ui` i `@devmentor/ui/product` + tokeny (`docs/design-system.md`). Teksty po polsku, neutralne płciowo (C12). Bez ocen, bez katalogu/wyszukiwarki (N02, R14).
- Logika domenowa w `lib/**/*.mjs` (JSDoc), żeby testy `node --test` (`tests/**/*.test.mjs`) importowały ją bez loadera TS; cienkie wrappery `.ts` z `import "server-only"`, cookies, `redirect`.
- Testy z bazą: `tests/db/` — jednorazowy schemat `dm_migtest_<losowe>` z komentarzem-markerem (spec #23 Q7); lokalnie brak bazy → skip z komunikatem, przy `CI=true` → fail.
- Luki DS (D1–D12, `lekcja-07/mapa-ekranow.md` §5) poprawiamy w `packages/ui` tylko wtedy, gdy wymaga ich kryterium akceptacji specyfikacji; aktualizujemy stories i `packages/ui/docs/guide/WhatIsMissing.mdx`.
- Siatka bezpieczeństwa po każdym zadaniu (musi być zielona przed commitem): `npx tsc --noEmit`, `npm run typecheck:ui` (gdy ruszony `packages/ui`), `npm run lint`, `npm test`, `npm run check:tokens`, `npm run build` + nowe skrypty testowe (`npm run test:storybook` gdy ruszony `packages/ui`; `npm run test:e2e` od fazy 2).
- Commit po polsku, ostatnia linia `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git add` tylko konkretnych ścieżek — nigdy `.env*` (poza ewentualnym `.env.example`), `docker-compose.yml`, nieśledzonych `.ai/analysis/*`.
- Nie instalujemy nic poza zależnościami wskazanymi w specach (`pg`, `node-pg-migrate`); nie pobieramy przeglądarek (Chromium dla Playwright jest już w cache).

## Fazy i zadania

### Faza 1 — Magazyn danych i migracja 0001 (#23, Phase 1) — ZAKOŃCZONA 2026-10-21 (review Codexa: approve; test ręczny koordynatora OK)

- [x] 1.1 Narzędzia: `pg` + `node-pg-migrate` (przypięte wersje), `scripts/db-migrate.mjs` (`migrate()` + CLI z `.env.local`, czytelny błąd braku bazy), skrypty `db:migrate` / `db:rollback`, `engines.node >=20.12`, pusty `db/migrations/`; test jednostkowy wrappera z wstrzykniętym runnerem.
- [x] 1.2 Migracja `0001_mentors_invitations_pages.sql` + `tests/db/migrations.test.mjs` (up → down → up) + `tests/db/schema.test.mjs` (CHECK-i reguł biznesowych) + test harnessu (obcy schemat `test_x` przetrwa sprzątanie).
- [x] 1.3 CI (`postgres:17` service, `DATABASE_URL`) + krok migracji w `scripts/setup.mjs` (z ponawianiem połączenia) + test w `tests/setup.test.mjs`.
- [x] 1.4 Dokumentacja i kontrakty: README (komendy migracji, `db/`, Node ≥ 20.12, `db:rollback` tylko lokalnie/testowo), `BACKWARD_COMPATIBILITY.md` (schemat → „dziś”, nowe skrypty).

### Faza 2 — Zaproszenie i logowanie mentora (#14, Phase 1) — ZAKOŃCZONA 2026-10-21 (review Codexa: approve + 1 Minor poprawiony; test ręczny koordynatora OK)

- [x] 2.1 Migracja `0002_mentor_sign_in` (`mentor_sessions`, `mentor_sign_in_links`) + pula `lib/db` (`DATABASE_URL`) + test up/down.
- [x] 2.2 CLI założycieli `scripts/mentor-links.mjs` + `mentor:invite`, `mentor:sign-in-link` (token 32 B base64url, tylko SHA-256, 14 dni / 72 h); testy z bazą.
- [x] 2.3 Rdzeń sesji i linków (`acceptInvitation`, `redeemSignInLink`, `startSession`, `endSession`, `getCurrentMentor`) w `.mjs` + DAL `server-only`; testy z bazą (transakcja, jednorazowość, współbieżność, ta sama neutralna odpowiedź, zamiana sesji innego mentora, własny link bez zużycia).
- [x] 2.4 Strony `/invite/[token]`, `/sign-in/[token]`, powłoka `/mentor`, „Wyloguj”, `MentorNav` bez „Zapytania” (luki DS D2, D3) + `npm run test:e2e` (Playwright na `next start`): GET niczego nie zużywa, ścieżka odmowy, tekst zaproszenia.

### Faza 3 — Edytor strony i publikacja (#14, Phase 2) — ZAKOŃCZONA 2026-10-21 (test ręczny koordynatora OK; review Codexa: request changes → poprawki po review)

- [x] 3.1 Migracja `0003_mentor_page_prices` (ceny w groszach, `currency` PLN, nowy CHECK publikacji, strażnik `RAISE` na opublikowanym wierszu) + testy.
- [x] 3.2 `lib/mentor-page/validate.mjs` + testy jednostkowe (każde brakujące pole nazwane, URL tylko http(s), ceny 20–5000 zł, slug).
- [x] 3.3 `saveMentorPage` (zapis szkicu / publikacja / edycja po publikacji, slug zablokowany, wyścig o slug, `unauthorized`) + testy z bazą (zakres mentora A/B).
- [x] 3.4 Edytor `/mentor`: formularz (F1 podpowiedź opisu, F2 „(zł)” w etykiecie + sufiks), panel linku do udostępnienia (L8/Z9), propozycja sluga z imienia (Z10; luka DS D4), `unauthorized` i brak sieci (D5, Z7, Z28), `shareUrl` po publikacji (D6) + testy (Storybook + e2e).
- [x] 3.5 Dokumentacja: README (skrypty mentora, nowe URL-e), `BACKWARD_COMPATIBILITY.md`.

### Faza 4 — Tygodniowa dostępność i wolne terminy (#15) — ZAKOŃCZONA 2026-10-21 (review Codexa: approve; test ręczny koordynatora OK; 2 drobne uwagi poprawione)

- [x] 4.1 Migracja `0004_availability` (`availability_windows`, `mentors.time_zone`) + testy CHECK i up/down.
- [x] 4.2 `lib/availability/zone.mjs` + `slots.mjs` (`listOpenSlots`, stałe `MIN_NOTICE_MINUTES=180`, `SLOT_GRID_MINUTES=30`, `HORIZON_DAYS=14`) + testy DST, granic, łączenia okien, `busy`.
- [x] 4.3 Zapytania okien/strefy + `isSlotOffered` + testy.
- [x] 4.4 `saveAvailability` (atomowa zamiana zestawu, limit 21, strefa z `Intl.supportedValuesOf`, `unauthorized`) + testy z bazą (zakres A/B).
- [x] 4.5 Strona `/mentor/availability` (prefill strefy, ostrzeżenie zmiany strefy, podgląd 10 terminów, limit 21 — luka DS D8, D11) + baner „Nie masz dostępności” na `/mentor` (Z21, Z40) + testy.

### Faza 5 — Publiczna strona mentora: profil i ceny (#16, Phase 1) — ZAKOŃCZONA 2026-10-21 (review Codexa: approve + 1 Minor, ryzyko zaakceptowane; test ręczny koordynatora OK)

- [x] 5.1 `lib/mentor-page/public` — `getPublishedPageBySlug` (tylko `mentor_pages`, allowlista kluczy) + testy z bazą.
- [x] 5.2 `app/m/[slug]/page.tsx` + not-found + `noindex` + tytuł; testy e2e (kolejność, brak ocen, 404 dla szkicu/nieznanego, `/m` i `/m?search=` → 404).

### Faza 6 — Publiczna strona mentora: wolne terminy (#16, Phase 2) — ZAKOŃCZONA 2026-10-21 (test ręczny koordynatora OK)

- [x] 6.1 Sekcja terminów (Suspense + error boundary, `listOpenSlots`, pusty stan, brak strefy) + testy.
- [x] 6.2 `slot-list.tsx`: strefa widza (fallback UTC), grupowanie po dniu z „Pokaż więcej (k)” (F3), przełącznik 25/50 ze strzałkami (luka DS D12, Z41) + testy helpera i komponentu.

## Podsumowanie Epiku 01 (2026-10-21)

- 6 faz, 22 zadania + poprawki po review; wszystkie zadania [x]. Specyfikacje #23, #14 (fazy 1–2), #15, #16 (fazy 1–2) zaimplementowane.
- Migracje 0001–0004; trasy: `/invite/[token]`, `/sign-in/[token]`, `/mentor`, `/mentor/availability`, `/m/[slug]` (+ `proxy.ts` dla 404 `/m/*`); CLI `mentor:invite`, `mentor:sign-in-link`; skrypty `db:migrate`, `db:rollback`, `test:e2e`.
- Siatka na koniec: `npm test` 406, `npm run test:e2e` 57, `npm run test:storybook` 370 — wszystko zielone; tsc (app + ui), lint, check:tokens, build OK.
- Luki DS zamknięte: D1–D8, D11, D12 (+ F1–F3); otwarte: D9 (część S2), D10.
- Dalej poza tym planem: E02 (#17 formularz zapytania — w tym F3 dla terminów wybieralnych i `busy`), CI dla e2e, QA `needs-qa`, PR-y z planem rollbacku.

## Dziennik decyzji implementacyjnych

- 2026-10-21: plan 6 faz zgodnie z Phasing specyfikacji i kolejnością podaną przez Krzysztofa (#23 → #14 → #15 → #16). Strona `/m/{slug}` dostępna dopiero od fazy 5 — do tego czasu link do udostępnienia prowadzi do 404 (zgodnie z „release gate” w #14 i #16).
- 2026-10-21: specyfikacje nie wprowadzają sekretów (sesje w bazie, bez kluczy) — `.env.local` zawiera tylko `DATABASE_URL` i `NEXT_PUBLIC_APP_URL`; utworzony przez `npm run setup`, niecommitowany.
- 2026-10-21 (faza 1): pg 8.23.1, node-pg-migrate 9.0.0; jedna transakcja na migrację, advisoryLockMode "wait"; harness testów `tests/db/harness.mjs` (`describeDb`, `createTestSchema`) — do użycia w kolejnych zadaniach.
- 2026-10-21 (faza 1): `runSteps` w `scripts/setup.mjs` jest teraz asynchroniczne; skrypt migracji ładowany dynamicznie (czysty klon przed `npm install`).
- 2026-10-21 (decyzja K. Marczak przez delegację): `.env.example` commitujemy (bez sekretów, dokumentuje zmienne); `docker-compose.yml` nadal generuje `npm run setup` (niecommitowany); skrypt `db:up` niepotrzebny.
- 2026-10-21 (faza 2): logika domenowa sesji w `lib/auth/mentor-auth.mjs` (przyjmuje `db` = `pg.Pool`, `now`), DAL `lib/auth/session.ts`; strony czytają sesję/link w `<Suspense>` po `connection()`, ciasteczka zapisują tylko akcje serwera.
- 2026-10-21 (faza 2): `npm run test:e2e` (`scripts/test-e2e.mjs`) wymaga wcześniejszego `npm run build`; aplikacja pod `next start` dostaje `DATABASE_URL` z `options=-c search_path=<schemat dm_migtest_*>`.
- 2026-10-21 (faza 2): DS — `MentorNav` (`sections`, `signOutAction`), `InvitationPanel` bez `inviterName`, `useFocusFirstError` przeniesiony do `shared/use-focus-first-error.ts` (barrel `@devmentor/ui/product` importowalny z Server Components); `testTimeout` Storybooka 30 s (wcześniej niestabilny test RequestForm).
- 2026-10-21 (faza 2): w nawigacji tylko „Strona” + „Wyloguj”; „Dostępność” dojdzie w zadaniu 4.5 razem z `/mentor/availability` (bez martwego linku). Data ważności linku podawana z dopiskiem „(czas polski)”. Strony linków i `/mentor` mają `noindex`.
- 2026-10-21 (po review fazy 2): strony z danymi z bazy mają `<Suspense>` OBEJMUJĄCY cały `PageLayout` (fallback z własnym `PageLayout`), żeby treść nigdy nie była poza `<main>`; props stron przez globalny `PageProps<"/trasa">`. Świeży klon: `npx tsc --noEmit` wymaga wcześniej `npx next typegen` / `next build` (tak samo dla istniejącego `LayoutProps`).
- 2026-10-21 (faza 3): walidacja serwerowa `lib/mentor-page/validate.mjs` jest źródłem prawdy; komunikaty klienta w DS identyczne (test pilnuje). Szkic przyjmuje puste pola, ale wypełnione muszą być poprawne. Po publikacji każdy zapis waliduje jak publikacja; slug zablokowany.
- 2026-10-21 (faza 3): DS — `MentorPageForm` (`slugIsPlaceholder`, `shareUrl`, `currencyLabel`, wynik `unauthorized`), `FormField hintPlacement="label"`, `ShareLinkPanel autoFocus`; błąd pola znika po poprawie wartości (wcześniej przesunięcie układu przy blur psuło kliknięcie „Opublikuj stronę”).
- 2026-10-21 (faza 3): `NEXT_PUBLIC_APP_URL` po stronie serwera czytany w czasie żądania (`Reflect.get(process.env, …)`), bo Next wkleja wartość z czasu buildu. Po zapisie `refresh()` z `next/cache`.
- 2026-10-21 (review fazy 3, decyzje K. Marczak przez delegację): [Major, ODRZUCONE] strażnik RAISE w 0003 zostaje — stan niemożliwy (publikacja powstaje w tej fazie, brak bazy produkcyjnej); w migracji dopisany komentarz z uzasadnieniem i ścieżką dwuetapową (backfill cen / cofnięcie publikacji przed zaostrzeniem CHECK). Zmiana tylko w komentarzu już zastosowanej migracji. [Minor, PRZYJĘTE] link: tylko kontrakt specyfikacji (http(s)://, ≤ 500), bez wymogu kropki w hoście — `https://localhost` poprawny. [Minor, PRZYJĘTE] jedna reguła długości (punkty kodowe) we wspólnym module `@devmentor/ui/text` (`packages/ui/src/lib/text.mjs`), używanym przez klienta i serwer; `Textarea` liczy limit w punktach kodowych (bez natywnego `maxlength`).
- 2026-10-21: w bazie dev zostaje opublikowana strona `anna-k` (anna@example.com) z fazy 3 — dane demo do faz 4–5; testy używają jednorazowych schematów.
- 2026-10-21 (faza 4): silnik terminów czysty (`lib/availability/slots.mjs`, `zone.mjs`, bez nowych zależności); UTC akceptowane mimo braku w `Intl.supportedValuesOf`; aliasy stref zapisywane jako nazwa kanoniczna Node (np. Europe/Kyiv → Europe/Kiev). Granica horyzontu to 14 × 24 h od teraz (P1/Z37 potwierdzone: ostatni dzień 2.11).
- 2026-10-21 (faza 4): `saveAvailability` serializuje zapisy blokadą doradczą na mentora (bez blokady wiersza `mentors`, której używa #17 — zgodnie z Edge Cases). Podgląd = terminy dla 10 najbliższych godzin startu (obie długości), tak jak grupuje DS `SlotPreview`.
- 2026-10-21 (faza 4): DS — `AvailabilityEditor` (`timeZone: string | null` = pierwsza wizyta z prefill z przeglądarki, błędy przy oknie, limit 21 z `disabledReason`, `unauthorized`), `SlotPreview emptyText`, `MentorPageForm notice` (baner nad panelem linku, Z40), `Select aria-describedby`. Nawigacja: „Strona”, „Dostępność”, „Wyloguj”.
- 2026-10-21 (po fazie 4): DS `Select` renderuje etykietę wybranej opcji już w HTML z serwera (wcześniej puste pole „Strefa czasowa” do hydracji); `NoAvailabilityNotice href={null}` — na /mentor/availability baner bez linku do samej siebie. W bazie dev zostaje Anna z oknami wt/czw 18–20.
- 2026-10-21 (faza 5): prawdziwy status 404 dla `/m/*` przez `proxy.ts` (lekkie `select 1 … published_at is not null` przed renderem, przepisanie na nieistniejącą ścieżkę → `app/not-found.tsx` z 404 i „Nie ma takiej strony mentora”); `notFound()` w stronie dawał 200 przez powłokę PPR (`cacheComponents`). Odstępstwo od #14 „No proxy.ts” dotyczy tylko statusu 404 stron publicznych — autoryzacja dalej wyłącznie w DAL. Każda odpowiedź `/m/*` ma `X-Robots-Tag: noindex, nofollow`. Nowy polski globalny `app/not-found.tsx` (przez `headers()` `/` i `/_not-found` są teraz ◐).
- 2026-10-21 (decyzje K. Marczak przez delegację po review fazy 5): odstępstwo `proxy.ts` PRZYJĘTE i dopisane w specyfikacjach #14 (wyjątek od „No proxy.ts”, bez autoryzacji) i #16 (Architecture: 404 pod `cacheComponents`); Minor Codexa (wyścig cofnięcia publikacji między proxy a renderem → miękkie 404) — ryzyko zaakceptowane, wpisane w #16 Risks, bez zmiany kodu.
- 2026-10-21 (zadanie 6.1): do klienta trafia tylko lista ISO terminów i publiczne ceny (okna, `time_zone`, `mentorId` zostają na serwerze; sprawdzane w HTML i payloadzie RSC). Sekcja terminów ma własny `<Suspense>` i granicę błędu (`catchError` z `next/error`); profil i ceny poza nimi. Czasy renderowane dopiero po hydracji (`useSyncExternalStore`, serwer pokazuje szkielet) — bez niezgodności hydracji i bez mignięcia czasów UTC. Zasada Z1: przełącznik 25/50 to grupa radio (Radix `<button role="radio">`), w liście terminów żadnych `a`/`button`. Nagłówek sekcji bez strefy w stanach pustym/błędu/ładowania (strefa tylko nad listą czasów, D3).
- 2026-10-21 (zadanie 6.2): grupowanie terminów po dniu we wspólnym module `@devmentor/ui/slots` (`packages/ui/src/lib/slot-days.mjs`, `groupSlotsByDay`) — ten sam kod w DS i w `node --test`; formatery dat przeniesione tam z `format.ts` (re-eksport). `SlotList` (tryb tekstowy): dzień raz jako `h3`, czasy jako `li` z ukrytą datą w tekście, maks. 6 + „Pokaż więcej (k)” (rozwinięty: „Pokaż mniej”), reset po zmianie długości. `RadioGroup` (D12): strzałka przenosi fokus i zaznacza od razu. Pusta lista dla jednej długości: „Brak terminów 50 min w najbliższych 14 dniach — wybierz 25 min”.
- 2026-10-21 (review końcowe Codexa main..HEAD, decyzje K. Marczak przez delegację): [Major, PRZYJĘTE] CI uruchamia teraz `npm run lint` i `npm run build` (osobne joby; build bez bazy, `NEXT_PUBLIC_APP_URL` testowy) obok `npm test` z Postgresem — zgodnie z SDLC.md; zamyka też action item z review PR #3. [Minor, PRZYJĘTE] „jutro”/„dziś” w `slot-days.mjs` liczone na dacie kalendarzowej w strefie widza, nie now + 24 h (testy DST 24→25.10 i 28→29.03).

## Otwarte punkty

- L12 (z #14): komunikaty „poproś zespół” nie wskazują kanału kontaktu — zaakceptowane tylko na pilotaż.
- Workflow CI z usługą postgres:17 nie był uruchomiony na GitHubie (brak push) — sprawdzony tylko lokalnie (YAML parsuje się).
- Z39 (dwie karty) w e2e tylko pośrednio — pokryte testami domeny z bazą.
- Niestabilny test `tests/db/harness.test.mjs` (wyścig sprzątania między plikami): przyczyna znaleziona, poprawka (oczekiwanie do 5 s) — obserwować.
- `npm run test:e2e` nadal nie jest w CI (decyzja 2026-10-21: nie dodajemy teraz) ani w bramce walidacji (`.ai/agentic.config.json`) — przepływy edytora i „GET niczego nie zużywa” są sprawdzane tylko lokalnie; dodanie wymaga joba CI (build + postgres + Chromium) i zgody maintainera.
- Opis PR (#14) musi zawierać: plan rollbacku (`db:rollback` cofa 0003 i 0002 po kolei, brak danych produkcyjnych), ⚠ Q2–Q4 (potwierdzone, D12), wynik ręcznego przejścia na czas (D08).
- (faza 4) QA w prawdziwej przeglądarce z wąskim ekranem (`needs-qa`) — nie wykonane; dopasowanie aliasów stref sprawdzone tylko w Chromium. Lista ~420 stref w zwykłym `Select` (bez wyszukiwania; combobox w DS „Not built”). Powód „Maksymalnie 21 okien…” powtarza się przy każdym z 7 przycisków „+ okno”.
- (faza 5) Dwa zapytania do bazy na wyświetlenie opublikowanej strony (proxy + strona). Wyścig „mentor cofa publikację między proxy a renderem” daje miękkie 404 (200 + noindex). Przy niedziałającej bazie `/m/*` zwraca 500.
- (faza 6) Reguła F3 (6 + „Pokaż więcej”) dla terminów wybieralnych w formularzu zapytania należy do #17 — nie zrobione. Data w ukrytym tekście każdego terminu powtarza się w czytniku ekranu — do odsłuchu w QA.
- QA ręczne `needs-qa` (SDLC, `risk-high`): przejście od linku zaproszenia do linku udostępnienia mierzone ręcznie (cel 20 min, D08) — po fazie 3.

# Epik 02 — część 1 (lekcja 11)

Tryb autonomiczny (`/om-auto-implement-spec` → `om-auto-create-pr`), gałąź `feat/e02-stripe-and-prepaid-request`, PR #40 (`Zamyka #24`, `Zamyka #17`, `Refs #9`). Start: 2026-10-27. Plan runu z postępem i decyzjami: `.ai/runs/2026-10-27-e02-stripe-and-prepaid-request.md`.

Specyfikacje: `.ai/specs/2026-10-19-stripe-card-payment-refund-and-webhook.md` (#24, fundament płatności) → `.ai/specs/2026-10-19-prepaid-request-with-question.md` (#17).

## Co powstało

- `lib/payments` (#24): konfiguracja i strażnik trybu testowego (tylko `sk_test_`/`rk_test_`), `createPayment` / `openCheckout` / `syncCheckout` / `expireCheckout`, zwrot outbox + dzierżawa (`requestRefund` / `executeRefund`, ponowienia 1/5/15/60 min, 24 h → `failed`), webhook (`POST /api/webhooks/stripe`, podpis, `stripe_events`, zwroty, spory), rekonsyliacja, subskrybenci w transakcji. Migracja `0005_payments`.
- `lib/jobs`: `POST/GET /api/internal/jobs` (Bearer `CRON_SECRET`, zdrowie `stale`/`failedRefunds`), `npm run jobs`.
- `lib/requests` + `lib/email` (#17): walidacja, zajęte przedziały (busy na `/m/{slug}`), `startRequest` (blokada wiersza mentora), subskrybent płatności, outbox e-maili (log/SMTP), odczyt `/r/{token}` po hashu. Migracja `0006_requests`.
- UI: formularz zapytania na `/m/[slug]` (DS `RequestForm`, F4 — godzina = radio), strona `/r/[token]` (stany płatności), `proxy.ts` (404 i `Referrer-Policy: no-referrer` dla `/r/*`). DS: F3 (6 + „Pokaż więcej”) także w trybie wybieralnym, `RadioGroup` z `footer`.
- E2E z lokalnym fałszywym Stripe (`tests/e2e/fake-stripe-server.mjs`): pełny przepływ formularz → płatność → „Opłacone”, porzucenie, dwie karty, 404. Zrzuty: `.ai/runs/2026-10-27-e02-stripe-and-prepaid-request/screenshots/`.

## Zasady, które doszły (dla kolejnych historii E02/E03)

- Ruch pieniędzy tylko przez `lib/payments`; historie słuchają przez `lib/payments/subscribers.mjs` (w transakcji przejścia) i dopisują zadania w `lib/jobs/registry.mjs`.
- Testy płatności: fałszywy klient (`tests/payments/fake-stripe.mjs`, migawki kluczy idempotencji, wstrzykiwanie błędów `afterEffect`), zegar sterowany w `deps.now`. Nigdy prawdziwe klucze — atrapy `sk_test_PLACEHOLDER…`.
- Treść pytania nigdy w e-mailach, Stripe ani logach; błędy Stripe zapisywane jako kod + id żądania.

## Siatka na koniec (lokalnie, 2026-10-27)

`npm test` 587 ✔, `npm run test:e2e` 64 ✔, `npm run test:storybook:themes` 372 ✔; tsc (app + ui), lint, check:tokens, check:agents, build OK.

## Otwarte punkty

- Ręczne QA w trybie testowym Stripe (`stripe listen`, karty 4242/0002/3155, spór, przejście na czas ≤ 5 min, e-maile) — wymaga kluczy testowych; `needs-qa`, bez self-QA (risk-high).
- Link w e-mailu do mentora `/mentor/requests/{id}` prowadzi do 404 do czasu #18. (zrobione w części 2, PR #46)
- Anulowanie (#19), decyzja mentora i wygasanie (#18) — kolejne części epiku. (zrobione w części 2, PR #46)
- `npm run build` ostrzega, że Next.js 16.4.0 ma znaną podatność — osobna aktualizacja zależności.
- Lista terminów w formularzu jest długa przy szerokich oknach (14 dni × 6 + „Pokaż więcej”) — do obserwacji w pilocie.

# Epik 02 — część 2 (lekcja 11, zadanie domowe)

Tryb autonomiczny (`om-auto-create-pr-loop`), gałąź `feat/e02-mentor-decision-and-cancel`, PR #46 (stos na #40, baza `feat/e02-stripe-and-prepaid-request`; `Zamyka #18`, `Zamyka #19`, `Refs #9`). Start: 2026-10-27. Plan runu: `.ai/runs/2026-10-27-e02-mentor-decision-and-cancel/PLAN.md`.

Specyfikacje: #18 (E02-S02, decyzja mentora i wygasanie) oraz #19 (E02-S03, anulowanie) — `.ai/specs/`.

## Co powstało

- #18: `lib/requests/mentor.mjs` (lista, licznik i szczegóły zapytań mentora, izolacja po `mentor_id`), `lib/requests/decision.mjs` (`acceptRequest` / `declineRequest`: jeden warunkowy UPDATE; odmowa z ponownego odczytu; zwrot `mentor_declined` + e-mail w transakcji, `executeRefund` po commicie), `lib/requests/lapse.mjs` (`lapseOverdue`, zadanie `requests.lapseOverdue` w `lib/jobs/registry.mjs` przed `payments.retryRefunds` i `email.sendDue`; `SKIP LOCKED`).
- UI mentora: `lib/requests/mentor-area.ts` (DAL), `app/mentor/requests/page.tsx`, `app/mentor/requests/[id]/page.tsx`, `app/mentor/requests/actions.ts`; „Zapytania” z licznikiem w `MentorNav` na wszystkich ekranach mentora (koniec reguły E01 „bez Zapytania”).
- `/r/{token}`: stany accepted / declined / overdue / lapsed ze stanem zwrotu; e-maile `request_accepted`, `request_declined`, `request_lapsed` (`lib/email/templates.mjs`).
- #19: `lib/requests/cancel.mjs` (`cancelByToken`: po hashu tokenu, bez strażnika czasu — D05, zwrot `mentee_cancelled`), `app/r/[token]/actions.ts`, przycisk „Anuluj i odzyskaj” na `/r/` (także po starcie terminu), `CancelNotPossible` po akceptacji.
- Testy: `tests/db/requests-{mentor,decision,lapse,cancel,cancel-race,view-states}.test.mjs`, `tests/requests/race.mjs`, e2e `tests/e2e/mentor-requests.e2e.mjs` i `tests/e2e/request-cancel.e2e.mjs`. Zrzuty: `.ai/runs/2026-10-27-e02-mentor-decision-and-cancel/screenshots/`. Bez migracji i bez nowych zmiennych środowiskowych.

## Zasady, które doszły

- Każde przejście z `awaiting_mentor` to jeden warunkowy UPDATE ze strażnikiem statusu; przegrany wyścigu klasyfikuje wynik z ponownego odczytu.
- Co najwyżej jeden zwrot na zapytanie — przez idempotentne `requestRefund`; `executeRefund` dopiero po commicie.
- Wyścigi (akceptacja / odmowa / wygaśnięcie / anulowanie) testuje `tests/requests/race.mjs`.

## Siatka na koniec (lokalnie, 2026-10-27)

`npm test` 642 ✔, `npm run test:e2e` 77 ✔; lint, tsc, build, check:agents OK.

## Otwarte punkty

- Ręczne QA w trybie testowym Stripe (akceptacja, odmowa, wygaśnięcie, anulowanie, zwroty, e-maile) — wymaga kluczy testowych.
- Najpierw trzeba zmergować bazowy PR #40, potem przestawić #46 na `main`.
- Czat (#20) opiera się na `requests.id` zaakceptowanego zapytania.
- Link w e-mailu do mentora (`mentor_new_request`) `/mentor/requests/{id}` już działa.
