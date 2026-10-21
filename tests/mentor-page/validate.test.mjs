// Testy jednostkowe walidacji strony mentora (spec #14, Implementation Plan Phase 2 krok 5) — bez bazy.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  FIELD_ORDER,
  MESSAGES,
  PRICE_MAX_ZLOTY,
  PRICE_MIN_ZLOTY,
  SLUG_PATTERN,
  currencyLabel,
  isPlaceholderSlug,
  slugFromName,
  validateMentorPage,
} from "../../lib/mentor-page/validate.mjs";
import * as sharedText from "@devmentor/ui/text";

/** 😀 = 1 punkt kodowy, 2 jednostki UTF-16. */
const EMOJI = "😀";

const FULL = Object.freeze({
  displayName: "Anna K.",
  publicWorkUrl: "https://github.com/anna-k",
  description: "Upgrade ingress-nginx do 1.28 w trzech klastrach.\nMigracja do TypeScript 5.",
  price25: "150",
  price50: "280",
  slug: "anna-k",
});

/** @param {Record<string, string>} patch @param {"draft" | "publish"} [mode] */
const run = (patch, mode = "publish", context) => validateMentorPage({ ...FULL, ...patch }, mode, context);

/** @param {ReturnType<typeof validateMentorPage>} result */
function errorsOf(result) {
  assert.equal(result.ok, false, "oczekiwano błędów walidacji");
  return /** @type {{ ok: false, errors: Record<string, string> }} */ (result).errors;
}

describe("validateMentorPage — publikacja", () => {
  test("pełny formularz → wartości znormalizowane, ceny w groszach", () => {
    const result = run({ displayName: "  Anna   K.  ", description: "Linia 1\r\nLinia 2\r\n", price25: " 150 " });
    assert.equal(result.ok, true);
    assert.deepEqual(result.values, {
      displayName: "Anna K.",
      publicWorkUrl: "https://github.com/anna-k",
      description: "Linia 1\nLinia 2",
      price25Minor: 15000,
      price50Minor: 28000,
      slug: "anna-k",
    });
  });

  for (const [field, message] of [
    ["displayName", MESSAGES.displayName],
    ["publicWorkUrl", "Dodaj link do publicznej pracy"],
    ["description", MESSAGES.description],
    ["price25", MESSAGES.price25],
    ["price50", MESSAGES.price50],
  ]) {
    test(`brak pola ${field} → błąd nazywa to pole`, () => {
      const errors = errorsOf(run({ [field]: "" }));
      assert.deepEqual(Object.keys(errors), [field]);
      assert.equal(errors[field], message);
    });
  }

  test("pusty formularz → każde brakujące pole osobno, w kolejności formularza", () => {
    const errors = errorsOf(validateMentorPage({ slug: "" }, "publish"));
    assert.deepEqual(Object.keys(errors), [...FIELD_ORDER]);
    assert.notEqual(errors.price25, errors.price50, "każda cena ma własny komunikat");
  });

  test("brak wejścia (undefined) traktowany jak pusty formularz", () => {
    assert.deepEqual(Object.keys(errorsOf(validateMentorPage(undefined, "publish"))), [...FIELD_ORDER]);
  });

  test("kolejność błędów zgodna z FIELD_ORDER niezależnie od kolejności sprawdzania", () => {
    const errors = errorsOf(run({ slug: "X", price50: "1", displayName: "A" }));
    assert.deepEqual(Object.keys(errors), ["displayName", "price50", "slug"]);
  });

  test("nieznany tryb → TypeError", () => {
    assert.throws(() => validateMentorPage(FULL, /** @type {any} */ ("edit")), TypeError);
  });
});

describe("validateMentorPage — szkic", () => {
  test("tylko imię → ok, reszta null, slug zachowany", () => {
    const result = validateMentorPage({ displayName: "Anna K.", slug: "mentor-k3x7qa" }, "draft");
    assert.equal(result.ok, true);
    assert.deepEqual(result.values, {
      displayName: "Anna K.",
      publicWorkUrl: null,
      description: null,
      price25Minor: null,
      price50Minor: null,
      slug: "mentor-k3x7qa",
    });
  });

  test("opis z samych białych znaków w szkicu → null, bez błędu", () => {
    const result = validateMentorPage({ description: " \n\t ", slug: "anna-k" }, "draft");
    assert.equal(result.ok, true);
    assert.equal(result.values.description, null);
  });

  test("to, co wpisane, musi być poprawne także w szkicu", () => {
    const errors = errorsOf(
      validateMentorPage({ displayName: "A", publicWorkUrl: "github.com/x", price25: "5001", slug: "anna-k" }, "draft"),
    );
    assert.deepEqual(Object.keys(errors), ["displayName", "publicWorkUrl", "price25"]);
  });

  test("slug wymagany także w szkicu", () => {
    assert.equal(errorsOf(validateMentorPage({ displayName: "Anna K." }, "draft")).slug, MESSAGES.slug);
  });
});

