// Sprawdzenie w przeglądarce (Etap 3) i zrzuty do evidence/:
//  - każdy ekran przy 320 i 1440 px, w jasnym i ciemnym motywie (bez poziomego przewijania),
//  - obsługa klawiaturą (Tab do akcji, Enter, fokus widoczny),
//  - każda wartość każdej kontrolki scenariusza (bez błędów strony),
//  - każdy przycisk i link w ramkach ekranów coś robi (zmiana treści, ekranu, fokusu albo komunikatu).
// Uruchom po `npm run build`: `npm run evidence`. Wynik: evidence/*.png i evidence/raport.json.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { control, current, nav, openPrototype, settled, startBrowser } from "../tests/helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../evidence");
await mkdir(out, { recursive: true });
const ctx = await startBrowser();
const report = { widths: [], keyboard: [], controls: [], buttons: [], errors: [] };

/** Stan „wszystko ustawione”: Anna zalogowana, strona opublikowana, okna wt + czw. */
async function signedInPublished(page) {
  await control(page, "C1", "anna");
  await control(page, "C6", "published");
}

// 1. Ekrany × szerokości × motywy -------------------------------------------------------
const SCREENS = ["s01", "s02", "s03", "s04", "s05", "s06", "s07"];
for (const colorScheme of ["light", "dark"]) {
  for (const width of [320, 1440]) {
    const { page, errors } = await openPrototype(ctx, { width, height: 900, colorScheme });
    await signedInPublished(page);
    for (const id of SCREENS) {
      if (id === "s03") await control(page, "C1", "anna-bez-sesji");
      if (id === "s04") await control(page, "C1", "anna");
      if (id === "s01") await control(page, "C1", "anna-bez-sesji");
      if (id === "s07") await control(page, "C12", "ewa-szkic");
      if (id === "s06") await control(page, "C12", "anna");
      await nav(page, id);
      await settled(page, id);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      report.widths.push({ colorScheme, width, screen: id, horizontalOverflowPx: overflow });
      await page.screenshot({ path: path.join(out, `${id}-${width}-${colorScheme}.png`), fullPage: true });
    }
    report.errors.push(...errors.map((e) => `${colorScheme}/${width}: ${e}`));
    await page.close();
  }
}

// Wybrane stany (jasny, 1440 i 375 px) ----------------------------------------------------
const STATES = [
  ["s01-niewazny", async (p) => (await control(p, "C2", "revoked"), "s01")],
  ["s01-brak-sieci", async (p) => (await control(p, "C3", "network"), await p.locator("#s01").getByRole("button", { name: "Akceptuję zaproszenie" }).click(), await p.waitForTimeout(700), "s01")],
  ["s01-przyjete-zalogowana", async (p) => (await control(p, "C1", "anna"), await control(p, "C2", "used"), "s01")],
  ["s02-podwojne-klikniecie", async (p) => (await control(p, "C4", "double"), await nav(p, "s02"), "s02")],
  ["s04-pierwsza-wizyta", async (p) => (await control(p, "C1", "anna"), await nav(p, "s04"), "s04")],
  ["s04-ladowanie", async (p) => (await control(p, "C1", "anna"), await control(p, "C16", "stuck"), await nav(p, "s04"), "s04")],
  ["s04-bledy-pol", async (p) => (await control(p, "C1", "anna"), await nav(p, "s04"), await settled(p, "s04"), await p.locator("#s04").getByRole("button", { name: "Opublikuj stronę" }).click(), "s04")],
  ["s04-opublikowano", async (p) => {
    await control(p, "C1", "anna");
    await control(p, "C6", "draft");
    await nav(p, "s04");
    await settled(p, "s04");
    await p.locator("#s04").getByRole("button", { name: "Opublikuj stronę" }).click();
    await p.locator("#s04").getByRole("textbox", { name: "Twój link" }).waitFor();
    return "s04";
  }],
  ["s05-pusta", async (p) => (await control(p, "C1", "anna"), await nav(p, "s05"), "s05")],
  ["s05-ustawiona", async (p) => (await signedInPublished(p), await nav(p, "s05"), "s05")],
  ["s05-limit-21", async (p) => (await control(p, "C1", "anna"), await control(p, "C9", "too-many"), await nav(p, "s05"), await settled(p, "s05"), await p.locator("#s05").getByRole("button", { name: "Zapisz", exact: true }).click(), await p.locator("#s05").getByText("Maksymalnie 21 okien w tygodniu").waitFor(), "s05")],
  ["s06-londyn", async (p) => (await control(p, "C6", "published"), await control(p, "C10", "london"), await nav(p, "s06"), "s06")],
  ["s06-utc", async (p) => (await control(p, "C6", "published"), await control(p, "C10", "none"), await nav(p, "s06"), "s06")],
  ["s06-brak-terminow-piotr", async (p) => (await control(p, "C12", "piotr-n"), "s06")],
  ["s06-blad-terminow", async (p) => (await control(p, "C6", "published"), await control(p, "C11", "error"), await nav(p, "s06"), "s06")],
  ["s06-dlugi-opis", async (p) => (await control(p, "C6", "published"), await control(p, "C13", "long"), await nav(p, "s06"), "s06")],
  ["s07-m-search", async (p) => (await control(p, "C12", "m-search"), "s07")],
];
for (const width of [1440, 375]) {
  for (const [name, setup] of STATES) {
    const { page, errors } = await openPrototype(ctx, { width });
    const id = await setup(page);
    await settled(page, id);
    if (name === "s04-ladowanie" || name === "s04-bledy-pol" || name === "s04-opublikowano" || name === "s01-brak-sieci" || name === "s05-limit-21") await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `stan-${name}-${width}.png`), fullPage: true });
    report.errors.push(...errors.map((e) => `${name}: ${e}`));
    await page.close();
  }
}

