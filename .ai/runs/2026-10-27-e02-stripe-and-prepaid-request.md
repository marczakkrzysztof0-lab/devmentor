# Plan wykonania — E02 część 1: płatność Stripe (#24) i zapytanie opłacone z góry (#17)

Source doc: .ai/specs/2026-10-19-stripe-card-payment-refund-and-webhook.md
Source doc: .ai/specs/2026-10-19-prepaid-request-with-question.md
Epik: #9 · Issues: #24 (E02-S01-T01), #17 (E02-S01) · Branch: `feat/e02-stripe-and-prepaid-request`
Engine: om-auto-create-pr (steps: 17, --loop: no)

## 🎯 Cel

Deweloper z linku mentora wybiera długość i termin, wpisuje imię i pytanie, płaci kartą przez Stripe Checkout
(tryb testowy) i ląduje na prywatnej stronie `/r/{token}` z „Opłacone — czeka na mentora”. Pod spodem jeden
moduł płatności (`lib/payments`): opłata, idempotentny pełny zwrot z dzierżawą (lease), podpisany webhook,
zadania okresowe (`/api/internal/jobs`) i wspólny adapter e-mail (`lib/email`).

## Zakres

- `lib/payments` (config + strażnik trybu testowego, `createPayment` / `openCheckout` / `syncCheckout` /
  `expireCheckout`, `requestRefund` / `executeRefund`, webhook, rekonsyliacja, subskrybenci), migracja `0005_payments`.
- `POST /api/webhooks/stripe`, `POST|GET /api/internal/jobs`, `npm run jobs`.
- `lib/requests` (walidacja, zajęte przedziały, `startRequest`, subskrybent płatności, odczyt po tokenie),
  migracja `0006_requests`, `lib/email` (outbox, szablony, transport `log`/`smtp`).
