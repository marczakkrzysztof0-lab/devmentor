// Wspólne kroki testów e2e (lekcja 12, `.ai/skills/om-integration-tests/SKILL.md`). To nie jest plik testowy
// (`scripts/test-e2e.mjs` uruchamia tylko tests/e2e/*.e2e.mjs). Każda funkcja robi jedną rzecz — kroki
// testowanego zachowania zostają w treści testu (dobra praktyka 13).
import assert from "node:assert/strict";
import pg from "pg";
import { chromium } from "playwright";
import { createInvitation, createSignInLink } from "../../../scripts/mentor-links.mjs";

export const BASE_URL = process.env.E2E_BASE_URL;
export const DATABASE_URL = process.env.E2E_DATABASE_URL;
/** Opcja `skip` dla `describe` — plik uruchamiany poza `npm run test:integration` jest pomijany. */
export const skip = BASE_URL && DATABASE_URL ? false : "Uruchom przez npm run test:integration (brak E2E_BASE_URL / E2E_DATABASE_URL).";

export const TEXT = Object.freeze({
  inactiveLink: "Ten link jest nieaktywny — poproś zespół o nowy",
  invitationOnly: "Dostęp tylko przez zaproszenie — poproś zespół o link do logowania",
  editorHeading: "Twoja strona",
  notFoundMentor: "Nie ma takiej strony mentora",
  emptySlots: "Brak wolnych terminów w najbliższych 14 dniach",
});

let counter = 0;
/** Unikalny adres e-mail testu (każdy przebieg ma też własny schemat bazy). */
export const uniqueEmail = (label) => `e2e-${label}-${Date.now()}-${++counter}@example.com`;

/** Pula do bazy schematu testowego i przeglądarka — zamykane w `after`. */
export async function openHarness() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  const browser = await chromium.launch();
  return {
    db,
    browser,
    close: async () => {
      await browser.close();
      await db.end();
    },
  };
}

/** Nowa karta w nowym kontekście (osobne ciasteczka), polska strefa i język. */
export async function newTab(browser, { timezoneId = "Europe/Warsaw" } = {}) {
  const context = await browser.newContext({ locale: "pl-PL", timezoneId });
  return { context, page: await context.newPage() };
}

export const invitationUrl = async (db, email) => (await createInvitation({ db, email, appUrl: BASE_URL })).url;
export const signInUrl = async (db, email) => (await createSignInLink({ db, email, appUrl: BASE_URL })).url;

/** Czeka, aż React podepnie się pod formularz edytora (wpisywanie przed hydracją ginęłoby). */
export async function waitForEditor(page) {
  await page.getByRole("heading", { level: 1, name: TEXT.editorHeading }).waitFor();
  await page.waitForFunction(() => {
    const input = document.querySelector('input[name="displayName"]');
    return input !== null && Object.keys(input).some((key) => key.startsWith("__react"));
  });
}

/** Przyjęcie zaproszenia w przeglądarce → zalogowana karta na /mentor z gotowym edytorem. */
export async function signedInMentor(browser, db, email, options) {
  const url = await invitationUrl(db, email);
  const tab = await newTab(browser, options);
  await tab.page.goto(url);
  await tab.page.getByRole("button", { name: "Akceptuję zaproszenie" }).click();
  await tab.page.waitForURL(`${BASE_URL}/mentor`);
  await waitForEditor(tab.page);
  return { ...tab, mentorId: await mentorIdFor(db, email) };
}

export async function mentorIdFor(db, email) {
  const { rows } = await db.query("select id from mentors where lower(email) = lower($1)", [email]);
  return rows[0]?.id;
}

/** Wiersz `mentor_pages` mentora (dokładnie jeden). */
export async function pageRow(db, mentorId) {
  const { rows } = await db.query(
    `select display_name, public_work_url, description, price_25_minor, price_50_minor, currency, slug, published_at
       from mentor_pages where mentor_id = $1`,
    [mentorId],
  );
  assert.equal(rows.length, 1, "jedna strona mentora");
  return rows[0];
}

/** Pole formularza po dokładnej etykiecie. */
export const field = (page, label) => page.getByLabel(label, { exact: true });

/** Wypełnia wszystkie pola edytora (ceny jako napisy, jak wpisuje człowiek). */
export async function fillEditor(page, values) {
  const labels = {
    displayName: "Imię i nazwisko",
    publicWorkUrl: "Link do publicznej pracy",
    description: "Twoje doświadczenie",
    price25: "Cena za 25 min (zł)",
    price50: "Cena za 50 min (zł)",
    slug: "Adres strony",
  };
  for (const [key, value] of Object.entries(values)) await field(page, labels[key]).fill(value);
}

/** Tekst opisu dostępności (aria-describedby) elementu — tam DS podpina komunikat błędu pola. */
export async function accessibleDescription(locator) {
  return locator.evaluate((el) =>
    (el.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .join(" "),
  );
}

/** Status HTTP publicznej strony mentora (bez przeglądarki). */
export async function publicStatus(slug) {
  const response = await fetch(`${BASE_URL}/m/${encodeURIComponent(slug)}`, { redirect: "manual" });
  return response.status;
}

/** Liczba aktywnych sesji mentora. */
export async function activeSessions(db, mentorId) {
  const { rows } = await db.query(
    "select count(*)::int as n from mentor_sessions where mentor_id = $1 and revoked_at is null and expires_at > now()",
    [mentorId],
  );
  return rows[0].n;
}
