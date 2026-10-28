// MENTOR-PAGE-001 — scenariusz: .ai/qa/MENTOR-PAGE/MENTOR-PAGE-001-publikacja-bez-ceny-za-50-min.md
// Reguła publikacji (spec #14, `saveMentorPage` / Q3, R03): strona idzie publicznie tylko z kompletem pól,
// w tym z ceną za 50 min. Bez niej: błąd przy polu, dane zostają, baza bez publikacji, /m/{slug} → 404.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  accessibleDescription,
  field,
  fillEditor,
  openHarness,
  pageRow,
  publicStatus,
  signedInMentor,
  skip,
  uniqueEmail,
} from "./support/mentor.mjs";

const PRICE_50_ERROR = "Podaj cenę za 50 min od 20 do 5000 zł, bez groszy";

describe("MENTOR-PAGE-001: publikacja strony mentora", { skip }, () => {
  /** @type {Awaited<ReturnType<typeof openHarness>>} */
  let h;
  before(async () => {
    h = await openHarness();
  });
  after(async () => {
    await h?.close();
  });

  test("odmawia publikacji, gdy brak ceny za 50 min — błąd przy polu, dane zostają, strona niepubliczna", async () => {
    // Given: zalogowana mentorka ze szkicem, wszystkie pola wypełnione poza ceną za 50 min
    const { context, page, mentorId } = await signedInMentor(h.browser, h.db, uniqueEmail("no-price-50"));
    try {
      const slug = `bez-ceny-${Date.now().toString(36)}`;
      await fillEditor(page, {
        displayName: "Ewa Bez-Ceny",
        publicWorkUrl: "https://github.com/ewa-bez-ceny",
        description: "Migracja monolitu PHP do Next.js, 3 lata utrzymania API płatności.",
        price25: "150",
        price50: "",
        slug,
      });
      const before = await pageRow(h.db, mentorId);

      // When: klika „Opublikuj stronę”
      await page.getByRole("button", { name: "Opublikuj stronę" }).click();

      // Then: komunikat przy polu ceny za 50 min (jedyny błąd), fokus na tym polu
      const price50 = field(page, "Cena za 50 min (zł)");
      await page.getByText(PRICE_50_ERROR, { exact: true }).waitFor();
      assert.match(await accessibleDescription(price50), new RegExp(PRICE_50_ERROR));
      assert.equal(await page.getByText(/^Podaj cenę za 25 min/).count(), 0, "cena za 25 min jest poprawna");
      await page.waitForFunction(() => document.activeElement?.getAttribute("name") === "price50");
      // … wpisane dane zostają w formularzu
      assert.equal(await field(page, "Imię i nazwisko").inputValue(), "Ewa Bez-Ceny");
      assert.equal(await field(page, "Cena za 25 min (zł)").inputValue(), "150");
      assert.equal(await field(page, "Adres strony").inputValue(), slug);
      // … nie ma panelu z linkiem do udostępnienia
      assert.equal(await page.getByRole("textbox", { name: "Twój link" }).count(), 0);
      // … w bazie nic się nie zmieniło (szkic, bez published_at)
      const after = await pageRow(h.db, mentorId);
      assert.deepEqual(after, before);
      assert.equal(after.published_at, null);
      // … a adres strony publicznej nie istnieje
      assert.equal(await publicStatus(slug), 404);
    } finally {
      await context.close();
    }
  });
});
