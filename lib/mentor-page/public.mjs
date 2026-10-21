// Publiczna strona mentora `/m/{slug}` — odczyt danych (spec #16, Proposed Solution, Q4, Q5, Risks).
//
// Czysta logika bez Next.js: funkcja dostaje `db` (pg.Pool albo PoolClient), więc testy `node --test`
// podają pulę jednorazowego schematu. Wrapper aplikacji: `lib/mentor-page/public.ts` (server-only).
//
// Zasady (to jest strażnik przed wyciekiem danych — test w tests/db/public-page.test.mjs przypina klucze):
// - JEDNO zapytanie, wyłącznie na `mentor_pages` (bez złączenia z `mentors`, więc `mentors.email` i
//   `mentors.time_zone` nigdy nie są czytane), z `published_at IS NOT NULL` w tym samym zapytaniu —
//   szkic i nieznany slug dają ten sam wynik `null` (Q4: brak podpowiedzi, czy slug istnieje).
// - Kolumny wybrane jawnie (nigdy `select *`); publiczny DTO `page` to jawna allowlista `PUBLIC_PAGE_KEYS`
//   (kształt = `MentorPublicPage` z `@devmentor/ui/product`).
// - `mentorId` zwracany OSOBNO, tylko dla serwerowego zapytania o terminy (#16 Phase 2). Nigdy nie trafia
//   do klienta: nie przekazuj go do komponentów klienckich ani do HTML.
// - Bez cache (Q5): każde wywołanie czyta bazę, edycja mentora widoczna od razu.
// - Niepoprawny slug (format/długość jak `SLUG_PATTERN`) → `null` bez zapytania do bazy.
import { SLUG_MAX, SLUG_PATTERN } from "./validate.mjs";

/** Klucze publicznego DTO — dokładnie te i tylko te (spec #16 Proposed Solution). */
export const PUBLIC_PAGE_KEYS = Object.freeze(
  /** @type {const} */ (["displayName", "publicWorkUrl", "description", "price25Minor", "price50Minor", "currency", "slug"]),
);

/**
 * Publiczne dane strony (allowlista; zgodne z `MentorPublicPage` w DS).
 * @typedef {object} MentorPublicPage
 * @property {string} displayName
 * @property {string} publicWorkUrl
 * @property {string} description
 * @property {number} price25Minor  grosze
 * @property {number} price50Minor  grosze
 * @property {string} currency  kod ISO 4217
 * @property {string} slug
 */

/**
 * @typedef {object} PublishedPageLookup
 * @property {MentorPublicPage} page  można przekazać do klienta
 * @property {string} mentorId  TYLKO serwer (zapytanie o terminy); nigdy nie serializować do klienta
 */

/** @typedef {import("../db/pool.mjs").Queryable} Queryable */

const PUBLISHED_PAGE_SQL = `select mentor_id, slug, display_name, public_work_url, description,
       price_25_minor, price_50_minor, currency
  from mentor_pages
 where slug = $1 and published_at is not null`;

/**
 * Czy napis może być slugiem (format i długość jak w walidacji edytora).
 * @param {unknown} slug
 * @returns {slug is string}
 */
export function isWellFormedSlug(slug) {
  return typeof slug === "string" && slug.length <= SLUG_MAX && SLUG_PATTERN.test(slug);
}

/**
 * Opublikowana strona mentora po slugu albo `null` (szkic, nieznany lub niepoprawny slug).
 * @param {{ db: Queryable, slug: unknown }} params
 * @returns {Promise<PublishedPageLookup | null>}
 */
export async function getPublishedPageBySlug({ db, slug }) {
  if (!isWellFormedSlug(slug)) return null;
  const { rows } = await db.query(PUBLISHED_PAGE_SQL, [slug]);
  const row = rows[0];
  if (!row) return null;
  /** @type {MentorPublicPage} */
  const page = {
    displayName: row.display_name,
    publicWorkUrl: row.public_work_url,
    description: row.description,
    price25Minor: Number(row.price_25_minor),
    price50Minor: Number(row.price_50_minor),
    currency: row.currency,
    slug: row.slug,
  };
  return { page, mentorId: row.mentor_id };
}
