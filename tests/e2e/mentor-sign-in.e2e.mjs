// E2E: zaproszenie, logowanie linkiem, /mentor i „Wyloguj” (spec #14 Phase 1; testy Z2, Z4–Z6, Z8, Z11, Z24).
// Uruchamiane przez `npm run test:e2e` (scripts/test-e2e.mjs): serwer `next start` i jednorazowy schemat
// bazy są już gotowe, adresy przychodzą w E2E_BASE_URL / E2E_DATABASE_URL. Bez nich plik jest pomijany.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { generateToken, hashToken } from "../../lib/auth/tokens.mjs";
import { createInvitation, createSignInLink } from "../../scripts/mentor-links.mjs";

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const skip = BASE_URL && DATABASE_URL ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL / E2E_DATABASE_URL).";

const INVITATION_TEXT = "Zespół DevMentora zaprasza cię do DevMentora";
const INACTIVE_TEXT = "Ten link jest nieaktywny — poproś zespół o nowy";
const INVITATION_ONLY_TEXT = "Dostęp tylko przez zaproszenie — poproś zespół o link do logowania";
// Formy rodzajowe 2. osoby czasu przeszłego (C12): „zrobiłeś”, „byłaś”, „mogłeś”… — „jesteś” jest neutralne.
const GENDERED_WORD = /(?<!\p{L})\p{L}*(?:łeś|łaś|eś|aś)(?!\p{L})/giu;
const NEUTRAL_WORDS = new Set(["jesteś"]);
const LOADING_TEXT = /Sprawdzanie linku|Wczytywanie/;

/**
 * Każdy <h1> w surowym HTML (przed wykonaniem JS, który podmienia fallback Suspense) leży wewnątrz <main>.
 * Strumieniowany segment trafia na koniec <body> w ukrytym <div>; jeśli nie niesie własnego <main>,
 * nagłówek jest poza landmarkiem do czasu podmiany (i na zawsze bez JS).
 * @param {string} html
 */
function headingsOutsideMain(html) {
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const outside = [];
  let depth = 0;
  for (const match of markup.matchAll(/<(\/?)(main|h1)\b[^>]*>/gi)) {
    const [, closing, tag] = match;
    if (tag.toLowerCase() === "main") depth += closing ? -1 : 1;
    else if (!closing && depth <= 0) outside.push(markup.slice(match.index, match.index + 120));
  }
  return outside;
}