describe("imię i nazwisko", () => {
  test("2 i 80 znaków ok; 1 i 81 → błąd", () => {
    assert.equal(run({ displayName: "Al" }).ok, true);
    assert.equal(run({ displayName: "a".repeat(80) }).ok, true);
    assert.equal(errorsOf(run({ displayName: "A" })).displayName, MESSAGES.displayName);
    assert.equal(errorsOf(run({ displayName: "a".repeat(81) })).displayName, MESSAGES.displayName);
  });

  test("emoji liczone jako 1 znak: 80 ok, 81 → błąd", () => {
    assert.equal(run({ displayName: EMOJI.repeat(80) }).ok, true);
    assert.equal(errorsOf(run({ displayName: EMOJI.repeat(81) })).displayName, MESSAGES.displayName);
  });

  test("same spacje na publikacji → błąd", () => {
    assert.equal(errorsOf(run({ displayName: "   " })).displayName, MESSAGES.displayName);
  });
});

describe("link do publicznej pracy", () => {
  for (const url of ["javascript:alert(1)", "mailto:a@b.pl", "ftp://example.com/x", "github.com/x", "//github.com/x",
    "https://", "https://github.com@zly.example/x", "https://user:pass@github.com/x", "https://git hub.com", "http:/github.com"]) {
    test(`odrzucony: ${url}`, () => {
      assert.equal(errorsOf(run({ publicWorkUrl: url })).publicWorkUrl, MESSAGES.publicWorkUrlInvalid);
    });
  }

  // Kontrakt: tylko http(s)://, parsuje się jako URL, ≤ 500 znaków — host bez kropki (localhost, port) też (review).
  for (const url of ["http://example.com", "https://github.com/anna-k?tab=repositories#readme", "HTTPS://Blog.Example.pl/post",
    "https://localhost", "http://localhost:3000/x", "https://github"]) {
    test(`przyjęty: ${url}`, () => {
      const result = run({ publicWorkUrl: `  ${url} ` });
      assert.equal(result.ok, true);
      assert.equal(result.values.publicWorkUrl, url, "zapisujemy przycięty tekst wpisany przez mentora");
    });
  }

  test("500 znaków ok, 501 → błąd długości", () => {
    const base = "https://example.com/";
    assert.equal(run({ publicWorkUrl: base + "a".repeat(500 - base.length) }).ok, true);
    assert.equal(
      errorsOf(run({ publicWorkUrl: base + "a".repeat(501 - base.length) })).publicWorkUrl,
      MESSAGES.publicWorkUrlTooLong,
    );
  });

  test("długość linku liczona w punktach kodowych (emoji = 1)", () => {
    const base = "https://example.com/";
    assert.equal(run({ publicWorkUrl: base + EMOJI.repeat(500 - base.length) }).ok, true);
    assert.equal(
      errorsOf(run({ publicWorkUrl: base + EMOJI.repeat(501 - base.length) })).publicWorkUrl,
      MESSAGES.publicWorkUrlTooLong,
    );
  });
});

describe("opis", () => {
  test("2000 znaków ok, 2001 → błąd", () => {
    assert.equal(run({ description: "x".repeat(2000) }).ok, true);
    assert.equal(errorsOf(run({ description: "x".repeat(2001) })).description, MESSAGES.description);
  });

  test("emoji liczone jako 1 znak: 2000 punktów kodowych ok, 2001 → błąd", () => {
    const ok = "x".repeat(1000) + EMOJI.repeat(1000); // 2000 punktów kodowych, 3000 jednostek UTF-16
    assert.equal(ok.length, 3000);
    assert.equal(run({ description: ok }).ok, true);
    assert.equal(errorsOf(run({ description: ok + EMOJI })).description, MESSAGES.description);
  });

  test("same białe znaki na publikacji → błąd", () => {
    assert.equal(errorsOf(run({ description: " \r\n\t " })).description, MESSAGES.description);
  });

  test("CRLF liczony jako jeden znak (2000 linii z CRLF mieści się w limicie po normalizacji)", () => {
    const text = "a\r\n".repeat(666) + "ab"; // 666*2 + 2 = 1334 po normalizacji
    const result = run({ description: text });
    assert.equal(result.ok, true);
    assert.ok(!result.values.description.includes("\r"));
  });
});

