// E2E: publiczna strona mentora /m/[slug], faza 1 — profil i ceny (spec #16 Phase 1, zadanie 5.2; Q1/L1, Q2,
// Q4, Q5, Q6; story 4–5; Z1, Z19, Z20, Z24, N02, K2; Edge Cases: bez dangerouslySetInnerHTML).
// Uruchamiane przez `npm run test:e2e` (scripts/test-e2e.mjs): serwer `next start` i jednorazowy schemat bazy są
// już gotowe (schemat usuwany po przebiegu), adresy w E2E_BASE_URL / E2E_DATABASE_URL.
//
// Dane tworzone funkcjami domeny (zaproszenie → `acceptInvitation` → `saveMentorPage`): opublikowane „anna-kowalska”
// (nie „anna-k” — ten slug publikuje mentor-editor.e2e.mjs w tym samym schemacie),
// „piotr-n” (inny mentor — nie może pojawić się na stronie Anny), „mobile-400” (opis 400 znaków) i szkic
// „ewa-szkic” (story 4). Surowy HTML (bez JS) pobierany `fetch`, DOM sprawdzany w Chromium (Playwright).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { acceptInvitation } from "../../lib/auth/mentor-auth.mjs";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const skip = BASE_URL && DATABASE_URL ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL / E2E_DATABASE_URL).";

const NOT_FOUND = "Nie ma takiej strony mentora";
// Formy rodzajowe 2. osoby czasu przeszłego (C12): „zrobiłeś”, „byłaś”… — „jesteś” jest neutralne.
const GENDERED_WORD = /(?<!\p{L})\p{L}*(?:łeś|łaś|eś|aś)(?!\p{L})/giu;
const NEUTRAL_WORDS = new Set(["jesteś"]);
// Brak ocen i opinii (N02, A03).
const RATING_WORDS = /ocen|opini|rating|review|★/i;

const ANNA = {
  displayName: "Anna K.",
  publicWorkUrl: "https://github.com/annak",
  description:
    "Migracje na server components w dwóch dużych projektach.\nTesty, cache i wycena takiej migracji.\n<script>alert(1)</script>",
  price25: "150",
  price50: "280",
  slug: "anna-kowalska",
};
const PIOTR = {
  displayName: "Piotr N.",
  publicWorkUrl: "https://gitlab.com/piotrn",
  description: "Kubernetes i ingress w produkcji.",
  price25: "120",
  price50: "220",
  slug: "piotr-n",
};
const EWA = {
  displayName: "Ewa Szkicowa",
  publicWorkUrl: "https://github.com/ewa-szkic",
  description: "Szkic opisu, którego nikt nie powinien zobaczyć.",
  price25: "170",
  price50: "310",
  slug: "ewa-szkic",
};
const DESCRIPTION_400 = `${"Migracje dużych aplikacji na nowe wersje frameworków, przegląd planu i ryzyk. ".repeat(6)}`.slice(0, 400);
const MOBILE = { ...ANNA, displayName: "Marta M.", description: DESCRIPTION_400, slug: "mobile-400" };
/** Strefa mentorki Anny — nie może trafić do HTML-a (zapisywana tylko po to, żeby było czego szukać). */
const ANNA_ZONE = "America/Argentina/Ushuaia";

/** NBSP z Intl.NumberFormat („150 zł”) → zwykła spacja. */
const normalize = (text) => text.replace(/ /g, " ");

