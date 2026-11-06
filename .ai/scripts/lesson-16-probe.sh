#!/bin/sh
# Lekcja 16 — próby kontroli dostępu przez HTTP na scenie z lesson-16-prepare.sh (tylko localhost, dane syntetyczne).
#
#   sh .ai/scripts/lesson-16-probe.sh
#
# Trzy granice z docs/security/threat-model.md (szczegóły i karty dowodu: docs/security/kontrola-dostepu.md):
#   G1 (T-01) czat mentora  GET/POST /api/mentor/requests/{BOOKING_ID}/session   mentor B vs sesja mentora A
#   G2 (T-03) role czatu    /api/r/session (token dewelopera) vs /api/mentor/... (ciasteczko mentora)
#   G3 (T-02) panel mentora GET /mentor/requests/{PENDING_ID} + server actions accept/decline jako mentor B
# Każda granica: (1) ścieżka pozytywna OBU kont, (2) odmowa odczytu, (3) odmowa zapisu, (4) ponowny odczyt
# właściciela + stan bazy identyczny (id, autor, treść / status).
# Werdykt: PASS | FAIL | NIEROZSTRZYGNIĘTE (błąd połączenia, 5xx albo nieudana ścieżka pozytywna — nigdy PASS).
# Dowody: .ai/qa/lesson-16-access-control/ (kody HTTP, odpowiedzi JSON, migawki bazy; bez ciasteczek i tokenów).
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
SCENE=.ai/tmp/lesson-16/scene.env
[ -f "$SCENE" ] || { echo "Brak $SCENE — najpierw sh .ai/scripts/lesson-16-prepare.sh" >&2; exit 1; }
# shellcheck disable=SC1090
. "./$SCENE"
case "$BASE_URL" in http://localhost:*|http://127.0.0.1:*) ;; *) echo "Odmowa: cel spoza localhost" >&2; exit 1 ;; esac

EV=.ai/qa/lesson-16-access-control
mkdir -p "$EV"
RESULTS="$EV/results.tsv"
printf 'granica\tkrok\tmetoda\tścieżka\tkonto\toczekiwane\tHTTP\twynik\n' > "$RESULTS"
STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Token dewelopera czytany w podpowłoce z pliku sekretów — nigdy nie trafia na stdout ani do dowodów.
dev_token() { ( . "./$SECRETS_FILE"; eval "printf %s \"\$$1\"" ); }

# call NAME METHOD PATH AUTH [BODY]   AUTH: jarA | jarB | devA | devB | jarA-only-cookie | none
# Zapisuje odpowiedź do $EV/NAME.body, wypisuje kod HTTP (000 = błąd połączenia).
call() {
  name=$1 method=$2 path=$3 auth=$4 body=${5:-}
  set -- -s -o "$EV/$name.body" -w '%{http_code}' -X "$method" "$BASE_URL$path" \
    -H "Content-Type: application/json" -H "x-devmentor-request: 1" -H "Origin: $BASE_URL" --max-time 30
  case "$auth" in
    jarA) set -- "$@" -b "$JAR_A" ;;
    jarB) set -- "$@" -b "$JAR_B" ;;
    devA) set -- "$@" -H "X-Request-Token: $(dev_token DEV_TOKEN_A)" ;;
    devB) set -- "$@" -H "X-Request-Token: $(dev_token DEV_TOKEN_B)" ;;
    none) ;;
  esac
  [ -n "$body" ] && set -- "$@" --data-binary "$body"
  curl "$@" || true
}

# action NAME PATH JAR ACTION_ID ARG — wywołanie server action tak, jak robi to przycisk w przeglądarce.
action() {
  name=$1 path=$2 jar=$3 id=$4 arg=$5
  curl -s -o "$EV/$name.body" -w '%{http_code}' -X POST "$BASE_URL$path" -b "$jar" \
    -H "Next-Action: $id" -H "Origin: $BASE_URL" -H "Accept: text/x-component" \
    -H "Content-Type: text/plain;charset=UTF-8" --data-binary "[\"$arg\"]" --max-time 30 || true
}

record() { printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$@" >> "$RESULTS"; }
# Wiadomości z odpowiedzi API jako (id, autor, treść) — do porównania przed/po.
messages() { node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify((j.messages??[]).map(m=>[m.id,m.author,m.body])))}catch{console.log("NIE-JSON")}' "$1"; }
has() { grep -q "$2" "$EV/$1.body" 2>/dev/null; }
snapshot() { node .ai/scripts/lesson-16-session.mjs snapshot > "$EV/$1.json"; }

inconclusive=""
mark() { # mark G STEP METHOD PATH ACCOUNT EXPECTED STATUS OKCONDITION
  g=$1 step=$2 m=$3 p=$4 acc=$5 exp=$6 st=$7 ok=$8
  if [ "$st" = "000" ] || [ "$st" -ge 500 ] 2>/dev/null; then res=NIEROZSTRZYGNIĘTE; inconclusive="$inconclusive $g"
  elif [ "$ok" = 1 ]; then res=OK; else res=NIEZGODNE; fi
  record "$g" "$step" "$m" "$p" "$acc" "$exp" "$st" "$res"
  echo "$res"
}

verdict() { # verdict G — PASS gdy wszystkie kroki OK, NIEROZSTRZYGNIĘTE gdy któryś pozytywny/połączenie zawiódł
  g=$1
  if grep -P "^$g\t" "$RESULTS" | grep -q "NIEROZSTRZYGNIĘTE"; then echo NIEROZSTRZYGNIĘTE; return; fi
  # Nieudana ścieżka pozytywna = scena/logowanie nie działa, więc odmowa niczego nie dowodzi.
  # Tak samo nieudana kontrola narzędzia (krok 5): odmowa mogła wynikać ze złego żądania, nie z kontroli dostępu.
  if grep -P "^$g\t(1|5) " "$RESULTS" | grep -q "NIEZGODNE"; then echo NIEROZSTRZYGNIĘTE; return; fi
  if grep -P "^$g\t" "$RESULTS" | grep -q "NIEZGODNE"; then echo FAIL; return; fi
  echo PASS
}

API_A="/api/mentor/requests/$BOOKING_ID/session"
API_B="/api/mentor/requests/$BOOKING_B_ID/session"

# ------------------------------------------------------------------ G1: czat mentora (T-01)
snapshot g1-db-before
s=$(call g1-1a-owner-read GET "$API_A" jarA); ok=0; [ "$s" = 200 ] && has g1-1a-owner-read "L16 wiadomość dewelopera A" && ok=1
mark G1 "1 pozytywna: właściciel czyta swoją sesję" GET "$API_A" "mentor A" "200 + wiadomości" "$s" $ok >/dev/null
s=$(call g1-1b-other-own GET "$API_B" jarB); ok=0; [ "$s" = 200 ] && ok=1
mark G1 "1 pozytywna: drugie konto czyta SWOJĄ sesję" GET "$API_B" "mentor B" 200 "$s" $ok >/dev/null
s=$(call g1-2-foreign-read GET "$API_A" jarB); ok=0; { [ "$s" = 404 ] || [ "$s" = 403 ]; } && ! has g1-2-foreign-read "L16 wiadomość" && ok=1
mark G1 "2 odmowa odczytu cudzej sesji" GET "$API_A" "mentor B" "403/404, bez treści" "$s" $ok >/dev/null
s=$(call g1-3-foreign-write POST "$API_A" jarB '{"body":"L16 PRÓBA ZAPISU mentora B"}'); ok=0; { [ "$s" = 404 ] || [ "$s" = 403 ]; } && ok=1
mark G1 "3 odmowa zapisu w cudzej sesji" POST "$API_A" "mentor B" "403/404" "$s" $ok >/dev/null
s=$(call g1-4-owner-reread GET "$API_A" jarA); snapshot g1-db-after
ok=0; [ "$s" = 200 ] && [ "$(messages "$EV/g1-1a-owner-read.body")" = "$(messages "$EV/g1-4-owner-reread.body")" ] && cmp -s "$EV/g1-db-before.json" "$EV/g1-db-after.json" && ok=1
mark G1 "4 ponowny odczyt właściciela: id, autor, treść bez zmian (API i baza)" GET "$API_A" "mentor A" "200, identyczne" "$s" $ok >/dev/null
# Kontrola narzędzia: ten sam POST od właściciela przechodzi (odmowa w kroku 3 nie wynika ze złego żądania).
s=$(call g1-5-owner-write POST "$API_A" jarA '{"body":"L16 kontrola: zapis właściciela"}'); ok=0; [ "$s" = 201 ] && ok=1
mark G1 "5 kontrola narzędzia: ten sam POST od właściciela" POST "$API_A" "mentor A" 201 "$s" $ok >/dev/null

