// E2E: anulowanie przez dewelopera na /r/{token} (spec #19 story 1–4, Implementation Plan krok 3) na buildzie
// produkcyjnym z lokalnym fałszywym Stripe (zapytania przez prawdziwy formularz i płatność).
//
// - „Opłacone — czeka na mentora”: „Anuluj i odzyskaj 150 zł”, „Możesz anulować, dopóki mentor nie zaakceptuje”;
//   potwierdzenie → „Anulowane — zwrot 150 zł zlecony” + stan zwrotu; mentor widzi „Zakończone — anulowane”.
// - Po akceptacji: brak przycisku, „anulowanie ze zwrotem nie jest już możliwe”.
// - Stara karta: mentor akceptuje, deweloper klika „Anuluj” → komunikat „właśnie zaakceptowane”, bez zwrotu.
// - Po starcie terminu, przed wygaśnięciem: przycisk nadal jest (D05).
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
const QUESTION = "Testy integracyjne z bazą padają losowo na CI, lokalnie przechodzą. Jak to zdiagnozować?";
const CANCEL = /Anuluj i odzyskaj 150\s?zł/;

describe("anulowanie przez dewelopera — /r/{token} (#19)", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  let slug = "";
  let mentorId = "";
  /** @type {import("playwright").BrowserContext} */
  let mentorContext;
  let paid = 0;

  async function shot(tab, name) {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await tab.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  }

  const newContext = () => browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw", viewport: { width: 1024, height: 900 } });

  /** Deweloper płaci za kolejny, odległy termin; zwraca kartę na /r/{token} i id zapytania. */
  async function paidRequest() {
    const context = await newContext();
    const tab = await context.newPage();
    await tab.goto(`${BASE_URL}/m/${slug}`);
    await tab.getByRole("radio", { name: /\d{2}:\d{2}/ }).first().waitFor();
    await tab.getByRole("radio", { name: /\d{2}:\d{2}/ }).nth(8 * paid++).click();
    await tab.getByLabel("Imię").fill("Kuba");
    await tab.getByLabel("Twoje pytanie").fill(QUESTION);
    await tab.getByRole("button", { name: /Zapłać 150 zł i wyślij pytanie/ }).click();
    await tab.waitForURL(`${FAKE_STRIPE}/pay/**`);
    await tab.getByRole("button", { name: "Zapłać (test)" }).click();
    await tab.waitForURL(/\/r\/[A-Za-z0-9_-]{43}\?checkout=return/);
    await tab.getByRole("heading", { level: 1, name: /Opłacone — czeka na mentora/ }).waitFor();
    const url = tab.url().split("?")[0];
    await tab.goto(url);
    const { rows } = await db.query("select id from requests where mentor_id = $1 order by created_at desc limit 1", [mentorId]);
    return { context, tab, url, id: rows[0].id };
  }

  /** Czeka, aż przycisk anulowania będzie zhydratowany (klik przed hydracją by zginął). */
  async function cancelButton(tab) {
    const button = tab.getByRole("button", { name: CANCEL });
    await button.waitFor();
    await tab.waitForFunction(() => {
      const el = [...document.querySelectorAll("main button")].find((b) => /Anuluj i odzyskaj/.test(b.textContent ?? ""));
      return el !== undefined && Object.keys(el).some((key) => key.startsWith("__react"));
    });
    return button;
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    browser = await chromium.launch();
    const address = `e2e-cancel-${Date.now()}@example.com`;
    const { url } = await createInvitation({ db, email: address, appUrl: BASE_URL });
    mentorContext = await newContext();
    const page = await mentorContext.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
    await page.waitForURL(`${BASE_URL}/mentor`);
    await page.close();
    const { rows } = await db.query("select id from mentors where lower(email) = lower($1)", [address]);
    mentorId = rows[0].id;
    slug = `anna-anulowanie-${Date.now().toString(36)}`;
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

  test("anulowanie: przycisk z kwotą, potwierdzenie → „Anulowane — zwrot 150 zł zlecony”; mentor: „Zakończone — anulowane” (AC)", async () => {
    const { context, tab, id } = await paidRequest();
    const errors = [];
    tab.on("pageerror", (error) => errors.push(String(error)));
    await tab.getByText("Możesz anulować, dopóki mentor nie zaakceptuje.").waitFor();
    await shot(tab, "12-r-oplacone-z-anulowaniem");
    await (await cancelButton(tab)).click();
    await tab.getByRole("alertdialog").getByText(/Mentor nie zobaczy już tego pytania/).waitFor();
    await shot(tab, "13-r-potwierdzenie-anulowania");
    await tab.getByRole("alertdialog").getByRole("button", { name: CANCEL }).click();
    await tab.getByRole("heading", { level: 1, name: /Anulowane — zwrot 150\s?zł zlecony/ }).waitFor();
    await tab.getByText("Zwrot wykonany").waitFor();
    assert.equal(await tab.getByRole("button", { name: CANCEL }).count(), 0);
    await shot(tab, "14-r-anulowane-zwrot");
    assert.deepEqual(errors, []);
    await context.close();

    const { rows } = await db.query("select r.status, p.refund_reason, p.refund_status from requests r join payments p on p.id = r.payment_id where r.id = $1", [id]);
    assert.deepEqual(rows[0], { status: "cancelled", refund_reason: "mentee_cancelled", refund_status: "succeeded" });

    const page = await mentorContext.newPage();
    await page.goto(`${BASE_URL}/mentor/requests`);
    await page.getByText("Zakończone — anulowane").waitFor();
    assert.equal(await page.getByRole("heading", { level: 2, name: "Czeka na decyzję" }).count(), 0);
    await shot(page, "15-mentor-lista-anulowane");
    await page.close();
  });

  test("po akceptacji: brak przycisku, „anulowanie ze zwrotem nie jest już możliwe”", async () => {
    const { context, tab, id, url } = await paidRequest();
    const page = await mentorContext.newPage();
    await page.goto(`${BASE_URL}/mentor/requests/${id}`);
    const accept = page.getByRole("button", { name: "Akceptuję", exact: true });
    await accept.waitFor();
    await page.waitForFunction(() => {
      const el = [...document.querySelectorAll("main button")].find((b) => b.textContent?.trim() === "Akceptuję");
      return el !== undefined && Object.keys(el).some((key) => key.startsWith("__react"));
    });
    await accept.click();
    await page.getByRole("button", { name: "Akceptuję pytanie" }).click();
    await page.getByText(/Zaakceptowane — sesja/).first().waitFor();
    await page.close();

    await tab.goto(url);
    await tab.getByRole("heading", { level: 1, name: /Zaakceptowane — sesja .+ \(czat tekstowy\)/ }).waitFor();
    await tab.getByText("Pytanie zostało już przyjęte — anulowanie ze zwrotem nie jest już możliwe.").waitFor();
    assert.equal(await tab.getByRole("button", { name: CANCEL }).count(), 0);
    await shot(tab, "16-r-zaakceptowane-bez-anulowania");
    await context.close();
  });

  test("stara karta: mentor akceptuje w międzyczasie → „właśnie zaakceptowane”, bez zwrotu (wyścig)", async () => {
    const { context, tab, id } = await paidRequest();
    const button = await cancelButton(tab);
    await db.query("update requests set status = 'accepted', accepted_at = now() where id = $1", [id]);
    await button.click();
    await tab.getByRole("alertdialog").getByRole("button", { name: CANCEL }).click();
    await tab.getByText("Pytanie zostało właśnie zaakceptowane — sesja się odbędzie").first().waitFor();
    const { rows } = await db.query("select r.status, p.refund_status from requests r join payments p on p.id = r.payment_id where r.id = $1", [id]);
    assert.deepEqual(rows[0], { status: "accepted", refund_status: null });
    await shot(tab, "17-r-wyscig-zaakceptowane");
    await context.close();
  });

  test("po starcie terminu, przed wygaśnięciem: „Termin minął” i nadal można anulować ze zwrotem (D05)", async () => {
    const { context, tab, id, url } = await paidRequest();
    await db.query(
      "update requests set slot_start = now() - interval '5 minutes', slot_end = now() - interval '5 minutes' + length_minutes * interval '1 minute' where id = $1",
      [id],
    );
    await tab.goto(url);
    await tab.getByRole("heading", { level: 1, name: "Termin minął — zwrot zostanie zlecony automatycznie" }).waitFor();
    await (await cancelButton(tab)).click();
    await tab.getByRole("alertdialog").getByRole("button", { name: CANCEL }).click();
    await tab.getByRole("heading", { level: 1, name: /Anulowane — zwrot 150\s?zł zlecony/ }).waitFor();
    await context.close();
  });

  test("wąski ekran 320 px: /r/ z przyciskiem anulowania bez poziomego przewijania", async () => {
    const { context, tab } = await paidRequest();
    await tab.setViewportSize({ width: 320, height: 800 });
    await cancelButton(tab);
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await shot(tab, "18-r-anulowanie-320px");
    await context.close();
  });
});
