// MENTOR-PAGE-003 — scenariusz: .ai/qa/MENTOR-PAGE/MENTOR-PAGE-003-kolizja-sluga-przy-publikacji.md
// Niestandardowy: dwie osoby chcą ten sam adres /m/{slug}. Unikalność pilnuje baza (`mentor_pages_slug_key`),
// a UI pokazuje „Ten adres jest zajęty” przy polu (spec #14 Edge Cases, `fieldErrorsFromDbError`).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  accessibleDescription,
  field,
  fillEditor,
  openHarness,
  pageRow,
  signedInMentor,
  skip,
  uniqueEmail,
} from "./support/mentor.mjs";

const SLUG_TAKEN = "Ten adres jest zajęty";

describe("MENTOR-PAGE-003: kolizja adresu strony", { skip }, () => {
  /** @type {Awaited<ReturnType<typeof openHarness>>} */
  let h;
  before(async () => {
    h = await openHarness();
  });
  after(async () => {
    await h?.close();
  });

  test("odmawia publikacji pod adresem zajętym przez inną mentorkę — „Ten adres jest zajęty”, strona pierwszej bez zmian", async () => {
    const slug = `zajety-${Date.now().toString(36)}`;
    const complete = {
      publicWorkUrl: "https://github.com/devmentor-e2e",
      description: "Code review i pair programming w TypeScript.",
      price25: "120",
      price50: "220",
      slug,
    };
    // Given: mentorka A opublikowała stronę pod adresem `slug`; mentorka B ma szkic
    const a = await signedInMentor(h.browser, h.db, uniqueEmail("slug-owner"));
    const b = await signedInMentor(h.browser, h.db, uniqueEmail("slug-second"));
    try {
      await fillEditor(a.page, { displayName: "Alicja Pierwsza", ...complete });
      await a.page.getByRole("button", { name: "Opublikuj stronę" }).click();
      await a.page.getByRole("textbox", { name: "Twój link" }).waitFor();
      const ownerBefore = await pageRow(h.db, a.mentorId);
      const secondBefore = await pageRow(h.db, b.mentorId);

      // When: mentorka B wypełnia stronę z tym samym adresem i klika „Opublikuj stronę”
      await fillEditor(b.page, { displayName: "Beata Druga", ...complete });
      await b.page.getByRole("button", { name: "Opublikuj stronę" }).click();

      // Then: błąd przy polu „Adres strony”, dane B zostają, B bez publikacji, strona A nietknięta
      await b.page.getByText(SLUG_TAKEN, { exact: true }).waitFor();
      assert.match(await accessibleDescription(field(b.page, "Adres strony")), new RegExp(SLUG_TAKEN));
      assert.equal(await field(b.page, "Imię i nazwisko").inputValue(), "Beata Druga");
      assert.equal(await field(b.page, "Adres strony").inputValue(), slug);
      assert.equal(await b.page.getByRole("textbox", { name: "Twój link" }).count(), 0);
      assert.deepEqual(await pageRow(h.db, b.mentorId), secondBefore);
      assert.deepEqual(await pageRow(h.db, a.mentorId), ownerBefore);
      assert.equal(ownerBefore.slug, slug);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });
});
