// PUBLIC-PAGE-001 — scenariusz: .ai/qa/PUBLIC-PAGE/PUBLIC-PAGE-001-okno-z-panelu-widoczne-na-stronie-publicznej.md
// Cała ścieżka mentor → deweloper wyłącznie przez UI (dotąd testy /m/{slug} wstawiały okna SQL-em):
// publikacja strony i okno „wtorek 18:00–20:00” (Europe/Warsaw) w panelu → deweloper z Londynu widzi wtorkowe
// terminy 17:00–18:30 swojego czasu; usunięcie okna w panelu → pusty stan (spec #15 + #16 Phase 2).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { BASE_URL, fillEditor, newTab, openHarness, signedInMentor, skip, TEXT, uniqueEmail } from "./support/mentor.mjs";

const VIEWER_ZONE = "Europe/London";
const TIME = /\b\d{2}:\d{2}\b/g;

async function saveAvailability(page) {
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await page.getByText("Dostępność zapisana").waitFor();
}

describe("PUBLIC-PAGE-001: okno z panelu mentora na stronie publicznej", { skip }, () => {
  /** @type {Awaited<ReturnType<typeof openHarness>>} */
  let h;
  before(async () => {
    h = await openHarness();
  });
  after(async () => {
    await h?.close();
  });

  test("pokazuje deweloperowi terminy z okna zapisanego w panelu, w jego strefie, i pusty stan po usunięciu okna", async () => {
    const slug = `pelna-sciezka-${Date.now().toString(36)}`;
    // Given: mentorka publikuje stronę i w panelu dodaje okno „wtorek 18:00–20:00” (strefa Europe/Warsaw)
    const mentor = await signedInMentor(h.browser, h.db, uniqueEmail("full-path"));
    const visitor = await newTab(h.browser, { timezoneId: VIEWER_ZONE });
    try {
      await fillEditor(mentor.page, {
        displayName: "Paulina Pełna",
        publicWorkUrl: "https://github.com/paulina-pelna",
        description: "Architektura frontendu i dostępność (WCAG 2.2).",
        price25: "140",
        price50: "260",
        slug,
      });
      await mentor.page.getByRole("button", { name: "Opublikuj stronę" }).click();
      await mentor.page.getByRole("textbox", { name: "Twój link" }).waitFor();
      await mentor.page.getByRole("navigation", { name: "Panel mentora" }).getByRole("link", { name: "Dostępność" }).click();
      await mentor.page.getByRole("heading", { level: 1, name: "Dostępność" }).waitFor();
      await mentor.page.getByRole("button", { name: "Dodaj okno: wtorek" }).click();
      await mentor.page.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" }).waitFor();
      await saveAvailability(mentor.page);

      // When: deweloper z Londynu otwiera link do strony
      await visitor.page.goto(`${BASE_URL}/m/${slug}`);
      await visitor.page.getByRole("heading", { level: 1, name: "Paulina Pełna" }).waitFor();
      await visitor.page.getByRole("heading", { level: 2, name: `Najbliższe terminy (twoja strefa: ${VIEWER_ZONE})` }).waitFor();

      // Then: widzi terminy wyłącznie z okna mentorki, przeliczone na czas londyński (o godzinę wcześniej)
      for (const length of ["25 min", "50 min"]) {
        await visitor.page.getByRole("radio", { name: new RegExp(length) }).click();
        const times = [...new Set((await visitor.page.getByRole("main").innerText()).match(TIME) ?? [])].sort();
        const lastStart = length === "25 min" ? "18:30" : "18:00";
        assert.ok(times.includes("17:00"), `${length}: jest 17:00 (= 18:00 w Warszawie), mamy ${times}`);
        assert.ok(times.every((t) => t >= "17:00" && t <= lastStart), `${length}: tylko 17:00–${lastStart}, mamy ${times}`);
      }
      assert.equal(await visitor.page.getByText(TEXT.emptySlots).count(), 0);

      // When: mentorka usuwa okno w panelu i zapisuje, deweloper odświeża stronę
      await mentor.page.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" }).click();
      await saveAvailability(mentor.page);
      await visitor.page.reload();

      // Then: pusty stan zamiast terminów, profil i ceny nadal widoczne
      await visitor.page.getByText(TEXT.emptySlots).waitFor();
      assert.equal(await visitor.page.getByRole("radiogroup").count(), 0);
      assert.equal(await visitor.page.getByRole("heading", { level: 1, name: "Paulina Pełna" }).count(), 1);
      const { rows } = await h.db.query("select count(*)::int as n from availability_windows where mentor_id = $1", [mentor.mentorId]);
      assert.equal(rows[0].n, 0);
    } finally {
      await mentor.context.close();
      await visitor.context.close();
    }
  });
});
