// AUTH-002 — scenariusz: .ai/qa/AUTH/AUTH-002-ponowne-uzycie-linku-logowania-w-innej-karcie.md
// Niestandardowy: jednorazowy link logowania otwarty w dwóch kartach tej samej przeglądarki (P3/Z39) i potem
// w innej przeglądarce. Druga karta trafia na /mentor sesją pierwszej, bez drugiej sesji; inna przeglądarka
// widzi „Ten link jest nieaktywny…” (spec #14 `redeemSignInLink`, `inspectSignInLink`).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  activeSessions,
  BASE_URL,
  newTab,
  openHarness,
  signInUrl,
  signedInMentor,
  skip,
  TEXT,
  uniqueEmail,
  waitForEditor,
} from "./support/mentor.mjs";

async function linkRow(db, mentorId) {
  const { rows } = await db.query("select used_at from mentor_sign_in_links where mentor_id = $1", [mentorId]);
  assert.equal(rows.length, 1);
  return rows[0];
}

describe("AUTH-002: link logowania w drugiej karcie i na innym urządzeniu", { skip }, () => {
  /** @type {Awaited<ReturnType<typeof openHarness>>} */
  let h;
  before(async () => {
    h = await openHarness();
  });
  after(async () => {
    await h?.close();
  });

  test("zużywa link raz: druga karta tej samej przeglądarki wchodzi bez nowej sesji, inna przeglądarka widzi nieaktywny link", async () => {
    // Given: mentor z kontem (bez sesji na tym urządzeniu) i świeży link logowania otwarty w dwóch kartach
    const email = uniqueEmail("sign-in-tabs");
    const account = await signedInMentor(h.browser, h.db, email);
    const mentorId = account.mentorId;
    await account.context.close();
    await h.db.query("update mentor_sessions set revoked_at = now() where mentor_id = $1", [mentorId]);
    const url = await signInUrl(h.db, email);

    const laptop = await newTab(h.browser);
    const otherDevice = await newTab(h.browser);
    try {
      const tab1 = laptop.page;
      const tab2 = await laptop.context.newPage();
      for (const tab of [tab1, tab2]) {
        await tab.goto(url);
        await tab.getByRole("button", { name: "Zaloguj" }).waitFor();
      }

      // When: karta 1 klika „Zaloguj”
      await tab1.getByRole("button", { name: "Zaloguj" }).click();
      await tab1.waitForURL(`${BASE_URL}/mentor`);
      await waitForEditor(tab1);
      // Then: link zużyty, jedna aktywna sesja
      const used = await linkRow(h.db, mentorId);
      assert.ok(used.used_at, "used_at ustawione");
      assert.equal(await activeSessions(h.db, mentorId), 1);

      // When: karta 2 (stara strona z przyciskiem) klika „Zaloguj” tym samym, już zużytym linkiem
      await tab2.getByRole("button", { name: "Zaloguj" }).click();
      // Then: też ląduje na /mentor (sesja z karty 1), bez drugiej sesji i bez ponownego zużycia
      await tab2.waitForURL(`${BASE_URL}/mentor`);
      await waitForEditor(tab2);
      assert.equal(await activeSessions(h.db, mentorId), 1);
      assert.deepEqual(await linkRow(h.db, mentorId), used);

      // When: ktoś otwiera ten sam link w innej przeglądarce (np. przekazany dalej mail)
      await otherDevice.page.goto(url);
      // Then: neutralny komunikat, bez przycisku i bez sesji
      await otherDevice.page.getByRole("heading", { level: 1, name: TEXT.inactiveLink }).waitFor();
      assert.equal(await otherDevice.page.getByRole("button").count(), 0);
      assert.equal((await otherDevice.context.cookies()).some((c) => c.name === "dm_session"), false);
      assert.equal(await activeSessions(h.db, mentorId), 1);
    } finally {
      await laptop.context.close();
      await otherDevice.context.close();
    }
  });
});
