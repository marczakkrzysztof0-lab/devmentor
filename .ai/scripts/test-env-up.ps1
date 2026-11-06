# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-10-27 generated (lekcja 12): logika w scripts/test-env.mjs (lock, reuse, build cache, schemat, seed, next start)
#   2026-10-27 verified (Git Bash, Windows): cold 343s (z next build), warm 4s (reused, ten sam runId); touch lib/* -> status stale
#
# Srodowisko testowe DevMentora (PowerShell, Windows): istniejacy Postgres z DATABASE_URL (kontener devmentor-db)
# + jednorazowy schemat dm_migtest_* z migracjami i seedem + `next start` na wolnym porcie.
# Uzycie:  powershell -ExecutionPolicy Bypass -File .ai/scripts/test-env-up.ps1 [--force] [--force-rebuild]
# Wynik: linie TEST_ENV_* i deskryptor .ai/qa/test-env.json (gitignored).
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- zmienne projektu ---
$NodeBin = if ($env:NODE_BIN) { $env:NODE_BIN } else { 'node' }
$Entry = 'scripts/test-env.mjs'

$Root = Resolve-Path (Join-Path $PSScriptRoot '../..')
Set-Location $Root
if (-not (Get-Command $NodeBin -ErrorAction SilentlyContinue)) { Write-Error 'Brak Node.js (wymagany >= 20.12).'; exit 1 }
if (-not $env:DATABASE_URL -and -not (Test-Path '.env.local')) {
  Write-Error 'Brak DATABASE_URL i .env.local - ustaw $env:DATABASE_URL albo uruchom npm run setup.'
  exit 1
}
& $NodeBin $Entry up '--start-script=.ai/scripts/test-env-up.ps1' @args
exit $LASTEXITCODE
