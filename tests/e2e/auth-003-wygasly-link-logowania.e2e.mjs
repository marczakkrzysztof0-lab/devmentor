// AUTH-003 — scenariusz: .ai/qa/AUTH/AUTH-003-wygasly-link-logowania.md
// Link logowania ważny 72 h (spec #14, `SIGN_IN_LINK_TTL_HOURS`). Po terminie: ten sam neutralny komunikat co dla
// zużytego/nieznanego linku, bez przycisku, link niezużyty, bez sesji. Czas nie zależy od zegara testu —
// termin ważności jest przesunięty w bazie (dobra praktyka 4).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { activeSessions, newTab, openHarness, signInUrl, signedInMentor, skip, TEXT, uniqueEmail } from "./support/mentor.mjs";

describe("AUTH-003: wygasły link logowania", { skip }, () => {
  /** @type {Awaited<ReturnType<typeof openHarness>>} */
  let h;
  before(async () => {
    h = await openHarness();
  });
  after(async () => {
    await h?.close();
  });

  test("pokazuje „Ten link jest nieaktywny…” bez przycisku i nie loguje, gdy link logowania wygasł", async () => {
    // Given: mentor z kontem, bez sesji; link logowania, którego termin ważności minął minutę temu
    const email = uniqueEmail("expired-sign-in");
    const account = await signedInMentor(h.browser, h.db, email);
    await account.context.close();
    await h.db.query("update mentor_sessions set revoked_at = now() where mentor_id = $1", [account.mentorId]);
    const url = await signInUrl(h.db, email);
    await h.db.query(
      "update mentor_sign_in_links set created_at = now() - interval '73 hours', expires_at = now() - interval '1 minute' where mentor_id = $1",
      [account.mentorId],
    );

    const { context, page } = await newTab(h.browser);
    try {
      // When: mentor otwiera link
      const response = await page.goto(url);

      // Then: neutralny komunikat (bez słowa „wygasł”), bez przycisku „Zaloguj”, bez sesji
      assert.equal(response?.status(), 200);
      await page.getByRole("heading", { level: 1, name: TEXT.inactiveLink }).waitFor();
      assert.equal(await page.getByRole("button").count(), 0);
      assert.doesNotMatch(await page.getByRole("main").innerText(), /wygas|użyt|72/i);
      assert.equal((await context.cookies()).some((c) => c.name === "dm_session"), false);
      // … link nie został oznaczony jako użyty, nie powstała sesja
      const { rows } = await h.db.query("select used_at from mentor_sign_in_links where mentor_id = $1", [account.mentorId]);
      assert.equal(rows[0].used_at, null);
      assert.equal(await activeSessions(h.db, account.mentorId), 0);
      // … a /mentor w tej przeglądarce dalej wymaga zaproszenia/logowania
      await page.goto(url.replace(/\/sign-in\/.*$/, "/mentor"));
      await page.getByRole("heading", { level: 1, name: TEXT.invitationOnly }).waitFor();
    } finally {
      await context.close();
    }
  });
});
