// Zapis i odczyt strony mentora z bazą (spec #14, Implementation Plan Phase 2 krok 6; Edge Cases: wyścig
// o slug, edycje po publikacji; Risks: test złego zakresu A/B). Czas zawsze jawny (`NOW`, `LATER`).
// Ścieżka `unauthorized` server action: test jednostkowy `saveMentorPageForSession`
// (tests/mentor-page/mentor-page.test.mjs) + e2e w zadaniu 3.4.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptInvitation } from "../../lib/auth/mentor-auth.mjs";
import {
  getMentorPageForEditor,
  saveMentorPage,
  saveMentorPageForSession,
} from "../../lib/mentor-page/mentor-page.mjs";
import { MESSAGES } from "../../lib/mentor-page/validate.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";
import { describeDb } from "./harness.mjs";

const APP_URL = "http://localhost:3000";
const NOW = new Date("2026-10-21T10:00:00.000Z");
const LATER = new Date("2026-10-22T09:30:00.000Z");
const MUCH_LATER = new Date("2026-10-25T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

const FULL = Object.freeze({
  displayName: "Anna K.",
  publicWorkUrl: "https://github.com/anna-k",
  description: "Upgrade ingress-nginx do 1.28 w trzech klastrach.",
  price25: "150",
  price50: "280",
});

let counter = 0;
const unique = (label) => `${label}-${(counter += 1)}`;

describeDb("mentor-page: zapis szkicu, publikacja i edycja po publikacji", (db) => {
  /** Nowy mentor przez zaproszenie + akceptację (strona szkicu z losowym slugiem). */
  const newMentor = async (label = "mentor") => {
    const email = `${unique(label)}@example.com`;
    const { url } = await createInvitation({ db: db.pool, email, appUrl: APP_URL, now: new Date(NOW.getTime() - HOUR_MS) });
    const token = url.slice(url.lastIndexOf("/") + 1);
    const result = await acceptInvitation({ db: db.pool, token, now: new Date(NOW.getTime() - HOUR_MS) });
    assert.equal(result.ok, true);
    return result.mentorId;
  };

  const pageRow = async (mentorId) =>
    (await db.query("select * from mentor_pages where mentor_id = $1", [mentorId])).rows[0];

  const save = (mentorId, input, { publish = false, now = NOW } = {}) =>
    saveMentorPage({ db: db.pool, mentorId, input, publish, now, appUrl: APP_URL });

  /** Nowy mentor z opublikowaną stroną pod podanym slugiem. */
  const publishedMentor = async (slug) => {
    const mentorId = await newMentor();
    const result = await save(mentorId, { ...FULL, slug }, { publish: true });
    assert.deepEqual(result, { ok: true, published: true, shareUrl: `${APP_URL}/m/${slug}` });
    return mentorId;
  };

  // ---------------------------------------------------------------- szkic

  test("szkic z częściową treścią: zapisany, published_at null, bez linku", async () => {
    const mentorId = await newMentor();
    const before = await pageRow(mentorId);
    const result = await save(mentorId, { displayName: "Anna K.", price25: "150", slug: before.slug });
    assert.deepEqual(result, { ok: true, published: false });
    const row = await pageRow(mentorId);
    assert.equal(row.display_name, "Anna K.");
    assert.equal(row.price_25_minor, 15000);
    assert.equal(row.public_work_url, null);
    assert.equal(row.description, null);
    assert.equal(row.price_50_minor, null);
    assert.equal(row.published_at, null);
    assert.equal(row.slug, before.slug);
    assert.equal(row.updated_at.getTime(), NOW.getTime());
  });

  test("szkic: błędna wartość odrzucona, wiersz bez zmian", async () => {
    const mentorId = await newMentor();
    const before = await pageRow(mentorId);
    const result = await save(mentorId, { publicWorkUrl: "ftp://x.example", slug: before.slug });
    assert.deepEqual(result, { ok: false, errors: { publicWorkUrl: MESSAGES.publicWorkUrlInvalid } });
    assert.deepEqual(await pageRow(mentorId), before);
  });

  // ---------------------------------------------------------------- publikacja

  test("publikacja: zwraca ${appUrl}/m/{slug}, ustawia published_at = now, ceny w groszach", async () => {
    const mentorId = await newMentor();
    const result = await save(mentorId, { ...FULL, slug: "anna-k" }, { publish: true });
    assert.deepEqual(result, { ok: true, published: true, shareUrl: `${APP_URL}/m/anna-k` });
    const row = await pageRow(mentorId);
    assert.equal(row.slug, "anna-k");
    assert.equal(row.published_at.getTime(), NOW.getTime());
    assert.equal(row.price_25_minor, 15000);
    assert.equal(row.price_50_minor, 28000);
    assert.equal(row.currency, "PLN");
  });

  test("shareUrl bez podwójnego ukośnika, gdy appUrl kończy się na /", async () => {
    const mentorId = await newMentor();
    const result = await saveMentorPage({
      db: db.pool,
      mentorId,
      input: { ...FULL, slug: unique("ukosnik") },
      publish: true,
      now: NOW,
      appUrl: `${APP_URL}/`,
    });
    assert.equal(result.ok, true);
    assert.match(result.shareUrl, /^http:\/\/localhost:3000\/m\/ukosnik-\d+$/);
  });

  for (const [field, message] of [
    ["publicWorkUrl", MESSAGES.publicWorkUrlMissing],
    ["description", MESSAGES.description],
  ]) {
    test(`publikacja z pustym polem ${field} odrzucona z nazwą pola, wiersz bez zmian`, async () => {
      const mentorId = await newMentor();
      const before = await pageRow(mentorId);
      const result = await save(mentorId, { ...FULL, [field]: "   ", slug: unique("pusty") }, { publish: true });
      assert.deepEqual(result, { ok: false, errors: { [field]: message } });
      assert.deepEqual(await pageRow(mentorId), before);
    });
  }

  test("ceny w groszach; waluta zostaje PLN, nawet gdy wejście mówi EUR", async () => {
    const mentorId = await newMentor();
    const result = await save(mentorId, { ...FULL, price25: "20", price50: "5000", currency: "EUR", slug: unique("waluta") }, { publish: true });
    assert.equal(result.ok, true);
    const row = await pageRow(mentorId);
    assert.equal(row.price_25_minor, 2000);
    assert.equal(row.price_50_minor, 500000);
    assert.equal(row.currency, "PLN");
  });

  // ---------------------------------------------------------------- po publikacji

  test("zmiana sluga po publikacji odrzucona, slug bez zmian", async () => {
    const slug = unique("staly");
    const mentorId = await publishedMentor(slug);
    const before = await pageRow(mentorId);
    for (const publish of [false, true]) {
      const result = await save(mentorId, { ...FULL, slug: unique("inny") }, { publish, now: LATER });
      assert.deepEqual(result, { ok: false, errors: { slug: MESSAGES.slugLocked } });
    }
    assert.deepEqual(await pageRow(mentorId), before);
  });

  test("ponowna publikacja zachowuje pierwotne published_at", async () => {
    const slug = unique("drugi-raz");
    const mentorId = await publishedMentor(slug);
    const result = await save(mentorId, { ...FULL, description: "Nowy opis", slug }, { publish: true, now: LATER });
    assert.deepEqual(result, { ok: true, published: true, shareUrl: `${APP_URL}/m/${slug}` });
    const row = await pageRow(mentorId);
    assert.equal(row.published_at.getTime(), NOW.getTime());
    assert.equal(row.updated_at.getTime(), LATER.getTime());
  });

  test("edycja opisu po publikacji („Zapisz”, publish=false): zapisana, strona nadal opublikowana", async () => {
    const slug = unique("edycja");
    const mentorId = await publishedMentor(slug);
    const result = await save(mentorId, { ...FULL, description: "Migracja 40 tys. linii do TypeScript 5.", slug }, { now: LATER });
    assert.deepEqual(result, { ok: true, published: true, shareUrl: `${APP_URL}/m/${slug}` });
    const row = await pageRow(mentorId);
    assert.equal(row.description, "Migracja 40 tys. linii do TypeScript 5.");
    assert.equal(row.published_at.getTime(), NOW.getTime());
  });

  test("wyczyszczenie opisu po publikacji odrzucone (także jako szkic), opublikowany wiersz bez zmian", async () => {
    const slug = unique("czysc");
    const mentorId = await publishedMentor(slug);
    const before = await pageRow(mentorId);
    for (const publish of [false, true]) {
      const result = await save(mentorId, { ...FULL, description: "", slug }, { publish, now: LATER });
      assert.deepEqual(result, { ok: false, errors: { description: MESSAGES.description } });
    }
    assert.deepEqual(await pageRow(mentorId), before);
  });

  // ---------------------------------------------------------------- slug zajęty

  test("slug zajęty przez innego mentora → „Ten adres jest zajęty”, nic nie zapisane", async () => {
    const taken = unique("zajety");
    await publishedMentor(taken);
    const mentorId = await newMentor();
    const before = await pageRow(mentorId);
    for (const publish of [true, false]) {
      const result = await save(mentorId, { ...FULL, description: "Inny opis", slug: taken }, { publish, now: LATER });
      assert.deepEqual(result, { ok: false, errors: { slug: "Ten adres jest zajęty" } });
    }
    assert.deepEqual(await pageRow(mentorId), before);
  });

  test("równoczesna publikacja dwóch mentorów z tym samym slugiem: wygrywa dokładnie jeden", async () => {
    const slug = unique("wyscig");
    const [a, b] = [await newMentor("a"), await newMentor("b")];
    const before = { [a]: await pageRow(a), [b]: await pageRow(b) };
    const results = await Promise.all(
      [a, b].map((mentorId) => save(mentorId, { ...FULL, slug }, { publish: true })),
    );
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    assert.equal(winners.length, 1);
    assert.deepEqual(winners[0], { ok: true, published: true, shareUrl: `${APP_URL}/m/${slug}` });
    assert.equal(losers.length, 1);
    assert.deepEqual(losers[0], { ok: false, errors: { slug: "Ten adres jest zajęty" } });
    const loserId = results[0].ok ? b : a;
    assert.deepEqual(await pageRow(loserId), before[loserId]);
    const { rows } = await db.query("select mentor_id from mentor_pages where slug = $1", [slug]);
    assert.deepEqual(rows, [{ mentor_id: results[0].ok ? a : b }]);
  });

  // ---------------------------------------------------------------- zakres mentora (A/B)

  test("zły zakres: zapis mentora A nigdy nie zmienia strony B, także z mentorId/id B w wejściu", async () => {
    const slugB = unique("strona-b");
    const b = await publishedMentor(slugB);
    const a = await newMentor("a");
    const pageB = await pageRow(b);
    const pageA = await pageRow(a);
    const allBefore = (await db.query("select * from mentor_pages where mentor_id <> $1 order by id", [a])).rows;

    const hostile = {
      ...FULL,
      description: "Opis A",
      slug: unique("strona-a"),
      mentorId: b,
      mentor_id: b,
      id: pageB.id,
      pageId: pageB.id,
      publishedAt: null,
    };
    const result = await save(a, hostile, { publish: true, now: LATER });
    assert.equal(result.ok, true);

    // Strona B (i każda inna niż A) bajt w bajt bez zmian.
    const allAfter = (await db.query("select * from mentor_pages where mentor_id <> $1 order by id", [a])).rows;
    assert.deepEqual(allAfter, allBefore);
    assert.deepEqual(await pageRow(b), pageB);
    // Zmieniła się wyłącznie strona A (ten sam wiersz, to samo id).
    const afterA = await pageRow(a);
    assert.equal(afterA.id, pageA.id);
    assert.equal(afterA.mentor_id, a);
    assert.equal(afterA.description, "Opis A");
    assert.equal(afterA.published_at.getTime(), LATER.getTime());
  });

  test("zły zakres: mentor A nie może przejąć sluga B ani wyczyścić strony B", async () => {
    const slugB = unique("cudzy");
    const b = await publishedMentor(slugB);
    const a = await newMentor("a");
    const pageB = await pageRow(b);
    const result = await save(a, { mentorId: b, id: pageB.id, slug: slugB }, { now: MUCH_LATER });
    assert.deepEqual(result, { ok: false, errors: { slug: "Ten adres jest zajęty" } });
    assert.deepEqual(await pageRow(b), pageB);
  });

  // ---------------------------------------------------------------- odczyt dla edytora

  test("getMentorPageForEditor zwraca tylko własną stronę, bez id", async () => {
    const slugB = unique("odczyt-b");
    const b = await publishedMentor(slugB);
    const a = await newMentor("a");
    const placeholder = (await pageRow(a)).slug;

    const own = await getMentorPageForEditor({ db: db.pool, mentorId: a });
    assert.deepEqual(own, {
      slug: placeholder,
      displayName: null,
      publicWorkUrl: null,
      description: null,
      price25Minor: null,
      price50Minor: null,
      currency: "PLN",
      publishedAt: null,
      isPlaceholderSlug: true,
    });

    const other = await getMentorPageForEditor({ db: db.pool, mentorId: b });
    assert.equal(other.slug, slugB);
    assert.equal(other.isPlaceholderSlug, false);
    assert.equal(other.publishedAt.getTime(), NOW.getTime());
    assert.equal(other.price25Minor, 15000);

    assert.equal(
      await getMentorPageForEditor({ db: db.pool, mentorId: "00000000-0000-4000-8000-000000000000" }),
      null,
    );
  });

  // ---------------------------------------------------------------- brak sesji

  test("saveMentorPageForSession bez mentora → unauthorized, nic nie zapisane", async () => {
    const before = (await db.query("select * from mentor_pages order by id")).rows;
    for (const mentor of [null, undefined, { mentorId: "" }]) {
      const result = await saveMentorPageForSession({
        db: db.pool,
        mentor,
        input: { ...FULL, slug: unique("bez-sesji") },
        publish: true,
        now: NOW,
        appUrl: APP_URL,
      });
      assert.deepEqual(result, { ok: false, reason: "unauthorized" });
    }
    assert.deepEqual((await db.query("select * from mentor_pages order by id")).rows, before);
  });

  test("saveMentorPageForSession z mentorem: publish liczy się tylko jako true", async () => {
    const mentorId = await newMentor();
    const result = await saveMentorPageForSession({
      db: db.pool,
      mentor: { mentorId },
      input: { ...FULL, slug: unique("tylko-true") },
      publish: "true",
      now: NOW,
      appUrl: APP_URL,
    });
    assert.deepEqual(result, { ok: true, published: false });
    assert.equal((await pageRow(mentorId)).published_at, null);
  });
});
