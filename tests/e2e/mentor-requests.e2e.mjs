// E2E: decyzja mentora (spec #18 story 1–4, Implementation Plan krok 2–3) na buildzie produkcyjnym z lokalnym
// fałszywym Stripe. Zapytania powstają przez prawdziwy formularz i płatność (jak `request-flow.e2e.mjs`), więc zwrot
// po odrzuceniu idzie przez fałszywy Stripe.
//
// - Bez sesji: /mentor/requests i szczegóły bez żadnych danych zapytania.
// - Pusty stan z linkiem; lista „Czeka na decyzję” + licznik w nawigacji; szczegóły: pytanie przed przyciskami (AC).
// - Akceptacja → „Zaakceptowane — sesja … (czat tekstowy)”, /r/ dewelopera w stanie zaakceptowanym.
// - Odrzucenie → „Odrzucone — deweloper dostaje pełny zwrot”, /r/ „Mentor nie przyjmie tego pytania — zwrot 150 zł
//   zlecony automatycznie” + „Zwrot wykonany”.
// - Inny mentor na cudzym id → „Nie ma takiego zapytania albo nie masz do niego dostępu”, bez pytania.
// - Termin minął bez decyzji → bez przycisków; /r/ „Termin minął — zwrot zostanie zlecony automatycznie”.
// Zrzuty ekranu: gdy ustawione `E2E_SCREENSHOT_DIR`.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { saveAvailability } from "../../lib/availability/save.mjs";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const FAKE_STRIPE = process.env.E2E_FAKE_STRIPE_URL;
const SHOTS = process.env.E2E_SCREENSHOT_DIR;
const skip = BASE_URL && DATABASE_URL && FAKE_STRIPE ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL / E2E_DATABASE_URL / E2E_FAKE_STRIPE_URL).";

const DAILY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 }));
const QUESTION = "Po migracji na app router cache nie odświeża listy zamówień po zapisie. Co sprawdzić najpierw?";
const NOT_FOUND = "Nie ma takiego zapytania albo nie masz do niego dostępu";

