import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReport, decideIssueAction, parseAudit, parseOutdated } from "../scripts/nightly-report.mjs";

const audit = JSON.stringify({
  vulnerabilities: {
    "low-pkg": { name: "low-pkg", severity: "low", fixAvailable: true },
    "crit-pkg": { name: "crit-pkg", severity: "critical", fixAvailable: false },
    "mod-pkg": { name: "mod-pkg", severity: "moderate", fixAvailable: { name: "x" } },
  },
});

test("parseAudit sortuje podatności od najpoważniejszej i mapuje fixAvailable na boolean", () => {
  assert.deepEqual(parseAudit(audit), [
    { name: "crit-pkg", severity: "critical", fixAvailable: false },
    { name: "mod-pkg", severity: "moderate", fixAvailable: true },
    { name: "low-pkg", severity: "low", fixAvailable: true },
  ]);
});

test("parseAudit i parseOutdated zwracają pustą listę dla pustego lub uszkodzonego wejścia", () => {
  assert.deepEqual(parseAudit(""), []);
  assert.deepEqual(parseAudit("{nie json"), []);
  assert.deepEqual(parseOutdated(""), []);
});

test("parseOutdated zwraca obecną, zgodną z zakresem i najnowszą wersję, alfabetycznie", () => {
  const outdated = JSON.stringify({ zeta: { current: "1.0.0", wanted: "1.0.1", latest: "2.0.0" }, alfa: { wanted: "3.0.0", latest: "3.0.0" } });
  assert.deepEqual(parseOutdated(outdated), [
    { name: "alfa", current: "—", wanted: "3.0.0", latest: "3.0.0" },
    { name: "zeta", current: "1.0.0", wanted: "1.0.1", latest: "2.0.0" },
  ]);
});

test("buildReport liczy jako blokujące tylko podatności moderate i wyższe", () => {
  const { markdown, hasBlocking } = buildReport(parseAudit(audit), [], "2026-10-27");
  assert.equal(hasBlocking, true);
  assert.match(markdown, /\*\*Podatności moderate\+: 2\*\* \(wszystkich: 3\)/);
  assert.match(markdown, /om-auto-fix-issue/);
});

test("buildReport bez podatności moderate+ nie wskazuje naprawy", () => {
  const onlyLow = JSON.stringify({ vulnerabilities: { a: { name: "a", severity: "low", fixAvailable: true } } });
  const { markdown, hasBlocking } = buildReport(parseAudit(onlyLow), [], "2026-10-27");
  assert.equal(hasBlocking, false);
  assert.match(markdown, /Brak podatności moderate\+ \(wszystkich zgłoszonych: 1\)/);
  assert.doesNotMatch(markdown, /om-auto-fix-issue/);
});

test("decideIssueAction: jedno zgłoszenie — zakłada, dopisuje, zamyka albo nic nie robi", () => {
  assert.equal(decideIssueAction(true, null), "create");
  assert.equal(decideIssueAction(true, 41), "comment");
  assert.equal(decideIssueAction(false, 41), "close");
  assert.equal(decideIssueAction(false, null), "none");
});
