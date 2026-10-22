#!/usr/bin/env node
// Hook PreToolUse dla narzędzia Bash (lekcja 09, guardraile deterministyczne).
// Claude Code podaje na stdin JSON z `tool_input.command`, a kod wyjścia decyduje o komendzie:
//   0 – komenda przechodzi,
//   2 – komenda zablokowana, stderr trafia do modelu jako błąd narzędzia,
//   inny – błąd hooka: komenda PRZECHODZI, komunikat widzi tylko człowiek.
// Napisany w Node, a nie w bash + jq, bo Node jest w każdym środowisku projektu (Windows, CI).
// Hook blokuje narzędzie, nie intencję agenta: znane luki są w lekcja-09/security-notes.md.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Pliki-wzorce bez sekretów: wolno je czytać (op run czyta .env.template).
const ENV_TEMPLATES = /\.env\.(example|template)\b/g;

const RULES = [
  {
    reason: "pobieranie skryptu prosto do powłoki",
    test: (cmd) => /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(cmd),
  },
  {
    reason: "rekursywne usuwanie (rm -r)",
    test: (cmd) =>
      /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/.test(cmd) ||
      /\bRemove-Item\b[^;|&]*-Recurse\b/i.test(cmd),
  },
  {
    reason: "dostęp do kluczy i poświadczeń",
    test: (cmd) => /(~|\$HOME|\$\{HOME\}|\$env:USERPROFILE)[\\/]\.(ssh|aws|kube|config[\\/]gh)\b/i.test(cmd),
  },
  {
    reason: "odczyt pliku .env",
    test: (cmd) => /\.env\b/.test(cmd.replace(ENV_TEMPLATES, "")),
  },
];

/** Zwraca powód blokady albo null, gdy komenda może przejść. */
export function blockReason(command) {
  if (typeof command !== "string" || command.trim() === "") return null;
  return RULES.find((rule) => rule.test(command))?.reason ?? null;
}

function main() {
  let command;
  try {
    command = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command;
  } catch {
    // Nieczytelne wejście: blokujemy (fail closed), zamiast po cichu przepuszczać.
    process.stderr.write("Hook PreToolUse nie mógł odczytać wejścia, komenda zablokowana.\n");
    process.exit(2);
  }
  const reason = blockReason(command);
  if (reason) {
    process.stderr.write(
      `Zablokowane przez politykę zespołu: ${reason}. Nie próbuj obejść tej blokady innymi komendami.\n`,
    );
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
