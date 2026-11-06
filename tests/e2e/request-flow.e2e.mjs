// E2E: zapytanie opłacone z góry (spec #17 UI/UX, F4, story 1–3; Implementation Plan krok 7–8) na buildzie
// produkcyjnym z lokalnym fałszywym Stripe (`tests/e2e/fake-stripe-server.mjs`, uruchamia go `scripts/test-e2e.mjs`).
//
// - F4: każda godzina na /m/{slug} to radio formularza (nazwa dostępna z datą i godziną), bez „Zarezerwuj”.
// - Ścieżka szczęśliwa: termin → imię → pytanie → „Zapłać 150 zł i wyślij pytanie” → strona płatności (fałszywy
//   Stripe) → „Zapłać (test)” → /r/{token}: „Opłacone — czeka na mentora”, „Zapisz ten link”, pytanie.
// - Porzucenie: „Wróć” na stronie płatności → „Płatność przerwana — nic nie pobrano”, pytanie do skopiowania,
//   „Wybierz inny termin”; termin wraca do oferty.
// - Dwie karty o jeden termin: druga dostaje „Ten termin właśnie się zajął — wybierz inny”, pytanie zostaje.
// - Błędy pól z fokusem na pierwszym; /r/ z nieznanym tokenem → 404; nagłówki Referrer-Policy i X-Robots-Tag.
// Zrzuty ekranu: gdy ustawione `E2E_SCREENSHOT_DIR`, test zapisuje PNG kolejnych ekranów (dowód do PR).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { acceptInvitation } from "../../lib/auth/mentor-auth.mjs";
import { saveAvailability } from "../../lib/availability/save.mjs";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const FAKE_STRIPE = process.env.E2E_FAKE_STRIPE_URL;
const SHOTS = process.env.E2E_SCREENSHOT_DIR;
const skip = BASE_URL && DATABASE_URL && FAKE_STRIPE ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL / E2E_DATABASE_URL / E2E_FAKE_STRIPE_URL).";

const DAILY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 }));
const QUESTION = "Po przejściu na app router dostaję błąd hydracji w liście produktów. Próbowałem suppressHydrationWarning, nie pomaga. Termin: jutro.";
const PAY_BUTTON = /Zapłać 150 zł i wyślij pytanie/;

