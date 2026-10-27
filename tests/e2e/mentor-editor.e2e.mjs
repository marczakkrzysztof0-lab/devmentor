// E2E: edytor strony /mentor (spec #14 Phase 2, zadanie 3.4; testy Z7, Z9–Z11, Z23, Z24, Z28, Z36, F1, F2 +
// zapis szkicu, publikacja, edycja po publikacji, zły zakres A/B).
// Uruchamiane przez `npm run test:e2e` (scripts/test-e2e.mjs): serwer `next start` i jednorazowy schemat
// bazy są już gotowe (schemat usuwany po przebiegu), adresy w E2E_BASE_URL / E2E_DATABASE_URL.
// Testy w tym pliku idą po kolei i dzielą jedną mentorkę A (Anna K.) — każdy krok zależy od poprzedniego.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const skip = BASE_URL && DATABASE_URL ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL / E2E_DATABASE_URL).";

const DESCRIPTION_HINT =
  "Deweloper zobaczy to na twojej stronie zamiast ocen. Wpisz konkretne rzeczy, które masz za sobą, np. upgrade ingress-nginx do 1.28 w trzech klastrach, migracja 40 tys. linii do TypeScript 5.";
const SESSION_EXPIRED = "Sesja wygasła — poproś zespół o link do logowania";
const LABELS = ["Imię i nazwisko", "Link do publicznej pracy", "Twoje doświadczenie", "Cena za 25 min (zł)", "Cena za 50 min (zł)", "Adres strony"];
// Formy rodzajowe 2. osoby czasu przeszłego (C12): „zrobiłeś”, „byłaś”… — „jesteś” jest neutralne.
const GENDERED_WORD = /(?<!\p{L})\p{L}*(?:łeś|łaś|eś|aś)(?!\p{L})/giu;
const NEUTRAL_WORDS = new Set(["jesteś"]);
const PAYOUT_WORDS = /wypłat|bank|IBAN|podat|NIP\b|numer konta|rachun/i;
const RATING_WORDS = /ocen[aęyi]|gwiazd|opini|recenz/i;