describe("publiczna strona mentora /m/[slug] — profil i ceny (faza 1)", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  let counter = 0;
  /** @type {import("playwright").BrowserContext[]} */
  const contexts = [];
  const anna = { id: "", email: "" };

  /** Mentor przez zaproszenie (jak w produkcji) + zapis strony; zwraca id i e-mail. */
  async function createMentor(values, publish) {
    const email = `e2e-public-${Date.now()}-${++counter}@example.com`;
    const { url } = await createInvitation({ db, email, appUrl: BASE_URL });
    const accepted = await acceptInvitation({ db, token: url.slice(url.lastIndexOf("/") + 1) });
    assert.equal(accepted.ok, true);
    const saved = await saveMentorPage({ db, mentorId: accepted.mentorId, input: values, publish, appUrl: BASE_URL });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(saved.published, publish);
    return { id: accepted.mentorId, email };
  }

  async function newPage(options = {}) {
    const context = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw", ...options });
    contexts.push(context);
    const page = await context.newPage();
    page.on("dialog", (dialog) => {
      throw new Error(`Nieoczekiwane okno dialogowe: ${dialog.message()}`);
    });
    return page;
  }

  /** Surowa odpowiedź serwera (bez JS): status, nagłówki, HTML. */
  async function raw(path, headers = {}) {
    // Żądanie RSC Next przekierowuje (307) na `?_rsc` — wtedy idziemy za przekierowaniem; zwykłe GET bez tego.
    const response = await fetch(`${BASE_URL}${path}`, { redirect: headers.RSC ? "follow" : "manual", headers });
    return { status: response.status, headers: response.headers, html: await response.text() };
  }

  /** Widoczny tekst strony po hydracji. */
  async function visibleText(page) {
    return normalize(await page.locator("body").innerText());
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    browser = await chromium.launch();
    Object.assign(anna, await createMentor(ANNA, true));
    await db.query("update mentors set time_zone = $2 where id = $1", [anna.id, ANNA_ZONE]);
    await createMentor(PIOTR, true);
    await createMentor(MOBILE, true);
    await createMentor(EWA, false);
  });

  after(async () => {
    for (const context of contexts) await context.close().catch(() => {});
    await browser?.close();
    await db?.end();
  });

  test("opublikowana: 200, imię → praca publiczna → opis → ceny w tej kolejności, tytuł, noindex/nofollow", async () => {
    const { status, headers, html } = await raw("/m/anna-kowalska");
    assert.equal(status, 200);
    assert.equal(headers.get("x-robots-tag"), "noindex, nofollow");
    // Kolejność w HTML-u z serwera: znaczniki treści, bez <head> i bez skryptów (ładunek RSC przychodzi w
    // strumieniu przed HTML-em segmentu podmienianego za <Suspense>).
    const body = normalize(html.slice(html.indexOf("<body")).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ""));
    const positions = [">Anna K.<", ">github.com/annak", "Migracje na server components", ">150 zł<", ">280 zł<"].map((needle) => {
      const at = body.indexOf(needle);
      assert.ok(at >= 0, `HTML z serwera zawiera ${needle}`);
      return at;
    });
    assert.deepEqual([...positions].sort((x, y) => x - y), positions, "kolejność w HTML-u");

    const page = await newPage();
    const response = await page.goto(`${BASE_URL}/m/anna-kowalska`);
    assert.equal(response?.status(), 200);
    assert.equal(await page.title(), "Anna K. — DevMentor");
    const robots = await page.locator('meta[name="robots"]').evaluateAll((metas) => metas.map((meta) => meta.getAttribute("content")));
    assert.ok(robots.some((content) => /noindex/.test(content ?? "") && /nofollow/.test(content ?? "")), JSON.stringify(robots));

    // Treść profilu przychodzi strumieniowo (Suspense) — najpierw czekamy na nagłówek, potem liczymy landmarki.
    // Bez tego na szybkim runnerze CI `count()` trafiał w chwilę przed podmianą segmentu (0 zamiast 1).
    await page.getByRole("heading", { level: 1, name: "Anna K." }).waitFor();
    const main = page.getByRole("main");
    assert.equal(await main.count(), 1, "dokładnie jeden landmark main");
    assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
    assert.equal(await main.getByRole("heading", { level: 1 }).innerText(), "Anna K.");

    // Kolejność w DOM: h1 → link do pracy → opis → 150 zł → 280 zł.
    const ordered = await page.evaluate(() => {
      const main = document.querySelector("main");
      const find = (text) =>
        [...main.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent.replace(/ /g, " ").includes(text)) ??
        [...main.querySelectorAll("*")].find((el) => el.textContent.replace(/ /g, " ").includes(text));
      const nodes = [main.querySelector("h1"), main.querySelector("a"), find("Migracje na server components"), find("150 zł"), find("280 zł")];
      if (nodes.some((node) => !node)) return null;
      return nodes.slice(1).every((node, i) => nodes[i].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(ordered, true, "kolejność w DOM");
    const text = await visibleText(page);
    assert.ok(text.includes("25 min") && text.includes("150 zł"), "cena 25 min z Intl pl-PL (C1, Q6)");
    assert.ok(text.includes("50 min") && text.includes("280 zł"), "cena 50 min z Intl pl-PL (C1, Q6)");
  });

  test("opublikowana: brak formularza, pola pytania i rezerwacji (Z1); jedyny link to praca publiczna z rel nofollow noopener ugc", async () => {
    const page = await newPage();
    await page.goto(`${BASE_URL}/m/anna-kowalska`);
    await page.getByRole("heading", { level: 1, name: "Anna K." }).waitFor();
    assert.equal(await page.locator("form, input, textarea, select").count(), 0);
    assert.equal(await page.getByRole("textbox").count(), 0, "brak pola pytania");
    assert.equal(await page.getByRole("searchbox").count(), 0, "brak wyszukiwarki");
    assert.equal(await page.getByRole("button").count(), 0, "brak przycisku rezerwacji");
    assert.equal(await page.getByRole("radio").count(), 0);
    const links = page.locator("a");
    assert.equal(await links.count(), 1, "jedyny link: praca publiczna");
    assert.equal(await links.getAttribute("href"), "https://github.com/annak");
    assert.equal(await links.getAttribute("target"), "_blank");
    const rel = ((await links.getAttribute("rel")) ?? "").split(/\s+/);
    for (const token of ["nofollow", "noopener", "ugc"]) assert.ok(rel.includes(token), `rel zawiera ${token}`);
    assert.match(await links.innerText(), /github\.com\/annak/, "pełny host widoczny");
  });

  test("opublikowana: bez ocen i opinii (N02), bez form rodzajowych (Z24), bez innych mentorów i bez katalogu (R14)", async () => {
    const page = await newPage();
    await page.goto(`${BASE_URL}/m/anna-kowalska`);
    await page.getByRole("heading", { level: 1, name: "Anna K." }).waitFor();
    const text = await visibleText(page);
    assert.doesNotMatch(text, RATING_WORDS);
    const gendered = [...text.matchAll(GENDERED_WORD)].map((m) => m[0]).filter((w) => !NEUTRAL_WORDS.has(w.toLowerCase()));
    assert.deepEqual(gendered, []);
    for (const other of [PIOTR.displayName, PIOTR.publicWorkUrl, "gitlab.com/piotrn", EWA.displayName, MOBILE.displayName, "120 zł", "170 zł"]) {
      assert.ok(!text.includes(other), `bez danych innego mentora: ${other}`);
    }
    const { html } = await raw("/m/anna-kowalska");
    for (const other of [PIOTR.displayName, "piotr-n", EWA.displayName, "ewa-szkic", MOBILE.displayName, "mobile-400"]) {
      assert.ok(!html.includes(other), `HTML bez ${other}`);
    }
  });

  test("opis: łamania linii zachowane, „<script>alert(1)</script>” jako tekst (bez wstrzykniętego skryptu)", async () => {
    const page = await newPage();
    await page.goto(`${BASE_URL}/m/anna-kowalska`);
    const description = page.getByText("Migracje na server components", { exact: false });
    await description.waitFor();
    assert.equal(
      await description.innerText(),
      "Migracje na server components w dwóch dużych projektach.\nTesty, cache i wycena takiej migracji.\n<script>alert(1)</script>",
    );
    assert.equal(await page.locator("main script").count(), 0, "brak elementu script w treści");
    assert.equal(
      await page.evaluate(() => [...document.scripts].some((script) => script.textContent?.includes("alert(1)") && !script.textContent.includes("self.__next_f"))),
      false,
    );
    const { html } = await raw("/m/anna-kowalska");
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "HTML z serwera: tekst zakodowany");
    assert.ok(!html.includes("<script>alert(1)"), "HTML z serwera: brak surowego <script>alert(1)");
  });

  test("mentorId, e-mail i strefa mentora nie występują w HTML-u ani w ładunku RSC", async () => {
    const forbidden = [anna.id, anna.email, ANNA_ZONE];
    const { html } = await raw("/m/anna-kowalska");
    const rsc = await raw("/m/anna-kowalska", { RSC: "1" });
    assert.equal(rsc.status, 200);
    assert.match(rsc.headers.get("content-type") ?? "", /text\/x-component/);
    assert.match(rsc.html, /Anna K\./, "to jest ładunek RSC tej strony");
    assert.ok(!html.includes("mentorId") && !rsc.html.includes("mentorId"), "bez klucza mentorId");
    for (const value of forbidden) {
      assert.ok(!html.includes(value), `HTML bez ${value}`);
      assert.ok(!rsc.html.includes(value), `RSC bez ${value}`);
    }
  });

  for (const [label, path] of [
    ["szkic „ewa-szkic”", "/m/ewa-szkic"],
    ["nieznany slug (literówka)", "/m/annak2"],
    ["niepoprawny slug", "/m/Anna_K!"],
    ["głębsza ścieżka", "/m/anna-kowalska/opinie"],
  ]) {
    test(`${label} → 404, „${NOT_FOUND}”, bez danych żadnego mentora, noindex (Z19, Q4)`, async () => {
      const { status, headers, html } = await raw(path);
      assert.equal(status, 404, "prawdziwy status 404, nie soft 404");
      assert.equal(headers.get("x-robots-tag"), "noindex, nofollow");
      assert.ok(html.includes(NOT_FOUND), "komunikat w HTML-u z serwera");

      const page = await newPage();
      const response = await page.goto(`${BASE_URL}${path}`);
      assert.equal(response?.status(), 404);
      const main = page.getByRole("main");
      await main.getByRole("heading", { level: 1, name: NOT_FOUND }).waitFor();
      assert.equal(await main.count(), 1);
      const text = await visibleText(page);
      for (const m of [ANNA, PIOTR, EWA, MOBILE]) {
        for (const value of [m.displayName, m.description.slice(0, 20), new URL(m.publicWorkUrl).host + new URL(m.publicWorkUrl).pathname]) {
          assert.ok(!text.includes(value), `bez ${value}`);
          assert.ok(!html.includes(value), `HTML bez ${value}`);
        }
      }
      assert.ok(!text.includes("zł"), "bez cen");
      assert.ok(!text.includes("Szkic opisu"), "bez treści szkicu");
      const robots = await page.locator('meta[name="robots"]').evaluateAll((metas) => metas.map((meta) => meta.getAttribute("content")));
      assert.ok(robots.some((content) => /noindex/.test(content ?? "")), JSON.stringify(robots));
    });
  }

  for (const path of ["/m", "/m?search=react"]) {
    test(`${path} → 404 bez katalogu i wyszukiwarki (Z20, R14)`, async () => {
      const { status, headers, html } = await raw(path);
      assert.equal(status, 404);
      assert.equal(headers.get("x-robots-tag"), "noindex, nofollow");
      const page = await newPage();
      const response = await page.goto(`${BASE_URL}${path}`);
      assert.equal(response?.status(), 404);
      await page.getByRole("heading", { level: 1, name: NOT_FOUND }).waitFor();
      assert.equal(await page.locator("form, input, a").count(), 0, "bez wyszukiwarki i bez listy linków");
      for (const value of [ANNA, PIOTR, MOBILE].flatMap((m) => [m.displayName, m.slug])) {
        assert.ok(!html.includes(value), `bez ${value}`);
      }
    });
  }

  test("edycja opisu funkcją domeny widoczna przy następnym żądaniu (bez cache, Q5)", async () => {
    const page = await newPage();
    await page.goto(`${BASE_URL}/m/piotr-n`);
    await page.getByText(PIOTR.description).waitFor();
    const edited = "Kubernetes, ingress i migracje klastrów — opis po edycji.";
    const saved = await saveMentorPage({
      db,
      mentorId: (await db.query("select mentor_id from mentor_pages where slug = 'piotr-n'")).rows[0].mentor_id,
      input: { ...PIOTR, description: edited },
      appUrl: BASE_URL,
    });
    assert.equal(saved.ok, true);
    await page.reload();
    await page.getByText(edited).waitFor();
    assert.equal(await page.getByText(PIOTR.description, { exact: true }).count(), 0);
    assert.equal(await page.title(), "Piotr N. — DevMentor");
  });

  test("telefon 375×812, opis 400 znaków: h1, link do pracy i obie ceny na pierwszym ekranie (K2)", async () => {
    assert.equal(DESCRIPTION_400.length, 400);
    const page = await newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(`${BASE_URL}/m/mobile-400`);
    await page.getByRole("heading", { level: 1, name: MOBILE.displayName }).waitFor();
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    const targets = [
      page.getByRole("heading", { level: 1 }),
      page.getByRole("link", { name: /github\.com\/annak/ }),
      page.getByText("150 zł", { exact: true }),
      page.getByText("280 zł", { exact: true }),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      assert.ok(box, "element widoczny");
      assert.ok(box.y >= 0 && box.y + box.height <= 812, `na pierwszym ekranie (dół ${box.y + box.height} px)`);
      assert.ok(box.x >= 0 && box.x + box.width <= 375, "bez przewijania w poziomie");
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375), "brak poziomego przewijania strony");
  });
});
