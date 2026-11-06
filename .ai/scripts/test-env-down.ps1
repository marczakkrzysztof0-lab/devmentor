# om-prepare-test-env: generated teardown (contract v2)
# history:
#   2026-10-27 generated (lekcja 12)
# Zatrzymuje tylko to, co uruchomil test-env-up (PID nadzorcy i schemat dm_migtest_* z deskryptora).
# Bezpieczne do wielokrotnego uruchomienia.  Uzycie: powershell -ExecutionPolicy Bypass -File .ai/scripts/test-env-down.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$NodeBin = if ($env:NODE_BIN) { $env:NODE_BIN } else { 'node' }
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
& $NodeBin scripts/test-env.mjs down
exit $LASTEXITCODE
