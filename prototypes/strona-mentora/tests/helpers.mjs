// Pomocnicze funkcje testów i zrzutów: Playwright (biblioteka z repozytorium) + serwer statyczny.
import { chromium } from "playwright";

import { serve } from "../scripts/serve.mjs";

export async function startBrowser() {
  const { server, url } = await serve();
  const browser = await chromium.launch();
  return { browser, url, close: async () => (await browser.close(), server.close()) };
}

/** Nowa karta z prototypem; zbiera błędy konsoli i wyjątki strony. */
export async function openPrototype(ctx, { width = 1440, height = 900, hash = "", colorScheme = "light" } = {}) {
  const page = await ctx.browser.newPage({ viewport: { width, height }, colorScheme });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(ctx.url + hash);
  await page.locator(".screen.is-current").waitFor();
  return { page, errors };
}

export const current = (page) => page.locator(".screen.is-current").getAttribute("id");
export const screen = (page, id) => page.locator(`#${id} .frame`);

/** Ustawia kontrolkę scenariusza (C1–C16) w pasku przeglądu. */
export async function control(page, id, value) {
  const panel = page.locator("details.sim-panel");
  if (!(await panel.evaluate((d) => d.open))) await panel.locator("summary").click();
  await page.locator(`[data-control="${id}"]`).selectOption(value);
  await panel.locator("summary").click(); // zamknij panel, żeby nie zasłaniał ekranu
}

export async function nav(page, id) {
  await page.locator(`.screen-nav a[href="#${id}"]`).click();
  await page.waitForFunction((s) => document.querySelector(".screen.is-current")?.id === s, id);
}

/** Czeka, aż ekran mentora skończy „wczytywanie” (stan Ł, 0,5 s). */
export async function settled(page, id) {
  await page.locator(`#${id} [aria-busy="true"], #${id} .animate-pulse`).first().waitFor({ state: "detached", timeout: 3000 }).catch(() => undefined);
  await page.waitForTimeout(600);
}
