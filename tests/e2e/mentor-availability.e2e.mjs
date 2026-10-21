// E2E: tygodniowa dostępność /mentor/availability i baner „Nie masz dostępności” na /mentor (spec #15,
// zadanie 4.5; Z7, Z15–Z17, Z21, Z24, Z26–Z28, Z40; spec #14 nawigacja L7/L10).
// Uruchamiane przez `npm run test:e2e` (scripts/test-e2e.mjs): serwer `next start` i jednorazowy schemat
// bazy są już gotowe (schemat usuwany po przebiegu), adresy w E2E_BASE_URL / E2E_DATABASE_URL.
//
// Zegar: aplikacja liczy terminy od prawdziwego „teraz”. Oczekiwany podgląd liczymy w teście tą samą funkcją
// (`listOpenSlots` + `previewSlots`) dla chwili tuż przed i tuż po zapisie — wynik nie zależy od pory dnia.
// Testy w jednym `describe` idą po kolei: kroki mentorki A zależą od poprzednich.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { saveAvailability, previewSlots } from "../../lib/availability/save.mjs";
import { listOpenSlots } from "../../lib/availability/slots.mjs";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const skip = BASE_URL && DATABASE_URL ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL / E2E_DATABASE_URL).";

const INVITATION_ONLY = "Dostęp tylko przez zaproszenie — poproś zespół o link do logowania";
const NO_AVAILABILITY = "Nie masz dostępności — nikt nie może wybrać terminu";
const SESSION_EXPIRED = "Sesja wygasła — poproś zespół o link do logowania";
const ZONE_WARNING = "Okna zachowają godziny (np. 18:00) w nowej strefie";
const LIMIT = "Maksymalnie 21 okien w tygodniu";
const WEEKDAYS = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];
// Formy rodzajowe 2. osoby czasu przeszłego (C12): „zrobiłeś”, „byłaś”… — „jesteś” jest neutralne.
const GENDERED_WORD = /(?<!\p{L})\p{L}*(?:łeś|łaś|eś|aś)(?!\p{L})/giu;
const NEUTRAL_WORDS = new Set(["jesteś"]);

