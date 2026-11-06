// AUTH-004 — scenariusz: .ai/qa/AUTH/AUTH-004-wylogowanie-w-innej-karcie.md
// „Wyloguj” w jednej karcie odwołuje sesję w bazie (Z8). Druga karta tej samej przeglądarki, otwarta wcześniej
// na /mentor/availability, po przejściu dalej nie widzi danych panelu, a zapis z niej nie przechodzi (Z7).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { activeSessions, BASE_URL, openHarness, signedInMentor, skip, TEXT, uniqueEmail } from "./support/mentor.mjs";

async function windowCount(db, mentorId) {
  const { rows } = await db.query("select count(*)::int as n from availability_windows where mentor_id = $1", [mentorId]);
  return rows[0].n;
}

describe("AUTH-004: wylogowanie w innej karcie", { skip }, () => {
  /** @type {Awaited<ReturnType<typeof openHarness>>} */
  let h;
  before(async () => {
    h = await openHarness();
  });
  after(async () => {
    await h?.close();
  });

  test("odbiera dostęp drugiej karcie po „Wyloguj” w pierwszej — zapis dostępności odrzucony, panel pokazuje tylko komunikat", async () => {
    // Given: mentor zalogowany; karta A na /mentor, karta B na /mentor/availability
    const { context, page: tabA, mentorId } = await signedInMentor(h.browser, h.db, uniqueEmail("sign-out-tabs"));
    try {
      const tabB = await context.newPage();
      await tabB.goto(`${BASE_URL}/mentor/availability`);
      await tabB.getByRole("heading", { level: 1, name: "Dostępność" }).waitFor();
      await tabB.getByRole("button", { name: "Dodaj okno: wtorek" }).click();
      await tabB.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" }).waitFor();

      // When: w karcie A klika „Wyloguj”
      await tabA.getByRole("navigation", { name: "Panel mentora" }).getByRole("button", { name: "Wyloguj" }).click();
      await tabA.getByRole("heading", { level: 1, name: TEXT.invitationOnly }).waitFor();
      assert.equal(await activeSessions(h.db, mentorId), 0, "sesja odwołana w bazie");

      // … i w karcie B (stara strona) próbuje zapisać dostępność
      await tabB.getByRole("button", { name: "Zapisz", exact: true }).click();

      // Then: karta B dostaje „Sesja wygasła…”, wpisane okno zostaje na ekranie, w bazie nic nie zapisano
      const alert = tabB.getByRole("main").getByRole("alert");
      await alert.waitFor();
      assert.deepEqual((await alert.innerText()).split("\n").map((line) => line.trim()).filter(Boolean), [
        "Sesja wygasła — poproś zespół o link do logowania",
        "Twoje okna zostały na ekranie.",
      ]);
      assert.equal(await tabB.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" }).count(), 1);
      assert.equal(await windowCount(h.db, mentorId), 0);

      // When: karta B przechodzi na /mentor
      await tabB.goto(`${BASE_URL}/mentor`);
      // Then: tylko komunikat o zaproszeniu — bez formularza i nawigacji panelu
      await tabB.getByRole("heading", { level: 1, name: TEXT.invitationOnly }).waitFor();
      assert.equal(await tabB.locator("form, input, textarea, select").count(), 0);
      assert.equal(await tabB.getByRole("navigation").count(), 0);
    } finally {
      await context.close();
    }
  });
});