describe("zapytanie opłacone z góry — formularz i /r/{token} (#17)", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  let slug = "";

  async function shot(tab, name) {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await tab.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  }

  async function newTab(options = {}) {
    const context = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw", viewport: { width: 1024, height: 900 }, ...options });
    const tab = await context.newPage();
    /** @type {string[]} */
    const errors = [];
    tab.on("pageerror", (error) => errors.push(String(error)));
    return { tab, errors, context };
  }

  async function openForm(tab) {
    await tab.goto(`${BASE_URL}/m/${slug}`);
    await tab.getByRole("radio", { name: /\d{2}:\d{2}/ }).first().waitFor();
  }

  /** Wypełnia formularz dla n-tej godziny 25 min i wysyła. Zwraca nazwę wybranego terminu. */
  async function submitForm(tab, { index = 0, name = "Kuba", question = QUESTION } = {}) {
    const slot = tab.getByRole("radio", { name: /\d{2}:\d{2}/ }).nth(index);
    // Nazwa dostępna radia pochodzi z otaczającego `<label>` (DS RadioGroup): „jutro, wtorek 20.10, 18:00”.
    const label = ((await slot.evaluate((el) => el.closest("label")?.textContent ?? "")) || "").trim();
    await slot.click();
    await tab.getByLabel("Imię").fill(name);
    await tab.getByLabel("Twoje pytanie").fill(question);
    await tab.getByRole("button", { name: PAY_BUTTON }).click();
    return label;
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    const email = `e2e-request-${Date.now()}@example.com`;
    const { url } = await createInvitation({ db, email, appUrl: BASE_URL });
    const accepted = await acceptInvitation({ db, token: url.slice(url.lastIndexOf("/") + 1) });
    slug = `anna-zapytania-${Date.now().toString(36)}`;
    const saved = await saveMentorPage({
      db,
      mentorId: accepted.mentorId,
      input: { displayName: "Anna K.", publicWorkUrl: "https://github.com/anna-k", description: "Next.js i React od 2016 roku. Migracje, cache, code review.", price25: "150", price50: "280", slug },
      publish: true,
      appUrl: BASE_URL,
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    await saveAvailability({ db, mentorId: accepted.mentorId, input: { timeZone: "Europe/Warsaw", windows: DAILY } });
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    await db?.end();
  });

  test("F4: każda godzina to radio formularza z datą i godziną; brak „Zarezerwuj”; kolejność pól", async () => {
    const { tab, errors } = await newTab();
    await openForm(tab);
    const radios = tab.getByRole("radio", { name: /\d{2}:\d{2}/ });
    assert.ok((await radios.count()) > 10);
    assert.equal(await tab.getByRole("button", { name: /Zarezerwuj|Rezerwuj/ }).count(), 0);
    assert.equal(await tab.getByRole("link", { name: /Zarezerwuj|Rezerwuj/ }).count(), 0);
    const order = await tab.evaluate(() => {
      const form = document.querySelector("form");
      const marks = ["Najbliższe terminy", "Imię", "Twoje pytanie", "Zapłać"];
      const text = form?.textContent ?? "";
      return marks.map((m) => text.indexOf(m));
    });
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), `kolejność pól: ${order}`);
    await shot(tab, "01-formularz-zapytania");
    assert.deepEqual(errors, []);
    await tab.context().close();
  });

  test("błędy pól: puste imię i pytanie → komunikaty, fokus na pierwszym błędzie, nic nie wysłane", async () => {
    const { tab } = await newTab();
    await openForm(tab);
    await tab.getByRole("button", { name: PAY_BUTTON }).click();
    await tab.getByText("Wybierz termin").first().waitFor();
    await tab.getByText(/Opisz problem w co najmniej 20 znakach/).waitFor();
    await shot(tab, "02-bledy-pol");
    assert.equal(tab.url(), `${BASE_URL}/m/${slug}`);
    await tab.context().close();
  });

  test("ścieżka szczęśliwa: płatność w (fałszywym) Stripe → /r/{token} „Opłacone — czeka na mentora”", async () => {
    const { tab, errors } = await newTab();
    await openForm(tab);
    await submitForm(tab);
    await tab.waitForURL(`${FAKE_STRIPE}/pay/**`);
    await shot(tab, "03-strona-platnosci-falszywy-stripe");
    await tab.getByRole("button", { name: "Zapłać (test)" }).click();
    await tab.waitForURL(/\/r\/[A-Za-z0-9_-]{43}\?checkout=return&session_id=cs_test_/);
    await tab.getByRole("heading", { level: 1, name: /Opłacone — czeka na mentora/ }).waitFor();
    await tab.getByText("Zapisz ten link").waitFor();
    await tab.getByText(QUESTION).waitFor();
    await shot(tab, "04-r-oplacone");
    const requestUrl = tab.url().split("?")[0];
    const response = await fetch(requestUrl, { redirect: "manual" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.deepEqual(errors, []);
    // Opłacony termin znika z listy.
    await openForm(tab);
    await tab.context().close();
  });

  test("porzucenie płatności: „Wróć” → „Płatność przerwana — nic nie pobrano”, pytanie do skopiowania, termin wolny", async () => {
    const { tab } = await newTab();
    await openForm(tab);
    const label = await submitForm(tab, { index: 3 });
    await tab.waitForURL(`${FAKE_STRIPE}/pay/**`);
    await tab.getByRole("link", { name: "Wróć" }).click();
    await tab.waitForURL(/checkout=cancel/);
    await tab.getByRole("heading", { level: 1, name: /Płatność przerwana — nic nie pobrano/ }).waitFor();
    await tab.getByRole("button", { name: "Kopiuj pytanie" }).waitFor();
    const back = tab.getByRole("link", { name: "Wybierz inny termin" });
    assert.equal(await back.getAttribute("href"), `/m/${slug}`);
    await shot(tab, "05-r-platnosc-przerwana");
    await back.click();
    assert.ok(label.length > 0);
    await tab.getByRole("radio", { name: label, exact: true }).waitFor();
    await tab.context().close();
  });

  test("dwie karty o jeden termin → druga: „Ten termin właśnie się zajął — wybierz inny”, pytanie zostaje", async () => {
    const first = await newTab();
    const second = await newTab();
    await openForm(first.tab);
    await openForm(second.tab);
    await submitForm(first.tab, { index: 6 });
    await first.tab.waitForURL(`${FAKE_STRIPE}/pay/**`);
    await submitForm(second.tab, { index: 6, name: "Ola" });
    await second.tab.getByText("Ten termin właśnie się zajął — wybierz inny").waitFor();
    assert.equal(await second.tab.getByLabel("Twoje pytanie").inputValue(), QUESTION);
    await shot(second.tab, "06-termin-zajety");
    await first.context.close();
    await second.context.close();
  });

  test("/r/ z nieznanym tokenem → 404 bez szczegółów", async () => {
    const response = await fetch(`${BASE_URL}/r/${"A".repeat(43)}`, { redirect: "manual" });
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.match(html, /Nie ma takiej strony/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal((await fetch(`${BASE_URL}/r`, { redirect: "manual" })).status, 404);
  });

  test("wąski ekran 320 px: formularz i strona zapytania bez poziomego przewijania", async () => {
    const { tab } = await newTab({ viewport: { width: 320, height: 800 } });
    await openForm(tab);
    const overflow = await tab.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false);
    await shot(tab, "07-formularz-320px");
    await tab.context().close();
  });
});