describe("mentor: zaproszenie, logowanie linkiem, wylogowanie", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  let counter = 0;
  /** Teksty wszystkich odwiedzonych stron (sprawdzenie form rodzajowych na końcu). */
  const visibleTexts = new Map();

  const email = (label) => `e2e-${label}-${Date.now()}-${++counter}@example.com`;
  const invite = (address) => createInvitation({ db, email: address, appUrl: BASE_URL });
  const signInLink = (address) => createSignInLink({ db, email: address, appUrl: BASE_URL });

  async function newPage() {
    const context = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
    return { context, page: await context.newPage() };
  }

  /** Otwiera adres, czeka na treść (Suspense) i zapamiętuje widoczny tekst. */
  async function open(page, url) {
    await page.goto(url);
    await page.locator("h1").first().waitFor();
    await remember(page);
  }

  async function remember(page) {
    visibleTexts.set(`${page.url()}#${visibleTexts.size}`, await page.locator("body").innerText());
  }

  /**
   * Po wczytaniu: dokładnie jeden landmark `main`, w nim nagłówek strony (i przycisk), bez tekstu ładowania;
   * w surowym HTML tej samej strony żaden <h1> nie leży poza <main>.
   * @param {import("playwright").Page} page
   * @param {{ heading: string, button?: string }} expected
   */
  async function assertMainLandmark(page, { heading, button }) {
    const main = page.getByRole("main");
    assert.equal(await main.count(), 1, `${page.url()}: dokładnie jeden landmark main`);
    assert.equal((await main.getByRole("heading", { level: 1 }).innerText()).trim(), heading);
    if (button) assert.equal(await main.getByRole("button", { name: button }).count(), 1, `przycisk „${button}” w main`);
    assert.doesNotMatch(await main.innerText(), LOADING_TEXT);
    // Ten sam adres jeszcze raz jako GET (ciasteczka kontekstu) — GET niczego nie zużywa.
    const response = await page.request.get(page.url());
    assert.equal(response.status(), 200);
    assert.deepEqual(headingsOutsideMain(await response.text()), [], `${page.url()}: <h1> poza <main> w surowym HTML`);
  }

  async function sessionCookie(context) {
    return (await context.cookies()).find((cookie) => cookie.name === "dm_session");
  }

  /** Pełna ścieżka zaproszenia w przeglądarce; zwraca kontekst zalogowanej osoby. */
  async function acceptInBrowser(address) {
    const { url } = await invite(address);
    const { context, page } = await newPage();
    await open(page, url);
    await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
    await page.waitForURL(`${BASE_URL}/mentor`);
    await page.getByRole("heading", { level: 1, name: "Twoja strona" }).waitFor();
    return { context, page };
  }

  async function mentorIdFor(address) {
    const { rows } = await db.query("select id from mentors where lower(email) = lower($1)", [address]);
    return rows[0]?.id;
  }

  async function activeSessions(mentorId) {
    const { rows } = await db.query(
      "select count(*)::int as n from mentor_sessions where mentor_id = $1 and revoked_at is null and expires_at > now()",
      [mentorId],
    );
    return rows[0].n;
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    await db?.end();
  });

  test("strona zaproszenia: tekst zespołu bez nazwiska, jeden przycisk, GET niczego nie zmienia (Z2)", async () => {
    const address = email("invite-get");
    const { url } = await invite(address);
    const { context, page } = await newPage();
    try {
      await open(page, url);
      await open(page, url); // drugie otwarcie (np. podgląd linku) też niczego nie zużywa
      const heading = page.getByRole("heading", { level: 1 });
      assert.equal((await heading.innerText()).trim(), INVITATION_TEXT);
      const buttons = await page.getByRole("button").allInnerTexts();
      assert.deepEqual(buttons.map((text) => text.trim()), ["Akceptuję zaproszenie"]);
      assert.match(await page.locator("main").innerText(), /Link ważny do \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/);
      assert.equal(await page.locator("input, textarea, select").count(), 0);
      await assertMainLandmark(page, { heading: INVITATION_TEXT, button: "Akceptuję zaproszenie" });
      assert.equal(await sessionCookie(context), undefined);

      const { rows } = await db.query("select accepted_at, mentor_id from invitations where email = $1", [address]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].accepted_at, null);
      assert.equal(rows[0].mentor_id, null);
      assert.equal(await mentorIdFor(address), undefined);
      assert.equal(await page.title(), "Zaproszenie — DevMentor");
    } finally {
      await context.close();
    }
  });

  test("akceptacja: /mentor zalogowany, nawigacja „Zapytania”, „Strona”, „Dostępność” + „Wyloguj” (od #18; bez licznika, gdy nic nie czeka), mentor i szkic w bazie", async () => {
    const address = email("accept");
    const { context, page } = await acceptInBrowser(address);
    try {
      await remember(page);
      // Po nawigacji klienta (poprzednia trasa zostaje w DOM ukryta) i po pełnym wczytaniu /mentor.
      await assertMainLandmark(page, { heading: "Twoja strona" });
      await open(page, `${BASE_URL}/mentor`);
      await assertMainLandmark(page, { heading: "Twoja strona" });
      const nav = page.getByRole("navigation", { name: "Panel mentora" });
      const links = (await nav.getByRole("link").allInnerTexts()).map((text) => text.trim());
      assert.deepEqual(links, ["Zapytania", "Strona", "Dostępność"]);
      assert.equal(await nav.getByRole("link", { name: "Strona" }).getAttribute("aria-current"), "page");
      assert.equal(await nav.getByRole("button", { name: "Wyloguj" }).count(), 1);
      assert.equal(await nav.getByRole("link", { name: "Zapytania" }).getAttribute("href"), "/mentor/requests");
      assert.equal(await page.getByText(/czeka(ją)? na decyzję/).count(), 0, "bez licznika, gdy nic nie czeka");
      assert.equal(await page.title(), "Twoja strona — DevMentor");

      const cookie = await sessionCookie(context);
      assert.ok(cookie, "ciasteczko dm_session ustawione");
      assert.equal(cookie.httpOnly, true);
      assert.equal(cookie.sameSite, "Lax");
      // `next start` = produkcja: Secure; Chromium przyjmuje takie ciasteczko na http://localhost.
      assert.equal(cookie.secure, true);

      const { rows } = await db.query(
        `select m.email, p.slug, p.published_at, i.accepted_at
           from mentors m
           join mentor_pages p on p.mentor_id = m.id
           join invitations i on i.mentor_id = m.id
          where lower(m.email) = lower($1)`,
        [address],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].email, address);
      assert.match(rows[0].slug, /^mentor-[a-z2-7]{6}$/);
      assert.equal(rows[0].published_at, null);
      assert.ok(rows[0].accepted_at);
      const { rows: sessions } = await db.query(
        "select count(*)::int as n from mentor_sessions s join mentors m on m.id = s.mentor_id where lower(m.email) = lower($1)",
        [address],
      );
      assert.equal(sessions[0].n, 1, "dokładnie jedna sesja po jednym kliknięciu");
    } finally {
      await context.close();
    }
  });

  test("brak sieci przy „Akceptuję zaproszenie”: komunikat DS, nic nie zmienione (Z28)", async () => {
    const address = email("offline");
    const { url } = await invite(address);
    const { context, page } = await newPage();
    try {
      await open(page, url);
      await context.setOffline(true);
      await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
      const alert = page.locator("main").getByRole("alert");
      await alert.waitFor();
      assert.match(await alert.innerText(), /Brak połączenia z internetem/);
      assert.equal(new URL(page.url()).pathname.startsWith("/invite/"), true);
      await context.setOffline(false);
      const { rows } = await db.query("select accepted_at from invitations where email = $1", [address]);
      assert.equal(rows[0].accepted_at, null);
      assert.equal(await mentorIdFor(address), undefined);
    } finally {
      await context.close();
    }
  });

  test("zużyte, wygasłe i nieznane zaproszenie: ten sam neutralny tekst (Z4)", async () => {
    const address = email("reuse");
    const { url } = await invite(address);
    const first = await acceptInBrowser(address);
    await first.context.close();

    // Wygasłe zaproszenie wstawione bezpośrednio (expires_at w przeszłości).
    const expiredToken = generateToken();
    await db.query(
      "insert into invitations (email, token_hash, expires_at, created_at) values ($1, $2, now() - interval '1 hour', now() - interval '15 days')",
      [email("expired"), hashToken(expiredToken)],
    );

    for (const target of [url, `${BASE_URL}/invite/${expiredToken}`, `${BASE_URL}/invite/${generateToken()}`, `${BASE_URL}/invite/x`]) {
      const { context, page } = await newPage();
      try {
        await open(page, target);
        assert.equal((await page.getByRole("heading", { level: 1 }).innerText()).trim(), INACTIVE_TEXT, target);
        assert.equal(await page.getByRole("button").count(), 0, target);
        await assertMainLandmark(page, { heading: INACTIVE_TEXT });
        // Ani słowa o przyczynie (wygasł / użyty / nieznany).
        assert.doesNotMatch(await page.locator("main").innerText(), /wygas|użyt|nieznan/i);
      } finally {
        await context.close();
      }
    }
  });

  test("/mentor bez sesji: tylko komunikat o zaproszeniu, bez formularza i bez danych (s03)", async () => {
    const { context, page } = await newPage();
    try {
      await open(page, `${BASE_URL}/mentor`);
      assert.equal((await page.getByRole("heading", { level: 1 }).innerText()).trim(), INVITATION_ONLY_TEXT);
      assert.equal(await page.locator("form, input, textarea, select").count(), 0);
      assert.equal(await page.getByRole("navigation").count(), 0);
      assert.equal(await page.getByRole("button").count(), 0);
      await assertMainLandmark(page, { heading: INVITATION_ONLY_TEXT });
    } finally {
      await context.close();
    }
  });

  test("„Wyloguj”: sesja odwołana w bazie, /mentor pokazuje komunikat o zaproszeniu (Z8)", async () => {
    const address = email("sign-out");
    const { context, page } = await acceptInBrowser(address);
    try {
      const mentorId = await mentorIdFor(address);
      await page.getByRole("button", { name: "Wyloguj" }).click();
      await page.getByRole("heading", { level: 1, name: INVITATION_ONLY_TEXT }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/mentor");
      await remember(page);

      const { rows } = await db.query("select revoked_at from mentor_sessions where mentor_id = $1", [mentorId]);
      assert.equal(rows.length, 1);
      assert.ok(rows[0].revoked_at, "revoked_at ustawione");
      assert.equal(await sessionCookie(context), undefined);

      await open(page, `${BASE_URL}/mentor`);
      assert.equal((await page.getByRole("heading", { level: 1 }).innerText()).trim(), INVITATION_ONLY_TEXT);
    } finally {
      await context.close();
    }
  });

  test("link logowania: GET niczego nie zużywa, „Zaloguj” → /mentor, ponowne użycie → nieaktywny", async () => {
    const address = email("sign-in");
    const accepted = await acceptInBrowser(address);
    await accepted.context.close(); // „nowy laptop”: bez ciasteczka
    const mentorId = await mentorIdFor(address);

    const { url } = await signInLink(address);
    const { context, page } = await newPage();
    try {
      await open(page, url);
      assert.equal((await page.getByRole("heading", { level: 1 }).innerText()).trim(), "Zaloguj się do DevMentora");
      assert.deepEqual((await page.getByRole("button").allInnerTexts()).map((text) => text.trim()), ["Zaloguj"]);
      assert.equal(await page.title(), "Logowanie — DevMentor");
      await assertMainLandmark(page, { heading: "Zaloguj się do DevMentora", button: "Zaloguj" });
      let { rows } = await db.query("select used_at from mentor_sign_in_links where mentor_id = $1", [mentorId]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].used_at, null);

      await page.getByRole("button", { name: "Zaloguj" }).click();
      await page.waitForURL(`${BASE_URL}/mentor`);
      await page.getByRole("heading", { level: 1, name: "Twoja strona" }).waitFor();
      ({ rows } = await db.query("select used_at from mentor_sign_in_links where mentor_id = $1", [mentorId]));
      assert.ok(rows[0].used_at, "used_at ustawione po kliknięciu");
    } finally {
      await context.close();
    }

    const fresh = await newPage();
    try {
      await open(fresh.page, url);
      assert.equal((await fresh.page.getByRole("heading", { level: 1 }).innerText()).trim(), INACTIVE_TEXT);
    } finally {
      await fresh.context.close();
    }
  });

  test("ta sama, zalogowana osoba otwiera własny nowy link logowania → /mentor bez zużycia (Z6)", async () => {
    const address = email("own-link");
    const { context, page } = await acceptInBrowser(address);
    try {
      const mentorId = await mentorIdFor(address);
      const { url } = await signInLink(address);
      await page.goto(url);
      await page.waitForURL(`${BASE_URL}/mentor`);
      await page.getByRole("heading", { level: 1, name: "Twoja strona" }).waitFor();
      const { rows } = await db.query("select used_at from mentor_sign_in_links where mentor_id = $1", [mentorId]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].used_at, null);
    } finally {
      await context.close();
    }
  });

  test("sesja innego mentora + ważny link logowania: po kliknięciu stara sesja odwołana (L5)", async () => {
    const owner = email("owner");
    const other = email("other");
    const ownerSession = await acceptInBrowser(owner);
    await ownerSession.context.close();
    const ownerId = await mentorIdFor(owner);

    const { context, page } = await acceptInBrowser(other);
    try {
      const otherId = await mentorIdFor(other);
      const ownerActiveBefore = await activeSessions(ownerId);
      const { url } = await signInLink(owner);
      await open(page, url);
      // Link innej osoby: własny przycisk, nic nie zużyte przy otwarciu.
      await page.getByRole("button", { name: "Zaloguj" }).click();
      await page.waitForURL(`${BASE_URL}/mentor`);
      await page.getByRole("heading", { level: 1, name: "Twoja strona" }).waitFor();

      const { rows: otherSessions } = await db.query("select revoked_at from mentor_sessions where mentor_id = $1", [otherId]);
      assert.equal(otherSessions.length, 1);
      assert.ok(otherSessions[0].revoked_at, "sesja poprzedniej osoby odwołana");
      // Nowa sesja właściciela linku (jego pierwsza sesja z innej przeglądarki zostaje — to inne urządzenie).
      assert.equal(await activeSessions(ownerId), ownerActiveBefore + 1);
      assert.equal(await activeSessions(otherId), 0);
    } finally {
      await context.close();
    }
  });

  test("odwiedzone strony nie mają form rodzajowych „-eś/-aś/-łeś/-łaś” (C12, Z24)", () => {
    assert.ok(visibleTexts.size >= 5, `sprawdzono ${visibleTexts.size} stron`);
    for (const [where, text] of visibleTexts) {
      const found = [...text.matchAll(GENDERED_WORD)].map((match) => match[0]).filter((word) => !NEUTRAL_WORDS.has(word.toLowerCase()));
      assert.deepEqual(found, [], `${where}: ${found.join(", ")}`);
    }
  });
});
