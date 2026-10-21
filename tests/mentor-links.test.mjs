// CLI założycieli scripts/mentor-links.mjs — części czyste i runCli z atrapami (bez bazy).
// Testy z bazą: tests/db/mentor-links.test.mjs.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  formatExpiry,
  formatResult,
  MentorLinksError,
  MISSING_APP_URL_MESSAGE,
  normalizeAppUrl,
  normalizeEmail,
  parseCliArgs,
  runCli,
} from "../scripts/mentor-links.mjs";
import { UNREACHABLE_MESSAGE } from "../scripts/db-migrate.mjs";

describe("parseCliArgs", () => {
  test("invite <email>", () => {
    assert.deepEqual(parseCliArgs(["invite", "anna@example.com"]), {
      command: "invite",
      email: "anna@example.com",
    });
  });

  test("sign-in-link <email>", () => {
    assert.deepEqual(parseCliArgs(["sign-in-link", "anna@example.com"]), {
      command: "sign-in-link",
      email: "anna@example.com",
    });
  });

  test("--help / -h", () => {
    assert.deepEqual(parseCliArgs(["--help"]), { help: true });
    assert.deepEqual(parseCliArgs(["invite", "-h"]), { help: true });
  });

  test("brak e-maila, nadmiarowe argumenty i nieznane polecenie → MentorLinksError", () => {
    assert.throws(() => parseCliArgs(["invite"]), /Podaj adres e-mail/);
    assert.throws(() => parseCliArgs(["invite", "a@b.pl", "c@d.pl"]), /dokładnie jeden/);
    assert.throws(() => parseCliArgs([]), MentorLinksError);
    assert.throws(() => parseCliArgs(["delete", "a@b.pl"]), /Nieznane polecenie/);
  });
});

describe("normalizeEmail", () => {
  test("przycina i zamienia na małe litery", () => {
    assert.equal(normalizeEmail("  Anna.K@Example.COM \n"), "anna.k@example.com");
  });

  test("odrzuca adresy bez podstawowego kształtu", () => {
    for (const bad of ["", "   ", "anna", "anna@", "@example.com", "anna@example", "an na@example.com", "a@b@c.pl"]) {
      assert.throws(() => normalizeEmail(bad), MentorLinksError, bad);
    }
    assert.throws(() => normalizeEmail(`${"a".repeat(250)}@x.pl`), MentorLinksError);
  });
});

describe("normalizeAppUrl", () => {
  test("usuwa końcowe ukośniki", () => {
    assert.equal(normalizeAppUrl("http://localhost:3000/"), "http://localhost:3000");
    assert.equal(normalizeAppUrl(" https://devmentor.pl// "), "https://devmentor.pl");
  });

  test("brak → czytelny komunikat; nie-http(s) → błąd", () => {
    assert.throws(() => normalizeAppUrl(undefined), { message: MISSING_APP_URL_MESSAGE });
    assert.throws(() => normalizeAppUrl("  "), { message: MISSING_APP_URL_MESSAGE });
    assert.throws(() => normalizeAppUrl("localhost:3000"), MentorLinksError);
    assert.throws(() => normalizeAppUrl("ftp://devmentor.pl"), MentorLinksError);
  });
});

describe("formatExpiry / formatResult", () => {
  test("czas polski (CET i CEST)", () => {
    assert.equal(formatExpiry(new Date("2026-11-04T11:00:00Z")), "04.11.2026, 12:00");
    assert.equal(formatExpiry(new Date("2026-07-01T22:30:00Z")), "02.07.2026, 00:30");
  });

  test("wynik zawiera link, datę ważności i wskazówkę o jednorazowości", () => {
    const text = formatResult("invite", {
      url: "http://localhost:3000/invite/abc",
      expiresAt: new Date("2026-11-04T11:00:00Z"),
    });
    assert.match(text, /http:\/\/localhost:3000\/invite\/abc/);
    assert.match(text, /Ważny do 04\.11\.2026, 12:00/);
    assert.match(text, /jednorazowy/);
    assert.match(text, /osobiście/);
  });
});

