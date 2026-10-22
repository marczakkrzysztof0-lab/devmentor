// check:agents z lekcji 10: budżet plików, istnienie ścieżek z routingu, CLAUDE.md = „@AGENTS.md”.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFile, findInstructionFiles, referencedPaths } from "../scripts/check-agents.mjs";

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "dm-check-agents-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("referencedPaths", () => {
  test("bierze ścieżki z backticków, pomija polecenia, wzorce i blok Next.js", () => {
    const text = [
      "<!-- BEGIN:nextjs-agent-rules -->`node_modules/next/dist/docs/`<!-- END:nextjs-agent-rules -->",
      "Read `docs/design-system.md` and `db/AGENTS.md`, run `npm test`, files `NNNN_<name>.sql`, `dm_migtest_*`.",
    ].join("\n");
    assert.deepEqual(referencedPaths(text), ["docs/design-system.md", "db/AGENTS.md"]);
  });
});

describe("checkFile", () => {
  test("zgłasza nieistniejącą ścieżkę z routingu", () => {
    const root = repo({ "AGENTS.md": "| Bug | `docs/missing.md` |\n", "docs/ok.md": "x" });
    try {
      const { errors } = checkFile(root, join(root, "AGENTS.md"));
      assert.equal(errors.length, 1);
      assert.match(errors[0], /docs\/missing\.md/);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("ścieżka względna do katalogu pliku przy module jest poprawna", () => {
    const root = repo({ "db/AGENTS.md": "See `migrations/0001.sql`.\n", "db/migrations/0001.sql": "" });
    try {
      assert.deepEqual(checkFile(root, join(root, "db/AGENTS.md")).errors, []);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("przekroczony budżet linii to błąd, 80% to ostrzeżenie", () => {
    const root = repo({ "AGENTS.md": "x\n".repeat(160), "db/AGENTS.md": "x\n".repeat(100) });
    try {
      assert.match(checkFile(root, join(root, "AGENTS.md")).errors[0], /budżet 150/);
      const unit = checkFile(root, join(root, "db/AGENTS.md"));
      assert.deepEqual(unit.errors, []);
      assert.match(unit.warnings[0], /80% budżetu 120/);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("CLAUDE.md z czymkolwiek poza „@AGENTS.md” to błąd", () => {
    const root = repo({ "AGENTS.md": "ok\n", "CLAUDE.md": "@AGENTS.md\nAlways be nice.\n" });
    try {
      assert.match(checkFile(root, join(root, "CLAUDE.md")).errors[0], /wyłącznie/);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});

describe("findInstructionFiles", () => {
  test("pomija node_modules i katalogi skilli", () => {
    const root = repo({
      "AGENTS.md": "",
      "node_modules/x/AGENTS.md": "",
      ".claude/skills/s/AGENTS.md": "",
      "packages/ui/AGENTS.md": "",
    });
    try {
      const found = findInstructionFiles(root).map((f) => f.slice(root.length + 1).replaceAll("\\", "/"));
      assert.deepEqual(found, ["AGENTS.md", "packages/ui/AGENTS.md"]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});

describe("repozytorium DevMentor", () => {
  test("wszystkie pliki instrukcji przechodzą check", () => {
    const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    const errors = findInstructionFiles(root).flatMap((file) => checkFile(root, file).errors);
    assert.deepEqual(errors, []);
  });
});
