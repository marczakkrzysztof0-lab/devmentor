// Check plików instrukcji dla agentów (lekcja 10, context engineering):
// - budżet: główny AGENTS.md ≤ 150 linii / 12 KB, pliki przy modułach ≤ 120 linii / 8 KB (ostrzeżenie od 80%),
// - każda ścieżka w backtickach w AGENTS.md istnieje (względem katalogu pliku albo korzenia repozytorium),
// - każdy CLAUDE.md zawiera wyłącznie `@AGENTS.md`.
// Kod wyjścia 1 przy błędzie, 0 przy samych ostrzeżeniach. Bez zależności.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "storybook-static", "coverage"]);
export const BUDGETS = { root: { lines: 150, bytes: 12_000 }, unit: { lines: 120, bytes: 8_000 } };
const WARN_AT = 0.8;

// Fragmenty w backtickach, które wyglądają na ścieżki: mają „/” albo rozszerzenie pliku, bez spacji.
const CODE_SPAN = /`([^`\s]+)`/g;
const LOOKS_LIKE_PATH = /\/|\.(md|mjs|ts|tsx|json|sql|yml|yaml)$/;
// Nie-ścieżki: polecenia, wzorce, placeholdery, adresy URL.
const NOT_A_PATH = /^(npm|node|docker|git)\b|[*<>…]|^https?:|^@|^\.\.\.$|^\$/;

export function findInstructionFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        // Skille mają własny budżet i format (SKILL.md), nie są częścią łańcucha AGENTS.md.
        if (name === "skills" && /[\\/]\.(claude|agents)$/.test(dir)) continue;
        walk(full);
      } else if (name === "AGENTS.md" || name === "CLAUDE.md") {
        found.push(full);
      }
    }
  };
  walk(root);
  return found.sort();
}

export function referencedPaths(text) {
  // Blok Next.js generuje `next dev`; jego ścieżki dotyczą node_modules.
  const body = text.replace(/<!-- BEGIN:nextjs-agent-rules -->[\s\S]*?<!-- END:nextjs-agent-rules -->/, "");
  const paths = new Set();
  for (const [, span] of body.matchAll(CODE_SPAN)) {
    if (LOOKS_LIKE_PATH.test(span) && !NOT_A_PATH.test(span)) paths.add(span);
  }
  return [...paths];
}

export function checkFile(root, file) {
  const errors = [];
  const warnings = [];
  const rel = relative(root, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");

  if (rel.endsWith("CLAUDE.md")) {
    if (text.trim() !== "@AGENTS.md") errors.push(`${rel}: CLAUDE.md ma zawierać wyłącznie „@AGENTS.md”`);
    else if (!existsSync(join(dirname(file), "AGENTS.md"))) errors.push(`${rel}: brak AGENTS.md obok`);
    return { errors, warnings };
  }

  const budget = rel === "AGENTS.md" ? BUDGETS.root : BUDGETS.unit;
  const lines = text.split("\n").length;
  const bytes = Buffer.byteLength(text);
  for (const [value, limit, unit] of [[lines, budget.lines, "linii"], [bytes, budget.bytes, "B"]]) {
    if (value > limit) errors.push(`${rel}: ${value} ${unit} > budżet ${limit}`);
    else if (value > limit * WARN_AT) warnings.push(`${rel}: ${value} ${unit} (≥ 80% budżetu ${limit})`);
  }

  for (const path of referencedPaths(text)) {
    const clean = path.replace(/:\d+$/, "").replace(/\/$/, "");
    if (!existsSync(join(dirname(file), clean)) && !existsSync(join(root, clean))) {
      errors.push(`${rel}: ścieżka \`${path}\` nie istnieje`);
    }
  }
  return { errors, warnings };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const files = findInstructionFiles(root);
  const errors = [];
  const warnings = [];
  for (const file of files) {
    const result = checkFile(root, file);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  for (const w of warnings) console.warn(`ostrzeżenie: ${w}`);
  for (const e of errors) console.error(`błąd: ${e}`);
  const agents = files.filter((f) => f.endsWith("AGENTS.md")).length;
  console.log(`check:agents: ${agents} plików AGENTS.md, ${files.length - agents} CLAUDE.md, błędów: ${errors.length}`);
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