// 2. Klawiatura ---------------------------------------------------------------------------
{
  const { page } = await openPrototype(ctx);
  const steps = [];
  // s01: Tab z nagłówka trafia na „Akceptuję zaproszenie”, Enter loguje i przenosi do s04.
  await page.locator("#s01 .frame h1").focus();
  await page.keyboard.press("Tab");
  steps.push({ step: "s01 Tab", focused: await page.evaluate(() => document.activeElement?.textContent?.trim()) });
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  steps.push({ step: "s01 focus ring", outlineStyle: outline });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".screen.is-current")?.id === "s04");
  await settled(page, "s04");
  steps.push({ step: "Enter → ekran", screen: await current(page), focused: await page.evaluate(() => document.activeElement?.textContent?.trim()?.slice(0, 40)) });
  // s04: Tab przez nawigację mentora do pierwszego pola.
  const order = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    order.push(await page.evaluate(() => {
      const el = document.activeElement;
      return `${el?.tagName.toLowerCase()}:${el?.getAttribute("aria-label") ?? el?.labels?.[0]?.textContent ?? el?.textContent?.trim()?.slice(0, 30)}`;
    }));
  }
  steps.push({ step: "s04 kolejność Tab", order });
  await page.screenshot({ path: path.join(out, "klawiatura-s04-fokus.png") });
  // s06: przełącznik 25/50 strzałkami.
  await control(page, "C6", "published");
  await nav(page, "s06");
  await page.locator("#s06 .frame h1").focus();
  await page.keyboard.press("Tab"); // link do publicznej pracy
  await page.keyboard.press("Tab"); // przełącznik 25/50
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  steps.push({ step: "s06 strzałka w przełączniku (przenosi fokus)", focused: await page.evaluate(() => document.activeElement?.textContent?.trim()), checked: await page.evaluate(() => document.activeElement?.getAttribute("aria-checked")) });
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  steps.push({ step: "s06 spacja wybiera 50 min", checked: await page.evaluate(() => document.activeElement?.getAttribute("aria-checked")), slots: (await page.locator("#s06 .frame ul").last().innerText()).split(String.fromCharCode(10)).slice(0, 2) });
  await page.screenshot({ path: path.join(out, "klawiatura-s06-przelacznik.png") });
  // Backspace = „← Back” w trybie prezentacji.
  await page.locator("#s06 .frame h1").focus();
  await page.keyboard.press("Backspace");
  steps.push({ step: "Backspace → poprzedni ekran", screen: await current(page) });
  report.keyboard = steps;
  await page.close();
}

// 3. Każda wartość każdej kontrolki --------------------------------------------------------
{
  const { page, errors } = await openPrototype(ctx);
  const ids = await page.locator("[data-control]").evaluateAll((els) => els.map((e) => e.getAttribute("data-control")));
  for (const id of ids) {
    const values = await page.locator(`[data-control="${id}"] option`).evaluateAll((os) => os.map((o) => o.value));
    for (const value of values) {
      await control(page, id, value);
      await page.waitForTimeout(80);
      report.controls.push({ control: id, value, screen: await current(page), ok: (await page.locator(".screen.is-current .frame").innerText()).trim().length > 0 });
    }
  }
  // Founder (CLI), „Otwórz link jako Anna”, motyw, Reset
  await page.locator("details.sim-panel summary").click();
  await page.getByRole("button", { name: "Wygeneruj zaproszenie" }).click();
  report.controls.push({ control: "Founder: zaproszenie", value: await page.getByTestId("cli").innerText(), ok: true });
  await page.getByRole("button", { name: "Otwórz link jako Anna" }).click();
  report.controls.push({ control: "Otwórz link jako Anna", value: "", screen: await current(page), ok: (await current(page)) === "s01" });
  await page.getByRole("button", { name: "Wygeneruj link logowania" }).click();
  await page.getByRole("button", { name: "Otwórz link jako Anna" }).click();
  report.controls.push({ control: "Founder: link logowania", value: "", screen: await current(page), ok: (await current(page)) === "s02" });
  for (let i = 0; i < 3; i++) {
    await page.locator("#theme-toggle").click();
    report.controls.push({ control: "Motyw", value: await page.locator("#theme-toggle").innerText(), ok: true, dataTheme: await page.evaluate(() => document.documentElement.getAttribute("data-theme")) });
  }
  await page.getByRole("button", { name: "Reset symulacji" }).click();
  report.controls.push({ control: "Reset symulacji", value: await page.locator(".review-message").innerText(), screen: await current(page), ok: (await current(page)) === "s01" });
  // Przyciski silnika przeglądu
  for (const name of ["Comment", "Clickable", "Show hotspots", "Presentation", "Threads", "Hide pins"]) {
    await page.getByRole("button", { name, exact: true }).first().click();
    report.controls.push({ control: `Silnik: ${name}`, value: "", ok: true });
  }
  await page.screenshot({ path: path.join(out, "silnik-tryb-dokumentu.png") });
  report.errors.push(...errors.map((e) => `controls: ${e}`));
  await page.close();
}

