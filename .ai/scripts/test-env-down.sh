#!/bin/sh
# om-prepare-test-env: generated teardown (contract v2)
# history:
#   2026-10-27 generated (lekcja 12)
# Zatrzymuje tylko to, co uruchomil test-env-up (PID nadzorcy z deskryptora, schemat dm_migtest_* z deskryptora).
# Bezpieczne do wielokrotnego uruchomienia.  Uzycie: sh .ai/scripts/test-env-down.sh
set -eu
NODE_BIN="${NODE_BIN:-node}"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
exec "$NODE_BIN" scripts/test-env.mjs down
