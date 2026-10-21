// Testy jednostkowe czystych helperów zapisu strony mentora (bez bazy): link do udostępnienia, filtr wejścia,
// wartości formularza, mapowanie błędów bazy, `unauthorized` bez sesji (L6/Z7).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  fieldErrorsFromDbError,
  pickMentorPageInput,
  saveMentorPageForSession,
  shareUrlFor,
  toFormValues,
  unauthorizedResult,
} from "../../lib/mentor-page/mentor-page.mjs";
import { MESSAGES } from "../../lib/mentor-page/validate.mjs";

describe("shareUrlFor", () => {
  test("${appUrl}/m/${slug}, końcowe ukośniki adresu usunięte", () => {
    assert.equal(shareUrlFor("http://localhost:3000", "anna-k"), "http://localhost:3000/m/anna-k");
    assert.equal(shareUrlFor("https://devmentor.example//", "anna-k"), "https://devmentor.example/m/anna-k");
  });
  test("brak adresu aplikacji → błąd", () => {
    assert.throws(() => shareUrlFor("", "anna-k"), /NEXT_PUBLIC_APP_URL/);
    assert.throws(() => shareUrlFor(/** @type {any} */ (undefined), "anna-k"), /NEXT_PUBLIC_APP_URL/);
  });
});

describe("pickMentorPageInput", () => {
  test("tylko znane pola-napisy; mentorId, id, currency, publishedAt pomijane", () => {
    const picked = pickMentorPageInput({
      displayName: "Anna",
      slug: "anna-k",
      price25: 150,
      mentorId: "b",
      id: "x",
      currency: "EUR",
      publishedAt: null,
    });
    assert.deepEqual(picked, { displayName: "Anna", slug: "anna-k" });
  });
  test("odziedziczone właściwości i nie-obiekty ignorowane", () => {
    assert.deepEqual(pickMentorPageInput(Object.create({ displayName: "Anna" })), {});
    for (const input of [null, undefined, "x", 1, ["Anna"]]) assert.deepEqual(pickMentorPageInput(input), {});
  });
});

test("toFormValues: null → \"\", grosze → pełne złote", () => {
  assert.deepEqual(
    toFormValues({
      slug: "mentor-abcdef",
      displayName: null,
      publicWorkUrl: "https://github.com/a",
      description: null,
      price25Minor: 15000,
      price50Minor: null,
      currency: "PLN",
      publishedAt: null,
      isPlaceholderSlug: true,
    }),
    { displayName: "", publicWorkUrl: "https://github.com/a", description: "", price25: "150", price50: "", slug: "mentor-abcdef" },
  );
});

describe("fieldErrorsFromDbError", () => {
  test("unikalność sluga → „Ten adres jest zajęty”", () => {
    assert.deepEqual(fieldErrorsFromDbError({ code: "23505", constraint: "mentor_pages_slug_key" }), {
      slug: "Ten adres jest zajęty",
    });
  });
  test("CHECK-i pól → błędy pól", () => {
    assert.deepEqual(fieldErrorsFromDbError({ code: "23514", constraint: "mentor_pages_slug_format" }), { slug: MESSAGES.slug });
    assert.deepEqual(fieldErrorsFromDbError({ code: "23514", constraint: "mentor_pages_price_25_minor_positive" }), {
      price25: MESSAGES.price25,
    });
    assert.deepEqual(fieldErrorsFromDbError({ code: "23514", constraint: "mentor_pages_price_50_minor_positive" }), {
      price50: MESSAGES.price50,
    });
  });
  test("inne błędy → null (rzucane dalej)", () => {
    assert.equal(fieldErrorsFromDbError({ code: "23514", constraint: "published_requires_content" }), null);
    assert.equal(fieldErrorsFromDbError({ code: "23505", constraint: "mentor_pages_mentor_id_key" }), null);
    assert.equal(fieldErrorsFromDbError(new Error("x")), null);
    assert.equal(fieldErrorsFromDbError(null), null);
  });
});

describe("saveMentorPageForSession — brak sesji", () => {
  const untouchableDb = new Proxy(
    {},
    {
      get() {
        throw new Error("baza nie powinna być używana bez sesji");
      },
    },
  );
  for (const mentor of [null, undefined, { mentorId: "" }]) {
    test(`mentor = ${JSON.stringify(mentor)} → { ok: false, reason: "unauthorized" }, baza nietknięta`, async () => {
      const result = await saveMentorPageForSession({
        db: /** @type {any} */ (untouchableDb),
        mentor,
        input: { displayName: "Anna" },
        publish: true,
        appUrl: "http://localhost:3000",
      });
      assert.deepEqual(result, { ok: false, reason: "unauthorized" });
    });
  }
  test("unauthorizedResult zwraca świeży obiekt", () => {
    assert.notEqual(unauthorizedResult(), unauthorizedResult());
  });
});
