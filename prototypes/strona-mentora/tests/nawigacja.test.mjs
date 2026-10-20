// Testy nawigacji i scenariuszy prototypu (Etap 3). Uruchom po `npm run build`: `npm test`.
// Playwright z repozytorium (chromium już pobrany przez CI design systemu), bez nowych zależności.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { control, current, nav, openPrototype, screen, settled, startBrowser } from "./helpers.mjs";

const SCREENS = ["s01", "s02", "s03", "s04", "s05", "s06", "s07"];
let ctx;

before(async () => {
  ctx = await startBrowser();
});
after(async () => {
  await ctx?.close();
});

test("start na s01, każdy link paska prowadzi do swojego ekranu, „← Back” wraca", async () => {
  const { page, errors } = await openPrototype(ctx);
  assert.equal(await current(page), "s01");
  for (const id of SCREENS) {
    await nav(page, id);
    assert.equal(await current(page), id);
    assert.equal(await page.locator(`#${id} .frame h1`).first().evaluate((h) => document.activeElement === h || h.closest(".screen").contains(document.activeElement)), true, `fokus w ${id}`);
  }
  await page.locator(".proto-back").click();
  assert.equal(await current(page), "s06");
  assert.deepEqual(errors, []);
  await page.close();
});

test("link z hashem otwiera wskazany ekran", async () => {
  const { page } = await openPrototype(ctx, { hash: "#s07" });
  assert.equal(await current(page), "s07");
  await page.close();
});

test("ścieżka bez błędów: zaproszenie → edytor → publikacja → dostępność → strona publiczna", async () => {
  const { page, errors } = await openPrototype(ctx);
  await page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
  await page.waitForFunction(() => document.querySelector(".screen.is-current")?.id === "s04");
  await settled(page, "s04");
  const s04 = screen(page, "s04");
  await s04.getByLabel("Imię i nazwisko").fill("Anna K.");
  assert.equal(await s04.getByLabel("Adres strony").inputValue(), "mentor-q7k2ma", "L9: slug zastępczy zostaje (LUKA DS D4)");
  await s04.getByLabel("Link do publicznej pracy").fill("https://github.com/annak");
  await s04.getByLabel("Twoje doświadczenie").fill("Migrowałam dwa duże projekty na server components.");
  await s04.getByLabel("Cena za 25 min").fill("150");
  await s04.getByLabel("Cena za 50 min").fill("280");
  await s04.getByLabel("Adres strony").fill("anna-k");
  await s04.getByRole("button", { name: "Opublikuj stronę" }).click();
  const link = s04.getByRole("textbox", { name: "Twój link" });
  await link.waitFor();
  assert.equal(await link.inputValue(), "http://localhost:3000/m/anna-k");
  assert.equal(await link.evaluate((el) => el === document.activeElement), true, "14-E6: fokus na linku");

  await s04.getByRole("link", { name: "Dodaj dostępność" }).click();
  await page.waitForFunction(() => document.querySelector(".screen.is-current")?.id === "s05");
  await settled(page, "s05");
  const s05 = screen(page, "s05");
  await s05.getByRole("button", { name: "Dodaj okno: wtorek" }).click();
  await s05.getByRole("button", { name: "Dodaj okno: czwartek" }).click();
  await s05.getByRole("button", { name: "Zapisz", exact: true }).click();
  await s05.getByText("Dostępność zapisana").waitFor();
  assert.match(await s05.getByRole("list", { name: "Najbliższe terminy" }).innerText(), /18:00/);

  await nav(page, "s06");
  const s06 = screen(page, "s06");
  assert.equal(await s06.getByRole("heading", { level: 1 }).innerText(), "Anna K.");
  assert.match(await s06.innerText(), /150\szł/);
  assert.match(await s06.innerText(), /twoja strefa: Europe\/Warsaw/);
  assert.match(await s06.innerText(), /18:00, 18:30, 19:00, 19:30/);
  assert.equal(await s06.getByRole("button", { name: /Zarezerwuj/ }).count(), 0, "#16 Q1: bez przycisku rezerwacji");
  await s06.getByText("50 min —").click();
  assert.doesNotMatch(await s06.innerText(), /19:30/, "16 story 2: przy 50 min znika 19:30");
  assert.deepEqual(errors, []);
  await page.close();
});

test("bramka: /mentor bez sesji pokazuje komunikat s03; „Wyloguj” prowadzi do s03", async () => {
  const { page } = await openPrototype(ctx);
  await nav(page, "s04");
  await screen(page, "s04").getByText("Dostęp tylko przez zaproszenie — poproś zespół o link do logowania").waitFor();
  await control(page, "C1", "anna");
  await settled(page, "s04");
  await screen(page, "s04").getByRole("button", { name: "Wyloguj" }).click();
  await page.waitForFunction(() => document.querySelector(".screen.is-current")?.id === "s03");
  await nav(page, "s05");
  await screen(page, "s05").getByText("Dostęp tylko przez zaproszenie — poproś zespół o link do logowania").waitFor();
  await page.close();
});

