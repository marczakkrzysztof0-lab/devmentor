// Finds values outside the design tokens (prompt rule 3) and exits with 1, so CI can run it.
//   1. colour literals (hex, rgb(), hsl(), oklch(), ...) outside src/styles/tokens.css,
//   2. Tailwind palette classes (bg-zinc-900, text-white, ...),
//   3. Tailwind arbitrary values (p-[13px], text-[#fff], ...),
//   4. numeric Tailwind spacing other than 0 (p-4, gap-2, mt-6, w-64 ...) — use spacing tokens.
// Usage: node scripts/check-tokens.mjs [paths...]   (default: src, docs, .storybook)
// A line may opt out with the comment `check-tokens-ignore` (e.g. a "what to avoid" example);
// every opt-out is printed so it stays visible in review.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILES = new Set([path.join(root, "src", "styles", "tokens.css")]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".mdx", ".html"]);
const SKIP_DIRS = new Set(["node_modules", "storybook-static", "dist", ".git"]);
const SELF = fileURLToPath(import.meta.url);

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe|black|white";
const UTILITY =
  "bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|accent|caret|decoration|shadow|inset-shadow|drop-shadow|text-shadow";

export const RULES = [
  {
    name: "colour literal outside tokens file",
    re: /(?<![\w&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(/g,

  },
  {
    name: "Tailwind palette class",
    re: new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?(?:\\/\\d+)?(?![\\w-])`, "g"),
  },
  {
    name: "numeric Tailwind spacing (use a spacing token)",
    re: /(?<![\w-])(?:[\w-]+:)*-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|start|end|w|h|size|min-w|min-h|max-w|max-h|translate-x|translate-y|scroll-m|scroll-p|indent|basis)-(?:[1-9]\d*(?:\.5)?|0\.5)(?![\w./-])/g,
  },
  {
    name: "Tailwind arbitrary value",
    // A bracket followed by ":" is an arbitrary VARIANT (data-[state=checked]:), not a value.
    re: /(?<![\w-])(?:[\w-]+:)*-?[a-z][\w-]*-\[[^\]\s]+\](?![\w:-])/g,
  },
];

function* walk(target) {
  const stat = statSync(target);
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(target))) yield target;
    return;
  }
  for (const entry of readdirSync(target)) {
    if (SKIP_DIRS.has(entry)) continue;
    yield* walk(path.join(target, entry));
  }
}

export function checkFile(file) {
  const findings = [];
  const ignored = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (TOKEN_FILES.has(file)) continue; // the tokens file defines the values
      for (const match of line.matchAll(rule.re)) {
        const hit = { file, line: index + 1, rule: rule.name, value: match[0] };
        (line.includes("check-tokens-ignore") ? ignored : findings).push(hit);
      }
    }
  });
  return { findings, ignored };
}

function main() {
  const args = process.argv.slice(2);
  const targets = (args.length ? args : ["src", "docs", ".storybook"]).map((t) => path.resolve(root, t));
  const findings = [];
  const ignored = [];
  for (const target of targets) {
    for (const file of walk(target)) {
      if (file === SELF) continue;
      const result = checkFile(file);
      findings.push(...result.findings);
      ignored.push(...result.ignored);
    }
  }
  const rel = (f) => path.relative(root, f).split(path.sep).join("/");
  for (const hit of ignored) console.log(`ignored  ${rel(hit.file)}:${hit.line}  ${hit.rule}: ${hit.value}`);
  for (const hit of findings) console.error(`ERROR    ${rel(hit.file)}:${hit.line}  ${hit.rule}: ${hit.value}`);
  if (findings.length) {
    console.error(`\ncheck:tokens — ${findings.length} value(s) outside the tokens. Use a semantic token instead.`);
    process.exit(1);
  }
  console.log(`check:tokens — OK (no values outside the tokens; ${ignored.length} ignored line(s)).`);
}

main();
