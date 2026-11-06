// E2E: rozliczenie sesji po terminie (spec #21 Implementation Plan krok 4; R09, R15, D11) na buildzie produkcyjnym
// z lokalnym fałszywym Stripe. Zapytania przez prawdziwy formularz i płatność, akceptacja funkcją domeny (#18),
// wiadomości przez API czatu (#20) w trwającym terminie; potem „upływ czasu” SQL-em (termin w przeszłość, czasy
// wiadomości przesunięte razem z nim) i wywołanie `POST /api/internal/jobs` jak cron hostingu (losowy CRON_SECRET
// z `scripts/test-e2e.mjs`).
//
// - Po terminie, przed zadaniem: „Sesja zakończona — rozliczamy”.
// - Pisał tylko deweloper → zwrot `mentor_no_show` wykonany (AC1); tylko mentor → płatność zostaje (AC2);
//   nikt → zwrot (AC3, D11); obie strony → „Sesja odbyta”, bez zwrotu (AC4). Lista mentora z wynikami.
// Zrzuty ekranu: gdy ustawione `E2E_SCREENSHOT_DIR`.
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
const skip = BASE_URL && DATABASE_URL && FAKE_STRIPE && CRON_SECRET ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL / E2E_DATABASE_URL / E2E_FAKE_STRIPE_URL / E2E_CRON_SECRET).";

const DAILY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 }));
const QUESTION = "Po migracji na app router dostaję błąd hydracji w liście zamówień. Co sprawdzić najpierw?";
const CONTEXT = { locale: "pl-PL", timezoneId: "Europe/Warsaw", viewport: { width: 1024, height: 900 } };