- Formularz zapytania na `/m/{slug}` (DS `RequestForm`, terminy jako radio — F4) i strona `/r/{token}`
  (stany z #17), `proxy.ts` dla 404 i nagłówków `/r/*`.
- Dokumentacja: README, `.env.example`, `BACKWARD_COMPATIBILITY.md`, `track.md`.

## Non-goals

- Akceptacja/odrzucenie przez mentora (#18), anulowanie (#19), czat (#20), wypłaty (#22/#25), `/mentor/requests`.
- Klucze live, prawdziwe płatności, wybór hostingu i schedulera (Q9 — tylko endpoint + `npm run jobs`).
- Zmiany w `packages/ui` — komponenty E02 (`RequestForm`, `RequestStatusView`, …) już są w DS.
- Ręczne QA z `stripe listen` i kartami testowymi (krok 8 #24, krok 9 #17) — wymaga kluczy Stripe; zostaje dla QA.

## Implementation Plan

### Phase 1: Płatność — opłata i webhook (#24 Phase 1)

1. Konfiguracja i strażnik trybu testowego: `stripe` (przypięta wersja), `lib/payments/config.mjs`, błędy typowane.
2. Migracja `0005_payments` (`payments`, `stripe_events`, `job_runs`) + testy up/down/up i CHECK.
3. Funkcje opłaty (fałszywy Stripe w testach) + lista subskrybentów.
4. Webhook: logika `.mjs` + trasa `app/api/webhooks/stripe/route.ts` + testy z podpisem `generateTestHeaderString`.
5. Zadania: `/api/internal/jobs` (POST/GET), rekonsyliacja, `job_runs`, zdrowie, `npm run jobs` + testy.

### Phase 2: Zwroty (#24 Phase 2)

6. Outbox zwrotu i dzierżawa (`requestRefund` / `executeRefund`, ponawianie, odpytywanie `pending`) + testy pieniędzy.
7. Webhooki zwrotów i sporów + testy.

### Phase 3: Zapytanie opłacone z góry (#17)

8. Migracja `0006_requests` (`requests`, `outbound_emails`) + testy.
9. `lib/requests/validate.mjs` + testy jednostkowe.
10. Zajęte przedziały (`heldRanges`) + `busy` na `/m/{slug}` + testy z bazą.
11. `lib/email` (outbox, szablony, transport) + testy.
12. `startRequest` + testy (cena, wyścig o termin, powtórzony `submissionId`).
13. Subskrybent płatności (#17) + testy.
14. Formularz na `/m/{slug}` (server action) + aktualizacja e2e (F4).
15. Strona `/r/{token}` + proxy + e2e.

### Phase 4: Dokumentacja i weryfikacja

16. README, `.env.example`, `BACKWARD_COMPATIBILITY.md`, `track.md`, backlog.
17. Zrzuty ekranu nowych ekranów (Playwright z repo) do `.ai/runs/2026-10-27-e02-stripe-and-prepaid-request/screenshots/`.

## Ryzyka

- Pieniądze i kontrakt webhooka (`risk-high`): testy porażek, ponowień, idempotencji i współbieżności; drugi reviewer; `needs-qa` bez self-QA.
- Bez kluczy Stripe pełny przepływ płatności nie jest sprawdzony na prawdziwym Stripe — tylko fałszywy Stripe w testach.
- Migracje 0005/0006: rollback `npm run db:rollback` (dwa razy) tylko póki nie ma danych pilotażu.

## Decyzje do przeglądu przez Krzysztofa

1. **Czas sesji Checkout 33 min zamiast 30** (`CHECKOUT_TTL_MINUTES`): Stripe wymaga `expires_at` ≥ 30 min od utworzenia sesji, a sesja powstaje po commicie i bywa ponawiana z tym samym `expires_at`. Slot zwalnia się najpóźniej po `checkout_expires_at + 10 min`.
2. **Odtworzenie sesji przez `expireCheckout`** wymaga identycznych parametrów (klucz idempotencji) — rozszerzenie kontraktu #24 o `resolveCheckoutRequest`; #17 bierze link `/r/` ze szkicu e-maila potwierdzenia (jedyne miejsce z tokenem jawnym, jak w specyfikacji).
3. **Webhook `checkout.session.completed` przy braku zapisanego id sesji** (awaria między Stripe a zapisem) przyjmuje sesję, gdy zgadza się `metadata.payment_id`, kwota i waluta.
4. **Zwrot `pending` → `refund.failed`** = `failed` końcowy (tabela przejść specyfikacji), bez ponownej próby; `charge.refunded` dla nieznanego PaymentIntentu → 200 i log.
5. **E-maile**: termin w strefie mentora z nazwą strefy (strefa dewelopera nieznana); wysyłka przez zadanie `email.sendDue` (lokalnie co 60 s, na hostingu co 5 min) — bez natychmiastowego `sendDue` po commicie. Link mentora `/mentor/requests/{id}` działa dopiero z #18.
6. **Nowa zmienna `STRIPE_API_BASE_URL`** (tylko `http://localhost`/`127.0.0.1`) dla lokalnego fałszywego Stripe w e2e — inaczej pełnego przepływu nie da się sprawdzić bez kluczy.
7. **DS**: F3 (6 godzin na dzień + „Pokaż więcej (k)”) w trybie wybieralnym (bez tego formularz miał ~380 radiów), `RadioGroup` z opcjonalnym `footer`, nagłówek bez „czas UTC” podczas wczytywania.
8. **Zależności**: `stripe@22.6.2` (nie 23.x — nowy major z 1.10), `nodemailer@10.0.16` (SMTP ze specyfikacji), obie przypięte.
9. **`.env.template`**: odnośniki `op://DevMentor-Dev/Stripe-Test/…` i `op://DevMentor-Dev/Cron/secret` — pozycje w sejfie trzeba założyć.
10. **Strona `/r/`** wywołuje `syncCheckout`/`expireCheckout` w czasie renderu GET (powrót ze Stripe) — zgodnie ze specyfikacją; operacje idempotentne, Stripe źródłem prawdy. Bez przycisku anulowania (#19).
11. **Worktree poza repo** (`../devmentor-wt-e02`) zamiast `.ai/tmp/…` — zagnieżdżony worktree z drugim `package-lock.json` myli Turbopack co do katalogu głównego.
12. **Kolejność commitów**: kod zwrotów (`refunds.mjs`) wszedł w 1.4 (webhook go importuje), a 3.3 importuje `lib/requests/server.ts` dodany w 3.7 — pośrednie commity nie zawsze budują się samodzielnie; HEAD jest zielony.

## Poza zakresem / nie zrobione

- Ręczne QA na prawdziwym Stripe (tryb testowy): `stripe listen`, karty `4242…`, `4000 0000 0000 0002`, `4000 0025 0000 3155`, `stripe trigger charge.dispute.created`, przejście na czas ≤ 5 min (D08), e-maile przez SMTP — brak kluczy w tym runie.
- `npm run build` zgłasza znaną podatność Next.js 16.4.0 — osobna aktualizacja.

## Progress

PR: #40

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Płatność — opłata i webhook

- [x] 1.1 Konfiguracja i strażnik trybu testowego — b5e7ad9
- [x] 1.2 Migracja 0005_payments — de0c83e
- [x] 1.3 Funkcje opłaty i subskrybenci — c313ca3
- [x] 1.4 Webhook Stripe — 958bca0
- [x] 1.5 Zadania okresowe i zdrowie — d7b1701

### Phase 2: Zwroty

- [x] 2.1 Outbox zwrotu i dzierżawa — f6f35b7 (kod: 958bca0)
- [x] 2.2 Webhooki zwrotów i sporów — 1e49d0b (kod: 958bca0)

### Phase 3: Zapytanie opłacone z góry

- [x] 3.1 Migracja 0006_requests — d5f5f07
- [x] 3.2 Walidacja zapytania — 20dc2f4
- [x] 3.3 Zajęte przedziały — d4785ad
- [x] 3.4 Adapter e-mail — 8a57297
- [x] 3.5 startRequest — 011ff96
- [x] 3.6 Subskrybent płatności — 7768ec9
- [x] 3.7 Formularz na /m/{slug} — 9256c21
- [x] 3.8 Strona /r/{token} — bf22790

### Phase 4: Dokumentacja i weryfikacja

- [x] 4.1 Dokumentacja — a1e4691
- [x] 4.2 Zrzuty ekranu UI — a021d53

## Review Codexa (drugi recenzent, risk-high) — 2026-10-27

- [x] **Major 1 — PRZYJĘTE.** `refund.updated` / `refund.failed` zmieniają stan tylko dla pełnego zwrotu tej płatności zleconego przez nas (`isOurFullRefund`: kwota = kwota płatności, waluta, id zwrotu zapisane u nas albo `metadata.payment_id`); inaczej log + 200 bez przejścia. Ta sama luka po stronie pracownika: przejęcie (`executeRefund`) tylko pełnego zwrotu w walucie płatności; istniejący zwrot częściowy → `failed` z `partial_refund_exists` (obsługa ręczna, Q05) zamiast uznania go za pełny.
- [x] **Major 2 — PRZYJĘTE.** Testy z bazą: dwa równoległe `executeRefund` + równoległe `retryRefunds` na jednej puli (jedno `create`, jedno `refund.succeeded`; test na dwóch połączeniach już był), webhook `refund.updated(succeeded)` i `refund.updated(pending)` w trakcie dzierżawy pracownika (zapis pracownika przegrywa, jedno przejście i jedno zdarzenie), równoległe podwójne dostarczenie `refund.failed`, zwrot częściowy / obca waluta / obcy pełny zwrot.