describe("decyzja mentora — /mentor/requests (#18)", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  let slug = "";
  let mentorId = "";
  /** @type {import("playwright").BrowserContext} */
  let mentorContext;
  let counter = 0;

  async function shot(tab, name) {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await tab.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  }

  /** Zalogowany mentor: pełna ścieżka zaproszenia w przeglądarce. */
  async function signedInMentor(label) {
    const address = `e2e-decision-${label}-${Date.now()}-${++counter}@example.com`;
    const { url } = await createInvitation({ db, email: address, appUrl: BASE_URL });
    const context = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw", viewport: { width: 1024, height: 900 } });
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
    await page.waitForURL(`${BASE_URL}/mentor`);
    const { rows } = await db.query("select id from mentors where lower(email) = lower($1)", [address]);
    await page.close();
    return { context, id: rows[0].id };
  }

  /** Deweloper płaci za n-tą godzinę (co 8, żeby terminy się nie nakładały); zwraca adres /r/ i id zapytania. */
  async function paidRequest(index) {
    const context = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw", viewport: { width: 1024, height: 900 } });
    const tab = await context.newPage();
    await tab.goto(`${BASE_URL}/m/${slug}`);
    await tab.getByRole("radio", { name: /\d{2}:\d{2}/ }).first().waitFor();
    await tab.getByRole("radio", { name: /\d{2}:\d{2}/ }).nth(index * 8).click();
    await tab.getByLabel("Imię").fill("Kuba");
    await tab.getByLabel("Twoje pytanie").fill(QUESTION);
    await tab.getByRole("button", { name: /Zapłać 150 zł i wyślij pytanie/ }).click();
    await tab.waitForURL(`${FAKE_STRIPE}/pay/**`);
    await tab.getByRole("button", { name: "Zapłać (test)" }).click();
    await tab.waitForURL(/\/r\/[A-Za-z0-9_-]{43}\?checkout=return/);
    await tab.getByRole("heading", { level: 1, name: /Opłacone — czeka na mentora/ }).waitFor();
    const requestUrl = tab.url().split("?")[0];
    await context.close();
    const { rows } = await db.query("select id from requests where mentor_id = $1 order by created_at desc limit 1", [mentorId]);
    return { requestUrl, id: rows[0].id };
  }

  /** Otwiera stronę i czeka na hydrację przycisku (klik przed hydracją by zginął). */
  async function openDetail(page, id) {
    await page.goto(`${BASE_URL}/mentor/requests/${id}`);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
  }
  async function hydrated(page, name) {
    const button = page.getByRole("button", { name, exact: true });
    await button.waitFor();
    await page.waitForFunction((label) => {
      const el = [...document.querySelectorAll("main button")].find((b) => b.textContent?.trim() === label);
      return el !== undefined && Object.keys(el).some((key) => key.startsWith("__react"));
    }, name);
    return button;
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    browser = await chromium.launch();
    const mentor = await signedInMentor("anna");
    mentorContext = mentor.context;
    mentorId = mentor.id;
    slug = `anna-decyzje-${Date.now().toString(36)}`;
    const saved = await saveMentorPage({
      db,
      mentorId,
      input: { displayName: "Anna K.", publicWorkUrl: "https://github.com/anna-k", description: "Next.js i React od 2016 roku. Migracje, cache, code review.", price25: "150", price50: "280", slug },
      publish: true,
      appUrl: BASE_URL,
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    await saveAvailability({ db, mentorId, input: { timeZone: "Europe/Warsaw", windows: DAILY } });
  });

  after(async () => {
    await browser?.close();
    await db?.end();
  });

  test("bez sesji: /mentor/requests — „Dostęp tylko przez zaproszenie”, bez danych", async () => {
    const context = await browser.newContext({ locale: "pl-PL" });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/mentor/requests`);
    await page.getByText(/Dostęp tylko przez zaproszenie/).first().waitFor();
    assert.equal(await page.getByRole("heading", { name: "Zapytania" }).count(), 0);
    await context.close();
  });

  test("pusty stan: „Nie masz jeszcze zapytań — udostępnij swój link” z linkiem strony", async () => {
    const page = await mentorContext.newPage();
    await page.goto(`${BASE_URL}/mentor/requests`);
    await page.getByText("Nie masz jeszcze zapytań — udostępnij swój link").waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Twój link" }).inputValue(), `${BASE_URL}/m/${slug}`);
    const nav = page.getByRole("navigation", { name: "Panel mentora" });
    assert.equal(await nav.getByRole("link", { name: "Zapytania" }).getAttribute("aria-current"), "page");
    await shot(page, "01-mentor-zapytania-pusto");
    await page.close();
  });

  /** @type {{ requestUrl: string, id: string }[]} */
  let requests = [];

  test("lista: opłacone zapytania w „Czeka na decyzję”, licznik w nawigacji; szczegóły: pytanie przed przyciskami (AC)", async () => {
    requests = [await paidRequest(0), await paidRequest(1), await paidRequest(2), await paidRequest(3)];
    const page = await mentorContext.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${BASE_URL}/mentor/requests`);
    await page.getByRole("heading", { level: 2, name: "Czeka na decyzję" }).waitFor();
    await page.getByRole("link", { name: "4 zapytania czekają na decyzję" }).waitFor();
    assert.equal(await page.getByRole("link", { name: /Kuba · 25 min/ }).count(), 4);
    assert.equal(await page.getByText(QUESTION).count(), 0, "pytanie tylko w szczegółach");
    await shot(page, "02-mentor-zapytania-lista");

    await openDetail(page, requests[0].id);
    await page.getByRole("heading", { level: 1, name: "Pytanie — Kuba" }).waitFor();
    await page.getByText(QUESTION).waitFor();
    await page.getByText("25 min, czat tekstowy").waitFor();
    const order = await page.evaluate((question) => {
      const text = document.querySelector("main")?.textContent ?? "";
      return [text.indexOf(question), text.indexOf("Akceptuję"), text.indexOf("Odrzucam")];
    }, QUESTION);
    assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], `kolejność: ${order}`);
    assert.equal(await page.getByText(/@example\.com/).count(), 0, "bez e-maila płacącego");
    await shot(page, "03-mentor-szczegoly");
    assert.deepEqual(errors, []);
    await page.close();
  });

  test("akceptacja: potwierdzenie → „Zaakceptowane — sesja … (czat tekstowy)”; /r/ dewelopera zaakceptowane", async () => {
    const page = await mentorContext.newPage();
    await openDetail(page, requests[0].id);
    await (await hydrated(page, "Akceptuję")).click();
    await page.getByRole("alertdialog").getByText("Zaakceptować to pytanie?").waitFor();
    await shot(page, "04-mentor-potwierdzenie-akceptacji");
    await page.getByRole("button", { name: "Akceptuję pytanie" }).click();
    await page.getByText(/Zaakceptowane — sesja .+ \(czat tekstowy\)/).first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Akceptuję", exact: true }).count(), 0);
    await shot(page, "05-mentor-zaakceptowane");
    await page.close();

    const dev = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
    const tab = await dev.newPage();
    await tab.goto(requests[0].requestUrl);
    await tab.getByRole("heading", { level: 1, name: /Zaakceptowane — sesja .+ \(czat tekstowy\)/ }).waitFor();
    await shot(tab, "06-r-zaakceptowane");
    await dev.close();
  });

  test("odrzucenie: → „Odrzucone — deweloper dostaje pełny zwrot”; /r/ ze zwrotem zleconym i wykonanym", async () => {
    const page = await mentorContext.newPage();
    await openDetail(page, requests[1].id);
    await (await hydrated(page, "Odrzucam")).click();
    await page.getByRole("alertdialog").getByText(/Odrzucenie zwraca pieniądze deweloperowi \(150\s?zł\)/).waitFor();
    await page.getByRole("button", { name: "Odrzucam pytanie" }).click();
    await page.getByText("Odrzucone — deweloper dostaje pełny zwrot").waitFor();
    await shot(page, "07-mentor-odrzucone");
    await page.goto(`${BASE_URL}/mentor/requests`);
    await page.getByRole("heading", { level: 2, name: "Zakończone" }).waitFor();
    await page.getByText("Zakończone — odrzucone").waitFor();
    await page.getByRole("link", { name: "2 zapytania czekają na decyzję" }).waitFor();
    await page.close();

    const { rows } = await db.query("select p.refund_status, p.refund_reason from requests r join payments p on p.id = r.payment_id where r.id = $1", [requests[1].id]);
    assert.equal(rows[0].refund_reason, "mentor_declined");
    assert.equal(rows[0].refund_status, "succeeded");

    const dev = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
    const tab = await dev.newPage();
    await tab.goto(requests[1].requestUrl);
    await tab.getByRole("heading", { level: 1, name: /Mentor nie przyjmie tego pytania — zwrot 150\s?zł zlecony automatycznie/ }).waitFor();
    await tab.getByText("Zwrot wykonany").waitFor();
    await shot(tab, "08-r-odrzucone-zwrot");
    await dev.close();
  });

  test("izolacja: inny mentor na cudzym id → „Nie ma takiego zapytania…”, bez pytania; zły id też", async () => {
    const other = await signedInMentor("ola");
    const page = await other.context.newPage();
    await page.goto(`${BASE_URL}/mentor/requests/${requests[2].id}`);
    await page.getByRole("heading", { level: 1, name: NOT_FOUND }).waitFor();
    assert.equal(await page.getByText(QUESTION).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Akceptuję" }).count(), 0);
    await shot(page, "09-mentor-cudze-zapytanie");
    await page.goto(`${BASE_URL}/mentor/requests/nie-uuid`);
    await page.getByRole("heading", { level: 1, name: NOT_FOUND }).waitFor();
    await other.context.close();
  });

  test("termin minął bez decyzji: bez przycisków; /r/ „Termin minął — zwrot zostanie zlecony automatycznie”", async () => {
    await db.query(
      "update requests set slot_start = now() - interval '5 minutes', slot_end = now() - interval '5 minutes' + length_minutes * interval '1 minute' where id = $1",
      [requests[3].id],
    );
    const page = await mentorContext.newPage();
    await openDetail(page, requests[3].id);
    await page.getByText("Termin minął — zwrot zostanie zlecony automatycznie").waitFor();
    assert.equal(await page.getByRole("button", { name: "Akceptuję" }).count(), 0);
    await page.close();

    const dev = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
    const tab = await dev.newPage();
    await tab.goto(requests[3].requestUrl);
    await tab.getByRole("heading", { level: 1, name: "Termin minął — zwrot zostanie zlecony automatycznie" }).waitFor();
    await shot(tab, "10-r-termin-minal");
    await dev.close();
  });

  test("wąski ekran 320 px: lista i szczegóły bez poziomego przewijania", async () => {
    const page = await mentorContext.newPage();
    await page.setViewportSize({ width: 320, height: 800 });
    for (const url of [`${BASE_URL}/mentor/requests`, `${BASE_URL}/mentor/requests/${requests[2].id}`]) {
      await page.goto(url);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, url);
    }
    await shot(page, "11-mentor-szczegoly-320px");
    await page.close();
  });
});
