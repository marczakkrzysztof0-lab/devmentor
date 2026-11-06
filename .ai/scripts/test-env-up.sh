#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-10-27 generated (lekcja 12): logika w scripts/test-env.mjs (lock, reuse, build cache, schemat, seed, next start)
#   2026-10-27 verified (Git Bash, Windows): cold 343s (z next build), warm 4s (reused, ten sam runId); touch lib/* -> status stale
#
# Srodowisko testowe DevMentora: istniejacy Postgres z DATABASE_URL (lokalnie kontener devmentor-db
# z docker-compose) + jednorazowy schemat dm_migtest_* z migracjami i seedem + `next start` na wolnym porcie.
# Uzycie (Git Bash / macOS / Linux / WSL2):  sh .ai/scripts/test-env-up.sh [--force] [--force-rebuild]
# Wynik: linie TEST_ENV_* i deskryptor .ai/qa/test-env.json (gitignored).
set -eu

# --- zmienne projektu ---
NODE_BIN="${NODE_BIN:-node}"
ENTRY="scripts/test-env.mjs"

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
command -v "$NODE_BIN" >/dev/null 2>&1 || { echo "Brak Node.js (wymagany >= 20.12)." >&2; exit 1; }
if [ -z "${DATABASE_URL:-}" ] && [ ! -f .env.local ]; then
  echo "Brak DATABASE_URL i .env.local - ustaw DATABASE_URL albo uruchom npm run setup." >&2
  exit 1
fi
exec "$NODE_BIN" "$ENTRY" up --start-script=.ai/scripts/test-env-up.sh "$@"
