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

### Faza 3 — Edytor strony i publikacja (#14, Phase 2) — W TOKU

- [x] 3.1 Migracja `0003_mentor_page_prices` (ceny w groszach, `currency` PLN, nowy CHECK publikacji, strażnik `RAISE` na opublikowanym wierszu) + testy.
- [x] 3.2 `lib/mentor-page/validate.mjs` + testy jednostkowe (każde brakujące pole nazwane, URL tylko http(s), ceny 20–5000 zł, slug).
- [x] 3.3 `saveMentorPage` (zapis szkicu / publikacja / edycja po publikacji, slug zablokowany, wyścig o slug, `unauthorized`) + testy z bazą (zakres mentora A/B).
- [ ] 3.4 Edytor `/mentor`: formularz (F1 podpowiedź opisu, F2 „(zł)” w etykiecie + sufiks), panel linku do udostępnienia (L8/Z9), propozycja sluga z imienia (Z10; luka DS D4), `unauthorized` i brak sieci (D5, Z7, Z28), `shareUrl` po publikacji (D6) + testy (Storybook + e2e).
- [ ] 3.5 Dokumentacja: README (skrypty mentora, nowe URL-e), `BACKWARD_COMPATIBILITY.md`.

### Faza 4 — Tygodniowa dostępność i wolne terminy (#15)

- [ ] 4.1 Migracja `0004_availability` (`availability_windows`, `mentors.time_zone`) + testy CHECK i up/down.
- [ ] 4.2 `lib/availability/zone.mjs` + `slots.mjs` (`listOpenSlots`, stałe `MIN_NOTICE_MINUTES=180`, `SLOT_GRID_MINUTES=30`, `HORIZON_DAYS=14`) + testy DST, granic, łączenia okien, `busy`.
- [ ] 4.3 Zapytania okien/strefy + `isSlotOffered` + testy.
- [ ] 4.4 `saveAvailability` (atomowa zamiana zestawu, limit 21, strefa z `Intl.supportedValuesOf`, `unauthorized`) + testy z bazą (zakres A/B).
- [ ] 4.5 Strona `/mentor/availability` (prefill strefy, ostrzeżenie zmiany strefy, podgląd 10 terminów, limit 21 — luka DS D8, D11) + baner „Nie masz dostępności” na `/mentor` (Z21, Z40) + testy.

### Faza 5 — Publiczna strona mentora: profil i ceny (#16, Phase 1)

- [ ] 5.1 `lib/mentor-page/public` — `getPublishedPageBySlug` (tylko `mentor_pages`, allowlista kluczy) + testy z bazą.
- [ ] 5.2 `app/m/[slug]/page.tsx` + not-found + `noindex` + tytuł; testy e2e (kolejność, brak ocen, 404 dla szkicu/nieznanego, `/m` i `/m?search=` → 404).

### Faza 6 — Publiczna strona mentora: wolne terminy (#16, Phase 2)

- [ ] 6.1 Sekcja terminów (Suspense + error boundary, `listOpenSlots`, pusty stan, brak strefy) + testy.
- [ ] 6.2 `slot-list.tsx`: strefa widza (fallback UTC), grupowanie po dniu z „Pokaż więcej (k)” (F3), przełącznik 25/50 ze strzałkami (luka DS D12, Z41) + testy helpera i komponentu.

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

## Otwarte punkty

- L12 (z #14): komunikaty „poproś zespół” nie wskazują kanału kontaktu — zaakceptowane tylko na pilotaż.
- Workflow CI z usługą postgres:17 nie był uruchomiony na GitHubie (brak push) — sprawdzony tylko lokalnie (YAML parsuje się).
- Z39 (dwie karty) w e2e tylko pośrednio — pokryte testami domeny z bazą.
- QA ręczne `needs-qa` (SDLC, `risk-high`): przejście od linku zaproszenia do linku udostępnienia mierzone ręcznie (cel 20 min, D08) — po fazie 3.