describe("runCli (atrapy, bez bazy)", () => {
  const env = { DATABASE_URL: "postgresql://x:y@127.0.0.1:1/z", NEXT_PUBLIC_APP_URL: "http://localhost:3000/" };

  /** Atrapa puli: zapisuje zapytania, `end()` liczy zamknięcia. */
  function fakeDb(queryImpl) {
    const db = {
      ended: 0,
      queries: /** @type {any[]} */ ([]),
      query: async (text, params) => {
        db.queries.push({ text, params });
        return queryImpl(text, params);
      },
      end: async () => {
        db.ended += 1;
      },
    };
    return db;
  }

  test("invite: wypisuje link, kod 0, pula zamknięta, token nie trafia do bazy", async () => {
    const db = fakeDb(async () => ({ rows: [] }));
    const lines = [];
    const code = await runCli({
      argv: ["invite", "Anna@Example.com"],
      env,
      loadEnv: () => {},
      createDb: () => /** @type {any} */ (db),
      log: (line) => lines.push(line),
      clock: () => new Date("2026-10-21T11:00:00Z"),
    });
    assert.equal(code, 0);
    assert.equal(db.ended, 1);
    const output = lines.join("\n");
    const match = output.match(/http:\/\/localhost:3000\/invite\/([A-Za-z0-9_-]{43})/);
    assert.ok(match, output);
    assert.match(output, /Ważny do 04\.11\.2026, 12:00/);
    const insert = db.queries.find((q) => q.text.startsWith("insert into invitations"));
    assert.ok(insert);
    assert.ok(!insert.params.includes(match[1]));
  });

  test("baza nieosiągalna → wspólny komunikat, kod 1, bez stack trace, pula zamknięta", async () => {
    const db = fakeDb(async () => {
      throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" });
    });
    const lines = [];
    const code = await runCli({
      argv: ["sign-in-link", "nobody@example.com"],
      env,
      loadEnv: () => {},
      createDb: () => /** @type {any} */ (db),
      log: (line) => lines.push(line),
    });
    assert.equal(code, 1);
    assert.equal(db.ended, 1);
    assert.deepEqual(lines, [`✖ ${UNREACHABLE_MESSAGE}`]);
  });

  test("zły argument → kod 1 bez wczytywania .env i bez łączenia z bazą", async () => {
    let loaded = false;
    let created = false;
    const lines = [];
    const code = await runCli({
      argv: ["invite"],
      env,
      loadEnv: () => {
        loaded = true;
      },
      createDb: () => {
        created = true;
        return /** @type {any} */ (fakeDb(async () => ({ rows: [] })));
      },
      log: (line) => lines.push(line),
    });
    assert.equal(code, 1);
    assert.equal(loaded, false);
    assert.equal(created, false);
    assert.match(lines[0], /^✖ Podaj adres e-mail/);
  });

  test("brak NEXT_PUBLIC_APP_URL albo DATABASE_URL → czytelny komunikat, kod 1", async () => {
    for (const partialEnv of [{ DATABASE_URL: env.DATABASE_URL }, { NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL }]) {
      const lines = [];
      const code = await runCli({
        argv: ["invite", "anna@example.com"],
        env: partialEnv,
        loadEnv: () => {},
        createDb: () => assert.fail("nie powinno łączyć się z bazą"),
        log: (line) => lines.push(line),
      });
      assert.equal(code, 1);
      assert.match(lines[0], /^✖ Brak (NEXT_PUBLIC_APP_URL|DATABASE_URL)/);
    }
  });

  test("--help → kod 0", async () => {
    const lines = [];
    const code = await runCli({ argv: ["--help"], env: {}, loadEnv: () => {}, log: (l) => lines.push(l) });
    assert.equal(code, 0);
    assert.match(lines[0], /mentor:invite/);
  });
});