# ------------------------------------------------------------------ G2: role czatu (T-03)
snapshot g2-db-before
s=$(call g2-1a-dev-own GET /api/r/session devA); ok=0; [ "$s" = 200 ] && has g2-1a-dev-own '"viewer":"mentee"' && ok=1
mark G2 "1 pozytywna: deweloper A czyta swoją sesję (token)" GET /api/r/session "deweloper A" "200 viewer=mentee" "$s" $ok >/dev/null
s=$(call g2-1b-dev-other-own GET /api/r/session devB); ok=0; [ "$s" = 200 ] && ! has g2-1b-dev-other-own "L16 wiadomość" && ok=1
mark G2 "1 pozytywna: deweloper B czyta SWOJĄ sesję (bez treści A)" GET /api/r/session "deweloper B" "200, bez danych A" "$s" $ok >/dev/null
s=$(call g2-2a-token-on-mentor-route GET "$API_A" devA); ok=0; [ "$s" = 401 ] && ! has g2-2a-token-on-mentor-route "L16 wiadomość" && ok=1
mark G2 "2 odmowa odczytu: token dewelopera na trasie mentora" GET "$API_A" "deweloper A" 401 "$s" $ok >/dev/null
s=$(call g2-2b-cookie-on-dev-route GET /api/r/session jarA); ok=0; [ "$s" = 404 ] && ! has g2-2b-cookie-on-dev-route "L16 wiadomość" && ok=1
mark G2 "2 odmowa odczytu: ciasteczko mentora na trasie dewelopera" GET /api/r/session "mentor A" 404 "$s" $ok >/dev/null
s=$(call g2-3a-mentor-as-dev POST /api/r/session jarA '{"body":"L16 PRÓBA: mentor jako deweloper"}'); ok=0; [ "$s" = 404 ] && ok=1
mark G2 "3 odmowa zapisu: mentor pisze jako deweloper" POST /api/r/session "mentor A" 404 "$s" $ok >/dev/null
s=$(call g2-3b-dev-as-mentor POST "$API_A" devA '{"body":"L16 PRÓBA: deweloper jako mentor"}'); ok=0; [ "$s" = 401 ] && ok=1
mark G2 "3 odmowa zapisu: deweloper pisze jako mentor" POST "$API_A" "deweloper A" 401 "$s" $ok >/dev/null
s=$(call g2-4-dev-reread GET /api/r/session devA); snapshot g2-db-after
ok=0; [ "$s" = 200 ] && [ "$(messages "$EV/g2-1a-dev-own.body")" = "$(messages "$EV/g2-4-dev-reread.body")" ] && cmp -s "$EV/g2-db-before.json" "$EV/g2-db-after.json" && ok=1
mark G2 "4 ponowny odczyt dewelopera A: id, autor, treść bez zmian (API i baza)" GET /api/r/session "deweloper A" "200, identyczne" "$s" $ok >/dev/null

