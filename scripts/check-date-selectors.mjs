// Reguła lekcji 17: e2e nie budują własnych wyrażeń na daty w nazwach elementów.
//
// Błąd z PR #49 (826e0bc): `new RegExp(`${date}.*${time}`)` — dla „1.11” trafiało też w „11.11, 17:00”, ale tylko
// w dni, w których oba terminy były w 14-dniowym oknie, więc przeszło review i CI. Wyrażenia na datę i godzinę
// radia budujemy tylko w `tests/e2e/slot-names.mjs` (sprawdzanym testem z zamrożonym zegarem:
// `tests/availability/slot-radio-names.test.mjs`).
//
// Zakazane w tests/e2e/**/*.mjs (poza slot-names.mjs):
//   D1  `new RegExp(` z interpolacją zmiennej o nazwie z „date”/„day”/„dzien” — data wklejona w wyrażenie,
//   D2  wpisana na sztywno data „d.mm” w wyrażeniu (`1\.11`) bez granicy przed nią (`(?<!\d)` albo `\b`).
// Linia z komentarzem `date-selector-ok: <powód>` jest pomijana (świadomy wyjątek do review).
// Kod wyjścia 1 przy naruszeniu. Bez zależności. Użycie: node scripts/check-date-selectors.mjs [katalog]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_FILE = "slot-names.mjs";
const D1 = /new RegExp\(\s*`[^`]*\$\{\s*[\w.]*(date|day|dzien)/i;
// Data „d.mm” wpisana w wyrażenie: „1\.11” w literale albo „1\\.11” w szablonie dla RegExp.
const HARD_DATE = /(\d{1,2})\\{1,2}\.(0[1-9]|1[0-2])(?!\d)/g;
// Dozwolona granica tuż przed datą: `(?<!\d)`, `\b` albo `^`.
const BOUNDARY_BEFORE = /(\(\?<!\\{1,2}d\)|\\{1,2}b|\^)$/;
const REGEX_CONTEXT = /new RegExp\(|\/[^/\s][^/]*\/[dgimsuyv]*/;

/** @param {string} text */
function hasUnboundedDate(text) {
  for (const m of text.matchAll(HARD_DATE)) {
    const before = text.slice(0, m.index);
    if (/\d$/.test(before)) continue; // część dłuższej liczby
    if (!BOUNDARY_BEFORE.test(before)) return true;
  }
  return false;
}

/** @param {string} dir */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith(".mjs") && name !== ALLOWED_FILE ? [full] : [];
  });
}

/**
 * @param {string} source
 * @returns {{ line: number, rule: string, text: string }[]}
 */
export function findDateSelectors(source) {
  const out = [];
  source.split(/\r?\n/).forEach((text, i) => {
    if (/date-selector-ok:/.test(text) || /^\s*(\/\/|\*)/.test(text)) return;
    if (D1.test(text)) out.push({ line: i + 1, rule: "D1", text: text.trim() });
    else if (REGEX_CONTEXT.test(text) && hasUnboundedDate(text)) out.push({ line: i + 1, rule: "D2", text: text.trim() });
  });
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.argv[2] ?? join(fileURLToPath(new URL("..", import.meta.url)), "tests", "e2e");
  const violations = walk(root).flatMap((file) =>
    findDateSelectors(readFileSync(file, "utf8")).map((v) => ({ ...v, file: relative(process.cwd(), file) })),
  );
  for (const v of violations) {
    console.error(`${v.file}:${v.line} ${v.rule} ${v.text}`);
  }
  if (violations.length > 0) {
    console.error(
      `\n${violations.length} niejednoznacznych selektorów dat w e2e. Użyj slotRadioNamePattern() z tests/e2e/slot-names.mjs` +
        " (D1: data wklejona w RegExp, D2: data bez granicy przed nią) albo oznacz wyjątek „date-selector-ok: <powód>”.",
    );
    process.exit(1);
  }
  console.log(`check-date-selectors: OK (${walk(root).length} plików w ${relative(process.cwd(), root) || "."})`);
}
