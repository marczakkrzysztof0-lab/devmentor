# Kontrola dostępu — próby HTTP dwoma kontami (lekcja 16)

Trzy granice o najwyższym wpływie z `docs/security/threat-model.md` dotyczące kontroli dostępu i izolacji danych: T-01, T-02, T-03 (wszystkie I = High). Próby wykonał agent 2026-11-03 na jednorazowym środowisku lokalnym; wynik do akceptacji przez Krzysztofa.

**Odstępstwo od nagrania lekcji.** Lekcja zakłada repo z `packages/core/src/http/owned-route.ts` (`requireSession`, `requireRole`), kontami `mock-mentee` / `mock-operator` i trasą `/api/sessions/{BOOKING_ID}`. DevMentor tego nie ma: mentor loguje się jednorazowym linkiem (ciasteczko `dm_session`), deweloper nie ma konta — jego poświadczeniem jest link `/r/{token}`, a nie hasło. Odpowiedniki:

| Nagranie | DevMentor |
| --- | --- |
| `mock-operator` (właściciel) | **mentor A** — właściciel zapytania i sesji `BOOKING_ID` |
| `mock-mentee` (drugie konto) | **mentor B** — drugie konto tej samej roli, z własną sesją `BOOKING_B_ID` (próba pozioma) oraz **deweloper A/B** z tokenem (próba między rolami) |
| `GET/POST /api/sessions/{BOOKING_ID}` (+`/messages`) | `GET/POST /api/mentor/requests/{BOOKING_ID}/session` (odczyt = lista wiadomości, zapis = nowa wiadomość) |
| `requireSession` / `requireRole` | `getCurrentMentor()` (`lib/auth/session.ts:69`) + filtr `mentor_id` w SQL (`lib/sessions/messages.mjs:92`) |

Drugi „uczeń z hasłem” nie był potrzebny (nie ma haseł) — scena dodaje drugiego mentora i drugiego dewelopera z linkiem (`.ai/scripts/lesson-16-session.mjs`).

## Jak powtórzyć

```sh
sh .ai/scripts/lesson-16-prepare.sh   # test-env-up + seed sceny + logowanie obu mentorów do osobnych cookie-jarów
sh .ai/scripts/lesson-16-probe.sh     # G1–G3, werdykt + dowody w .ai/qa/lesson-16-access-control/
sh .ai/scripts/test-env-down.sh       # sprzątanie: schemat dm_migtest_* znika razem ze sceną
```

Nagłówki zapisu: `Content-Type: application/json`, `x-devmentor-request: 1` (z nagrania; DevMentor go nie wymaga), `Origin` = adres aplikacji. Logowanie = wywołanie server action przycisku „Zaloguj” (`Next-Action`) tokenem z pliku sekretów sceny; ani tokeny, ani ciasteczka nie trafiają na ekran ani do dowodów (sprawdzone: brak 43-znakowych ciągów base64url w `.ai/qa/lesson-16-access-control/`).

Reguła werdyktu: **PASS** tylko gdy obie ścieżki pozytywne dały 200, odmowy odczytu i zapisu zadziałały, dane po próbie są identyczne, a kontrola narzędzia (ten sam zapis od właściciela przechodzi) potwierdza, że odmowa nie wynika ze źle zbudowanego żądania. Błąd połączenia, 5xx, nieudane logowanie albo nieudana ścieżka pozytywna → **NIEROZSTRZYGNIĘTE**, nigdy PASS.

## Wyniki

| Granica | Zagrożenie | Wynik |
| --- | --- | --- |
| G1 czat mentora — mentor B vs sesja mentora A | T-01 | **PASS** |
| G2 role czatu — token dewelopera vs ciasteczko mentora | T-03 | **PASS** |
| G3 szczegóły i decyzje w panelu — mentor B vs zapytanie mentora A | T-02 | **PASS** |

Pełna tabela kroków: `.ai/qa/lesson-16-access-control/results.tsv`, werdykt: `verdict.txt`.

---

## Karta dowodu G1 — czat sesji mentora (T-01)

