// E2E: czat sesji (spec #20 Implementation Plan krok 4) na buildzie produkcyjnym z lokalnym fałszywym Stripe.
// Zapytanie powstaje przez prawdziwy formularz i płatność (jak `mentor-requests.e2e.mjs`), akceptacja funkcją
// domeny (#18), a termin sesji przesuwamy SQL-em na „teraz” (sesja trwa) albo w przeszłość (po sesji).
//
// - AC1: deweloper i mentor widzą swoje wiadomości na żywo (w rytmie odpytywania), w dwóch przeglądarkach.
// - AC2: komunikat „tylko tekst” na obu ekranach; brak przycisków wideo / głosu.
// - AC3: inny mentor, zły token, brak sesji — żadnej treści (strona i API).
// - AC4: wiadomość zapisana z czasem bazy w terminie.
// - Przed terminem: „Czat otworzy się …”, bez pola; po terminie: tylko do odczytu. Obcy Origin → 403.
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
const SHOTS = process.env.E2E_SCREENSHOT_DIR;
const skip = BASE_URL && DATABASE_URL && FAKE_STRIPE ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL / E2E_DATABASE_URL / E2E_FAKE_STRIPE_URL).";

const DAILY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 }));
const QUESTION = "Po migracji na app router dostaję błąd hydracji w liście zamówień. Co sprawdzić najpierw?";
const TEXT_ONLY = "Sesja odbywa się wyłącznie na czacie tekstowym — bez wideo i rozmowy głosowej.";
const NOT_FOUND = "Nie ma takiego zapytania albo nie masz do niego dostępu";
const CONTEXT = { locale: "pl-PL", timezoneId: "Europe/Warsaw", viewport: { width: 1024, height: 900 } };