# ------------------------------------------------------------------ G3: szczegóły i decyzje w panelu (T-02)
PAGE_P="/mentor/requests/$PENDING_ID"
PAGE_B="/mentor/requests/$BOOKING_B_ID"
snapshot g3-db-before
s=$(call g3-1a-owner-detail GET "$PAGE_P" jarA); ok=0; [ "$s" = 200 ] && has g3-1a-owner-detail "L16-OCZEKUJACE" && ok=1
mark G3 "1 pozytywna: właściciel widzi szczegóły (pytanie)" GET "$PAGE_P" "mentor A" "200 + pytanie" "$s" $ok >/dev/null
s=$(call g3-1b-other-own GET "$PAGE_B" jarB); ok=0; [ "$s" = 200 ] && has g3-1b-other-own "L16-DRUGIE-KONTO" && ok=1
mark G3 "1 pozytywna: drugie konto widzi SWOJE zapytanie" GET "$PAGE_B" "mentor B" "200 + pytanie" "$s" $ok >/dev/null
s=$(call g3-2-foreign-detail GET "$PAGE_P" jarB); ok=0; ! has g3-2-foreign-detail "L16-OCZEKUJACE" && ! has g3-2-foreign-detail "Deweloper A2" && has g3-2-foreign-detail "Nie ma takiego zapytania" && ok=1
mark G3 "2 odmowa odczytu cudzych szczegółów (strona PPR: 200 z komunikatem, bez danych)" GET "$PAGE_P" "mentor B" "brak pytania i imienia, komunikat" "$s" $ok >/dev/null
s=$(action g3-3a-foreign-accept "$PAGE_P" "$JAR_B" "$ACCEPT_ACTION" "$PENDING_ID"); ok=0; [ "$s" = 200 ] && has g3-3a-foreign-accept '"ok":false,"code":"not_found"' && ! has g3-3a-foreign-accept "L16-OCZEKUJACE" && ok=1
mark G3 "3 odmowa zapisu: akceptacja cudzego zapytania (server action)" POST "$PAGE_P" "mentor B" "wynik not_found" "$s" $ok >/dev/null
s=$(action g3-3b-foreign-decline "$PAGE_P" "$JAR_B" "$DECLINE_ACTION" "$PENDING_ID"); ok=0; [ "$s" = 200 ] && has g3-3b-foreign-decline '"ok":false,"code":"not_found"' && ! has g3-3b-foreign-decline "L16-OCZEKUJACE" && ok=1
mark G3 "3 odmowa zapisu: odrzucenie cudzego zapytania (server action)" POST "$PAGE_P" "mentor B" "wynik not_found" "$s" $ok >/dev/null
s=$(call g3-4-owner-reread GET "$PAGE_P" jarA); snapshot g3-db-after
ok=0; [ "$s" = 200 ] && has g3-4-owner-reread "L16-OCZEKUJACE" && cmp -s "$EV/g3-db-before.json" "$EV/g3-db-after.json" && grep -q '"awaiting_mentor"' "$EV/g3-db-after.json" && ok=1
mark G3 "4 ponowny odczyt właściciela: status awaiting_mentor, baza bez zmian" GET "$PAGE_P" "mentor A" "200, identyczne" "$s" $ok >/dev/null

# Kontrola narzędzia: ta sama server action od właściciela akceptuje (zmienia stan sceny — dlatego na końcu).
s=$(action g3-5-owner-accept "$PAGE_P" "$JAR_A" "$ACCEPT_ACTION" "$PENDING_ID"); snapshot g3-db-control
ok=0; [ "$s" = 200 ] && has g3-5-owner-accept '"ok":true' && grep -q '"accepted"' "$EV/g3-db-control.json" && ok=1
mark G3 "5 kontrola narzędzia: ta sama akcja od właściciela akceptuje" POST "$PAGE_P" "mentor A" "ok:true, status accepted" "$s" $ok >/dev/null

# Odpowiedzi server actions: zostaje tylko linia wyniku akcji (reszta to drzewo RSC strony).
for f in g3-3a-foreign-accept g3-3b-foreign-decline g3-5-owner-accept; do
  grep "^1:" "$EV/$f.body" > "$EV/$f.result" || true
  rm -f "$EV/$f.body"
done
# Strony HTML są duże — w dowodach zostają tylko kody i wyniki grep (powyżej); usuwamy ciała HTML.
rm -f "$EV"/g3-1a-owner-detail.body "$EV"/g3-1b-other-own.body "$EV"/g3-2-foreign-detail.body "$EV"/g3-4-owner-reread.body

FINISHED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
  echo "started=$STARTED finished=$FINISHED commit=$(git rev-parse --short HEAD) base_url=$BASE_URL"
  echo "booking_id=$BOOKING_ID booking_b_id=$BOOKING_B_ID pending_id=$PENDING_ID"
  for g in G1 G2 G3; do echo "$g=$(verdict "$g")"; done
} | tee "$EV/verdict.txt"
column -t -s "$(printf '\t')" "$RESULTS" 2>/dev/null || cat "$RESULTS"