| Pole | Treść |
| --- | --- |
| Wymaganie / hipoteza | Mentor widzi i pisze wyłącznie w czacie sesji swoich zapytań (spec #20 API Contracts). Hipoteza ataku: mentor B, podmieniając id w `/api/mentor/requests/{id}/session`, czyta albo dopisuje wiadomości w sesji mentora A (IDOR). |
| Zakres i ryzyko | `GET` i `POST /api/mentor/requests/{BOOKING_ID}/session`; dane: treść czatu dewelopera i mentora. Ryzyko: wyciek prywatnej rozmowy i podszycie się pod mentora. Poza zakresem: `?after=`, limit 500 wiadomości. |
| Baza i docelowy commit | `main` @ `a4812a3` (kod aplikacji bez zmian; skrypty sceny niezacommitowane w chwili próby). Gałąź `lekcja-16-bezpieczenstwo` nie zmienia logiki dostępu — wynik dotyczy też jej HEAD. |
| Środowisko, seed, konto i czas | `next start` (produkcyjny build) na `http://localhost:64748`, Postgres 17 (kontener `devmentor-db`), schemat `dm_migtest_fe5959d06c1b9e15`; seed `.ai/scripts/lesson-16-session.mjs`: mentor A z otwartą sesją `BOOKING_ID=b9ba5480-ab35-4384-adae-ffe688b23e9b` (2 wiadomości), mentor B z sesją `BOOKING_B_ID=1ac05b65-d201-4f56-b778-885b8954426e`; konta: mentor A i mentor B (osobne cookie-jary); 2026-11-03 15:04:32–15:04:57 UTC. |
| Sprawdzenie | 1) A: `GET …/{BOOKING_ID}/session`; B: `GET …/{BOOKING_B_ID}/session`. 2) B: `GET …/{BOOKING_ID}/session`. 3) B: `POST …/{BOOKING_ID}/session` `{"body":"L16 PRÓBA ZAPISU mentora B"}`. 4) A: ponowny `GET`, porównanie listy (id, autor, treść) z krokiem 1 + migawka `session_messages` z bazy przed/po. 5) Kontrola narzędzia: A wysyła ten sam `POST` do swojej sesji. |
| Oczekiwane | 1) 200 i 200; 2) 403/404 bez treści; 3) 403/404, nic nie zapisane; 4) 200, identyczne dane, baza bez zmian; 5) 201. |
| Rzeczywisty wynik i miejsce dowodu | 1) 200 (2 wiadomości), 200; 2) **404** `{"error":"not_found"}`; 3) **404** `{"ok":false,"error":"not_found"}`; 4) 200, lista identyczna, `g1-db-before.json` = `g1-db-after.json`; 5) 201. Dowody: `.ai/qa/lesson-16-access-control/g1-*.body`, `g1-db-*.json`, `results.tsv`. Ochrona w kodzie: `lib/sessions/messages.mjs:91-93` (`r.id = $2 and r.mentor_id = $3`), `lib/sessions/server.ts:45-48`. |
| Czego to nie dowodzi | Nie sprawdza sesji po rozliczeniu (`held`, `*_no_show`), wygasłej sesji mentora, wyścigów ani innych tras mentora (to G3). Jedna para kont, jedna sesja. 404 zamiast 403 jest zamierzone (spec: cudze = nieistniejące). |
| Decyzja i osoba odpowiedzialna | PASS — bez poprawki. Regresję chroni `tests/db/session-messages.test.mjs` („izolacja: inny mentor…”). Akceptuje: Krzysztof Marczak. |

## Karta dowodu G2 — role w czacie: deweloper vs mentor (T-03)