describe("ceny", () => {
  test(`granice ${PRICE_MIN_ZLOTY} i ${PRICE_MAX_ZLOTY} zł → 2000 i 500000 groszy`, () => {
    const result = run({ price25: "20", price50: "5000" });
    assert.equal(result.ok, true);
    assert.equal(result.values.price25Minor, 2000);
    assert.equal(result.values.price50Minor, 500000);
  });

  for (const value of ["19", "5001", "150,50", "150.50", "1e3", "-20", "+150", "0", "150 zł", "1 500", "abc", "٣٠"]) {
    test(`odrzucona cena „${value}”`, () => {
      const errors = errorsOf(run({ price25: value, price50: value }));
      assert.equal(errors.price25, MESSAGES.price25);
      assert.equal(errors.price50, MESSAGES.price50);
    });
  }

  test("pusta cena na publikacji → błąd; w szkicu → null", () => {
    assert.equal(errorsOf(run({ price50: "" })).price50, MESSAGES.price50);
    const draft = run({ price50: "  " }, "draft");
    assert.equal(draft.ok, true);
    assert.equal(draft.values.price50Minor, null);
  });

  test("zera wiodące i spacje dookoła są przyjęte", () => {
    assert.equal(run({ price25: " 0150 " }).values?.price25Minor, 15000);
  });
});

describe("slug", () => {
  for (const slug of ["abc", "a".repeat(40), "anna-k", "a-1", "mentor-k3x7qa", "123"]) {
    test(`poprawny: ${slug}`, () => assert.equal(run({ slug }).ok, true));
  }

  for (const slug of ["Anna-k", "-anna", "anna-", "a".repeat(41), "ab", "", "anna_k", "anna k", "ąna"]) {
    test(`niepoprawny: „${slug}”`, () => assert.equal(errorsOf(run({ slug })).slug, MESSAGES.slug));
  }

  test("SLUG_PATTERN jest regułą z #23", () => {
    assert.equal(SLUG_PATTERN.source, "^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$");
  });

  test("opublikowana strona: ten sam slug ok, zmiana → błąd blokady", () => {
    assert.equal(run({}, "publish", { publishedSlug: "anna-k" }).ok, true);
    assert.equal(errorsOf(run({ slug: "anna-kowalska" }, "publish", { publishedSlug: "anna-k" })).slug, MESSAGES.slugLocked);
  });

  test("publishedSlug null/undefined → zwykła walidacja", () => {
    assert.equal(run({ slug: "nowy-adres" }, "publish", { publishedSlug: null }).ok, true);
  });
});

describe("slugFromName", () => {
  const cases = [
    ["Anna K.", "anna-k"],
    ["Łukasz Żółć", "lukasz-zolc"],
    ["Ąę Śćń Źż Ół", "ae-scn-zz-ol"],
    ["  --Jan__Nowak!!  ", "jan-nowak"],
    ["Zoë Ångström", "zoe-angstrom"],
    ["DevOps 2026", "devops-2026"],
  ];
  for (const [name, slug] of cases) {
    test(`„${name}” → „${slug}”`, () => assert.equal(slugFromName(name), slug));
  }

  test("maks. 40 znaków, bez myślnika na końcu po przycięciu", () => {
    const slug = slugFromName("a".repeat(39) + " bcd");
    assert.equal(slug, "a".repeat(39));
    assert.ok(SLUG_PATTERN.test(String(slug)));
    assert.equal(slugFromName("x".repeat(60))?.length, 40);
  });

  for (const name of ["🚀🔥", "!!! ???", "", "Al", "Ł.", undefined]) {
    test(`brak sensownego sluga → null (${JSON.stringify(name)})`, () => assert.equal(slugFromName(name), null));
  }
});

describe("currencyLabel", () => {
  test("PLN → zł", () => assert.equal(currencyLabel("PLN"), "zł"));
  test("nieznany kod → sam kod", () => {
    assert.equal(currencyLabel("EUR"), "EUR");
    assert.equal(currencyLabel("toString"), "toString");
  });
});

