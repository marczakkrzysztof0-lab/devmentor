#!/bin/sh
# Lekcja 16 — DAST: OWASP ZAP Baseline (Docker) na LOKALNYM, jednorazowym środowisku testowym.
#
#   sh .ai/qa/lesson-16-sast-dast/zap-baseline.sh [nazwa-raportu]     (domyślnie: zap-baseline)
#
# Baseline = pasywny skan: pająk ~1 min + reguły pasywne, bez ataków aktywnych i bez logowania (bez sesji).
# Cel: adres z .ai/qa/test-env.json (najpierw sh .ai/scripts/test-env-up.sh); skrypt odmawia celu spoza localhost.
# Kontener widzi host jako host.docker.internal (Docker Desktop). Raporty: reports/<nazwa>.html i .json (+ .md).
set -eu
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT="$ROOT/.ai/qa/lesson-16-sast-dast/reports"
NAME=${1:-zap-baseline}
mkdir -p "$OUT"
IMAGE=${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}

BASE_URL=$(node -e 'const d=require(process.argv[1]); if(d.status!=="running") process.exit(1); console.log(d.baseUrl)' "$ROOT/.ai/qa/test-env.json") || {
  echo "Środowisko testowe nie działa — sh .ai/scripts/test-env-up.sh" >&2; exit 1; }
case "$BASE_URL" in
  http://localhost:*|http://127.0.0.1:*) ;;
  *) echo "Odmowa: $BASE_URL nie jest lokalny" >&2; exit 1 ;;
esac
PORT=${BASE_URL##*:}
TARGET="http://host.docker.internal:$PORT/"
SLUG=$(node -e 'console.log(require(process.argv[1]).seed?.publishedSlug ?? "")' "$ROOT/.ai/qa/test-env.json")

echo "[zap] cel: $TARGET (= $BASE_URL), raport: $OUT/$NAME.{html,json,md}"
# -I: ostrzeżenia nie dają kodu 1 (raport jest wynikiem), -j: pająk AJAX wyłączony (bez przeglądarki w kontenerze).
MSYS_NO_PATHCONV=1 docker run --rm -v "$OUT:/zap/wrk:rw" "$IMAGE" \
  zap-baseline.py -t "$TARGET" -r "$NAME.html" -J "$NAME.json" -w "$NAME.md" -I -m 1 \
  -z "-config spider.maxDuration=1" || true
# Druga strona startowa: publiczna strona mentorki z seeda (pająk nie znajdzie jej z /).
if [ -n "$SLUG" ]; then
  MSYS_NO_PATHCONV=1 docker run --rm -v "$OUT:/zap/wrk:rw" "$IMAGE" \
    zap-baseline.py -t "${TARGET}m/$SLUG" -J "$NAME-mentor-page.json" -I -m 1 >/dev/null 2>&1 || true
fi

node -e '
  const fs = require("fs");
  const [out, name] = process.argv.slice(1);
  const rows = [];
  for (const file of [name + ".json", name + "-mentor-page.json"]) {
    if (!fs.existsSync(out + "/" + file)) continue;
    const report = JSON.parse(fs.readFileSync(out + "/" + file, "utf8"));
    for (const site of report.site ?? []) for (const a of site.alerts ?? []) rows.push({ file, id: a.pluginid, risk: a.riskdesc, name: a.name, count: Number(a.count) });
  }
  const merged = {};
  for (const r of rows) { const k = r.id; merged[k] ??= { id: r.id, risk: r.risk, name: r.name, count: 0 }; merged[k].count += r.count; }
  const list = Object.values(merged).sort((a, b) => b.risk.localeCompare(a.risk));
  fs.writeFileSync(out + "/" + name + "-summary.json", JSON.stringify(list, null, 2));
  for (const r of list) console.log(`${r.id}\t${r.risk}\t${r.count}\t${r.name}`);
' "$OUT" "$NAME"
