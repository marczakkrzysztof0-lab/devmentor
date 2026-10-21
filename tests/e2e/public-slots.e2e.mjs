// E2E: publiczna strona mentora /m/[slug], faza 2 — sekcja wolnych terminów (spec #16 Phase 2, krok 4; zadanie 6.1;
// story 1–3; Q1/L1, Q3, Q5; Z1, Z28, Z38/P2, F3; Edge Cases „Slot loading fails”).
// Uruchamiane przez `npm run test:e2e` (scripts/test-e2e.mjs): serwer `next start` (produkcja) i jednorazowy schemat
// bazy; pliki e2e idą po kolei (`--test-concurrency=1`), testy w pliku też.
//
// Dane funkcjami domeny (zaproszenie → `acceptInvitation` → `saveMentorPage` → `saveAvailability`):
// - „olga-sloty”: okna codziennie 18:00–20:00 Europe/Warsaw (14 dni → terminy każdego dnia, ≤ 6 na dzień),
// - „dawid-caly-dzien”: okna codziennie 08:00–22:00 (28 terminów 25 min na dzień → F3: 6 + „Pokaż więcej (k)”),
// - „bartek-bez-okien”: opublikowany, bez dostępności (story 3),
// - „celina-bez-strefy”: okna zapisane, potem `time_zone = null` (P2/Z38 — okna bez strefy).
// Oczekiwane terminy liczy ta sama funkcja (`listOpenSlots`) tuż przed i tuż po żądaniu (granica 3 h wyprzedzenia
// może przesunąć się w trakcie testu) — akceptujemy którykolwiek wynik. Godziny w strefie widza liczone w teście
// niezależnie (`Intl`, nie helpery DS).
//
// Błąd wczytania terminów: bez flag w kodzie (e2e działa na buildzie produkcyjnym). Test na chwilę zmienia nazwę
// tabeli `availability_windows` w JEDNORAZOWYM schemacie — ładowarka terminów dostaje prawdziwy błąd bazy, a
// sprawdzenie proxy i odczyt profilu (tylko `mentor_pages`) działają dalej. Nazwa wraca w `finally`.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { acceptInvitation } from "../../lib/auth/mentor-auth.mjs";
import { saveAvailability } from "../../lib/availability/save.mjs";
import { listOpenSlots } from "../../lib/availability/slots.mjs";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const skip = BASE_URL && DATABASE_URL ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL / E2E_DATABASE_URL).";

const EMPTY = "Brak wolnych terminów w najbliższych 14 dniach";
const ERROR = "Nie udało się wczytać terminów — odśwież stronę";
const MENTOR_ZONE = "Europe/Warsaw";
const VIEWER_ZONE = "Europe/London";
/** Codziennie 18:00–20:00 czasu mentora (ISO 1–7). */
const DAILY_18_20 = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 18 * 60, endMinute: 20 * 60 }));
/** Codziennie 08:00–22:00 czasu mentora — dużo terminów dziennie (F3). */
const DAILY_08_22 = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 }));
/** Spec #16 F3: najwyżej 6 godzin na dzień przed „Pokaż więcej (k)”. */
const PER_DAY = 6;
const TIME = /\b\d{2}:\d{2}\b/;

const page = (displayName, slug, price25 = "150", price50 = "280") => ({
  displayName,
  publicWorkUrl: `https://github.com/${slug}`,
  description: `Opis mentora ${displayName}: migracje i code review.`,
  price25,
  price50,
  slug,
});
const OLGA = page("Olga S.", "olga-sloty", "150", "280");
const BARTEK = page("Bartek B.", "bartek-bez-okien", "120", "220");
const CELINA = page("Celina C.", "celina-bez-strefy", "130", "240");
const DAWID = page("Dawid D.", "dawid-caly-dzien", "100", "190");

/** NBSP z Intl → zwykła spacja. */
const normalize = (text) => text.replace(/[  ]/g, " ");

