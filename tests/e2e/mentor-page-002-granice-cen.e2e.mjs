// MENTOR-PAGE-002 — scenariusz: .ai/qa/MENTOR-PAGE/MENTOR-PAGE-002-granice-cen-20-i-5000-zl.md
// Reguła ceny (spec #14 Q14, `validate.mjs` PRICE_MIN_ZLOTY / PRICE_MAX_ZLOTY): pełne złote od 20 do 5000.
// Wartości tuż poza zakresem blokują publikację, wartości graniczne publikują stronę (grosze w bazie).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { BASE_URL, field, fillEditor, openHarness, pageRow, publicStatus, signedInMentor, skip, uniqueEmail } from "./support/mentor.mjs";

const PRICE_25_ERROR = "Podaj cenę za 25 min od 20 do 5000 zł, bez groszy";
const PRICE_50_ERROR = "Podaj cenę za 50 min od 20 do 5000 zł, bez groszy";

describe("MENTOR-PAGE-002: granice cen przy publikacji", { skip }, () => {
  /** @type {Awaited<ReturnType<typeof openHarness>>} */
  let h;
  before(async () => {
    h = await openHarness();
  });
  after(async () => {
    await h?.close();
  });

  test("odrzuca 19 i 5001 zł, publikuje stronę z cenami 20 i 5000 zł (2000 i 500000 groszy w bazie)", async () => {
    // Given: zalogowana mentorka, komplet pól poza cenami
    const { context, page, mentorId } = await signedInMentor(h.browser, h.db, uniqueEmail("price-bounds"));
    try {
      const slug = `granice-${Date.now().toString(36)}`;
      await fillEditor(page, {
        displayName: "Gabriela Granica",
        publicWorkUrl: "https://gitlab.com/gabriela",
        description: "Testy kontraktowe i CI dla 12 mikroserwisów.",
        slug,
      });

      // When: ceny tuż poza zakresem (19 zł i 5001 zł) → „Opublikuj stronę”
      await fillEditor(page, { price25: "19", price50: "5001" });
      await page.getByRole("button", { name: "Opublikuj stronę" }).click();
      // Then: oba pola z błędem, strona nadal szkicem
      await page.getByText(PRICE_25_ERROR, { exact: true }).waitFor();
      await page.getByText(PRICE_50_ERROR, { exact: true }).waitFor();
      assert.equal((await pageRow(h.db, mentorId)).published_at, null);
      assert.equal(await publicStatus(slug), 404);

      // When: wartości graniczne 20 zł i 5000 zł → „Opublikuj stronę”
      await fillEditor(page, { price25: "20", price50: "5000" });
      await page.getByRole("button", { name: "Opublikuj stronę" }).click();
      // Then: panel z linkiem, w bazie ceny w groszach i PLN, strona publiczna dostępna
      const link = page.getByRole("textbox", { name: "Twój link" });
      await link.waitFor();
      assert.equal(await link.inputValue(), `${BASE_URL}/m/${slug}`);
      assert.equal(await page.getByText(PRICE_25_ERROR, { exact: true }).count(), 0);
      const row = await pageRow(h.db, mentorId);
      assert.ok(row.published_at, "published_at ustawione");
      assert.equal(row.price_25_minor, 2000);
      assert.equal(row.price_50_minor, 500000);
      assert.equal(row.currency, "PLN");
      assert.equal(await field(page, "Cena za 50 min (zł)").inputValue(), "5000");
      assert.equal(await publicStatus(slug), 200);
    } finally {
      await context.close();
    }
  });
});
