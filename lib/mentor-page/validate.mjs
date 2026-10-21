// Walidacja formularza strony mentora (spec #14, API Contracts `saveMentorPage`; Q3, Q6, Q14; #23 slug, R03).
//
// Czysty moduł (bez bazy, bez Reacta): serwer jest tu źródłem prawdy, a komunikaty pokrywają się z walidacją
// DS w przeglądarce (`packages/ui/src/product/e01/Mentor.tsx`, `validateMentorPage`).
//
// Tryby:
// - "draft"   — „Zapisz szkic”: puste pola są dozwolone (→ null), ale to, co JEST wpisane, musi być poprawne
//               (zły link czy cena poza zakresem to błąd także w szkicu — inaczej szkic przechowałby wartość,
//               której nie da się opublikować). Pole z samymi białymi znakami traktujemy jak puste.
// - "publish" — „Opublikuj” oraz każda edycja już opublikowanej strony (strona musi pozostać publikowalna):
//               wszystkie pola wymagane.
// Slug jest wymagany zawsze (szkic ma losowy `mentor-xxxxxx`). Blokadę sluga po publikacji sprawdza ten moduł,
// jeśli dostanie `{ publishedSlug }` (zapisany slug opublikowanej strony); unikalność sluga sprawdza baza.
//
// Teksty po polsku, neutralne płciowo (C12).

/** Kolejność pól w formularzu — błędy zwracamy w tej kolejności, żeby UI ustawił fokus na pierwszym. */
export const FIELD_ORDER = /** @type {const} */ ([
  "displayName",
  "publicWorkUrl",
  "description",
  "price25",
  "price50",
  "slug",
]);

/** Dolna granica ceny w pełnych złotych (ochrona przed literówką; baza pilnuje tylko `> 0`). */
export const PRICE_MIN_ZLOTY = 20;
/** Górna granica ceny w pełnych złotych. */
export const PRICE_MAX_ZLOTY = 5000;

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 80;
export const PUBLIC_WORK_URL_MAX = 500;
export const DESCRIPTION_MAX = 2000;

/** Segment ścieżki `/m/{slug}`: 3–40 znaków, małe litery, cyfry, myślniki nie na brzegach (#23, CHECK w 0001). */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const SLUG_MAX = 40;

/** Losowy slug szkicu nadany przy przyjęciu zaproszenia (Q6; `lib/auth/mentor-auth.mjs`). */
const PLACEHOLDER_SLUG_PATTERN = /^mentor-[a-z2-7]{6}$/;

/** Komunikaty błędów pól (wspólne brzmienie z DS tam, gdzie DS je ma). */
export const MESSAGES = Object.freeze({
  displayName: "Wpisz imię i nazwisko (od 2 do 80 znaków)",
  publicWorkUrlMissing: "Dodaj link do publicznej pracy",
  publicWorkUrlInvalid: "Link musi zaczynać się od https:// albo http://",
  publicWorkUrlTooLong: "Link może mieć najwyżej 500 znaków",
  description: "Opisz swoje doświadczenie (do 2000 znaków)",
  price25: "Podaj cenę za 25 min od 20 do 5000 zł, bez groszy",
  price50: "Podaj cenę za 50 min od 20 do 5000 zł, bez groszy",
  slug: "Adres: 3–40 znaków — małe litery, cyfry i myślniki",
  slugLocked: "Adresu nie można zmienić po publikacji.",
});

/**
 * @typedef {"displayName" | "publicWorkUrl" | "description" | "price25" | "price50" | "slug"} MentorPageField
 *
 * @typedef {object} MentorPageInput Surowe wartości formularza (napisy tak, jak przyszły; brak = pusty napis).
 * @property {unknown} [displayName]
 * @property {unknown} [publicWorkUrl]
 * @property {unknown} [description]
 * @property {unknown} [price25]  pełne złote, np. "150"
 * @property {unknown} [price50]
 * @property {unknown} [slug]
 *
 * @typedef {object} MentorPageValues Wartości gotowe do zapisu w `mentor_pages`.
 * @property {string | null} displayName
 * @property {string | null} publicWorkUrl
 * @property {string | null} description
 * @property {number | null} price25Minor  grosze (zł × 100)
 * @property {number | null} price50Minor
 * @property {string} slug
 *
 * @typedef {{ ok: true, values: MentorPageValues }
 *   | { ok: false, errors: Partial<Record<MentorPageField, string>> }} MentorPageValidation
 */

/** @param {unknown} v */
function str(v) {
  return typeof v === "string" ? v : "";
}

/** Długość w znakach Unicode (emoji = 1), nie w jednostkach UTF-16. @param {string} s */
function charLength(s) {
  return [...s].length;
}