/** Klucz lokalnego dnia i godzina w strefie (niezależnie od DS). */
const dayKeyIn = (iso, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const timeIn = (iso, timeZone) => new Intl.DateTimeFormat("pl-PL", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Oczekiwana lista: dni (klucz) z godzinami w strefie widza, dla jednej długości. */
function expectedDays(slots, length, timeZone) {
  /** @type {Map<string, string[]>} */
  const days = new Map();
  for (const slot of slots.filter((s) => s.lengthMinutes === length)) {
    const key = dayKeyIn(slot.startsAt, timeZone);
    days.set(key, [...(days.get(key) ?? []), timeIn(slot.startsAt, timeZone)]);
  }
  return [...days].map(([key, times]) => ({ key, times }));
}

describe("publiczna strona mentora /m/[slug] — wolne terminy (faza 2)", { skip }, () => {
  /** @type {pg.Pool} */
  let db;
  /** @type {import("playwright").Browser} */
  let browser;
  let counter = 0;
  /** @type {import("playwright").BrowserContext[]} */
  const contexts = [];
  const olga = { id: "", email: "" };
  const celina = { id: "", email: "" };

  async function createMentor(values) {
    const email = `e2e-slots-${Date.now()}-${++counter}@example.com`;
    const { url } = await createInvitation({ db, email, appUrl: BASE_URL });
    const accepted = await acceptInvitation({ db, token: url.slice(url.lastIndexOf("/") + 1) });
    assert.equal(accepted.ok, true);
    const saved = await saveMentorPage({ db, mentorId: accepted.mentorId, input: values, publish: true, appUrl: BASE_URL });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    return { id: accepted.mentorId, email };
  }

  async function newPage(options = {}) {
    const context = await browser.newContext({ locale: "pl-PL", timezoneId: VIEWER_ZONE, ...options });
    contexts.push(context);
    const tab = await context.newPage();
    /** @type {string[]} */
    const errors = [];
    tab.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    tab.on("pageerror", (error) => errors.push(String(error)));
    return { tab, errors };
  }

  /** Surowa odpowiedź serwera (bez JS). */
  async function raw(path, headers = {}) {
    const response = await fetch(`${BASE_URL}${path}`, { redirect: headers.RSC ? "follow" : "manual", headers });
    return { status: response.status, html: await response.text() };
  }

  /** Sekcja terminów (DS `SlotList` i stany bez godzin mają h2 `slots-heading`). */
  const slotSection = (tab) => tab.locator('section[aria-labelledby="slots-heading"]');

  /**
   * Dni z listy terminów (DS `SlotList`, selectable={false}, F3): nagłówek `h3` dnia, lista `ul` z jednym `li` na
   * godzinę (tekst „jutro, wtorek 20.10, 18:00” — data w tekście) i ewentualny przycisk „Pokaż więcej (k)”.
   */
  async function shownDays(tab) {
    return slotSection(tab)
      .locator("h3")
      .evaluateAll((headings) =>
        headings
          .filter((h3) => h3.nextElementSibling?.tagName === "UL")
          .map((h3) => {
            const list = /** @type {HTMLUListElement} */ (h3.nextElementSibling);
            const items = [...list.querySelectorAll("li")].map((li) => (li.textContent ?? "").trim());
            const button = list.nextElementSibling?.tagName === "BUTTON" ? list.nextElementSibling : null;
            return {
              label: (h3.textContent ?? "").trim(),
              items,
              times: items.map((text) => text.slice(-5)),
              listId: list.id,
              listLabelledBy: list.getAttribute("aria-labelledby"),
              headingId: h3.id,
              button: button
                ? { text: (button.textContent ?? "").trim(), expanded: button.getAttribute("aria-expanded"), controls: button.getAttribute("aria-controls") }
                : null,
            };
          }),
      );
  }

  /** Lista na stronie = `listOpenSlots` z „teraz” sprzed albo spod żądania (strefa widza). */
  function assertSlotsMatch(shown, nows, length, timeZone, windows = DAILY_18_20) {
    const candidates = nows.map((now) => expectedDays(listOpenSlots({ windows, timeZone: MENTOR_ZONE, now }), length, timeZone));
    const shownTimes = shown.map((day) => day.times);
    assert.ok(
      candidates.some((days) => JSON.stringify(days.map((d) => d.times)) === JSON.stringify(shownTimes)),
      `terminy ${JSON.stringify(shownTimes)} ≠ listOpenSlots ${JSON.stringify(candidates.map((c) => c.map((d) => d.times)))}`,
    );
    const expected = candidates.find((days) => JSON.stringify(days.map((d) => d.times)) === JSON.stringify(shownTimes));
    // Każdy dzień raz, z datą w tekście (poza „dziś”/„jutro”, które DS pokazuje słownie).
    assert.equal(new Set(shown.map((d) => d.label)).size, shown.length, "etykieta dnia tylko raz");
    shown.forEach((day, i) => {
      const [, month, date] = expected[i].key.split("-");
      // Każda godzina ma datę w tekście (`li`: „…20.10, 18:00”), nie tylko przez grupowanie.
      for (const item of day.items) assert.ok(item.includes(`${Number(date)}.${month}, `), `godzina z datą: ${item}`);
      if (day.label !== "dziś" && day.label !== "jutro") {
        assert.ok(day.label.includes(`${Number(date)}.${month}`), `etykieta ${day.label} zawiera ${Number(date)}.${month}`);
      }
    });
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    browser = await chromium.launch();
    Object.assign(olga, await createMentor(OLGA));
    const savedOlga = await saveAvailability({ db, mentorId: olga.id, input: { timeZone: MENTOR_ZONE, windows: DAILY_18_20 } });
    assert.equal(savedOlga.ok, true);
    await createMentor(BARTEK);
    Object.assign(celina, await createMentor(CELINA));
    const savedCelina = await saveAvailability({ db, mentorId: celina.id, input: { timeZone: MENTOR_ZONE, windows: DAILY_18_20 } });
    assert.equal(savedCelina.ok, true);
    await db.query("update mentors set time_zone = null where id = $1", [celina.id]);
    const dawid = await createMentor(DAWID);
    const savedDawid = await saveAvailability({ db, mentorId: dawid.id, input: { timeZone: MENTOR_ZONE, windows: DAILY_08_22 } });
    assert.equal(savedDawid.ok, true);
  });

  after(async () => {
    for (const context of contexts) await context.close().catch(() => {});
    await browser?.close();
    await db?.end();
  });

  test("terminy = listOpenSlots w strefie widza (Europe/London vs mentor Europe/Warsaw), nagłówek ze strefą, bez błędów hydracji", async () => {
    const { tab, errors } = await newPage();
    const before = new Date();
    await tab.goto(`${BASE_URL}/m/${OLGA.slug}`);
    const after = new Date();
    await tab.getByRole("heading", { level: 2, name: `Najbliższe terminy (twoja strefa: ${VIEWER_ZONE})` }).waitFor();
    const shown = await shownDays(tab);
    assert.ok(shown.length >= 13, `terminy z całego horyzontu 14 dni (dni: ${shown.length})`);
    assertSlotsMatch(shown, [before, after], 25, VIEWER_ZONE);
    // Okno 18:00–20:00 w Warszawie to 17:00–19:00 w Londynie (ta sama zmiana czasu w UE → zawsze 1 h różnicy).
    const all = shown.flatMap((d) => d.times);
    assert.ok(all.includes("17:00") && all.includes("18:30"), "godziny przesunięte o 1 h");
    assert.ok(!all.includes("19:00") && !all.includes("19:30"), "bez godzin w strefie mentora");
    assert.deepEqual(errors.filter((e) => /hydrat|did not match/i.test(e)), [], "brak błędów hydracji");
  });

  test("przełącznik 25/50 to grupa radiowa z cenami; 50 min ukrywa start, przy którym 50 minut się nie mieści (story 2)", async () => {
    const { tab } = await newPage();
    const before = new Date();
    await tab.goto(`${BASE_URL}/m/${OLGA.slug}`);
    const after = new Date();
    await tab.getByRole("heading", { level: 2, name: /twoja strefa/ }).waitFor();
    const group = tab.getByRole("radiogroup", { name: "Długość sesji" });
    assert.equal(await group.getByRole("radio").count(), 2);
    const r25 = group.getByRole("radio", { name: /25 min/ });
    const r50 = group.getByRole("radio", { name: /50 min/ });
    assert.match(normalize(await r25.innerText()), /25 min —\s*150 zł/);
    assert.match(normalize(await r50.innerText()), /50 min —\s*280 zł/);
    assert.equal(await r25.getAttribute("aria-checked"), "true");

    const times25 = (await shownDays(tab)).flatMap((d) => d.times);
    assert.ok(times25.includes("18:30"), "25 min: 18:30 Londyn (19:30 Warszawa) jest");
    await r50.click();
    assert.equal(await r50.getAttribute("aria-checked"), "true");
    const shown50 = await shownDays(tab);
    assertSlotsMatch(shown50, [before, after], 50, VIEWER_ZONE);
    assert.ok(!shown50.flatMap((d) => d.times).includes("18:30"), "50 min: 19:30 Warszawa (18:30 Londyn) znika");
    // Ceny nad sekcją widoczne cały czas (R07).
    const prices = tab.getByRole("region", { name: "Ceny" });
    assert.match(normalize(await prices.innerText()), /150 zł[\s\S]*280 zł/);
  });

  test("E1 (Z1/F3): w sekcji terminów brak linków i przycisków — godzina nie jest kontrolką; przełącznik to radio", async () => {
    const { tab } = await newPage();
    await tab.goto(`${BASE_URL}/m/${OLGA.slug}`);
    await tab.getByRole("heading", { level: 2, name: /twoja strefa/ }).waitFor();
    const list = slotSection(tab);
    assert.equal(await list.count(), 1);
    assert.equal(await list.locator("a, button, input, select, textarea, [role=button], [role=link], [tabindex]").count(), 0, "lista terminów: sam tekst");
    // Cała strona: jedyny link to praca publiczna; żadnego elementu z rolą przycisku (Radix renderuje opcje
    // przełącznika jako <button role="radio"> — to radio, nie przycisk).
    assert.equal(await tab.locator("main a").count(), 1);
    assert.equal(await tab.getByRole("button").count(), 0);
    const buttonRoles = await tab.locator("main button").evaluateAll((buttons) => buttons.map((b) => b.getAttribute("role")));
    assert.deepEqual(buttonRoles, ["radio", "radio"]);
    assert.equal(await tab.locator("form, textarea").count(), 0, "brak formularza i pola pytania (L1)");
  });

  test("kolejność: profil → ceny → przełącznik → terminy; HTML z serwera bez godzin i bez strefy widza (hydracja bez niezgodności)", async () => {
    const { tab } = await newPage();
    await tab.goto(`${BASE_URL}/m/${OLGA.slug}`);
    await tab.getByRole("heading", { level: 2, name: /twoja strefa/ }).waitFor();
    const ordered = await tab.evaluate(() => {
      const main = document.querySelector("main");
      const nodes = [
        main.querySelector("h1"),
        main.querySelector("a"),
        [...main.querySelectorAll("p")].find((p) => p.textContent.includes("Opis mentora")),
        main.querySelector("#prices-heading"),
        main.querySelector('[role="radiogroup"]'),
        main.querySelector('section[aria-labelledby="slots-heading"]'),
      ];
      if (nodes.some((node) => !node)) return null;
      return nodes.slice(1).every((node, i) => nodes[i].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(ordered, true);

    const { status, html } = await raw(`/m/${OLGA.slug}`);
    assert.equal(status, 200);
    const visible = html.slice(html.indexOf("<body")).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    assert.ok(visible.includes("Wczytywanie terminów"), "serwer: szkielet zamiast godzin");
    assert.doesNotMatch(visible, /twoja strefa/, "serwer nie zna strefy widza");
    assert.doesNotMatch(visible.replace(/<[^>]+>/g, " "), TIME, "serwer nie renderuje godzin");
  });

  test("mentorId, strefa mentora i okna nie występują w HTML-u ani w ładunku RSC; do klienta idą tylko startsAt + lengthMinutes", async () => {
    const { html } = await raw(`/m/${OLGA.slug}`);
    const rsc = await raw(`/m/${OLGA.slug}`, { RSC: "1" });
    assert.equal(rsc.status, 200);
    assert.match(rsc.html, /Olga S\./, "to jest ładunek RSC tej strony");
    assert.match(rsc.html, /"startsAt":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z","lengthMinutes":(25|50)/, "lista ISO w ładunku");
    for (const body of [html, rsc.html]) {
      for (const value of [olga.id, olga.email, MENTOR_ZONE, "mentorId", "time_zone", "timeZone", "startMinute", "endMinute", "weekday", "windows"]) {
        assert.ok(!body.includes(value), `bez ${value}`);
      }
      // Każdy obiekt z `startsAt` ma dokładnie dwa klucze.
      const objects = body.replace(/\\"/g, '"').match(/\{"startsAt":[^}]*\}/g) ?? [];
      assert.ok(objects.length > 0);
      for (const object of objects) assert.deepEqual(Object.keys(JSON.parse(object)), ["startsAt", "lengthMinutes"]);
    }
  });

  for (const [label, mentor] of [
    ["mentor bez okien (story 3)", BARTEK],
    ["okna bez strefy mentora (P2/Z38)", CELINA],
  ]) {
    test(`${label}: profil, ceny i „${EMPTY}”, bez żadnej godziny i bez przełącznika`, async () => {
      const { tab } = await newPage();
      await tab.goto(`${BASE_URL}/m/${mentor.slug}`);
      await tab.getByRole("heading", { level: 1, name: mentor.displayName }).waitFor();
      const section = slotSection(tab);
      await section.getByText(EMPTY).waitFor();
      const text = normalize(await section.innerText());
      assert.doesNotMatch(text, TIME, "bez godziny");
      assert.equal(await tab.getByRole("radiogroup").count(), 0, "bez przełącznika, gdy nie ma terminów");
      assert.equal(await section.locator("a, button").count(), 0);
      assert.match(normalize(await tab.locator("main").innerText()), new RegExp(`${mentor.price25} zł[\\s\\S]*${mentor.price50} zł[\\s\\S]*${EMPTY}`));
      // Pusty stan nie zależy od strefy widza → jest już w HTML-u z serwera.
      const { html } = await raw(`/m/${mentor.slug}`);
      assert.ok(html.includes(EMPTY), "pusty stan w HTML-u z serwera");
    });
  }

  test("błąd wczytania terminów (prawdziwy błąd bazy): „Nie udało się wczytać terminów — odśwież stronę”, profil i ceny zostają", async () => {
    await db.query("alter table availability_windows rename to availability_windows_e2e_off");
    try {
      const { tab } = await newPage();
      const response = await tab.goto(`${BASE_URL}/m/${OLGA.slug}`);
      assert.equal(response?.status(), 200, "profil renderuje się mimo błędu sekcji");
      const section = slotSection(tab);
      await section.getByRole("alert").getByText(ERROR).waitFor();
      assert.equal(await tab.getByRole("heading", { level: 1 }).innerText(), OLGA.displayName);
      assert.equal(await tab.locator("main a").getAttribute("href"), OLGA.publicWorkUrl);
      const main = normalize(await tab.locator("main").innerText());
      assert.match(main, /Opis mentora Olga S\./);
      assert.match(main, /150 zł[\s\S]*280 zł[\s\S]*Nie udało się wczytać terminów/, "ceny przed komunikatem błędu");
      assert.doesNotMatch(normalize(await section.innerText()), TIME, "bez godzin");
      assert.equal(await tab.getByRole("radiogroup").count(), 0);
      // Szczegóły błędu bazy nie trafiają do strony.
      assert.ok(!(await tab.content()).includes("availability_windows"), "bez treści błędu SQL");
    } finally {
      await db.query("alter table availability_windows_e2e_off rename to availability_windows");
    }
  });

  test("brak strefy w przeglądarce → godziny w UTC z etykietą „UTC”", async () => {
    const { tab } = await newPage({ timezoneId: "Asia/Tokyo" });
    // Przeglądarka bez strefy: `resolvedOptions().timeZone` puste (np. stare/okrojone środowiska).
    await tab.addInitScript(() => {
      const original = Intl.DateTimeFormat.prototype.resolvedOptions;
      Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
        return { ...original.call(this), timeZone: undefined };
      };
    });
    const before = new Date();
    await tab.goto(`${BASE_URL}/m/${OLGA.slug}`);
    const after = new Date();
    await tab.getByRole("heading", { level: 2, name: "Najbliższe terminy (czas UTC)" }).waitFor();
    assertSlotsMatch(await shownDays(tab), [before, after], 25, "UTC");
  });

  test("brak sieci po wczytaniu (Z28): profil i ceny zostają, przełącznik 25/50 działa bez żadnego żądania", async () => {
    const { tab } = await newPage();
    await tab.goto(`${BASE_URL}/m/${OLGA.slug}`);
    await tab.getByRole("heading", { level: 2, name: /twoja strefa/ }).waitFor();
    /** @type {string[]} */
    const requests = [];
    tab.on("request", (request) => requests.push(request.url()));
    await tab.context().setOffline(true);
    await tab.getByRole("radio", { name: /50 min/ }).click();
    assert.ok(!(await shownDays(tab)).flatMap((d) => d.times).includes("18:30"), "lista przefiltrowana offline");
    await tab.getByRole("radio", { name: /25 min/ }).click();
    assert.ok((await shownDays(tab)).flatMap((d) => d.times).includes("18:30"));
    assert.equal(await tab.getByRole("heading", { level: 1, name: OLGA.displayName }).count(), 1);
    assert.match(normalize(await tab.getByRole("region", { name: "Ceny" }).innerText()), /150 zł[\s\S]*280 zł/);
    assert.deepEqual(requests, [], "przełącznik nie wysyła żądań");
    await tab.context().setOffline(false);
  });

  test("F3: codziennie 08:00–22:00 → każdy dzień raz (h3), najwyżej 6 godzin i „Pokaż więcej (k)”; rozwija tylko ten dzień", async () => {
    const { tab } = await newPage();
    const before = new Date();
    await tab.goto(`${BASE_URL}/m/${DAWID.slug}`);
    const after = new Date();
    await tab.getByRole("heading", { level: 2, name: `Najbliższe terminy (twoja strefa: ${VIEWER_ZONE})` }).waitFor();
    const section = slotSection(tab);
    const shown = await shownDays(tab);
    assert.ok(shown.length >= 13, `dni: ${shown.length}`);
    assert.equal(new Set(shown.map((d) => d.label)).size, shown.length, "etykieta dnia tylko raz");
    assert.equal(await section.locator("h3").count(), shown.length, "jeden nagłówek h3 na dzień");
    // Pełne listy dni (przed lub po żądaniu) — do porównania liczby ukrytych godzin i rozwinięcia.
    const candidates = [before, after].map((now) => expectedDays(listOpenSlots({ windows: DAILY_08_22, timeZone: MENTOR_ZONE, now }), 25, VIEWER_ZONE));
    const expected = candidates.find(
      (days) => days.length === shown.length && days.every((d, i) => JSON.stringify(d.times.slice(0, PER_DAY)) === JSON.stringify(shown[i].times)),
    );
    assert.ok(expected, `widoczne godziny = pierwsze ${PER_DAY} z listOpenSlots dla każdego dnia`);
    shown.forEach((day, i) => {
      const hidden = expected[i].times.length - PER_DAY;
      assert.equal(day.listLabelledBy, day.headingId, "lista godzin nazwana nagłówkiem dnia");
      if (hidden > 0) {
        assert.equal(day.times.length, PER_DAY);
        assert.deepEqual(day.button, { text: `Pokaż więcej (${hidden})`, expanded: "false", controls: day.listId });
      } else {
        assert.equal(day.button, null, `${day.label}: bez przycisku`);
      }
    });
    // Jedyne przyciski w sekcji to „Pokaż więcej (k)”; żadnych linków ani innych kontrolek (Z1/F3).
    const buttons = await section.locator("button").allInnerTexts();
    assert.ok(buttons.length > 0 && buttons.every((text) => /^Pokaż więcej \(\d+\)$/.test(text.trim())), JSON.stringify(buttons));
    assert.equal(await section.locator("a, input, select, textarea, [role=link], [role=radio], [tabindex]").count(), 0);
    assert.equal(await section.getByRole("button").count(), buttons.length);

    // Pełny dzień (drugi — pierwszy może być skrócony 3-godzinnym wyprzedzeniem): rozwinięcie tylko jego.
    const index = shown.findIndex((day, i) => i > 0 && day.button);
    const day = shown[index];
    // Wiele dni ma ten sam napis (np. „Pokaż więcej (22)”) — przycisk tego dnia przez `aria-controls` jego listy.
    const more = section.locator(`button[aria-controls="${day.listId}"]`);
    assert.equal(await more.innerText(), day.button.text);
    await more.click();
    assert.equal(await more.getAttribute("aria-expanded"), "true");
    const expanded = await shownDays(tab);
    assert.deepEqual(expanded[index].times, expected[index].times, "po rozwinięciu wszystkie godziny tego dnia");
    expanded.forEach((other, i) => {
      if (i !== index) assert.ok(other.times.length <= PER_DAY, `${other.label}: nadal zwinięty`);
    });
    // Zmiana długości zwija wszystkie dni (F3).
    await tab.getByRole("radio", { name: /50 min/ }).click();
    const after50 = await shownDays(tab);
    assert.ok(after50.every((d) => d.times.length <= PER_DAY && (d.button === null || d.button.expanded === "false")));
  });

  test("klawiatura (Z41): Tab do przełącznika, strzałka w prawo zaznacza 50 min i od razu filtruje listę; w lewo wraca", async () => {
    const { tab } = await newPage();
    await tab.goto(`${BASE_URL}/m/${OLGA.slug}`);
    await tab.getByRole("heading", { level: 2, name: /twoja strefa/ }).waitFor();
    const r25 = tab.getByRole("radio", { name: /25 min/ });
    const r50 = tab.getByRole("radio", { name: /50 min/ });
    // Tab od początku strony aż do grupy radiowej (jeden przystanek: zaznaczona opcja).
    let onRadio = false;
    for (let i = 0; i < 10 && !onRadio; i++) {
      await tab.keyboard.press("Tab");
      onRadio = await tab.evaluate(() => document.activeElement?.getAttribute("role") === "radio");
    }
    assert.ok(onRadio, "Tab dochodzi do przełącznika 25/50");
    assert.equal(await r25.evaluate((el) => el === document.activeElement), true, "fokus na zaznaczonym 25 min");
    assert.ok((await shownDays(tab)).flatMap((d) => d.times).includes("18:30"));

    await tab.keyboard.press("ArrowRight");
    assert.equal(await r50.evaluate((el) => el === document.activeElement), true, "fokus na 50 min");
    assert.equal(await r50.getAttribute("aria-checked"), "true", "strzałka zaznacza (nie tylko przenosi fokus)");
    assert.equal(await r25.getAttribute("aria-checked"), "false");
    assert.ok(!(await shownDays(tab)).flatMap((d) => d.times).includes("18:30"), "lista od razu przefiltrowana do 50 min");

    await tab.keyboard.press("ArrowLeft");
    assert.equal(await r25.getAttribute("aria-checked"), "true");
    assert.ok((await shownDays(tab)).flatMap((d) => d.times).includes("18:30"), "z powrotem 25 min");
  });

  test("telefon 375 px: wiersze godzin zawijają się bez przewijania w poziomie (także po rozwinięciu dnia)", async () => {
    const { tab } = await newPage({ viewport: { width: 375, height: 812 } });
    await tab.goto(`${BASE_URL}/m/${DAWID.slug}`);
    await tab.getByRole("heading", { level: 2, name: /twoja strefa/ }).waitFor();
    const noHorizontalScroll = () =>
      tab.evaluate(() => {
        const section = document.querySelector('section[aria-labelledby="slots-heading"]');
        return {
          page: document.documentElement.scrollWidth <= window.innerWidth,
          section: section ? section.scrollWidth <= section.clientWidth : false,
          items: [...(section?.querySelectorAll("li") ?? [])].every((li) => li.getBoundingClientRect().right <= window.innerWidth),
        };
      });
    assert.deepEqual(await noHorizontalScroll(), { page: true, section: true, items: true });
    assert.ok((await slotSection(tab).locator("li").count()) > 0);
    await slotSection(tab).getByRole("button", { name: /^Pokaż więcej/ }).first().click();
    assert.deepEqual(await noHorizontalScroll(), { page: true, section: true, items: true });
  });
});
