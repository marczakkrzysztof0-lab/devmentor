// Nocna zmiana (lekcja 13): z wyników `npm audit --json` i `npm outdated --json` buduje raport
// Markdown i utrzymuje JEDNO zgłoszenie z etykietą `dependencies`:
//   - są podatności moderate+ → zakłada zgłoszenie albo dopisuje komentarz do otwartego,
//   - podatności brak, a zgłoszenie jest otwarte → komentarz „czysto” i zamknięcie.
// Nieaktualne paczki tylko raportujemy (podbijanie wersji to decyzja człowieka/agenta w PR).
// Użycie: node scripts/nightly-report.mjs audit.json outdated.json report.md
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const ISSUE_TITLE = "Nocna zmiana: podatności w zależnościach";
export const ISSUE_LABEL = "dependencies";
const BLOCKING = new Set(["moderate", "high", "critical"]);

/** Audyt, który się nie udał — nie wolno go uznać za „brak podatności” (ani zamknąć zgłoszenia). */
export class AuditFailed extends Error {}

/** @param {string} text */
function parseJson(text) {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {string} auditText wynik `npm audit --json`
 * @returns {{ name: string, severity: string, fixAvailable: boolean }[]} podatne paczki, od najpoważniejszych
 * @throws {AuditFailed} gdy wynik jest pusty, nie jest JSON-em, zawiera `error` albo nie ma `vulnerabilities`
 */
export function parseAudit(auditText) {
  const order = ["critical", "high", "moderate", "low", "info"];
  const parsed = parseJson(auditText);
  if (!parsed || parsed.error || typeof parsed.vulnerabilities !== "object" || parsed.vulnerabilities === null) {
    throw new AuditFailed("npm audit nie zwrócił poprawnego raportu");
  }
  const vulns = parsed.vulnerabilities;
  return Object.values(vulns)
    .map((v) => ({ name: String(v.name), severity: String(v.severity), fixAvailable: Boolean(v.fixAvailable) }))
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.name.localeCompare(b.name));
}

/**
 * @param {string} outdatedText wynik `npm outdated --json`
 * @returns {{ name: string, current: string, wanted: string, latest: string }[] | null} null, gdy wynik jest nieczytelny
 */
export function parseOutdated(outdatedText) {
  const parsed = parseJson(outdatedText);
  if (!parsed || parsed.error) return null;
  return Object.entries(parsed)
    .map(([name, v]) => ({ name, current: String(v.current ?? "—"), wanted: String(v.wanted ?? "—"), latest: String(v.latest ?? "—") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {ReturnType<typeof parseAudit>} vulns
 * @param {ReturnType<typeof parseOutdated>} outdated null = `npm outdated` się nie udał (tylko informacja w raporcie)
 * @param {string} date YYYY-MM-DD
 */
export function buildReport(vulns, outdated, date) {
  const blocking = vulns.filter((v) => BLOCKING.has(v.severity));
  const lines = [`## Nocna zmiana — ${date}`, ""];
  lines.push(
    blocking.length
      ? `**Podatności moderate+: ${blocking.length}** (wszystkich: ${vulns.length}).`
      : `Brak podatności moderate+ (wszystkich zgłoszonych: ${vulns.length}).`,
    "",
  );
  if (vulns.length) {
    lines.push("| Paczka | Poziom | Poprawka dostępna |", "|---|---|---|");
    for (const v of vulns) lines.push(`| \`${v.name}\` | ${v.severity} | ${v.fixAvailable ? "tak" : "nie"} |`);
    lines.push("");
  }
  if (outdated === null) lines.push("Nieaktualne paczki: nie udało się odczytać wyniku `npm outdated`.", "");
  else lines.push(`Nieaktualne paczki: ${outdated.length}.`, "");
  if (outdated?.length) {
    lines.push("| Paczka | Obecna | Zgodna z zakresem | Najnowsza |", "|---|---|---|---|");
    for (const o of outdated) lines.push(`| \`${o.name}\` | ${o.current} | ${o.wanted} | ${o.latest} |`);
    lines.push("");
  }
  if (blocking.length) lines.push("Następny krok: `/om-auto-fix-issue <numer tego zgłoszenia>` w porannym bloku przeglądu.");
  return { markdown: lines.join("\n"), hasBlocking: blocking.length > 0 };
}

/**
 * Decyzja o zgłoszeniu, bez efektów ubocznych.
 * @param {boolean} hasBlocking
 * @param {number | null} openIssue numer otwartego zgłoszenia nocnej zmiany albo null
 * @returns {"create" | "comment" | "close" | "none"}
 */
export function decideIssueAction(hasBlocking, openIssue) {
  if (hasBlocking) return openIssue ? "comment" : "create";
  return openIssue ? "close" : "none";
}

/** @param {string[]} args */
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

function main([auditPath, outdatedPath, reportPath]) {
  let vulns;
  try {
    vulns = parseAudit(readFileSync(auditPath, "utf8"));
  } catch (error) {
    // Bez zmian w zgłoszeniu: nieudany audyt nie może zamknąć otwartego zgłoszenia ani założyć nowego.
    writeFileSync(reportPath, `## Nocna zmiana\n\nAudyt się nie udał: ${error.message}. Zgłoszenie bez zmian.\n`);
    console.error(`Nocna zmiana: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const outdated = parseOutdated(readFileSync(outdatedPath, "utf8"));
  const { markdown, hasBlocking } = buildReport(vulns, outdated, new Date().toISOString().slice(0, 10));
  writeFileSync(reportPath, markdown + "\n");

  const found = JSON.parse(
    gh(["issue", "list", "--state", "open", "--label", ISSUE_LABEL, "--search", `"${ISSUE_TITLE}" in:title`, "--json", "number"]),
  );
  const openIssue = found[0]?.number ?? null;
  const action = decideIssueAction(hasBlocking, openIssue);
  if (action === "create") gh(["issue", "create", "--title", ISSUE_TITLE, "--label", ISSUE_LABEL, "--body-file", reportPath]);
  if (action === "comment") gh(["issue", "comment", String(openIssue), "--body-file", reportPath]);
  if (action === "close") {
    gh(["issue", "comment", String(openIssue), "--body-file", reportPath]);
    gh(["issue", "close", String(openIssue), "--reason", "completed"]);
  }
  console.log(`Nocna zmiana: ${action}${openIssue ? ` (#${openIssue})` : ""}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
