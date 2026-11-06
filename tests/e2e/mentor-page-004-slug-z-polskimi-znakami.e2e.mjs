// MENTOR-PAGE-004 — scenariusz: .ai/qa/MENTOR-PAGE/MENTOR-PAGE-004-slug-z-polskimi-znakami.md
// Niestandardowy: imię z polskimi znakami (ł, ż, ó, ć, ś, ę) → propozycja adresu w ASCII (Z10, `slugFromName`),
// publikacja i publiczna strona pod tym adresem z imieniem zapisanym poprawnie po polsku.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { BASE_URL, field, fillEditor, newTab, openHarness, pageRow, signedInMentor, skip, uniqueEmail } from "./support/mentor.mjs";

const NAME = "Łukasz Żółć-Ślęzak";
const SLUG = "lukasz-zolc-slezak";

describe("MENTOR-PAGE-004: adres strony z imienia z polskimi znakami", { skip }, () => {
  /** @type {Awaited<ReturnType<typeof openHarness>>} */
  let h;
  before(async () => {
    h = await openHarness();
  });
  after(async () => {
    await h?.close();
  });

  test("proponuje adres bez polskich znaków i publikuje stronę, którą deweloper otwiera pod tym adresem", async () => {
    // Given: zalogowany mentor na pierwszej wizycie (adres zastępczy mentor-xxxxxx)
    const { context, page, mentorId } = await signedInMentor(h.browser, h.db, uniqueEmail("polish-slug"));
    try {
      // When: wpisuje imię z polskimi znakami
      await field(page, "Imię i nazwisko").fill(NAME);
      // Then: propozycja adresu to transliteracja ASCII
      assert.equal(await field(page, "Adres strony").inputValue(), SLUG);

      // When: zostawia propozycję, uzupełnia resztę i publikuje
      await fillEditor(page, {
        publicWorkUrl: "https://github.com/lukasz-zolc",
        description: "Wydajność PostgreSQL: indeksy częściowe, partycjonowanie, VACUUM.",
        price25: "180",
        price50: "320",
      });
      await page.getByRole("button", { name: "Opublikuj stronę" }).click();
      // Then: link do udostępnienia i baza z tym adresem, imię w bazie z polskimi znakami
      const link = page.getByRole("textbox", { name: "Twój link" });
      await link.waitFor();
      assert.equal(await link.inputValue(), `${BASE_URL}/m/${SLUG}`);
      const row = await pageRow(h.db, mentorId);
      assert.equal(row.slug, SLUG);
      assert.equal(row.display_name, NAME);

      // … deweloper (inna przeglądarka, bez sesji) otwiera link i widzi imię po polsku w nagłówku i tytule
      const visitor = await newTab(h.browser, { timezoneId: "Europe/London" });
      try {
        const response = await visitor.page.goto(`${BASE_URL}/m/${SLUG}`);
        assert.equal(response?.status(), 200);
        await visitor.page.getByRole("heading", { level: 1, name: NAME }).waitFor();
        assert.equal(await visitor.page.title(), `${NAME} — DevMentor`);
      } finally {
        await visitor.context.close();
      }
    } finally {
      await context.close();
    }
  });
});
