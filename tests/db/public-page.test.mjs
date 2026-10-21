// Publiczna strona mentora — odczyt po slugu (spec #16, Implementation Plan Phase 1 krok 1; Q4, Q5;
// Risks: test przypina klucze DTO). Strony tworzone przez zaproszenie + `saveMentorPage`, czas jawny.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptInvitation } from "../../lib/auth/mentor-auth.mjs";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { getPublishedPageBySlug, PUBLIC_PAGE_KEYS } from "../../lib/mentor-page/public.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";
import { describeDb } from "./harness.mjs";

const APP_URL = "http://localhost:3000";
const NOW = new Date("2026-10-21T10:00:00.000Z");
const EARLIER = new Date("2026-10-21T09:00:00.000Z");

const ALLOWLIST = ["displayName", "publicWorkUrl", "description", "price25Minor", "price50Minor", "currency", "slug"];

const FULL = Object.freeze({
  displayName: "Anna K.",
  publicWorkUrl: "https://github.com/anna-k",
  description: "Migrowałam dwa duże projekty na server components.",
  price25: "150",
  price50: "280",
});

let counter = 0;
const unique = (label) => `${label}-${(counter += 1)}`;

describeDb("public-page: getPublishedPageBySlug", (db) => {
  const newMentor = async () => {
    const email = `${unique("public")}@example.com`;
    const { url } = await createInvitation({ db: db.pool, email, appUrl: APP_URL, now: EARLIER });
    const token = url.slice(url.lastIndexOf("/") + 1);
    const result = await acceptInvitation({ db: db.pool, token, now: EARLIER });
    assert.equal(result.ok, true);
    return result.mentorId;
  };

  const save = (mentorId, input, publish) =>
    saveMentorPage({ db: db.pool, mentorId, input, publish, now: NOW, appUrl: APP_URL });

  const publishedMentor = async (slug, overrides = {}) => {
    const mentorId = await newMentor();
    const result = await save(mentorId, { ...FULL, ...overrides, slug }, true);
    assert.equal(result.ok, true);
    return mentorId;
  };

  /** Pula opakowana szpiegiem: zapisuje tekst każdego zapytania. */
  const spyDb = () => {
    const calls = [];
    return {
      calls,
      query: (text, params) => {
        calls.push(typeof text === "string" ? text : text.text);
        return db.pool.query(text, params);
      },
    };
  };

  test("opublikowana strona: publiczne dane + osobno mentorId", async () => {
    const mentorId = await publishedMentor("anna-public");
    const result = await getPublishedPageBySlug({ db: db.pool, slug: "anna-public" });
    assert.deepEqual(result, {
      page: {
        displayName: "Anna K.",
        publicWorkUrl: "https://github.com/anna-k",
        description: FULL.description,
        price25Minor: 15000,
        price50Minor: 28000,
        currency: "PLN",
        slug: "anna-public",
      },
      mentorId,
    });
  });

  test("DTO zawiera dokładnie klucze z allowlisty (bez e-maila, strefy, id, dat)", async () => {
    await publishedMentor("keys-public");
    const result = await getPublishedPageBySlug({ db: db.pool, slug: "keys-public" });
    assert.ok(result);
    assert.deepEqual(Object.keys(result.page), ALLOWLIST);
    assert.deepEqual([...PUBLIC_PAGE_KEYS], ALLOWLIST);
    assert.deepEqual(Object.keys(result).sort(), ["mentorId", "page"]);
    const serialized = JSON.stringify(result.page);
    for (const forbidden of ["@example.com", "mentorId", "mentor_id", "time_zone", "timeZone", "published", "created", "updated", result.mentorId]) {
      assert.equal(serialized.includes(forbidden), false, `DTO nie może zawierać: ${forbidden}`);
    }
  });

  test("ceny są liczbami", async () => {
    await publishedMentor("prices-public", { price25: "99", price50: "180" });
    const { page } = await getPublishedPageBySlug({ db: db.pool, slug: "prices-public" });
    assert.equal(typeof page.price25Minor, "number");
    assert.equal(typeof page.price50Minor, "number");
    assert.equal(page.price25Minor, 9900);
    assert.equal(page.price50Minor, 18000);
  });

  test("szkic → null (nawet z pełną treścią)", async () => {
    const mentorId = await newMentor();
    const result = await save(mentorId, { ...FULL, slug: "draft-public" }, false);
    assert.deepEqual(result, { ok: true, published: false });
    assert.equal(await getPublishedPageBySlug({ db: db.pool, slug: "draft-public" }), null);
  });

  test("nieznany slug → null", async () => {
    assert.equal(await getPublishedPageBySlug({ db: db.pool, slug: "nie-ma-takiego" }), null);
  });

  test("niepoprawny slug → null bez zapytania do bazy", async () => {
    const spy = spyDb();
    for (const slug of ["Anna-K", "../x", "a".repeat(41), "", "ab", "-abc", "abc-", "anna k", undefined, null, 42]) {
      assert.equal(await getPublishedPageBySlug({ db: spy, slug }), null, `slug: ${String(slug)}`);
    }
    assert.equal(spy.calls.length, 0);
  });

  test("slug o długości 40 jest poprawny", async () => {
    const slug = "a".repeat(40);
    await publishedMentor(slug);
    const result = await getPublishedPageBySlug({ db: db.pool, slug });
    assert.equal(result?.page.slug, slug);
  });

  test("po edycji zwracany jest nowy opis (bez cache)", async () => {
    const mentorId = await publishedMentor("edit-public");
    const first = await getPublishedPageBySlug({ db: db.pool, slug: "edit-public" });
    assert.equal(first?.page.description, FULL.description);
    const result = await save(mentorId, { ...FULL, description: "Nowy opis po edycji.", slug: "edit-public" }, false);
    assert.equal(result.ok, true);
    const second = await getPublishedPageBySlug({ db: db.pool, slug: "edit-public" });
    assert.equal(second?.page.description, "Nowy opis po edycji.");
  });

  test("jedno zapytanie, tylko mentor_pages, z published_at is not null, bez select *", async () => {
    await publishedMentor("sql-public");
    const spy = spyDb();
    const result = await getPublishedPageBySlug({ db: spy, slug: "sql-public" });
    assert.ok(result);
    assert.equal(spy.calls.length, 1);
    const sql = spy.calls[0].toLowerCase().replace(/\s+/g, " ");
    assert.match(sql, /\bfrom mentor_pages\b/);
    assert.doesNotMatch(sql, /\bmentors\b/, "zapytanie nie może dotykać tabeli mentors");
    assert.doesNotMatch(sql, /\bjoin\b/);
    assert.doesNotMatch(sql, /select \*|\.\*/);
    assert.doesNotMatch(sql, /\bemail\b|\btime_zone\b/);
    assert.match(sql, /published_at is not null/);
    assert.match(sql, /slug = \$1/);
  });
});
