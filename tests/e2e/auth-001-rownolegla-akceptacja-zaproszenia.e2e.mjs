// AUTH-001 — scenariusz: .ai/qa/AUTH/AUTH-001-rownolegla-akceptacja-tego-samego-zaproszenia.md
// Niestandardowy: ten sam link zaproszenia otwarty w dwóch przeglądarkach i zaakceptowany w obu naraz.
// `acceptInvitation` blokuje wiersz zaproszenia (`for update`), więc powstaje dokładnie jedno konto, jedna strona
// i jedna sesja; druga przeglądarka dostaje neutralny komunikat o nieaktywnym linku (spec #14, L3/Z4).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { invitationUrl, newTab, openHarness, skip, TEXT, uniqueEmail } from "./support/mentor.mjs";

/** Wynik kliknięcia w danej karcie: „Twoja strona” (zalogowana) albo komunikat o nieaktywnym linku. */
async function outcome(page) {
  const heading = page.getByRole("heading", { level: 1, name: new RegExp(`^(${TEXT.editorHeading}|${TEXT.inactiveLink})$`) });
  await heading.waitFor();
  return (await heading.innerText()).trim();
}

describe("AUTH-001: równoległa akceptacja tego samego zaproszenia", { skip }, () => {
  /** @type {Awaited<ReturnType<typeof openHarness>>} */
  let h;
  before(async () => {
    h = await openHarness();
  });
  after(async () => {
    await h?.close();
  });

  test("tworzy jedno konto i jedną sesję, gdy dwie przeglądarki klikają „Akceptuję zaproszenie” jednocześnie — druga widzi nieaktywny link", async () => {
    // Given: ważne zaproszenie otwarte w dwóch niezależnych przeglądarkach (osobne ciasteczka)
    const email = uniqueEmail("parallel-accept");
    const url = await invitationUrl(h.db, email);
    const first = await newTab(h.browser);
    const second = await newTab(h.browser);
    try {
      for (const { page } of [first, second]) {
        await page.goto(url);
        await page.getByRole("button", { name: "Akceptuję zaproszenie" }).waitFor();
      }

      // When: obie klikają „Akceptuję zaproszenie” w tej samej chwili
      await Promise.all([first, second].map(({ page }) => page.getByRole("button", { name: "Akceptuję zaproszenie" }).click()));
      const results = await Promise.all([first, second].map(({ page }) => outcome(page)));

      // Then: dokładnie jedna przeglądarka jest zalogowana na /mentor, druga widzi neutralny komunikat
      assert.deepEqual([...results].sort(), [TEXT.inactiveLink, TEXT.editorHeading].sort());
      const winner = results[0] === TEXT.editorHeading ? first : second;
      const loser = winner === first ? second : first;
      assert.equal(new URL(winner.page.url()).pathname, "/mentor");
      assert.equal(await loser.page.getByRole("button").count(), 0, "przegrana karta bez przycisków");
      assert.equal((await loser.context.cookies()).some((c) => c.name === "dm_session"), false, "przegrana bez sesji");

      // … w bazie: jedno konto, jedna strona-szkic, zaproszenie przyjęte raz, jedna sesja
      const { rows } = await h.db.query(
        `select (select count(*)::int from mentors where lower(email) = lower($1)) as mentors,
                (select count(*)::int from mentor_pages p join mentors m on m.id = p.mentor_id where lower(m.email) = lower($1)) as pages,
                (select count(*)::int from invitations where lower(email) = lower($1) and accepted_at is not null) as accepted,
                (select count(*)::int from mentor_sessions s join mentors m on m.id = s.mentor_id where lower(m.email) = lower($1)) as sessions`,
        [email],
      );
      assert.deepEqual(rows[0], { mentors: 1, pages: 1, accepted: 1, sessions: 1 });

      // … a ponowne otwarcie linku w przegranej przeglądarce dalej pokazuje nieaktywny link
      await loser.page.goto(url);
      await loser.page.getByRole("heading", { level: 1, name: TEXT.inactiveLink }).waitFor();
    } finally {
      await first.context.close();
      await second.context.close();
    }
  });
});