describe("rozliczenie sesji po terminie (#21)", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  /** @type {import("playwright").BrowserContext} */
  let mentorContext;
  let mentorId = "";
  let slug = "";

  async function shot(tab, name) {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await tab.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  }

  /** Opłacone i zaakceptowane zapytanie (n-ty wolny termin co 8), od razu w trwającym terminie. */
  async function liveSession(index) {
    const context = await browser.newContext(CONTEXT);
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
    const { rows } = await db.query("select id, payment_id from requests where mentor_id = $1 order by created_at desc limit 1", [mentorId]);
    assert.equal((await acceptRequest({ mentorId, requestId: rows[0].id }, { db, payments: null })).ok, true);
    await db.query(
      `update requests set slot_start = date_trunc('second', now()) - interval '1 minute',
                           slot_end = date_trunc('second', now()) - interval '1 minute' + length_minutes * interval '1 minute'
        where id = $1`,
      [rows[0].id],
    );
    return { requestUrl, token: requestUrl.split("/r/")[1], id: rows[0].id, paymentId: rows[0].payment_id };
  }

  const postAsDeveloper = (session, body) =>
    fetch(`${BASE_URL}/api/r/session`, { method: "POST", headers: { "Content-Type": "application/json", "X-Request-Token": session.token }, body: JSON.stringify({ body }) });

  async function postAsMentor(session, body) {
    const page = await mentorContext.newPage();
    await page.goto(`${BASE_URL}/mentor/requests/${session.id}`);
    const status = await page.evaluate(
      async ([id, text]) => (await fetch(`/api/mentor/requests/${id}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) })).status,
      [session.id, body],
    );
    await page.close();
    return status;
  }

  /** „Upływ czasu”: termin godzinę wcześniej, wiadomości przesunięte o tyle samo (zostają w terminie). */
  async function endSession(session) {
    await db.query(
      `with shift as (select slot_start - (date_trunc('second', now()) - interval '60 minutes') as delta from requests where id = $1)
       update session_messages set created_at = created_at - (select delta from shift) where request_id = $1`,
      [session.id],
    );
    await db.query(
      `update requests set slot_start = date_trunc('second', now()) - interval '60 minutes',
                           slot_end = date_trunc('second', now()) - interval '60 minutes' + length_minutes * interval '1 minute'
        where id = $1`,
      [session.id],
    );
  }

  const runJobs = async () => {
    const response = await fetch(`${BASE_URL}/api/internal/jobs`, { method: "POST", headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    assert.equal(response.status, 200);
    return (await response.json()).results["sessions.settleEnded"];
  };

  async function developerPage(session, name) {
    const context = await browser.newContext(CONTEXT);
    const tab = await context.newPage();
    await tab.goto(session.requestUrl);
    await tab.getByRole("heading", { level: 1 }).waitFor();
    const heading = await tab.getByRole("heading", { level: 1 }).innerText();
    const text = await tab.locator("main").innerText();
    if (name) await shot(tab, name);
    await context.close();
    return { heading, text };
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
    browser = await chromium.launch();
    const address = `e2e-settle-${Date.now()}@example.com`;
    const { url } = await createInvitation({ db, email: address, appUrl: BASE_URL });
    mentorContext = await browser.newContext(CONTEXT);
    const page = await mentorContext.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
    await page.waitForURL(`${BASE_URL}/mentor`);
    await page.close();
    mentorId = (await db.query("select id from mentors where lower(email) = lower($1)", [address])).rows[0].id;
    slug = `anna-rozliczenie-${Date.now().toString(36)}`;
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

  test("AC1–AC4: wynik każdej sesji po zadaniu; przed zadaniem „Sesja zakończona — rozliczamy”", async () => {
    const developerOnly = await liveSession(0);
    assert.equal((await postAsDeveloper(developerOnly, "Jestem, czekam na mentora")).status, 201);
    const mentorOnly = await liveSession(1);
    assert.equal(await postAsMentor(mentorOnly, "Jestem, czekam na pytania"), 201);
    const nobody = await liveSession(2);
    const both = await liveSession(3);
    assert.equal((await postAsDeveloper(both, "Dzień dobry")).status, 201);
    assert.equal(await postAsMentor(both, "Dzień dobry, czytam"), 201);
    for (const session of [developerOnly, mentorOnly, nobody, both]) await endSession(session);

    const pending = await developerPage(developerOnly, "05-deweloper-rozliczamy");
    assert.match(pending.heading, /Sesja zakończona — rozliczamy/);
    assert.doesNotMatch(pending.text, /zwrot/i, "przed rozliczeniem bez słowa o pieniądzach");

    const counts = await runJobs();
    assert.ok(counts.settled >= 4, JSON.stringify(counts));

    const refunded = await developerPage(developerOnly, "06-deweloper-mentor-nie-pisal-zwrot");
    assert.match(refunded.heading, /Brak wiadomości od mentora w czasie sesji — zwrot 150\szł zlecony automatycznie/);
    assert.match(refunded.text, /Zwrot wykonany/);
    assert.match(refunded.text, /Jestem, czekam na mentora/, "czat zostaje do odczytu");

    const kept = await developerPage(mentorOnly, "07-deweloper-nie-pisal-platnosc-zostaje");
    assert.match(kept.heading, /Brak Twojej wiadomości w czasie sesji — zgodnie z zasadami płatność zostaje u mentora/);
    assert.doesNotMatch(kept.text, /Zwrot/);

    assert.match((await developerPage(nobody)).heading, /Brak wiadomości od mentora w czasie sesji — zwrot 150\szł zlecony/);
    assert.match((await developerPage(both, "08-deweloper-sesja-odbyta")).heading, /Sesja odbyta/);

    const { rows } = await db.query(
      `select r.id, r.status, p.refund_status, p.refund_reason from requests r join payments p on p.id = r.payment_id where r.id = any($1)`,
      [[developerOnly.id, mentorOnly.id, nobody.id, both.id]],
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    assert.deepEqual(byId[developerOnly.id], { id: developerOnly.id, status: "mentor_no_show", refund_status: "succeeded", refund_reason: "mentor_no_show" });
    assert.deepEqual(byId[mentorOnly.id], { id: mentorOnly.id, status: "mentee_no_show", refund_status: null, refund_reason: null });
    assert.deepEqual(byId[nobody.id], { id: nobody.id, status: "mentor_no_show", refund_status: "succeeded", refund_reason: "mentor_no_show" });
    assert.deepEqual(byId[both.id], { id: both.id, status: "held", refund_status: null, refund_reason: null });

    // Drugie wywołanie zadań nic nie zmienia.
    assert.equal((await runJobs()).settled, 0);

    const list = await mentorContext.newPage();
    await list.goto(`${BASE_URL}/mentor/requests`);
    await list.getByText("Zakończone — sesja odbyta").waitFor();
    await list.getByText("Zakończone — brak wiadomości od dewelopera (płatność zostaje)").waitFor();
    assert.equal(await list.getByText("Zakończone — brak Twojej wiadomości (zwrot dla dewelopera)").count(), 2);
    await shot(list, "09-mentor-lista-wynikow");
    await list.close();
  });
});
