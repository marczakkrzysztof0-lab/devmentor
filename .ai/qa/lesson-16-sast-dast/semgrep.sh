#!/bin/sh
# Lekcja 16 — SAST: Semgrep CE w Dockerze, telemetria wyłączona, tylko lokalne pliki repozytorium.
#
#   sh .ai/qa/lesson-16-sast-dast/semgrep.sh
#
# Reguły z rejestru Semgrep (pobierane przez kontener przy starcie; kod NIE jest wysyłany — `--metrics=off`,
# bez logowania do Semgrep AppSec Platform):
#   p/typescript, p/react, p/nextjs, p/owasp-top-ten, p/javascript, p/default, p/security-audit
# (p/default i p/security-audit dodane po teście kanarka — bez nich zestaw nie złapał nawet `eval` z parametru URL;
#  evidence/semgrep-canary.txt).
# Cele: packages/ (design system), app/, lib/, proxy.ts, scripts/ — w tym repo kod aplikacji nie leży w packages/.
# Wynik: reports/semgrep.json (+ podsumowanie pokrycia na stdout: pliki, reguły, błędy parsowania, reguły Next.js).
set -eu
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT="$ROOT/.ai/qa/lesson-16-sast-dast/reports"
mkdir -p "$OUT"
IMAGE=${SEMGREP_IMAGE:-semgrep/semgrep:latest}
TARGETS="packages app lib proxy.ts scripts"

# Kopia śledzonych plików celów (git archive) do katalogu tymczasowego — montowanie całego repo z node_modules na Windows/Docker
# Desktop jest bardzo wolne (pierwsza próba: > 20 min bez wyniku). Skanujemy dokładnie to, co jest w gicie (HEAD
# + zmiany w drzewie roboczym przez `git stash create`), ścieżki w wynikach zostają względne jak w repo.
# Katalog tymczasowy poza repo (inaczej eslint i check:agents widzą kopię), sprzątany przy wyjściu.
SRC=$(mktemp -d "${TMPDIR:-/tmp}/devmentor-semgrep.XXXXXX")
trap 'rm -rf "$SRC"' EXIT
# Docker Desktop na Windows potrzebuje ścieżki Windows dla katalogu spoza /c/... (Git Bash: cygpath).
MOUNT=$SRC; command -v cygpath >/dev/null 2>&1 && MOUNT=$(cygpath -m "$SRC")
TREE=$(cd "$ROOT" && git stash create 2>/dev/null || true)
# shellcheck disable=SC2086
(cd "$ROOT" && git archive "${TREE:-HEAD}" $TARGETS) | tar -x -C "$SRC"

# MSYS_NO_PATHCONV: Git Bash na Windows nie przepisuje ścieżek kontenera (/src).
MSYS_NO_PATHCONV=1 docker run --rm \
  -e SEMGREP_SEND_METRICS=off -e SEMGREP_ENABLE_VERSION_CHECK=0 \
  -v "$MOUNT:/src" -v "$OUT:/out" -w /src "$IMAGE" \
  semgrep scan --metrics=off --disable-version-check \
    --config p/typescript --config p/react --config p/nextjs --config p/owasp-top-ten --config p/javascript \
    --config p/default --config p/security-audit \
    --exclude node_modules --exclude .next --exclude storybook-static --exclude '*.stories.tsx' \
    --json --output /out/semgrep.json \
    $TARGETS 2> "$OUT/semgrep-stderr.txt" || true

# Osobno sam pakiet Next.js — czy w ogóle zawiera reguły (pusty pakiet = fałszywe poczucie pokrycia).
MSYS_NO_PATHCONV=1 docker run --rm -e SEMGREP_SEND_METRICS=off -v "$MOUNT:/src" -v "$OUT:/out" -w /src "$IMAGE" \
  semgrep scan --metrics=off --disable-version-check --config p/nextjs --json \
    --output /out/semgrep-nextjs-only.json app lib proxy.ts 2> "$OUT/semgrep-nextjs-stderr.txt" >/dev/null || true

node -e '
  const fs = require("fs");
  const out = process.argv[1];
  const all = JSON.parse(fs.readFileSync(out + "/semgrep.json", "utf8"));
  const next = JSON.parse(fs.readFileSync(out + "/semgrep-nextjs-only.json", "utf8"));
  const ran = (file) => { const text = fs.readFileSync(out + "/" + file, "utf8"); const m = text.match(/Ran ([0-9]+) rules? on ([0-9]+) files?/); const loaded = text.match(/with ([0-9]+) Code rules/); return m ? { rulesRun: Number(m[1]), rulesLoaded: loaded ? Number(loaded[1]) : null, files: Number(m[2]) } : { rulesRun: 0, note: "brak linii Ran N rules: pakiet bez reguł dla tych plików" }; };
  const files = all.paths?.scanned ?? [];
  const byDir = {};
  for (const f of files) { const d = f.split("/")[0]; byDir[d] = (byDir[d] ?? 0) + 1; }
  const severity = {};
  for (const r of all.results) severity[r.extra.severity] = (severity[r.extra.severity] ?? 0) + 1;
  const summary = {
    version: all.version,
    filesScanned: files.length,
    ran: ran("semgrep-stderr.txt"),
    filesByDir: byDir,
    findings: all.results.length,
    bySeverity: severity,
    findingsList: all.results.map((r) => ({ rule: r.check_id, file: r.path, line: r.start.line, severity: r.extra.severity })),
    errors: all.errors.length,
    errorKinds: [...new Set(all.errors.map((e) => e.type + (e.path ? " " + e.path : "")))].slice(0, 20),
    skipped: (all.paths?.skipped ?? []).length,
    nextjsOnly: { ran: ran("semgrep-nextjs-stderr.txt"), findings: next.results.length, filesScanned: (next.paths?.scanned ?? []).length, errors: next.errors.length },
  };
  fs.writeFileSync(out + "/semgrep-summary.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
' "$OUT"
