// Lekcja 21 — ręczne sprawdzenie wypłat w prawdziwej przeglądarce i fałszywym Stripe.
// Uruchomienie: npm run test:e2e -- lekcja-21/qa/manual-check.e2e.mjs
// Wynik: lekcja-21/qa/manual-check-result.json; zrzuty ekranu: lekcja-21/qa/.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
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
const OUT = path.resolve("lekcja-21/qa");
const skip = BASE_URL && DATABASE_URL && FAKE_STRIPE && CRON_SECRET ? false : "npm run test:e2e -- lekcja-21/qa/manual-check.e2e.mjs";
const DAILY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 }));
const PHONE = { locale: "pl-PL", timezoneId: "Europe/Warsaw", viewport: { width: 390, height: 844 } };
const nbsp = (text) => text.replace(/\u00a0/g, " ");

describe("lekcja 21 — ręczne sprawdzenie wypłat", { skip }, () => {
  /** @type {pg.Pool} */ let db;
  /** @type {import("playwright").Browser} */ let browser;
  const result = { at: new Date().toISOString(), viewport: "390x844", steps: [] };
  const step = (name, ok, detail = "") => result.steps.push({ name, ok, detail });

  async function mentor(label) {
    const email = `l21-${label}-${Date.now()}@example.com`;
    const { url } = await createInvitation({ db, email, appUrl: BASE_URL });
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
    await page.waitForURL(`${BASE_URL}/mentor`);
    const id = (await db.query("select id from mentors where lower(email) = lower($1)", [email])).rows[0].id;
    const slug = `l21-${label}-${Date.now().toString(36)}`;
    await saveMentorPage({
      db,
      mentorId: id,
      input: { displayName: `Mentor ${label}`, publicWorkUrl: "https://github.com/example", description: "Architektura i migracje aplikacji Next.js.", price25: "150", price50: "280", slug },
      publish: true,
      appUrl: BASE_URL,
    });
    await saveAvailability({ db, mentorId: id, input: { timeZone: "Europe/Warsaw", windows: DAILY } });
    return { id, slug, context, page };
  }

  const settled = async (page) => {
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.querySelectorAll("main").length === 1 && !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {});
  };
  const shot = async (page, name) => {
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  };
  const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  async function createPaidHeldRequest(person, developerName) {
    const developer = await browser.newPage({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
    await developer.goto(`${BASE_URL}/m/${person.slug}`);
    await developer.getByRole("radio", { name: /\d{2}:\d{2}/ }).first().click();
    await developer.getByLabel("Imię").fill(developerName);
    await developer.getByLabel("Twoje pytanie").fill("Jak bezpiecznie rozdzielić moduł płatności od reszty aplikacji?");
    await developer.getByRole("button", { name: /Zapłać 150 zł/ }).click();
    await developer.waitForURL(`${FAKE_STRIPE}/pay/**`);
    await developer.getByRole("button", { name: "Zapłać (test)" }).click();
    await developer.waitForURL(/\/r\/.*checkout=return/);
    const request = (await db.query("select id, payment_id from requests where mentor_id = $1 order by created_at desc limit 1", [person.id])).rows[0];

    assert.equal((await acceptRequest({ mentorId: person.id, requestId: request.id }, { db, payments: null })).ok, true);
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
    await person.page.goto(`${BASE_URL}/mentor/requests/${request.id}`);
    const mentorMessageStatus = await person.page.evaluate(
      async ([id, body]) => (await fetch(`/api/mentor/requests/${id}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
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
    const settlement = await fetch(`${BASE_URL}/api/internal/jobs`, { method: "POST", headers: { authorization: `Bearer ${CRON_SECRET}` } });
    assert.equal(settlement.status, 200);
    await developer.close();
    return request;
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
    browser = await chromium.launch();
  });

  after(async () => {
    writeFileSync(path.join(OUT, "manual-check-result.json"), JSON.stringify(result, null, 2));
    await browser?.close();
    await db?.end();
  });

  test("przepływ z E2E, 390 px, konta A i B", async () => {
    const a = await mentor("a");
    const b = await mentor("b");

    await a.page.goto(`${BASE_URL}/mentor`); await settled(a.page);
    const before = await a.page.locator("main").innerText();
    step("A: przed płatnością brak wzmianki o wypłatach", !/wypłat/i.test(before));
    await shot(a.page, "01-mentor-A-przed-platnoscia-390");

    const requestA = await createPaidHeldRequest(a, "Kuba A");
    await a.page.goto(`${BASE_URL}/mentor`); await settled(a.page);
    const promptA = a.page.getByText("Skonfiguruj wypłaty, żeby otrzymać zarobione pieniądze");
    const promptBox = await promptA.boundingBox();
    step("A: prośba o konfigurację jest widoczna przy 390 px", (await promptA.count()) > 0);
    step("A: górna krawędź prośby mieści się w pierwszym widoku 844 px", Boolean(promptBox && promptBox.y >= 0 && promptBox.y < 844), JSON.stringify(promptBox));
    step("A: /mentor bez poziomego przewijania przy 390 px", await noHorizontalScroll(a.page));
    await shot(a.page, "02-mentor-A-prosba-o-wyplaty-390");

    await a.page.goto(`${BASE_URL}/mentor/requests`); await settled(a.page);
    step("A: zapytania działają przy widocznej prośbie", (await a.page.getByText("Kuba A").count()) > 0);
    await shot(a.page, "03-mentor-A-zapytania-390");

    await a.page.goto(`${BASE_URL}/mentor/payouts`); await settled(a.page);
    const payoutsA = nbsp(await a.page.locator("main").innerText());
    step("A: /mentor/payouts ma jeden landmark <main>", (await a.page.locator("main").count()) === 1);
    step("A: held widnieje jako oczekująca kwota 135 zł", /135 zł/.test(payoutsA) && /Wstrzymane/.test(payoutsA), payoutsA.slice(0, 200));
    step("A: /mentor/payouts zawiera nawigację Wyloguj", (await a.page.getByRole("button", { name: "Wyloguj" }).count()) > 0);
    step("A: /mentor/payouts bez poziomego przewijania przy 390 px", await noHorizontalScroll(a.page));
    await shot(a.page, "04-mentor-A-wyplaty-wstrzymane-390");

    await a.page.getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }).click();
    await a.page.waitForURL(`${FAKE_STRIPE}/connect/**`); await settled(a.page);
    const onboardingUrlA = a.page.url();
    await a.page.getByRole("button", { name: "Wróć" }).click();
    await a.page.waitForURL(`${BASE_URL}/mentor/payouts?stripe=refresh`); await settled(a.page);
    const abandonedA = nbsp(await a.page.locator("main").innerText());
    const payoutA = (await db.query("select status from payouts where request_id = $1", [requestA.id])).rows[0];
    step("A: porzucony onboarding pokazuje aktualny komunikat i przycisk dokończenia", abandonedA.includes("Konfiguracja w Stripe nie jest dokończona — kwota czeka na wypłatę") && (await a.page.getByRole("button", { name: "Dokończ konfigurację w Stripe" }).count()) > 0);
    step("A: po porzuceniu środki pozostają oczekujące", payoutA?.status === "held_for_payout", payoutA?.status ?? "brak wypłaty");
    await shot(a.page, "05-mentor-A-onboarding-porzucony-390");

    const requestB = await createPaidHeldRequest(b, "Kuba B");
    await b.page.goto(`${BASE_URL}/mentor/payouts`); await settled(b.page);
    await b.page.getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }).click();
    await b.page.waitForURL(`${FAKE_STRIPE}/connect/**`); await settled(b.page);
    await b.page.getByRole("button", { name: "Wróć" }).click();
    await b.page.waitForURL(`${BASE_URL}/mentor/payouts?stripe=refresh`); await settled(b.page);
    const accountA = (await db.query("select * from mentor_payout_accounts where mentor_id = $1", [a.id])).rows[0];
    const accountB = (await db.query("select * from mentor_payout_accounts where mentor_id = $1", [b.id])).rows[0];
    const payoutB = (await db.query("select status, amount_minor from payouts where request_id = $1", [requestB.id])).rows[0];
    const pendingB = nbsp(await b.page.locator("main").innerText());
    step("B: ma własne konto pending i własne 135 zł", Boolean(accountB) && accountB.state === "pending" && payoutB?.status === "held_for_payout" && payoutB.amount_minor === 13500 && /135 zł/.test(pendingB), pendingB.slice(0, 200));
    step("B: porzucony onboarding pokazuje aktualny komunikat", pendingB.includes("Konfiguracja w Stripe nie jest dokończona — kwota czeka na wypłatę") && (await b.page.getByRole("button", { name: "Dokończ konfigurację w Stripe" }).count()) > 0);
    await shot(b.page, "06-mentor-B-onboarding-porzucony-390");

    await b.page.goto(`${BASE_URL}/mentor/payouts?stripe=return&account=${accountA.stripe_account_id}`); await settled(b.page);
    const afterForeignReturn = nbsp(await b.page.locator("body").innerText());
    const accountAAfterReturn = (await db.query("select * from mentor_payout_accounts where mentor_id = $1", [a.id])).rows[0];
    step("B: cudzy return URL pokazuje wyłącznie stan B, bez danych A", /135 zł/.test(afterForeignReturn) && !afterForeignReturn.includes(accountA.stripe_account_id) && !afterForeignReturn.includes("Kuba A") && !/Wypłaty gotowe/.test(afterForeignReturn), b.page.url());
    step("B: cudzy return URL nie tworzy ani nie zmienia konta A", JSON.stringify(accountAAfterReturn) === JSON.stringify(accountA));
    await shot(b.page, "07-mentor-B-cudzy-powrot-390");

    await b.page.goto(onboardingUrlA); await settled(b.page);
    const foreignOnboarding = nbsp(await b.page.locator("body").innerText());
    const accountAAfterOnboarding = (await db.query("select * from mentor_payout_accounts where mentor_id = $1", [a.id])).rows[0];
    step("B: link onboardingu A nie ujawnia danych konta A", !foreignOnboarding.includes(accountA.stripe_account_id) && !foreignOnboarding.includes("Kuba A") && !/Wypłaty gotowe/.test(foreignOnboarding), b.page.url());
    step("B: otwarcie linku onboardingu A nie zmienia konta A", JSON.stringify(accountAAfterOnboarding) === JSON.stringify(accountA));
    await shot(b.page, "08-mentor-B-cudzy-onboarding-390");
    await b.page.goto(`${BASE_URL}/mentor/payouts`); await settled(b.page);
    const bAfterForeignOnboarding = nbsp(await b.page.locator("main").innerText());
    const accountBAfterForeignOnboarding = (await db.query("select * from mentor_payout_accounts where mentor_id = $1", [b.id])).rows[0];
    step("B: po otwarciu linku A nadal widzi własne 135 zł i konto pending", /135 zł/.test(bAfterForeignOnboarding) && accountBAfterForeignOnboarding.state === "pending" && !bAfterForeignOnboarding.includes(accountA.stripe_account_id));
    await shot(b.page, "08-mentor-B-wlasne-wyplaty-po-linku-390");

    await a.page.goto(`${BASE_URL}/mentor/payouts`); await settled(a.page);
    await a.page.getByRole("button", { name: "Dokończ konfigurację w Stripe" }).click();
    await a.page.waitForURL(`${FAKE_STRIPE}/connect/**`); await settled(a.page);
    await a.page.getByRole("button", { name: "Dokończ konfigurację (test)" }).click();
    await a.page.waitForURL(`${BASE_URL}/mentor/payouts?stripe=return`); await settled(a.page);
    step("A: po powrocie konto wypłat jest gotowe", (await a.page.getByText("Wypłaty gotowe").count()) > 0);
    await shot(a.page, "09-mentor-A-wyplaty-gotowe-390");

    const jobs = await fetch(`${BASE_URL}/api/internal/jobs`, { method: "POST", headers: { authorization: `Bearer ${CRON_SECRET}` } });
    const jobsBody = await jobs.json();
    await a.page.reload(); await settled(a.page);
    const readyPayouts = nbsp(await a.page.locator("main").innerText());
    const payout = (await db.query("select status, amount_minor, stripe_transfer_id from payouts where request_id = $1", [requestA.id])).rows[0];
    step("A: gotowe konto pokazuje held jako Do wypłaty", /Do wypłaty/.test(readyPayouts), readyPayouts.slice(0, 200));
    step("A: zadanie wypłaciło 135 zł", jobs.status === 200 && payout?.status === "paid" && payout.amount_minor === 13500 && /Wypłacone do tej pory\s*135 zł/.test(readyPayouts), JSON.stringify(jobsBody.results?.["payouts.transferOwed"]));
    await shot(a.page, "10-mentor-A-wyplacone-390");

    await fetch(`${BASE_URL}/api/internal/jobs`, { method: "POST", headers: { authorization: `Bearer ${CRON_SECRET}` } });
    const transfers = await fetch(`${FAKE_STRIPE}/__test/transfers`).then((response) => response.json());
    step("Drugie uruchomienie zadania: nadal jeden transfer", transfers.count === 1, JSON.stringify(transfers));

    await a.context.close();
    await b.context.close();
    const failed = result.steps.filter((item) => !item.ok);
    assert.deepEqual(failed.map((item) => item.name), []);
  });
});