| Pole | Treść |
| --- | --- |
| Wymaganie / hipoteza | Autor wiadomości wynika wyłącznie z trasy i poświadczenia: deweloper = token w `X-Request-Token` na `/api/r/session`, mentor = ciasteczko na `/api/mentor/requests/{id}/session` (spec #20). Hipoteza ataku: posiadacz linku dewelopera czyta/pisze jako mentor albo mentor pisze jako deweloper (pomylenie ról, podszycie). |
| Zakres i ryzyko | `GET/POST /api/r/session`, `GET/POST /api/mentor/requests/{BOOKING_ID}/session`. Ryzyko: sfałszowanie autora w rozmowie, która rozstrzyga rozliczenie (#21 no-show). |
| Baza i docelowy commit | jak G1 (`a4812a3`). |
| Środowisko, seed, konto i czas | jak G1; konta: deweloper A (token sesji `BOOKING_ID`), deweloper B (token sesji `BOOKING_B_ID`), mentor A (ciasteczko). |
| Sprawdzenie | 1) dev A: `GET /api/r/session`; dev B: `GET /api/r/session`. 2a) dev A: token na `GET` trasy mentora; 2b) mentor A: ciasteczko bez tokenu na `GET /api/r/session`. 3a) mentor A: `POST /api/r/session` (bez tokenu); 3b) dev A: `POST` na trasę mentora z tokenem. 4) dev A: ponowny `GET` + migawka bazy. |
| Oczekiwane | 1) 200 `viewer=mentee` / 200 bez danych A; 2a) 401; 2b) 404; 3a) 404; 3b) 401; 4) 200, identyczne. |
| Rzeczywisty wynik i miejsce dowodu | 1) 200 (`viewer":"mentee"`, wiadomości A), 200 (sesja B, `otherName: Mentor B (L16)`, 0 wiadomości, brak treści A); 2a) **401** `signed_out`; 2b) **404**; 3a) **404**; 3b) **401**; 4) 200, lista identyczna, `g2-db-before.json` = `g2-db-after.json`. Dowody: `g2-*.body`, `g2-db-*.json`. Kod: `lib/sessions/server.ts:43` (token tylko z nagłówka), `:53-63` (trasa mentora wymaga sesji), `lib/sessions/messages.mjs:188` (autor = `viewer.kind`). |
| Czego to nie dowodzi | Nie bada wycieku samego tokenu (T-04, issue #57) ani tokenu przekazanego w adresie API (trasa go nie czyta). Kontrola narzędzia dla zapisu dewelopera nie była osobnym krokiem — 201 dla poprawnego `POST` potwierdza G1 krok 5 (ten sam format treści) i seed (wiadomość dewelopera). |
| Decyzja i osoba odpowiedzialna | PASS — bez poprawki. Akceptuje: Krzysztof Marczak. |

## Karta dowodu G3 — szczegóły i decyzje w panelu mentora (T-02)

| Pole | Treść |
| --- | --- |
| Wymaganie / hipoteza | Mentor widzi szczegóły (pytanie, kwota) i podejmuje decyzję wyłącznie dla swoich zapytań (spec #18). Hipoteza ataku: mentor B otwiera `/mentor/requests/{PENDING_ID}` mentora A albo wywołuje server action `acceptRequestAction` / `declineRequestAction` z cudzym id (odrzucenie = zwrot pieniędzy deweloperowi i utrata przychodu mentora A). |
| Zakres i ryzyko | strona `GET /mentor/requests/{id}` i server actions decyzji (`POST` z nagłówkiem `Next-Action`, id akcji z `.next/server/server-reference-manifest.json`). |
| Baza i docelowy commit | jak G1 (`a4812a3`). |
| Środowisko, seed, konto i czas | jak G1; `PENDING_ID=973c2a87-11ff-4b26-ae67-5bc3a512a379` (mentor A, `awaiting_mentor`, termin za ≥ 3 h, pytanie z markerem `L16-OCZEKUJACE`); mentor B ma własne zapytanie `BOOKING_B_ID` (marker `L16-DRUGIE-KONTO`). |
| Sprawdzenie | 1) A: `GET /mentor/requests/{PENDING_ID}`; B: `GET /mentor/requests/{BOOKING_B_ID}`. 2) B: `GET /mentor/requests/{PENDING_ID}`. 3) B: `acceptRequestAction(PENDING_ID)` i `declineRequestAction(PENDING_ID)`. 4) A: ponowny `GET` + migawka `requests` (status, `accepted_at`, `declined_at`). 5) Kontrola narzędzia: A wywołuje tę samą akcję akceptacji. |
| Oczekiwane | 1) 200 z markerem / 200 z markerem B; 2) bez pytania i imienia dewelopera, komunikat „Nie ma takiego zapytania…”; 3) wynik akcji `{"ok":false,"code":"not_found"}`; 4) status `awaiting_mentor`, baza bez zmian; 5) `{"ok":true}`, status `accepted`. |
| Rzeczywisty wynik i miejsce dowodu | 1) 200 z markerem, 200 z markerem B; 2) **200 z komunikatem**, bez markera i imienia (strona ma statyczną powłokę PPR, więc kod HTTP to zawsze 200 — rozstrzyga treść); 3) **`{"ok":false,"code":"not_found"}`** dla obu akcji, bez danych A w odpowiedzi RSC; 4) 200, `g3-db-before.json` = `g3-db-after.json`, `awaiting_mentor`; 5) `{"ok":true}`, `accepted` (`g3-db-control.json`). Dowody: `g3-*.result`, `g3-db-*.json` (ciała HTML usunięte, w `results.tsv` wynik sprawdzeń treści). Kod: `lib/requests/mentor.mjs:93-100`, `lib/requests/decision.mjs:110-118`, `lib/requests/mentor-area.ts:82-84`. |
| Czego to nie dowodzi | Nie obejmuje edytora strony i dostępności (inne server actions z tym samym wzorcem `getCurrentMentor()`), anulowania z `/r/` ani wyścigu decyzja–anulowanie (chronią `tests/db/requests-cancel-race.test.mjs`). Kod 200 dla cudzej strony to cecha PPR — monitoring oparty na kodach HTTP tego nie odróżni. |
| Decyzja i osoba odpowiedzialna | PASS — bez poprawki. Regresję chronią `tests/db/requests-mentor.test.mjs`, `tests/db/requests-decision.test.mjs`. Akceptuje: Krzysztof Marczak. |
