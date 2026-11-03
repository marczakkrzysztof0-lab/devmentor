# Plan poprawek po modelu zagrożeń (lekcja 16)

Data: 2026-11-03 · Baza: `main` @ `a4812a3` · Model: `docs/security/threat-model.md`

Zakres: zagrożenia o wpływie **High** z kontrolą dziś **Brak / Częściowo** (T-04, T-05, T-13) oraz T-07 (kontrola: Brak, wpływ Medium) — jedyne zagrożenie z brakiem kontroli, potwierdzone przez ZAP i naprawione w tym PR. Zagrożenia High z pełną kontrolą (T-01, T-02, T-03) sprawdzone próbą HTTP dwoma kontami — `docs/security/kontrola-dostepu.md`.

## Weryfikacja w kodzie

| ID | Potwierdzone (co działa, plik:linia) | Brak (scenariusz, którego zabezpieczenie nie obejmuje) | Najmniejsza poprawka | Test |
| --- | --- | --- | --- | --- |
| T-07 | — (żadnego nagłówka; `next.config.ts:3-15` nie ma `headers()`; tylko `proxy.ts:56-57` daje `Referrer-Policy`/`X-Robots-Tag` na `/r/*`, `proxy.ts:42` `X-Robots-Tag` na `/m/*`) | brak CSP, `X-Frame-Options`/`frame-ancestors` (panel mentora z przyciskami „Akceptuj/Odrzuć” da się osadzić w ramce), `nosniff`, `Referrer-Policy` poza `/r/*`; `X-Powered-By: Next.js` | `headers()` + `poweredByHeader: false` w `next.config.ts` (**zrobione w tym PR**) | `tests/security/security-headers.test.mjs` (czerwony 4/4 na `a4812a3`, zielony po poprawce), `tests/e2e/security-headers.e2e.mjs`, ZAP przed/po |
| T-04 | token 256 bit (`lib/auth/tokens.mjs:8`), w bazie tylko SHA-256 (`lib/requests/view.mjs:81`), `Referrer-Policy: no-referrer` + `noindex` na `/r/*` (`proxy.ts:56-57`), w API token wyłącznie w nagłówku (`lib/sessions/server.ts:43`), jednolite 404 (`proxy.ts:55`) | link ważny do 30 dni po terminie (`lib/requests/view.mjs:11`) i nieodwoływalny; kto ma link (przekazany e-mail, historia, log proxy z adresem), czyta pytanie i czat, pisze jako deweloper i anuluje zapytanie ze zwrotem (`lib/requests/cancel.mjs:6` — bez dodatkowego potwierdzenia) | do decyzji (zmiana kontraktu #17/#19): krótszy TTL po sesji (np. 7 dni), przycisk „unieważnij link / wyślij nowy”, potwierdzenie anulowania kodem z e-maila. **Bez poprawki w tym PR** (issue #57) | po decyzji: test `tests/db/requests-view-states.test.mjs` (nowy TTL), e2e unieważnienia |
| T-05 | jednorazowe linki (`lib/auth/mentor-auth.mjs:368-370` warunkowy `update … used_at is null and expires_at > $2`), TTL 72 h / 14 dni (`lib/auth/tokens.mjs:11,14`), hash w bazie, GET nie zużywa (`app/sign-in/[token]/actions.ts`), sesja innego mentora odwoływana (`mentor-auth.mjs:158`) | przechwycony, nieużyty link = pełne przejęcie konta; brak powiadomienia „nowe logowanie” i listy sesji do odwołania; link nie jest powiązany z urządzeniem, które go zamówiło | do decyzji: e-mail o nowym logowaniu + „wyloguj wszędzie”; skrócenie linku logowania do 15–60 min. **Bez poprawki w tym PR** | po decyzji: `tests/db/mentor-auth.test.mjs` (TTL, odwołanie wszystkich sesji) |
| T-13 | ciasteczko httpOnly, `Secure` w produkcji, `SameSite=Lax`, `path=/` (`lib/auth/session.ts:49-57`); sesja tylko po hashu, sprawdzane `revoked_at` i `expires_at` (`mentor-auth.mjs:124`); wylogowanie odwołuje sesję w bazie (`mentor-auth.mjs:140-146`) | sesja 30 dni bez wygaszania po bezczynności (`lib/auth/tokens.mjs:17`), brak „wyloguj wszędzie” — skradzione ciasteczko działa do 30 dni | do decyzji: TTL bezczynności (np. 7 dni z przedłużaniem) + odwołanie wszystkich sesji mentora. **Bez poprawki w tym PR** | po decyzji: `tests/db/mentor-auth.test.mjs` |

Zagrożenia Medium z kontrolą częściową (T-11 brak limitu częstości) — poza zakresem tego planu, zostają w modelu do decyzji.

## Kolejność prac

1. **T-07 nagłówki bezpieczeństwa** — mała zmiana konfiguracji, potwierdzona skanem, zamyka 5 alertów ZAP (10020, 10021, 10037, 10038, 10063); zrobione w tym PR (issue #55).
2. **T-04 link `/r/{token}`** — największy wpływ na dane dewelopera i pieniądze (anulowanie ze zwrotem); wymaga decyzji produktowej (TTL, unieważnianie), potem spec + migracja.
3. **T-05 link logowania mentora** — powiadomienie o nowym logowaniu i krótszy TTL; zależy od wysyłki e-maili (#17 outbox już jest).
4. **T-13 sesja mentora** — TTL bezczynności i „wyloguj wszędzie”; najtańsze po T-05 (ta sama tabela `mentor_sessions`).

## Do akceptacji przez Krzysztofa

| Decyzja | Propozycja agenta | Uzasadnienie |
| --- | --- | --- |
| Nagłówki z `unsafe-inline` w `script-src` | zaakceptować na teraz | Next.js wstrzykuje skrypty inline (RSC payload); CSP z nonce wymaga renderowania dynamicznego każdej strony przez `proxy.ts`, co psuje PPR/`cacheComponents`. Najważniejsze dyrektywy (`frame-ancestors`, `object-src`, `base-uri`, `form-action`, `connect-src 'self'`) działają już teraz |
| T-04 — TTL i unieważnianie linku `/r/` | otworzyć spec (issue #57) | zmiana kontraktu z #17/#19 i e-maili; nie poprawka „na szybko” |
| T-05 — powiadomienie o logowaniu, krótszy link | otworzyć spec (issue #58) | dotyka CLI założycieli i e-maili mentorów |
| T-13 — TTL bezczynności sesji | decyzja razem z T-05 (issue #58) | ta sama tabela i UX logowania |
| T-11 — limit częstości formularza | zaakceptować ryzyko do startu produkcji | zależy od hostingu (rate limit platformy); bez testów obciążeniowych w tej lekcji |
