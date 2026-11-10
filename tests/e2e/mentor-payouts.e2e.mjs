// E2E wypłat mentora: pierwsza płatność, onboarding Connect i transfer należności (spec 2026-11-09, E2E).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { saveAvailability } from "../../lib/availability/save.mjs";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { acceptRequest } from "../../lib/requests/decision.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const FAKE_STRIPE = process.env.E2E_FAKE_STRIPE_URL;
const CRON_SECRET = process.env.E2E_CRON_SECRET;
const SHOTS = process.env.E2E_SCREENSHOT_DIR;
const skip = BASE_URL && DATABASE_URL && FAKE_STRIPE && CRON_SECRET
  ? false
  : "Uruchom przez npm run test:e2e.";
const DAILY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  startMinute: 8 * 60,
  endMinute: 22 * 60,
}));

describe("mentor payouts", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  /** @type {import("playwright").BrowserContext} */
  let context;
  let mentorId;
  let slug;

  /** Zapisuje zrzut ekranu, gdy ustawiono E2E_SCREENSHOT_DIR.
   * @param {import("playwright").Page} page strona przeglądarki
   * @param {string} name nazwa pliku bez rozszerzenia
   */
  const shot = async (page, name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
    browser = await chromium.launch();
    const email = `payout-${Date.now()}@example.com`;
    const invitation = await createInvitation({ db, email, appUrl: BASE_URL });
    context = await browser.newContext({
      locale: "pl-PL",
      timezoneId: "Europe/Warsaw",
      viewport: { width: 390, height: 844 },
    });
    const login = await context.newPage();
    await login.goto(invitation.url);
    await login.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
    await login.waitForURL(`${BASE_URL}/mentor`);
    mentorId = (await db.query(
      "select id from mentors where lower(email) = lower($1)",
      [email],
    )).rows[0].id;
    await login.close();

    slug = `payout-${Date.now().toString(36)}`;
    await saveMentorPage({
      db,
      mentorId,
      input: {
        displayName: "Anna K.",
        publicWorkUrl: "https://github.com/anna",
        description: "Migracje aplikacji i architektury systemów.",
        price25: "150",
        price50: "280",
        slug,
      },
      publish: true,
      appUrl: BASE_URL,
    });
    await saveAvailability({
      db,
      mentorId,
      input: { timeZone: "Europe/Warsaw", windows: DAILY },
    });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
    await db?.end();
  });

  test("first paid request prompts onboarding and held session transfers once", async () => {
    const home = await context.newPage();
    await home.goto(`${BASE_URL}/mentor`);
    assert.equal(await home.getByText(/Skonfiguruj wypłaty/).count(), 0);
    const beforePayout = await context.newPage();
    await beforePayout.goto(`${BASE_URL}/mentor/payouts`);
    await beforePayout.waitForURL(`${BASE_URL}/mentor`);
    await beforePayout.close();

    const developer = await browser.newPage({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
    await developer.goto(`${BASE_URL}/m/${slug}`);
    await developer.getByRole("radio", { name: /\d{2}:\d{2}/ }).first().click();
    await developer.getByLabel("Imię").fill("Kuba");
    await developer.getByLabel("Twoje pytanie").fill(
      "Jak bezpiecznie rozdzielić moduł API przed migracją do nowego routera?",
    );
    await developer.getByRole("button", { name: /Zapłać 150 zł i wyślij pytanie/ }).click();
    await developer.waitForURL(`${FAKE_STRIPE}/pay/**`);
    await developer.getByRole("button", { name: "Zapłać (test)" }).click();
    await developer.waitForURL(/\/r\/.*checkout=return/);

    const request = (await db.query(
      "select id, payment_id from requests where mentor_id = $1 order by created_at desc limit 1",
      [mentorId],
    )).rows[0];
    await home.reload();
    await home.getByText("Skonfiguruj wypłaty, żeby otrzymać zarobione pieniądze").waitFor();

    assert.equal((await acceptRequest({ mentorId, requestId: request.id }, { db, payments: null })).ok, true);
    // Sesja trwa: obie strony piszą w terminie, potem „upływ czasu” jak w session-settlement.e2e.mjs → `held`.
    await db.query(
      `update requests set slot_start = date_trunc('second', now()) - interval '1 minute',
                           slot_end = date_trunc('second', now()) - interval '1 minute' + length_minutes * interval '1 minute'
        where id = $1`,
      [request.id],
    );
    const token = developer.url().split("?")[0].split("/r/")[1];
    const developerMessage = await fetch(`${BASE_URL}/api/r/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Token": token },
      body: JSON.stringify({ body: "Dzień dobry, jestem gotowy." }),
    });
    assert.equal(developerMessage.status, 201);
    await home.goto(`${BASE_URL}/mentor/requests/${request.id}`);
    const mentorMessageStatus = await home.evaluate(
      async ([id, text]) => (await fetch(`/api/mentor/requests/${id}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      })).status,
      [request.id, "Cześć, zaczynamy."],
    );
    assert.equal(mentorMessageStatus, 201);
    await db.query(
      `with shift as (select slot_start - (date_trunc('second', now()) - interval '60 minutes') as delta from requests where id = $1)
       update session_messages set created_at = created_at - (select delta from shift) where request_id = $1`,
      [request.id],
    );
    await db.query(
      `update requests set slot_start = date_trunc('second', now()) - interval '60 minutes',
                           slot_end = date_trunc('second', now()) - interval '60 minutes' + length_minutes * interval '1 minute'
        where id = $1`,
      [request.id],
    );
    const settlement = await fetch(`${BASE_URL}/api/internal/jobs`, {
      method: "POST",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    assert.equal(settlement.status, 200);
    await home.goto(`${BASE_URL}/mentor`);
    await home.getByText("Skonfiguruj wypłaty, żeby otrzymać zarobione pieniądze").waitFor();
    const requests = await context.newPage();
    await requests.goto(`${BASE_URL}/mentor/requests`);
    await requests.getByRole("main").waitFor();
    await requests.close();
    await home.goto(`${BASE_URL}/mentor/payouts`);
    await home.getByText("135 zł").first().waitFor();
    await shot(home, "mentor-payouts-held-390");

    await home.getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }).click();
    await home.waitForURL(`${FAKE_STRIPE}/connect/**`);
    await home.getByRole("button", { name: "Dokończ konfigurację (test)" }).click();
    await home.waitForURL(`${BASE_URL}/mentor/payouts?stripe=return`);
    await home.getByText("Wypłaty gotowe").waitFor();
    await home.goto(`${BASE_URL}/mentor`);
    await home.getByText("Wypłaty gotowe").waitFor();
    assert.equal(await home.getByRole("link", { name: "Zobacz wypłaty" }).getAttribute("href"), "/mentor/payouts");

    const response = await fetch(`${BASE_URL}/api/internal/jobs`, {
      method: "POST",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    assert.equal(response.status, 200);
    await home.goto(`${BASE_URL}/mentor/payouts`);
    await home.reload();
    const paidOutValue = home.locator("dt").filter({ hasText: "Wypłacone do tej pory" }).locator("xpath=following-sibling::dd");
    const owedValue = home.locator("dt").filter({ hasText: "Do wypłaty" }).locator("xpath=following-sibling::dd");
    await paidOutValue.waitFor();
    assert.match(await paidOutValue.innerText(), /135\s?zł/);
    assert.match(await owedValue.innerText(), /0\s?zł/);
    const payout = (await db.query(
      "select status, stripe_transfer_id, amount_minor from payouts where request_id = $1",
      [request.id],
    )).rows[0];
    assert.equal(payout.status, "paid");
    assert.equal(payout.amount_minor, 13_500);
    assert.ok(payout.stripe_transfer_id);
    const transferStats = await fetch(`${FAKE_STRIPE}/__test/transfers`).then((result) => result.json());
    assert.equal(transferStats.count, 1);
    await shot(home, "mentor-payouts-paid-390");
    await developer.close();
    await home.close();
  });
});
