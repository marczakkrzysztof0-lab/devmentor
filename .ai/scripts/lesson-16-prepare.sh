#!/bin/sh
# Lekcja 16 — przygotowanie sceny do prób kontroli dostępu (tylko lokalnie, dane syntetyczne).
#
#   sh .ai/scripts/lesson-16-prepare.sh [--force]
#
# 1. jednorazowe środowisko: .ai/scripts/test-env-up.sh (schemat dm_migtest_*, next start na 127.0.0.1);
# 2. seed sceny: .ai/scripts/lesson-16-session.mjs seed (mentor A + mentor B, opłacone sesje, linki logowania);
# 3. logowanie OBU mentorów przez HTTP (server action strony /sign-in/{token}) do osobnych cookie-jarów —
#    bez wypisywania tokenów i ciasteczek;
# 4. zapis .ai/tmp/lesson-16/scene.env: BASE_URL, BOOKING_ID, BOOKING_B_ID, PENDING_ID, JAR_A, JAR_B, id akcji.
# Sprzątanie: sh .ai/scripts/test-env-down.sh (schemat znika razem z danymi sceny), rm -r .ai/tmp/lesson-16.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
OUT=.ai/tmp/lesson-16
mkdir -p "$OUT"
umask 077

sh .ai/scripts/test-env-up.sh "$@" > "$OUT/test-env-up.log" 2>&1 || { tail -20 "$OUT/test-env-up.log" >&2; exit 1; }
node .ai/scripts/lesson-16-session.mjs seed

# shellcheck disable=SC1091
. "$OUT/seed.env"
case "$BASE_URL" in
  http://localhost:*|http://127.0.0.1:*) ;;
  *) echo "Odmowa: BASE_URL nie jest lokalny" >&2; exit 1 ;;
esac

# Id server actions z manifestu buildu (zmieniają się między buildami).
action_id() {
  node -e '
    const m = require("./.next/server/server-reference-manifest.json");
    const hit = Object.entries(m.node).find(([, v]) => v.exportedName === process.argv[1] && String(v.filename).startsWith(process.argv[2]));
    if (!hit) process.exit(1);
    console.log(hit[0]);' "$1" "$2"
}
SIGN_IN_ACTION=$(action_id redeemSignInLinkAction "app/sign-in/")
ACCEPT_ACTION=$(action_id acceptRequestAction "app/mentor/requests/")
DECLINE_ACTION=$(action_id declineRequestAction "app/mentor/requests/")

JAR_A="$OUT/cookies-mentor-a.txt"
JAR_B="$OUT/cookies-mentor-b.txt"
rm -f "$JAR_A" "$JAR_B"

# Logowanie: wywołanie server action tak, jak robi to przycisk „Zaloguj” (Next-Action + argument = token z linku).
# Token czytany z pliku sekretów sceny w podpowłoce, nigdy nie trafia na stdout ani do logu.
login() {
  jar=$1
  var=$2
  status=$(
    . "$OUT/secrets.env"
    eval "path=\$$var"
    token=${path##*/}
    curl -s -o /dev/null -w '%{http_code}' -c "$jar" -b "$jar" -X POST "$BASE_URL$path" \
      -H "Next-Action: $SIGN_IN_ACTION" -H "Origin: $BASE_URL" -H "Accept: text/x-component" \
      -H "Content-Type: text/plain;charset=UTF-8" --data-binary "[\"$token\"]"
  )
  if ! grep -q "dm_session" "$jar" 2>/dev/null; then
    echo "Logowanie ($var) nie dało ciasteczka sesji (HTTP $status) — wynik prób byłby nierozstrzygnięty." >&2
    exit 1
  fi
  echo "[lesson-16] zalogowano $var (HTTP $status, ciasteczko w $jar — wartość nie jest wypisywana)"
}
login "$JAR_A" SIGN_IN_PATH_A
login "$JAR_B" SIGN_IN_PATH_B

cat > "$OUT/scene.env" <<EOF
BASE_URL=$BASE_URL
BOOKING_ID=$BOOKING_ID
BOOKING_B_ID=$BOOKING_B_ID
PENDING_ID=$PENDING_ID
JAR_A=$JAR_A
JAR_B=$JAR_B
SECRETS_FILE=$OUT/secrets.env
SIGN_IN_ACTION=$SIGN_IN_ACTION
ACCEPT_ACTION=$ACCEPT_ACTION
DECLINE_ACTION=$DECLINE_ACTION
PREPARED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMMIT=$(git rev-parse --short HEAD)
EOF
echo "[lesson-16] scena: $OUT/scene.env (BASE_URL=$BASE_URL, BOOKING_ID=$BOOKING_ID)"