describe("mentor: edytor strony /mentor", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  let counter = 0;
  /** Mentorka A (pełna ścieżka) i mentor B (zakres). */
  const a = { email: "", id: "", /** @type {import("playwright").BrowserContext} */ context: null, /** @type {import("playwright").Page} */ page: null };
  const b = { email: "", id: "", /** @type {any} */ rowBefore: null };

  const email = (label) => `e2e-editor-${label}-${Date.now()}-${++counter}@example.com`;

  async function pageRow(mentorId) {
    const { rows } = await db.query(
      `select display_name, public_work_url, description, price_25_minor, price_50_minor, currency, slug, published_at, updated_at
         from mentor_pages where mentor_id = $1`,
      [mentorId],
    );
    assert.equal(rows.length, 1);
    return rows[0];
  }

  /** Czeka, aż React podepnie się pod formularz (wpisywanie przed hydracją ginęłoby). */
  async function waitForEditor(page) {
    await page.getByRole("heading", { level: 1, name: "Twoja strona" }).waitFor();
    await page.waitForFunction(() => {
      const input = document.querySelector('input[name="displayName"]');
      return input !== null && Object.keys(input).some((key) => key.startsWith("__react"));
    });
  }

  /** Pełna ścieżka zaproszenia w przeglądarce → zalogowany kontekst na /mentor. */
  async function acceptInBrowser(address) {
    const { url } = await createInvitation({ db, email: address, appUrl: BASE_URL });
    const context = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
    await page.waitForURL(`${BASE_URL}/mentor`);
    await waitForEditor(page);
    const { rows } = await db.query("select id from mentors where lower(email) = lower($1)", [address]);
    return { context, page, id: rows[0].id };
  }

  async function reload(page) {
    await page.goto(`${BASE_URL}/mentor`);
    await waitForEditor(page);
  }

  const field = (page, label) => page.getByLabel(label, { exact: true });

  /**
   * Zwykły klik przycisku formularza prosto z pola z błędem. Regresja: wcześniej błąd znikał dopiero „on blur”,
   * układ przesuwał się między mousedown a mouseup i klik w „Opublikuj stronę” trafiał obok (DS czyści błąd
   * pola już przy poprawnej zmianie wartości).
   */
  async function press(page, name) {
    await page.getByRole("button", { name }).click();
  }

  /** Tekst opisu dostępności (aria-describedby) elementu. */
  async function accessibleDescription(locator) {
    return locator.evaluate((el) =>
      (el.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" "),
    );
  }

  async function focusedLabel(page) {
    return page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return el.labels?.[0]?.textContent?.trim() ?? el.tagName;
    });
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    browser = await chromium.launch();
    b.email = email("b");
    const mentorB = await acceptInBrowser(b.email);
    b.id = mentorB.id;
    await mentorB.context.close();
    b.rowBefore = await pageRow(b.id);
    a.email = email("a");
    Object.assign(a, await acceptInBrowser(a.email));
  });

  after(async () => {
    await a.context?.close();
    await browser?.close();
    await db?.end();
  });

  test("pierwsza wizyta: slug zastępczy, propozycja z imienia, ręczna zmiana sluga zostaje (Z10)", async () => {
    const { page } = a;
    const slug = field(page, "Adres strony");
    const placeholder = await slug.inputValue();
    assert.match(placeholder, /^mentor-[a-z2-7]{6}$/);
    assert.equal(placeholder, (await pageRow(a.id)).slug);
    assert.match(await accessibleDescription(slug), new RegExp(`${BASE_URL}/m/${placeholder}`));

    await field(page, "Imię i nazwisko").fill("Anna K.");
    assert.equal(await slug.inputValue(), "anna-k");

    await slug.fill("anna-dev");
    await field(page, "Imię i nazwisko").fill("Anna Kowalska");
    assert.equal(await slug.inputValue(), "anna-dev", "po ręcznej zmianie imię nie nadpisuje sluga");

    // Powrót do „Anna K.” / „anna-k” na potrzeby kolejnych kroków (pole sluga już ręczne).
    await field(page, "Imię i nazwisko").fill("Anna K.");
    await slug.fill("anna-k");
  });

  test("etykiety sześciu pól (Z23), podpowiedź opisu (F1), ceny w zł (F2), bez wypłat i ocen (Z36), bez form rodzajowych (Z24), bez „Zapytania” (Z11)", async () => {
    const { page } = a;
    const main = page.getByRole("main");
    assert.equal(await main.count(), 1);
    for (const label of LABELS) assert.equal(await field(page, label).count(), 1, `pole „${label}”`);
    assert.equal(await page.getByRole("textbox", { name: "Link do publicznej pracy", exact: true }).count(), 1);

    const description = field(page, "Twoje doświadczenie");
    const descriptionText = await accessibleDescription(description);
    assert.match(descriptionText, /zamiast ocen/);
    assert.match(descriptionText, /np\./);
    assert.ok(descriptionText.includes(DESCRIPTION_HINT));
    const hint = page.getByText(DESCRIPTION_HINT, { exact: true });
    assert.equal(await hint.isVisible(), true);
    // Kolejność w DOM: etykieta → podpowiedź → pole → następne pole.
    const order = await page.evaluate((hintText) => {
      const label = [...document.querySelectorAll("label")].find((el) => el.textContent?.trim() === "Twoje doświadczenie");
      const hintEl = [...document.querySelectorAll("p")].find((el) => el.textContent?.trim() === hintText);
      const textarea = document.querySelector('textarea[name="description"]');
      const next = document.querySelector('input[name="price25"]');
      const follows = (x, y) => Boolean(x && y && x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
      return follows(label, hintEl) && follows(hintEl, textarea) && follows(textarea, next);
    }, DESCRIPTION_HINT);
    assert.equal(order, true, "podpowiedź po etykiecie, przed polem");

    for (const label of ["Cena za 25 min (zł)", "Cena za 50 min (zł)"]) {
      const input = field(page, label);
      assert.equal(await input.getAttribute("name"), label.includes("25") ? "price25" : "price50");
      const suffix = input.locator("xpath=..").getByText("zł", { exact: true });
      assert.equal(await suffix.isVisible(), true, `${label}: widoczny sufiks zł`);
      assert.doesNotMatch((await suffix.getAttribute("class")) ?? "", /sr-only/);
      const suffixId = await suffix.getAttribute("id");
      assert.ok(suffixId && ((await input.getAttribute("aria-describedby")) ?? "").split(" ").includes(suffixId), `${label}: sufiks w aria-describedby`);
      assert.match(await accessibleDescription(input), /Tyle zapłaci deweloper\./);
    }

    const text = await page.locator("body").innerText();
    assert.doesNotMatch(text, PAYOUT_WORDS);
    assert.doesNotMatch(text, RATING_WORDS);
    const found = [...text.matchAll(GENDERED_WORD)].map((m) => m[0]).filter((w) => !NEUTRAL_WORDS.has(w.toLowerCase()));
    assert.deepEqual(found, []);
    assert.equal(await page.getByRole("link", { name: /Zapytania|zapyta/ }).count(), 0);
    const nav = page.getByRole("navigation", { name: "Panel mentora" });
    assert.deepEqual((await nav.getByRole("link").allInnerTexts()).map((t) => t.trim()), ["Strona", "Dostępność"]);
    assert.equal(await nav.getByRole("button", { name: "Wyloguj" }).count(), 1);
    // Tylko pola treści — żadnych pól wypłaty, banku, podatku, ocen.
    const names = await page.locator("main input[name], main textarea[name], main select[name]").evaluateAll((els) => els.map((el) => el.getAttribute("name")));
    assert.deepEqual(names.sort(), ["description", "displayName", "price25", "price50", "publicWorkUrl", "slug"]);
  });

  test("zapis szkicu z samym imieniem → po odświeżeniu imię jest, strona nieopublikowana", async () => {
    const { page } = a;
    await press(page, "Zapisz szkic");
    await page.getByText("Szkic zapisany — strona nie jest jeszcze widoczna").waitFor();
    const row = await pageRow(a.id);
    assert.equal(row.display_name, "Anna K.");
    assert.equal(row.slug, "anna-k");
    assert.equal(row.published_at, null);

    await reload(page);
    assert.equal(await field(page, "Imię i nazwisko").inputValue(), "Anna K.");
    assert.equal(await field(page, "Adres strony").inputValue(), "anna-k");
    assert.equal(await page.getByRole("textbox", { name: "Twój link" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Opublikuj stronę" }).count(), 1);
  });

  test("publikacja bez linku i opisu → błędy przy polach, dane zostają, fokus na pierwszym, baza bez zmian", async () => {
    const { page } = a;
    const before = await pageRow(a.id);
    await field(page, "Cena za 25 min (zł)").fill("150");
    await field(page, "Cena za 50 min (zł)").fill("280");
    await press(page, "Opublikuj stronę");
    await page.getByText("Dodaj link do publicznej pracy", { exact: true }).waitFor();
    assert.match(await accessibleDescription(field(page, "Link do publicznej pracy")), /Dodaj link do publicznej pracy/);
    assert.match(await accessibleDescription(field(page, "Twoje doświadczenie")), /Opisz swoje doświadczenie/);
    await page.waitForFunction(() => document.activeElement?.getAttribute("name") === "publicWorkUrl");
    assert.equal(await focusedLabel(page), "Link do publicznej pracy");
    assert.equal(await field(page, "Imię i nazwisko").inputValue(), "Anna K.");
    assert.equal(await field(page, "Cena za 25 min (zł)").inputValue(), "150");
    assert.equal(await field(page, "Cena za 50 min (zł)").inputValue(), "280");
    assert.deepEqual(await pageRow(a.id), before);
  });

  test("pełna publikacja → panel z linkiem i fokusem, baza: published_at, ceny w groszach, PLN", async () => {
    const { page } = a;
    await field(page, "Link do publicznej pracy").fill("https://github.com/annak");
    await field(page, "Twoje doświadczenie").fill("Upgrade ingress-nginx do 1.28 w trzech klastrach. Migracja 40 tys. linii do TypeScript 5.");
    await press(page, "Opublikuj stronę");
    const link = page.getByRole("textbox", { name: "Twój link" });
    await link.waitFor();
    assert.equal(await link.inputValue(), `${BASE_URL}/m/anna-k`);
    assert.equal(await page.getByRole("button", { name: "Kopiuj link" }).count(), 1);
    await page.waitForFunction(() => document.activeElement?.getAttribute("readonly") !== null && document.activeElement?.tagName === "INPUT" && document.activeElement?.closest("section") !== null);
    assert.equal(await focusedLabel(page), "Twój link");
    assert.match(await page.getByRole("main").innerText(), /Wklej go tam, gdzie ludzie już cię pytają/);
    assert.equal(await field(page, "Adres strony").getAttribute("readonly"), "");

    const row = await pageRow(a.id);
    assert.ok(row.published_at, "published_at ustawione");
    assert.equal(row.price_25_minor, 15000);
    assert.equal(row.price_50_minor, 28000);
    assert.equal(row.currency, "PLN");
    assert.equal(row.slug, "anna-k");
    assert.equal(row.public_work_url, "https://github.com/annak");
    a.publishedAt = row.published_at;
  });

  test("odświeżenie opublikowanej strony: panel nad formularzem bez fokusu, slug tylko do odczytu (Z9)", async () => {
    const { page } = a;
    await reload(page);
    const link = page.getByRole("textbox", { name: "Twój link" });
    assert.equal(await link.inputValue(), `${BASE_URL}/m/anna-k`);
    assert.equal(await focusedLabel(page), null, "fokus nie jest przeniesiony na link");
    const panelFirst = await page.evaluate(() => {
      const share = [...document.querySelectorAll("input[readonly]")].find((el) => el.labels?.[0]?.textContent?.trim() === "Twój link");
      const form = document.querySelector("main form");
      return Boolean(share && form && share.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(panelFirst, true, "panel z linkiem nad formularzem");
    const slug = field(page, "Adres strony");
    assert.equal(await slug.getAttribute("readonly"), "");
    assert.equal(await accessibleDescription(slug), `Pełny link: ${BASE_URL}/m/anna-k. Adresu nie można zmienić po publikacji.`);
    assert.equal(await page.getByRole("button", { name: "Zapisz zmiany" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Zapisz szkic" }).count(), 0);
    assert.equal(await field(page, "Cena za 25 min (zł)").inputValue(), "150");
  });

  test("edycja opisu po publikacji → baza zmieniona, nadal opublikowana, slug bez zmian", async () => {
    const { page } = a;
    await field(page, "Twoje doświadczenie").fill("Upgrade ingress-nginx do 1.28 w trzech klastrach.");
    await press(page, "Zapisz zmiany");
    await page.getByText("Zmiany są już na twojej stronie — link się nie zmienił").waitFor();
    const row = await pageRow(a.id);
    assert.equal(row.description, "Upgrade ingress-nginx do 1.28 w trzech klastrach.");
    assert.deepEqual(row.published_at, a.publishedAt);
    assert.equal(row.slug, "anna-k");
    await reload(page);
    assert.equal(await field(page, "Twoje doświadczenie").inputValue(), "Upgrade ingress-nginx do 1.28 w trzech klastrach.");
  });

  test("brak sieci przy zapisie → dane zostają, komunikat o połączeniu (Z28), baza bez zmian", async () => {
    const { page, context } = a;
    const before = await pageRow(a.id);
    await field(page, "Twoje doświadczenie").fill("Opis wpisany bez sieci.");
    await context.setOffline(true);
    try {
      await press(page, "Zapisz zmiany");
      const alert = page.getByRole("main").getByRole("alert");
      await alert.waitFor();
      assert.match(await alert.innerText(), /Brak połączenia z internetem/);
      assert.equal(await field(page, "Twoje doświadczenie").inputValue(), "Opis wpisany bez sieci.");
    } finally {
      await context.setOffline(false);
    }
    assert.deepEqual(await pageRow(a.id), before);
  });

  test("sesja odwołana w bazie, potem zapis → dane zostają, „Sesja wygasła…” (Z7), bez przekierowania, baza bez zmian", async () => {
    const { page } = a;
    await reload(page);
    const before = await pageRow(a.id);
    await db.query("update mentor_sessions set revoked_at = now() where mentor_id = $1 and revoked_at is null", [a.id]);
    await field(page, "Twoje doświadczenie").fill("Opis po wygaśnięciu sesji.");
    await press(page, "Zapisz zmiany");
    const alert = page.getByRole("main").getByRole("alert");
    await alert.waitFor();
    assert.equal((await alert.innerText()).trim(), SESSION_EXPIRED);
    assert.equal(await field(page, "Twoje doświadczenie").inputValue(), "Opis po wygaśnięciu sesji.");
    assert.equal(new URL(page.url()).pathname, "/mentor");
    assert.deepEqual(await pageRow(a.id), before);
  });

  test("zły zakres: publikacja A nie zmienia strony B (akcja nie przyjmuje id mentora)", async () => {
    assert.deepEqual(await pageRow(b.id), b.rowBefore);
    assert.equal(b.rowBefore.published_at, null);
    assert.notEqual(b.rowBefore.slug, "anna-k");
  });

  test("320 px, opublikowany slug 40 znaków bez myślników: pełny link się zawija, strona bez przewijania w poziomie (#42)", async () => {
    const longSlug = "katarzynawisniewskakowalczykmentoring123";
    const c = await acceptInBrowser(email("c"));
    try {
      const saved = await saveMentorPage({
        db,
        mentorId: c.id,
        publish: true,
        appUrl: BASE_URL,
        input: {
          displayName: "Katarzyna Wiśniewska-Kowalczyk",
          publicWorkUrl: "https://github.com/kwk",
          description: "Migracje do App Routera.",
          price25: "150",
          price50: "280",
          slug: longSlug,
        },
      });
      assert.equal(saved.ok, true, JSON.stringify(saved));
      await c.page.setViewportSize({ width: 320, height: 812 });
      await reload(c.page);
      assert.equal(
        await accessibleDescription(field(c.page, "Adres strony")),
        `Pełny link: ${BASE_URL}/m/${longSlug}. Adresu nie można zmienić po publikacji.`,
      );
      const { scrollWidth, clientWidth, hint } = await c.page.evaluate(() => {
        const ids = document.querySelector('input[name="slug"]')?.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
        const node = ids.map((id) => document.getElementById(id)).find((el) => el?.textContent?.startsWith("Pełny link:"));
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hint: node ? { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth } : null,
        };
      });
      assert.ok(hint, "podpowiedź „Pełny link” jest w opisie pola");
      assert.ok(hint.scrollWidth <= hint.clientWidth, `podpowiedź się nie zawija: ${hint.scrollWidth} > ${hint.clientWidth}`);
      assert.ok(scrollWidth <= clientWidth, `przewijanie w poziomie: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`);
    } finally {
      await c.context.close();
    }
  });
});