describe("isPlaceholderSlug", () => {
  test("mentor- + 6 znaków base32 → true", () => {
    assert.equal(isPlaceholderSlug("mentor-k3x7qa"), true);
    assert.equal(isPlaceholderSlug("mentor-abcdef"), true);
  });
  for (const slug of ["mentor-k3x7q", "mentor-k3x7qab", "mentor-k3x7q1", "mentor-K3X7QA", "anna-k", "xmentor-abcdef", null]) {
    test(`nie placeholder: ${JSON.stringify(slug)}`, () => assert.equal(isPlaceholderSlug(slug), false));
  }
});

describe("komunikaty (C12)", () => {
  test("bez form nacechowanych płciowo", () => {
    for (const message of Object.values(MESSAGES)) {
      assert.doesNotMatch(message, /(?:eś|aś|łeś|łaś)(?![a-ząćęłńóśźż])/i, message);
    }
  });
  test("wzorzec C12 łapie formy nacechowane (kontrola samego testu)", () => {
    assert.match("Opublikowałaś stronę", /(?:eś|aś|łeś|łaś)(?![a-ząćęłńóśźż])/i);
    assert.match("Zapisałeś", /(?:eś|aś|łeś|łaś)(?![a-ząćęłńóśźż])/i);
  });
  test("każde pole ma niepusty komunikat", () => {
    for (const message of Object.values(MESSAGES)) assert.ok(message.trim().length > 0);
  });
});

describe("komunikaty serwera = komunikaty DS w przeglądarce (zadanie 3.4)", () => {
  test("każdy komunikat pola z MESSAGES występuje dosłownie w validateMentorPage z DS", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../../packages/ui/src/product/e01/Mentor.tsx", import.meta.url), "utf8");
    // slugLocked i slugTaken zna tylko serwer (blokada po publikacji, unikalność w bazie) — DS pokazuje je jako błąd z serwera.
    const clientSide = ["displayName", "publicWorkUrlMissing", "publicWorkUrlInvalid", "publicWorkUrlTooLong", "description", "price25", "price50", "slug"];
    for (const key of clientSide) {
      assert.ok(source.includes(`"${MESSAGES[key]}"`), `${key}: „${MESSAGES[key]}” nie występuje w Mentor.tsx`);
    }
  });
});

describe("wspólny moduł reguł tekstu (@devmentor/ui/text) — ten sam w przeglądarce i na serwerze", () => {
  test("textLength liczy punkty kodowe Unicode", () => {
    assert.equal(sharedText.textLength(""), 0);
    assert.equal(sharedText.textLength("Łódź"), 4);
    assert.equal(sharedText.textLength(EMOJI), 1);
    assert.equal(sharedText.textLength(EMOJI.repeat(2000)), 2000);
  });

  test("limity serwera to limity wspólnego modułu", async () => {
    const server = await import("../../lib/mentor-page/validate.mjs");
    for (const name of ["DISPLAY_NAME_MIN", "DISPLAY_NAME_MAX", "PUBLIC_WORK_URL_MAX", "DESCRIPTION_MAX", "textLength"]) {
      assert.equal(server[name], sharedText[name], name);
    }
  });

  test("publicWorkUrlProblem: localhost i port przyjęte, dane logowania i białe znaki odrzucone", () => {
    assert.equal(sharedText.publicWorkUrlProblem("https://localhost"), null);
    assert.equal(sharedText.publicWorkUrlProblem("http://localhost:3000/x"), null);
    assert.equal(sharedText.publicWorkUrlProblem("https://a@b.example"), "invalid");
    assert.equal(sharedText.publicWorkUrlProblem("https://a b.example"), "invalid");
    assert.equal(sharedText.publicWorkUrlProblem("https://example.com/" + "a".repeat(481)), "tooLong");
  });

  test("walidacja DS w przeglądarce (Mentor.tsx) korzysta z tego samego modułu, bez własnego liczenia długości", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../../packages/ui/src/product/e01/Mentor.tsx", import.meta.url), "utf8");
    assert.match(source, /from "\.\.\/\.\.\/lib\/text\.mjs"/);
    const start = source.indexOf("export function validateMentorPage");
    const body = source.slice(start, source.indexOf("\n}\n", start));
    for (const fn of ["textLength(", "publicWorkUrlProblem(", "normalizeDisplayName(", "normalizeDescription("]) {
      assert.ok(body.includes(fn), `validateMentorPage w DS nie używa ${fn}`);
    }
    assert.ok(!/\b(?:name|url|description)\.length\b/.test(body), "DS liczy długość pola po swojemu (.length)");
  });
});