/** „18:00” w strefie — jak DS `formatTime`. */
const timeIn = (iso, timeZone) => new Intl.DateTimeFormat("pl-PL", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

describe("mentor: dostępność /mentor/availability i baner na /mentor", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  let counter = 0;
  /** @type {import("playwright").BrowserContext[]} */
  const contexts = [];
  /** Mentorka A: pełna ścieżka (Warszawa). */
  const a = { id: "", /** @type {import("playwright").BrowserContext} */ context: null, /** @type {import("playwright").Page} */ page: null };

  const email = (label) => `e2e-availability-${label}-${Date.now()}-${++counter}@example.com`;

  /** Pełna ścieżka zaproszenia w przeglądarce ze strefą przeglądarki `timezoneId` → zalogowany kontekst na /mentor. */
  async function acceptInBrowser(label, timezoneId = "Europe/Warsaw") {
    const address = email(label);
    const { url } = await createInvitation({ db, email: address, appUrl: BASE_URL });
    const context = await browser.newContext({ locale: "pl-PL", timezoneId });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
    await page.waitForURL(`${BASE_URL}/mentor`);
    await page.getByRole("heading", { level: 1, name: "Twoja strona" }).waitFor();
    const { rows } = await db.query("select id from mentors where lower(email) = lower($1)", [address]);
    return { context, page, id: rows[0].id };
  }

  /** Otwiera /mentor/availability i czeka, aż React podepnie się pod edytor (klik przed hydracją by zginął). */
  async function openAvailability(page) {
    await page.goto(`${BASE_URL}/mentor/availability`);
    await page.getByRole("heading", { level: 1, name: "Dostępność" }).waitFor();
    await page.waitForFunction(() => {
      const button = document.querySelector('main button[role="combobox"]');
      return button !== null && Object.keys(button).some((key) => key.startsWith("__react"));
    });
  }

  async function openMentor(page) {
    await page.goto(`${BASE_URL}/mentor`);
    await page.getByRole("heading", { level: 1, name: "Twoja strona" }).waitFor();
  }

  const zoneBox = (page) => page.getByRole("combobox", { name: "Strefa czasowa" });

  /** Wybór z listy DS `Select` (Radix: lista w portalu). */
  async function choose(page, comboboxName, optionName) {
    await page.getByRole("combobox", { name: comboboxName, exact: true }).click();
    await page.getByRole("option", { name: optionName, exact: true }).click();
    await page.getByRole("listbox").waitFor({ state: "detached" });
  }

  async function windowRows(mentorId) {
    const { rows } = await db.query(
      "select weekday, start_minute, end_minute from availability_windows where mentor_id = $1 order by weekday, start_minute",
      [mentorId],
    );
    return rows.map((row) => [Number(row.weekday), Number(row.start_minute), Number(row.end_minute)]);
  }

  async function mentorZone(mentorId) {
    const { rows } = await db.query("select time_zone from mentors where id = $1", [mentorId]);
    return rows[0].time_zone;
  }

  /** Wiersze podglądu „Najbliższe terminy” jako tekst. */
  async function previewTexts(page) {
    const list = page.getByRole("list", { name: "Najbliższe terminy" });
    if ((await list.count()) === 0) return [];
    return (await list.getByRole("listitem").allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim());
  }

  /** Oczekiwane godziny startu podglądu (10 najbliższych) dla okien z bazy, w strefie mentora. */
  function expectedTimes(windows, timeZone, now) {
    const slots = previewSlots(listOpenSlots({ windows, timeZone, now }));
    return [...new Set(slots.map((slot) => slot.startsAt))].map((iso) => timeIn(iso, timeZone));
  }

  /** Podgląd zgadza się z `listOpenSlots` liczonym tuż przed albo tuż po zapisie (granica siatki :00/:30). */
  async function assertPreview(page, mentorId, timeZone, nows) {
    const windows = (await windowRows(mentorId)).map(([weekday, startMinute, endMinute]) => ({ weekday, startMinute, endMinute }));
    const shown = (await previewTexts(page)).map((text) => text.match(/\d{2}:\d{2}/)?.[0]);
    const candidates = nows.map((now) => expectedTimes(windows, timeZone, now));
    assert.ok(
      candidates.some((times) => JSON.stringify(times) === JSON.stringify(shown)),
      `podgląd ${JSON.stringify(shown)} ≠ ${JSON.stringify(candidates)}`,
    );
    assert.ok(shown.length > 0 && shown.length <= 10, `najwyżej 10 najbliższych godzin startu (jest ${shown.length})`);
    return shown;
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    browser = await chromium.launch();
    Object.assign(a, await acceptInBrowser("a"));
  });

  after(async () => {
    for (const context of contexts) await context.close().catch(() => {});
    await browser?.close();
    await db?.end();
  });

  test("bez sesji: komunikat „tylko przez zaproszenie”, bez danych okien (Z15)", async () => {
    const context = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
    contexts.push(context);
    const page = await context.newPage();
    const response = await page.goto(`${BASE_URL}/mentor/availability`);
    assert.equal(response?.status(), 200);
    const main = page.getByRole("main");
    await main.getByRole("heading", { level: 1, name: INVITATION_ONLY }).waitFor();
    assert.equal(await main.count(), 1);
    const text = await page.locator("body").innerText();
    for (const word of [...WEEKDAYS, "Strefa czasowa", "Najbliższe terminy", "okno", "Zapisz"]) {
      assert.ok(!text.includes(word), `bez „${word}”`);
    }
    assert.equal(await page.getByRole("combobox").count(), 0);
    assert.equal(await page.getByRole("navigation").count(), 0);
    const meta = await page.locator('meta[name="robots"]').getAttribute("content");
    assert.match(meta ?? "", /noindex/);
  });

  test("/mentor: szkic przy pierwszej wizycie ma baner (Z21); nawigacja „Strona”, „Dostępność”, „Wyloguj”, bez „Zapytania”", async () => {
    const { page } = a;
    await openMentor(page);
    await page.getByText(NO_AVAILABILITY, { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Dodaj dostępność" }).getAttribute("href"), "/mentor/availability");
    assert.equal(await page.getByRole("textbox", { name: "Twój link" }).count(), 0, "szkic — bez panelu linku");
    const nav = page.getByRole("navigation", { name: "Panel mentora" });
    assert.deepEqual((await nav.getByRole("link").allInnerTexts()).map((t) => t.trim()), ["Strona", "Dostępność"]);
    assert.equal(await nav.getByRole("button", { name: "Wyloguj" }).count(), 1);
    assert.equal(await page.getByRole("link", { name: /Zapytania|zapyta/ }).count(), 0);
    assert.equal(await nav.getByRole("link", { name: "Dostępność" }).getAttribute("href"), "/mentor/availability");
  });

  test("pierwsza wizyta, przeglądarka Europe/Warsaw: strefa wypełniona, baner, jeden main z h1, tytuł, bez form rodzajowych (Z16, Z24)", async () => {
    const { page } = a;
    await openAvailability(page);
    assert.equal(await page.title(), "Dostępność — DevMentor");
    const main = page.getByRole("main");
    assert.equal(await main.count(), 1);
    assert.equal((await main.getByRole("heading", { level: 1 }).allInnerTexts()).length, 1);
    assert.equal((await page.getByRole("heading", { level: 1 }).allInnerTexts()).length, 1);
    assert.equal(await zoneBox(page).innerText(), "Europe/Warsaw");
    assert.equal(await zoneBox(page).isVisible(), true);
    assert.equal(await page.getByText(NO_AVAILABILITY, { exact: true }).count(), 1, "baner raz (D11)");
    assert.equal(await page.getByRole("link", { name: "Dodaj dostępność" }).count(), 0, "baner bez linku do tej samej strony");
    const nav = page.getByRole("navigation", { name: "Panel mentora" });
    assert.equal(await nav.getByRole("link", { name: "Dostępność" }).getAttribute("aria-current"), "page");
    assert.equal(await mentorZone(a.id), null, "strefa nie jest zapisywana bez „Zapisz”");
    const text = await page.locator("body").innerText();
    const found = [...text.matchAll(GENDERED_WORD)].map((m) => m[0]).filter((w) => !NEUTRAL_WORDS.has(w.toLowerCase()));
    assert.deepEqual(found, []);
    const meta = await page.locator('meta[name="robots"]').getAttribute("content");
    assert.match(meta ?? "", /noindex/);
  });

  test("pierwsza wizyta, przeglądarka America/New_York: wypełniona strefa nowojorska (Z16)", async () => {
    const ny = await acceptInBrowser("ny", "America/New_York");
    // HTML z serwera (przed hydratacją): pole strefy już pokazuje Europe/Warsaw, nigdy puste.
    const html = await (await ny.page.request.get(`${BASE_URL}/mentor/availability`)).text();
    const trigger = html.match(/<button[^>]*role="combobox"[^>]*>([\s\S]*?)<\/button>/);
    assert.ok(trigger, "pole strefy w HTML z serwera");
    assert.match(trigger[1], />Europe\/Warsaw</);
    await openAvailability(ny.page);
    await ny.page.waitForFunction(() => document.querySelector('main button[role="combobox"]')?.textContent === "America/New York");
    // Zapis bez okien zapisuje strefę z przeglądarki pod nazwą z listy serwera.
    await ny.page.getByRole("button", { name: "Zapisz", exact: true }).click();
    await ny.page.getByText("Dostępność zapisana").waitFor();
    assert.equal(await mentorZone(ny.id), "America/New_York");
    assert.deepEqual(await windowRows(ny.id), []);
  });

  test("dodanie „wtorek 18:00–20:00” i „czwartek 12:00–13:00”, zapis → baza, podgląd w strefie mentora, po odświeżeniu to samo", async () => {
    const { page } = a;
    await page.getByRole("button", { name: "Dodaj okno: wtorek" }).click();
    await page.getByRole("button", { name: "Dodaj okno: czwartek" }).click();
    await choose(page, "czwartek, od", "12:00");
    await choose(page, "czwartek, do", "13:00");
    await page.getByRole("button", { name: "Usuń okno czwartek 12:00–13:00" }).waitFor();
    const before = new Date();
    await page.getByRole("button", { name: "Zapisz", exact: true }).click();
    await page.getByText("Dostępność zapisana").waitFor();
    const afterSave = new Date();

    assert.deepEqual(await windowRows(a.id), [
      [2, 18 * 60, 20 * 60],
      [4, 12 * 60, 13 * 60],
    ]);
    assert.equal(await mentorZone(a.id), "Europe/Warsaw");

    assert.equal(await page.getByText(NO_AVAILABILITY, { exact: true }).count(), 0, "baner znika po zapisie");
    await page.getByRole("heading", { level: 2, name: "Najbliższe terminy" }).waitFor();
    assert.equal(await page.getByText("Godziny w strefie Europe/Warsaw.").count(), 1);
    const shown = await assertPreview(page, a.id, "Europe/Warsaw", [before, afterSave]);
    for (const time of shown) assert.ok(["18:00", "18:30", "19:00", "19:30", "12:00", "12:30"].includes(time), time);
    const texts = await previewTexts(page);
    assert.ok(texts.some((t) => t.includes("25 lub 50 min")));
    assert.ok(texts.some((t) => t.includes("tylko 25 min")), "19:30 i 12:30 mieszczą tylko 25 min");

    await openAvailability(page);
    await page.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Usuń okno czwartek 12:00–13:00" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /^Usuń okno / }).count(), 2);
    assert.equal(await zoneBox(page).innerText(), "Europe/Warsaw");
    assert.equal(await page.getByText(NO_AVAILABILITY, { exact: true }).count(), 0);
    await assertPreview(page, a.id, "Europe/Warsaw", [before, new Date()]);
  });

  test("usunięcie okna czwartkowego i zapis → w bazie tylko wtorek, w podglądzie brak czwartku (story 2)", async () => {
    const { page } = a;
    await page.getByRole("button", { name: "Usuń okno czwartek 12:00–13:00" }).click();
    const before = new Date();
    await page.getByRole("button", { name: "Zapisz", exact: true }).click();
    await page.getByText("Dostępność zapisana").waitFor();
    assert.deepEqual(await windowRows(a.id), [[2, 18 * 60, 20 * 60]]);
    // Podgląd przeliczony po zapisie: tylko wtorkowe godziny.
    await page.waitForFunction(() => {
      const list = document.querySelector('ul[aria-label="Najbliższe terminy"]');
      return list !== null && !/\b12:(00|30)\b/.test(list.textContent ?? "");
    });
    const shown = await assertPreview(page, a.id, "Europe/Warsaw", [before, new Date()]);
    for (const time of shown) assert.ok(["18:00", "18:30", "19:00", "19:30"].includes(time), time);
  });

  test("brak sieci przy zapisie → zestaw zostaje, komunikat o połączeniu (Z28), baza bez zmian", async () => {
    const { page, context } = a;
    const rows = await windowRows(a.id);
    await page.getByRole("button", { name: "Dodaj okno: piątek" }).click();
    await context.setOffline(true);
    try {
      await page.getByRole("button", { name: "Zapisz", exact: true }).click();
      const alert = page.getByRole("main").getByRole("alert");
      await alert.waitFor();
      assert.match(await alert.innerText(), /Brak połączenia z internetem/);
      assert.equal(await page.getByRole("button", { name: "Usuń okno piątek 18:00–20:00" }).count(), 1);
      assert.equal(await page.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" }).count(), 1);
    } finally {
      await context.setOffline(false);
    }
    assert.deepEqual(await windowRows(a.id), rows);
  });

  test("zmiana strefy zapisanego zestawu: ostrzeżenie i „Zapisz i zmień strefę”; bez zapisu nic się nie zmienia; zapis zmienia strefę, godziny okien zostają (Z27)", async () => {
    const { page } = a;
    await openAvailability(page);
    assert.equal(await page.getByText(ZONE_WARNING).count(), 0);
    await choose(page, "Strefa czasowa", "America/New York");
    await page.getByText(ZONE_WARNING).waitFor();
    assert.equal(await page.getByRole("button", { name: "Zapisz i zmień strefę" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Zapisz", exact: true }).count(), 0);

    // Odświeżenie bez zapisu: baza i ekran bez zmian.
    await openAvailability(page);
    assert.equal(await mentorZone(a.id), "Europe/Warsaw");
    assert.equal(await zoneBox(page).innerText(), "Europe/Warsaw");
    assert.equal(await page.getByText(ZONE_WARNING).count(), 0);

    await choose(page, "Strefa czasowa", "America/New York");
    const before = new Date();
    await page.getByRole("button", { name: "Zapisz i zmień strefę" }).click();
    await page.getByText("Dostępność zapisana").waitFor();
    assert.equal(await mentorZone(a.id), "America/New_York");
    assert.deepEqual(await windowRows(a.id), [[2, 18 * 60, 20 * 60]], "te same godziny ścienne");
    assert.equal(await page.getByText(ZONE_WARNING).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Zapisz", exact: true }).count(), 1);
    await page.getByText("Godziny w strefie America/New_York.").waitFor();
    const shown = await assertPreview(page, a.id, "America/New_York", [before, new Date()]);
    for (const time of shown) assert.ok(["18:00", "18:30", "19:00", "19:30"].includes(time), `${time} w strefie nowojorskiej`);
  });

  test("sesja odwołana, potem zapis → zestaw zostaje, „Sesja wygasła…” (Z7), bez przekierowania, baza bez zmian", async () => {
    const { page } = a;
    await openAvailability(page);
    const rows = await windowRows(a.id);
    const zone = await mentorZone(a.id);
    await db.query("update mentor_sessions set revoked_at = now() where mentor_id = $1 and revoked_at is null", [a.id]);
    await page.getByRole("button", { name: "Dodaj okno: sobota" }).click();
    await page.getByRole("button", { name: "Zapisz", exact: true }).click();
    const alert = page.getByRole("main").getByRole("alert");
    await alert.waitFor();
    assert.match(await alert.innerText(), new RegExp(SESSION_EXPIRED));
    assert.equal(await page.getByRole("button", { name: "Usuń okno sobota 18:00–20:00" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" }).count(), 1);
    assert.equal(new URL(page.url()).pathname, "/mentor/availability");
    assert.deepEqual(await windowRows(a.id), rows);
    assert.equal(await mentorZone(a.id), zone);
  });

  test("21 okien: „+ okno” niedostępne z powodem „Maksymalnie 21 okien w tygodniu” (Z17)", async () => {
    const m = await acceptInBrowser("limit");
    // 20 okien z bazy (domena), 21. dodane w przeglądarce.
    const windows = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [8, 12, 18].map((hour) => ({ weekday, startMinute: hour * 60, endMinute: hour * 60 + 60 })));
    const saved = await saveAvailability({ db, mentorId: m.id, input: { timeZone: "Europe/Warsaw", windows: windows.slice(1) } });
    assert.equal(saved.ok, true);
    await openAvailability(m.page);
    assert.equal(await m.page.getByRole("button", { name: /^Usuń okno / }).count(), 20);
    const monday = m.page.getByRole("button", { name: "Dodaj okno: poniedziałek" });
    assert.equal(await monday.getAttribute("aria-disabled"), null);
    await monday.click();
    assert.equal(await m.page.getByRole("button", { name: /^Usuń okno / }).count(), 21);
    for (const day of WEEKDAYS) {
      const add = m.page.getByRole("button", { name: `Dodaj okno: ${day}` });
      assert.equal(await add.getAttribute("aria-disabled"), "true", day);
      const describedBy = await add.getAttribute("aria-describedby");
      assert.equal((await m.page.locator(`[id="${describedBy}"]`).innerText()).trim(), LIMIT, day);
    }
    await m.page.getByRole("button", { name: "Dodaj okno: wtorek" }).click({ force: true });
    assert.equal(await m.page.getByRole("button", { name: /^Usuń okno / }).count(), 21, "klik nic nie dodaje");
    // 22 okien nie da się wysłać z interfejsu — odmowę serwera dla 22 sprawdzają testy domeny z bazą
    // (tests/db/availability-save.test.mjs) i story DS „22 windows sent”.
    await m.page.getByRole("button", { name: "Zapisz", exact: true }).click();
    await m.page.getByText("Dostępność zapisana").waitFor();
    assert.equal((await windowRows(m.id)).length, 21);
  });

  test("/mentor opublikowana bez okien: baner przed panelem linku; po zapisaniu okna baneru nie ma, panel jest pierwszy (Z40)", async () => {
    const p = await acceptInBrowser("published");
    const published = await saveMentorPage({
      db,
      mentorId: p.id,
      input: {
        displayName: "Piotr N.",
        publicWorkUrl: "https://github.com/piotrn",
        description: "Utrzymanie klastrów Kubernetes i migracje baz PostgreSQL bez przestoju.",
        price25: "120",
        price50: "220",
        slug: `piotr-${Date.now().toString(36)}`,
      },
      publish: true,
      appUrl: BASE_URL,
    });
    assert.equal(published.ok, true);

    await openMentor(p.page);
    await p.page.getByRole("textbox", { name: "Twój link" }).waitFor();
    const orderWithout = await p.page.evaluate((noticeText) => {
      const main = document.querySelector("main");
      const h1 = main?.querySelector("h1");
      const notice = [...(main?.querySelectorAll("p") ?? [])].find((el) => el.textContent?.trim() === noticeText);
      const link = [...(main?.querySelectorAll("input[readonly]") ?? [])].find((el) => el.labels?.[0]?.textContent?.trim() === "Twój link");
      const follows = (x, y) => Boolean(x && y && x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { headingFirst: follows(h1, notice), noticeBeforePanel: follows(notice, link) };
    }, NO_AVAILABILITY);
    assert.deepEqual(orderWithout, { headingFirst: true, noticeBeforePanel: true });

    // Okno zapisane w edytorze dostępności → powrót przez nawigację „Strona”.
    await p.page.getByRole("link", { name: "Dodaj dostępność" }).click();
    await p.page.waitForURL(`${BASE_URL}/mentor/availability`);
    await openAvailability(p.page);
    await p.page.getByRole("button", { name: "Dodaj okno: wtorek" }).click();
    await p.page.getByRole("button", { name: "Zapisz", exact: true }).click();
    await p.page.getByText("Dostępność zapisana").waitFor();
    await p.page.getByRole("navigation", { name: "Panel mentora" }).getByRole("link", { name: "Strona" }).click();
    await p.page.waitForURL(`${BASE_URL}/mentor`);
    await p.page.getByRole("textbox", { name: "Twój link" }).waitFor();
    assert.equal(await p.page.getByText(NO_AVAILABILITY, { exact: true }).count(), 0);
    const panelFirst = await p.page.evaluate(() => {
      const main = document.querySelector("main");
      const h1 = main?.querySelector("h1");
      const link = [...(main?.querySelectorAll("input[readonly]") ?? [])].find((el) => el.labels?.[0]?.textContent?.trim() === "Twój link");
      const form = main?.querySelector("form");
      const alerts = [...(main?.querySelectorAll('[role="status"], [role="alert"]') ?? [])];
      const follows = (x, y) => Boolean(x && y && x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
      return follows(h1, link) && follows(link, form) && alerts.every((el) => follows(link, el));
    });
    assert.equal(panelFirst, true, "panel linku zaraz po nagłówku");
    await openMentor(p.page);
    assert.equal(await p.page.getByText(NO_AVAILABILITY, { exact: true }).count(), 0, "po pełnym odświeżeniu też bez banera");
  });
});