// 4. Każdy przycisk i link w ramkach coś robi ------------------------------------------------
const BUTTON_SETUPS = {
  s01: async () => undefined,
  s02: async (p) => nav(p, "s02"),
  s03: async (p) => nav(p, "s03"),
  s04: async (p) => (await control(p, "C1", "anna"), await control(p, "C6", "published"), await nav(p, "s04")),
  "s04-szkic": async (p) => (await control(p, "C1", "anna"), await control(p, "C6", "draft"), await control(p, "C8", "none"), await nav(p, "s04")),
  s05: async (p) => (await control(p, "C1", "anna"), await control(p, "C6", "published"), await nav(p, "s05")),
  s06: async (p) => (await control(p, "C6", "published"), await nav(p, "s06")),
  s07: async (p) => nav(p, "s07"),
};
for (const [name, setup] of Object.entries(BUTTON_SETUPS)) {
  const id = name.slice(0, 3);
  const probe = await openPrototype(ctx);
  await probe.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(probe.page);
  await settled(probe.page, id);
  const count = await probe.page.locator(`#${id} .frame`).locator("button, a[href], [role=radio]").count();
  await probe.page.close();
  for (let i = 0; i < count; i++) {
    const { page, errors } = await openPrototype(ctx);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await setup(page);
    await settled(page, id);
    const target = page.locator(`#${id} .frame`).locator("button, a[href], [role=radio]").nth(i);
    const label = ((await target.getAttribute("aria-label")) ?? (await target.innerText())).trim().replace(/\s+/g, " ").slice(0, 50);
    const before = { text: await page.locator(`#${id} .frame`).innerText(), screen: await current(page), msg: await page.locator(".review-message").innerText(), html: await page.locator(`#${id} .frame`).innerHTML() };
    let clicked = true;
    try {
      await target.click({ timeout: 3000 });
    } catch {
      clicked = false;
    }
    await page.waitForTimeout(1200);
    const after = { text: await page.locator(`#${id} .frame`).innerText(), screen: await current(page), msg: await page.locator(".review-message").innerText(), html: await page.locator(`#${id} .frame`).innerHTML() };
    const changed = before.text !== after.text || before.screen !== after.screen || before.msg !== after.msg || before.html !== after.html;
    report.buttons.push({ screen: name, control: label, clicked, effect: changed ? (before.screen !== after.screen ? `→ ${after.screen}` : before.msg !== after.msg ? after.msg : "zmiana na ekranie") : "BRAK" });
    report.errors.push(...errors.map((e) => `${name}/${label}: ${e}`));
    await page.close();
  }
}

await ctx.close();
await writeFile(path.join(out, "raport.json"), JSON.stringify(report, null, 2));
const overflow = report.widths.filter((w) => w.horizontalOverflowPx > 0);
const dead = report.buttons.filter((b) => b.effect === "BRAK" || !b.clicked);
const badControls = report.controls.filter((c) => !c.ok);
console.log(`Zrzuty: ${out}`);
console.log(`Szerokości: ${report.widths.length} sprawdzeń, poziome przewijanie: ${overflow.length ? JSON.stringify(overflow) : "brak"}`);
console.log(`Kontrolki: ${report.controls.length} wartości, problemy: ${badControls.length ? JSON.stringify(badControls) : "brak"}`);
console.log(`Przyciski/linki w ramkach: ${report.buttons.length}, bez efektu: ${dead.length ? JSON.stringify(dead, null, 1) : "brak"}`);
console.log(`Klawiatura: ${JSON.stringify(report.keyboard, null, 1)}`);
console.log(`Błędy strony: ${report.errors.length ? report.errors.join("\n") : "brak"}`);