/** @param {string} raw @returns {string | null} komunikat błędu albo null */
function checkUrl(raw) {
  if (charLength(raw) > PUBLIC_WORK_URL_MAX) return MESSAGES.publicWorkUrlTooLong;
  if (!/^https?:\/\//i.test(raw) || /\s/.test(raw)) return MESSAGES.publicWorkUrlInvalid;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return MESSAGES.publicWorkUrlInvalid;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return MESSAGES.publicWorkUrlInvalid;
  // Publiczna praca leży w internecie: host z kropką (łapie „https://github”), bez danych logowania
  // w adresie (np. „https://github.com@zly.example”).
  if (!url.hostname.includes(".") || url.hostname.startsWith(".") || url.hostname.endsWith(".")) {
    return MESSAGES.publicWorkUrlInvalid;
  }
  if (url.username !== "" || url.password !== "") return MESSAGES.publicWorkUrlInvalid;
  return null;
}

/** @param {string} raw @returns {number | null} grosze albo null, gdy cena niepoprawna */
function parsePrice(raw) {
  if (!/^\d+$/.test(raw)) return null; // bez groszy, przecinków, znaków, wykładników, „zł”
  const zloty = Number(raw);
  if (!Number.isSafeInteger(zloty) || zloty < PRICE_MIN_ZLOTY || zloty > PRICE_MAX_ZLOTY) return null;
  return zloty * 100;
}

/**
 * Waliduje i normalizuje formularz strony mentora.
 *
 * @param {MentorPageInput | null | undefined} input
 * @param {"draft" | "publish"} mode  "publish" także dla zapisu zmian opublikowanej strony
 * @param {{ publishedSlug?: string | null }} [context]  slug opublikowanej strony — wtedy nie może się zmienić
 * @returns {MentorPageValidation}
 */
export function validateMentorPage(input, mode, context = {}) {
  if (mode !== "draft" && mode !== "publish") {
    throw new TypeError(`validateMentorPage: nieznany tryb ${String(mode)} (oczekiwano "draft" albo "publish").`);
  }
  const required = mode === "publish";
  /** @type {Partial<Record<MentorPageField, string>>} */
  const found = {};
  /** @type {MentorPageInput} */
  const raw = input ?? {};

  // Imię i nazwisko: przycięte, ciągi białych znaków (w tym nowe linie) → jedna spacja.
  const displayName = str(raw.displayName).trim().replace(/\s+/g, " ");
  if (displayName === "") {
    if (required) found.displayName = MESSAGES.displayName;
  } else if (charLength(displayName) < DISPLAY_NAME_MIN || charLength(displayName) > DISPLAY_NAME_MAX) {
    found.displayName = MESSAGES.displayName;
  }

  const publicWorkUrl = str(raw.publicWorkUrl).trim();
  if (publicWorkUrl === "") {
    if (required) found.publicWorkUrl = MESSAGES.publicWorkUrlMissing;
  } else {
    const urlError = checkUrl(publicWorkUrl);
    if (urlError) found.publicWorkUrl = urlError;
  }

  // Opis: zwykły tekst, CRLF/CR → LF, przycięte brzegi, nowe linie w środku zostają.
  const description = str(raw.description).replace(/\r\n?/g, "\n").trim();
  if (description === "") {
    if (required) found.description = MESSAGES.description;
  } else if (charLength(description) > DESCRIPTION_MAX) {
    found.description = MESSAGES.description;
  }

  /** @type {Record<"price25" | "price50", number | null>} */
  const prices = { price25: null, price50: null };
  for (const field of /** @type {const} */ (["price25", "price50"])) {
    const value = str(raw[field]).trim();
    if (value === "") {
      if (required) found[field] = MESSAGES[field];
      continue;
    }
    const minor = parsePrice(value);
    if (minor === null) found[field] = MESSAGES[field];
    else prices[field] = minor;
  }

  const slug = str(raw.slug).trim();
  const publishedSlug = context.publishedSlug ?? null;
  if (publishedSlug !== null && slug !== publishedSlug) found.slug = MESSAGES.slugLocked;
  else if (!SLUG_PATTERN.test(slug)) found.slug = MESSAGES.slug;

  /** @type {Partial<Record<MentorPageField, string>>} */
  const errors = {};
  for (const field of FIELD_ORDER) {
    const message = found[field];
    if (message) errors[field] = message;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    values: {
      displayName: displayName || null,
      publicWorkUrl: publicWorkUrl || null,
      description: description || null,
      price25Minor: prices.price25,
      price50Minor: prices.price50,
      slug,
    },
  };
}

/**
 * Propozycja sluga z imienia (Q6, Z10) — serwerowy odpowiednik `slugify` z DS.
 * „Anna K.” → „anna-k”, „Łukasz Żółć” → „lukasz-zolc”. Zwraca null, gdy nie da się uzyskać 3 znaków.
 * @param {unknown} name
 * @returns {string | null}
 */
export function slugFromName(name) {
  const slug = str(name)
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/** Etykiety walut (Q14, F2): jeden formatter dla etykiety „Cena za 25 min (zł)” i sufiksu pola. */
const CURRENCY_LABELS = Object.freeze(/** @type {Record<string, string>} */ ({ PLN: "zł" }));

/**
 * @param {string} currency kod ISO 4217 z `mentor_pages.currency`
 * @returns {string} np. „zł” dla PLN; nieznany kod zwracany bez zmian
 */
export function currencyLabel(currency) {
  return Object.hasOwn(CURRENCY_LABELS, currency) ? CURRENCY_LABELS[currency] : currency;
}

/**
 * Czy slug to losowy placeholder szkicu (`mentor-` + 6 znaków base32), a nie wybrany przez mentora.
 * @param {unknown} slug
 * @returns {boolean}
 */
export function isPlaceholderSlug(slug) {
  return typeof slug === "string" && PLACEHOLDER_SLUG_PATTERN.test(slug);
}