test("nieaktywne linki: zaproszenie wygasłe i link logowania użyty dają jeden neutralny komunikat", async () => {
  const { page } = await openPrototype(ctx);
  await control(page, "C2", "expired");
  await screen(page, "s01").getByText("Ten link jest nieaktywny — poproś zespół o nowy").waitFor();
  await control(page, "C4", "used");
  await nav(page, "s02");
  await screen(page, "s02").getByText("Ten link jest nieaktywny — poproś zespół o nowy").waitFor();
  await page.close();
});

test("link logowania: sukces prowadzi do edytora; podwójne kliknięcie daje komunikat", async () => {
  const { page } = await openPrototype(ctx);
  await control(page, "C4", "double");
  await nav(page, "s02");
  await screen(page, "s02").getByRole("button", { name: "Zaloguj" }).click();
  await screen(page, "s02").getByText("Ten link jest nieaktywny — poproś zespół o nowy").waitFor();
  await control(page, "C1", "anna-bez-sesji");
  await control(page, "C4", "valid");
  await screen(page, "s02").getByRole("button", { name: "Zaloguj" }).click();
  await page.waitForFunction(() => document.querySelector(".screen.is-current")?.id === "s04");
  await page.close();
});

test("publikacja pustego formularza: błędy przy polach i fokus na pierwszym", async () => {
  const { page } = await openPrototype(ctx);
  await control(page, "C1", "anna");
  await nav(page, "s04");
  await settled(page, "s04");
  const s04 = screen(page, "s04");
  await s04.getByRole("button", { name: "Opublikuj stronę" }).click();
  await s04.getByText("Wpisz imię i nazwisko (od 2 do 80 znaków)").waitFor();
  assert.equal(await s04.getByLabel("Imię i nazwisko").evaluate((el) => el === document.activeElement), true);
  await page.close();
});

test("adres zajęty przy publikacji (C7) i wygaśnięcie sesji przy zapisie (C5, L6): dane zostają", async () => {
  const { page } = await openPrototype(ctx);
  await control(page, "C1", "anna");
  await control(page, "C6", "draft");
  await control(page, "C7", "slug-taken");
  await nav(page, "s04");
  await settled(page, "s04");
  const s04 = screen(page, "s04");
  await s04.getByRole("button", { name: "Opublikuj stronę" }).click();
  await s04.getByText("Ten adres jest zajęty").waitFor();
  await control(page, "C7", "ok");
  await control(page, "C5", "wygasa-przy-zapisie");
  await s04.getByLabel("Imię i nazwisko").fill("Anna Kowalczyk");
  await s04.getByRole("button", { name: "Zapisz szkic" }).click();
  await s04.getByText("Sesja wygasła — poproś zespół o link do logowania").waitFor();
  assert.equal(await s04.getByLabel("Imię i nazwisko").inputValue(), "Anna Kowalczyk");
  await page.close();
});

test("dostępność: 22 okna są odrzucane z komunikatem o limicie 21 (L16)", async () => {
  const { page } = await openPrototype(ctx);
  await control(page, "C1", "anna");
  await control(page, "C9", "too-many");
  await nav(page, "s05");
  await settled(page, "s05");
  const s05 = screen(page, "s05");
  await s05.getByRole("button", { name: "Zapisz", exact: true }).click();
  await s05.getByText("Maksymalnie 21 okien w tygodniu").waitFor();
  await page.close();
});

test("strona publiczna: widz w Londynie widzi 17:00; brak terminów u Piotra; szkic Ewy i /m dają s07", async () => {
  const { page } = await openPrototype(ctx);
  await control(page, "C6", "published");
  await control(page, "C10", "london");
  await nav(page, "s06");
  assert.match(await screen(page, "s06").innerText(), /twoja strefa: Europe\/London/);
  assert.match(await screen(page, "s06").innerText(), /17:00/);
  await control(page, "C12", "piotr-n");
  await screen(page, "s06").getByText("Brak wolnych terminów w najbliższych 14 dniach").waitFor();
  await control(page, "C12", "ewa-szkic");
  await page.waitForFunction(() => document.querySelector(".screen.is-current")?.id === "s07");
  await screen(page, "s07").getByText("Nie ma takiej strony mentora").waitFor();
  await control(page, "C12", "m-search");
  assert.equal(await page.getByTestId("route").innerText(), "/m?search=react");
  await page.close();
});

test("link zewnętrzny na stronie publicznej nie wychodzi z prototypu", async () => {
  const { page } = await openPrototype(ctx);
  await control(page, "C6", "published");
  await nav(page, "s06");
  await screen(page, "s06").getByRole("link", { name: /github\.com\/annak/ }).click();
  assert.equal(await current(page), "s06");
  assert.match(page.url(), /strona-mentora\/index\.html/);
  await page.locator(".review-message").getByText(/nie jest otwierany w prototypie/).waitFor();
  await page.close();
});