describe("czat sesji — /r/{token} i /mentor/requests/{id} (#20)", { skip }, () => {
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

  async function signedInMentor(label) {
    const address = `e2e-chat-${label}-${Date.now()}-${++counter}@example.com`;
    const { url } = await createInvitation({ db, email: address, appUrl: BASE_URL });
    const context = await browser.newContext(CONTEXT);
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
    await page.waitForURL(`${BASE_URL}/mentor`);
    const { rows } = await db.query("select id from mentors where lower(email) = lower($1)", [address]);
    await page.close();
    return { context, id: rows[0].id };
  }

  /** Opłacone i zaakceptowane zapytanie (n-ty wolny termin co 8); zwraca adres /r/, token i id. */
  async function acceptedRequest(index) {
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
    const { rows } = await db.query("select id from requests where mentor_id = $1 order by created_at desc limit 1", [mentorId]);
    const accepted = await acceptRequest({ mentorId, requestId: rows[0].id }, { db, payments: null });
    assert.equal(accepted.ok, true);
    return { requestUrl, token: requestUrl.split("/r/")[1], id: rows[0].id };
  }

  /** Przesuwa termin: start = teraz + `offsetMinutes` (długość bez zmian). */
  async function moveSlot(id, offsetMinutes) {
    await db.query(
      `update requests set slot_start = date_trunc('second', now()) + make_interval(mins => $2),
                           slot_end = date_trunc('second', now()) + make_interval(mins => $2 + length_minutes)
        where id = $1`,
      [id, offsetMinutes],
    );
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
    browser = await chromium.launch();
    const mentor = await signedInMentor("anna");
    mentorContext = mentor.context;
    mentorId = mentor.id;
    slug = `anna-czat-${Date.now().toString(36)}`;
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

  /** @type {{ requestUrl: string, token: string, id: string }} */
  let live;

  test("przed terminem: „Czat otworzy się …”, komunikat „tylko tekst”, bez pola wiadomości (oba ekrany)", async () => {
    const future = await acceptedRequest(0);
    const developer = await browser.newContext(CONTEXT);
    const tab = await developer.newPage();
    await tab.goto(future.requestUrl);
    await tab.getByText(/Czat otworzy się/).waitFor();
    await tab.getByText(TEXT_ONLY).waitFor();
    assert.equal(await tab.getByRole("textbox", { name: "Twoja wiadomość" }).count(), 0);
    await shot(tab, "01-deweloper-przed-sesja");
    await developer.close();

    const page = await mentorContext.newPage();
    await page.goto(`${BASE_URL}/mentor/requests/${future.id}`);
    await page.getByText(/Czat otworzy się/).waitFor();
    await page.getByText(TEXT_ONLY).waitFor();
    await page.close();
  });

  test("AC1+AC2+AC4: w terminie obie strony piszą i widzą się na żywo; tylko tekst, bez wideo i głosu", async () => {
    live = await acceptedRequest(1);
    await moveSlot(live.id, -1);

    const developer = await browser.newContext(CONTEXT);
    const dev = await developer.newPage();
    const errors = [];
    dev.on("pageerror", (error) => errors.push(String(error)));
    await dev.goto(live.requestUrl);
    await dev.getByText(/Sesja trwa — zostało \d+ min/).waitFor();
    await dev.getByText(TEXT_ONLY).waitFor();
    assert.equal(await dev.getByRole("button", { name: /wideo|głos|zadzwoń|kamera|mikrofon/i }).count(), 0);

    const mentor = await mentorContext.newPage();
    await mentor.goto(`${BASE_URL}/mentor/requests/${live.id}`);
    await mentor.getByText(/Sesja trwa — zostało \d+ min/).waitFor();
    await mentor.getByText(TEXT_ONLY).waitFor();
    assert.equal(await mentor.getByRole("button", { name: /wideo|głos|zadzwoń|kamera|mikrofon/i }).count(), 0);

    const devBox = dev.getByRole("textbox", { name: "Twoja wiadomość" });
    await devBox.fill("Dzień dobry, wklejam błąd:\n  at OrderList (app/orders/list.tsx:18)");
    await dev.getByRole("button", { name: "Wyślij" }).click();
    await dev.getByRole("list", { name: "Wiadomości sesji" }).getByText(/wklejam błąd/).waitFor();
    assert.equal(await devBox.inputValue(), "");

    // Mentor widzi wiadomość dewelopera bez przeładowania (odpytywanie co 3 s).
    await mentor.getByRole("list", { name: "Wiadomości sesji" }).getByText(/wklejam błąd/).waitFor({ timeout: 10_000 });
    await mentor.getByRole("textbox", { name: "Twoja wiadomość" }).fill("Widzę. new Date() w renderze — przenieś do efektu.");
    await mentor.getByRole("button", { name: "Wyślij" }).click();
    await dev.getByRole("list", { name: "Wiadomości sesji" }).getByText(/przenieś do efektu/).waitFor({ timeout: 10_000 });
    const devItems = dev.getByRole("list", { name: "Wiadomości sesji" }).getByRole("listitem");
    assert.match(await devItems.nth(0).innerText(), /^Ty/);
    assert.match(await devItems.nth(1).innerText(), /^Anna K\./);
    const mentorItems = mentor.getByRole("list", { name: "Wiadomości sesji" }).getByRole("listitem");
    assert.match(await mentorItems.nth(0).innerText(), /^Kuba/);
    await shot(dev, "02-deweloper-czat-w-trakcie");
    await shot(mentor, "03-mentor-czat-w-trakcie");

    const { rows } = await db.query(
      `select m.author, m.created_at >= r.slot_start and m.created_at < r.slot_end as in_slot
         from session_messages m join requests r on r.id = m.request_id where r.id = $1 order by m.seq`,
      [live.id],
    );
    assert.deepEqual(rows.map((r) => [r.author, r.in_slot]), [["mentee", true], ["mentor", true]]);
    assert.deepEqual(errors, []);
    await developer.close();
    await mentor.close();
  });

  test("AC3: inny mentor i zły token nie widzą treści; API: 404 / 401; obcy Origin → 403", async () => {
    const other = await signedInMentor("bartek");
    const page = await other.context.newPage();
    await page.goto(`${BASE_URL}/mentor/requests/${live.id}`);
    await page.getByText(NOT_FOUND).waitFor();
    assert.equal(await page.getByText(/wklejam błąd/).count(), 0);
    const viaApi = await page.evaluate(async (id) => {
      const response = await fetch(`/api/mentor/requests/${id}/session`);
      return { status: response.status, text: await response.text() };
    }, live.id);
    assert.equal(viaApi.status, 404);
    assert.doesNotMatch(viaApi.text, /wklejam/);
    await other.context.close();

    const anonymous = await fetch(`${BASE_URL}/api/mentor/requests/${live.id}/session`);
    assert.equal(anonymous.status, 401);
    const wrongToken = await fetch(`${BASE_URL}/api/r/session`, { headers: { "X-Request-Token": "A".repeat(43) } });
    assert.equal(wrongToken.status, 404);
    assert.equal(wrongToken.headers.get("cache-control"), "no-store");
    const noToken = await fetch(`${BASE_URL}/api/r/session`);
    assert.equal(noToken.status, 404);

    const foreign = await fetch(`${BASE_URL}/api/r/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example", "X-Request-Token": live.token },
      body: JSON.stringify({ body: "z obcej strony" }),
    });
    assert.equal(foreign.status, 403);
    const form = await fetch(`${BASE_URL}/api/r/session`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Request-Token": live.token },
      body: "body=x",
    });
    assert.equal(form.status, 415);
    const { rows } = await db.query("select count(*)::int as n from session_messages where request_id = $1", [live.id]);
    assert.equal(rows[0].n, 2);
  });

  test("po terminie: czat tylko do odczytu, wysłanie przez API → 409 closed", async () => {
    await moveSlot(live.id, -60);
    const developer = await browser.newContext(CONTEXT);
    const dev = await developer.newPage();
    await dev.goto(live.requestUrl);
    await dev.getByText("Sesja zakończona — czat tylko do odczytu").waitFor();
    await dev.getByRole("list", { name: "Wiadomości sesji" }).getByText(/przenieś do efektu/).waitFor();
    assert.equal(await dev.getByRole("textbox", { name: "Twoja wiadomość" }).count(), 0);
    await shot(dev, "04-deweloper-po-sesji");
    await developer.close();

    const late = await fetch(`${BASE_URL}/api/r/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Token": live.token },
      body: JSON.stringify({ body: "za późno" }),
    });
    assert.equal(late.status, 409);
    assert.deepEqual(await late.json(), { ok: false, error: "closed" });
  });
});
