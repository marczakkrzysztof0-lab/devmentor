// Odczyt i zapis strony mentora (spec #14, API Contracts `saveMentorPage`, Q6, Q7, Edge Cases; L6/Z7).
//
// Czysta logika domenowa bez Next.js: każda funkcja dostaje `db` (pg.Pool albo PoolClient) i `now`, więc
// testy `node --test` sterują bazą i czasem. Server action i loader edytora: `app/mentor/actions.ts`,
// `lib/mentor-page/editor.ts` (server-only).
//
// Zasady:
// - Id mentora pochodzi WYŁĄCZNIE od wywołującego (sesja, `getCurrentMentor()`); dane formularza nigdy nie
//   niosą id mentora ani strony — z wejścia bierzemy tylko znane pola (`FIELD_ORDER`), resztę pomijamy.
// - Zapis to jedna transakcja z wierszem strony zablokowanym `for update`:
//     opublikowana strona   → walidacja „publish” ze slugiem zablokowanym (`publishedSlug`); odmowa = brak zmian,
//     publikacja (`publish`) → walidacja „publish”, `published_at = now` tylko przy pierwszej publikacji,
//     szkic               → walidacja „draft”.
// - Waluty nie bierzemy z wejścia (Q2): kolumna `currency` zostaje bez zmian.
// - Slug zajęty (także w wyścigu dwóch publikacji) → błąd pola „Ten adres jest zajęty”, nic nie zapisane.
// - Cofnięcie publikacji nie istnieje w tej historii (Q7): `published_at` nigdy nie wraca do NULL.
import { withTransaction } from "../db/pool.mjs";
import { FIELD_ORDER, isPlaceholderSlug, MESSAGES, validateMentorPage } from "./validate.mjs";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const SLUG_UNIQUE_CONSTRAINT = "mentor_pages_slug_key";

/**
 * CHECK-i bazy (zabezpieczenie na wypadek luki w walidacji) → pole formularza z komunikatem.
 * `published_requires_content` nie wskazuje jednego pola — taki błąd jest rzucany dalej.
 * @type {Readonly<Record<string, [import("./validate.mjs").MentorPageField, string]>>}
 */
const CHECK_CONSTRAINT_FIELDS = Object.freeze({
  mentor_pages_slug_format: ["slug", MESSAGES.slug],
  mentor_pages_price_25_minor_positive: ["price25", MESSAGES.price25],
  mentor_pages_price_50_minor_positive: ["price50", MESSAGES.price50],
});

/** @typedef {import("../db/pool.mjs").Queryable} Queryable */
/** @typedef {import("./validate.mjs").MentorPageField} MentorPageField */
/** @typedef {Partial<Record<MentorPageField, string>>} MentorPageErrors */

/**
 * Strona mentora dla edytora (tylko pola, które edytor pokazuje; bez id).
 * @typedef {object} MentorPageForEditor
 * @property {string} slug
 * @property {string | null} displayName
 * @property {string | null} publicWorkUrl
 * @property {string | null} description
 * @property {number | null} price25Minor  grosze
 * @property {number | null} price50Minor  grosze
 * @property {string} currency  kod ISO 4217 (dziś PLN)
 * @property {Date | null} publishedAt
 * @property {boolean} isPlaceholderSlug  slug to losowy `mentor-xxxxxx` z akceptacji zaproszenia (Q6)
 */

/**
 * Wartości formularza edytora (napisy, jak `MentorPageValues` w DS: ceny w pełnych złotych).
 * @typedef {object} MentorPageFormValues
 * @property {string} displayName
 * @property {string} publicWorkUrl
 * @property {string} description
 * @property {string} price25
 * @property {string} price50
 * @property {string} slug
 */

/**
 * @typedef {{ ok: true, published: boolean, shareUrl?: string }
 *   | { ok: false, errors: MentorPageErrors }} SaveMentorPageResult
 */

/** @typedef {{ ok: false, reason: "unauthorized" }} UnauthorizedResult */

/**
 * @param {unknown} now
 * @returns {Date}
 */
function toDate(now) {
  const date = now === undefined ? new Date() : now instanceof Date ? now : new Date(/** @type {any} */ (now));
  if (Number.isNaN(date.getTime())) throw new TypeError("mentor-page: niepoprawna data bieżąca (now).");
  return date;
}

/**
 * Link do udostępnienia: `${appUrl}/m/${slug}` (adres aplikacji bez końcowego ukośnika).
 * @param {string} appUrl np. NEXT_PUBLIC_APP_URL
 * @param {string} slug
 * @returns {string}
 */
export function shareUrlFor(appUrl, slug) {
  const base = typeof appUrl === "string" ? appUrl.trim().replace(/\/+$/, "") : "";
  if (base === "") throw new Error("mentor-page: brak adresu aplikacji (NEXT_PUBLIC_APP_URL).");
  return `${base}/m/${slug}`;
}

/**
 * Tylko znane pola formularza (własne właściwości, wyłącznie napisy). Klucze takie jak `mentorId`, `id`,
 * `currency`, `publishedAt` z wejścia są pomijane.
 * @param {unknown} input
 * @returns {import("./validate.mjs").MentorPageInput}
 */
export function pickMentorPageInput(input) {
  /** @type {Record<string, string>} */
  const picked = {};
  if (input === null || typeof input !== "object" || Array.isArray(input)) return picked;
  for (const field of FIELD_ORDER) {
    if (!Object.hasOwn(input, field)) continue;
    const value = /** @type {Record<string, unknown>} */ (input)[field];
    if (typeof value === "string") picked[field] = value;
  }
  return picked;
}

/**
 * @param {Record<string, any>} row
 * @returns {MentorPageForEditor}
 */
function toEditorPage(row) {
  return {
    slug: row.slug,
    displayName: row.display_name,
    publicWorkUrl: row.public_work_url,
    description: row.description,
    price25Minor: row.price_25_minor,
    price50Minor: row.price_50_minor,
    currency: row.currency,
    publishedAt: row.published_at,
    isPlaceholderSlug: isPlaceholderSlug(row.slug),
  };
}

/**
 * Strona zalogowanego mentora dla edytora albo `null`, gdy mentor nie ma strony.
 * @param {object} options
 * @param {Queryable} options.db
 * @param {string} options.mentorId z sesji, nigdy z danych od klienta
 * @returns {Promise<MentorPageForEditor | null>}
 */
export async function getMentorPageForEditor({ db, mentorId }) {
  const { rows } = await db.query(
    `select slug, display_name, public_work_url, description, price_25_minor, price_50_minor, currency, published_at
       from mentor_pages where mentor_id = $1`,
    [mentorId],
  );
  return rows[0] ? toEditorPage(rows[0]) : null;
}

/**
 * Wartości startowe formularza (DS `MentorPageForm.initial`): puste pola → "", grosze → pełne złote.
 * @param {MentorPageForEditor} page
 * @returns {MentorPageFormValues}
 */
export function toFormValues(page) {
  /** @param {number | null} minor */
  const zloty = (minor) => (minor === null ? "" : String(Math.trunc(minor / 100)));
  return {
    displayName: page.displayName ?? "",
    publicWorkUrl: page.publicWorkUrl ?? "",
    description: page.description ?? "",
    price25: zloty(page.price25Minor),
    price50: zloty(page.price50Minor),
    slug: page.slug,
  };
}

/** Wewnętrzny sygnał: zapis odrzucony przez bazę z błędami pól (transakcja wycofana). */
class FieldErrorsRejection extends Error {
  /** @param {MentorPageErrors} errors */
  constructor(errors) {
    super("mentor-page: zapis odrzucony przez bazę");
    this.errors = errors;
  }
}

/**
 * Błąd bazy przy zapisie → błędy pól albo `null` (wtedy wywołujący rzuca dalej).
 * @param {any} error
 * @returns {MentorPageErrors | null}
 */
export function fieldErrorsFromDbError(error) {
  if (!error || typeof error !== "object") return null;
  if (error.code === UNIQUE_VIOLATION && error.constraint === SLUG_UNIQUE_CONSTRAINT) {
    return { slug: MESSAGES.slugTaken };
  }
  if (error.code === CHECK_VIOLATION && Object.hasOwn(CHECK_CONSTRAINT_FIELDS, error.constraint)) {
    const [field, message] = CHECK_CONSTRAINT_FIELDS[error.constraint];
    return { [field]: message };
  }
  return null;
}

/**
 * Zapis strony mentora: szkic, publikacja albo edycja opublikowanej strony (patrz komentarz na górze pliku).
 *
 * @param {object} options
 * @param {Queryable} options.db
 * @param {string} options.mentorId z sesji (jedyne źródło); wejście nie wskazuje strony
 * @param {unknown} options.input pola formularza (napisy; ceny w pełnych złotych); nieznane klucze pomijane
 * @param {boolean} [options.publish] „Opublikuj” (true) albo „Zapisz szkic” (false); po publikacji bez znaczenia
 * @param {Date} [options.now]
 * @param {string} options.appUrl adres aplikacji do linku do udostępnienia
 * @returns {Promise<SaveMentorPageResult>}
 */
export async function saveMentorPage({ db, mentorId, input, publish = false, now, appUrl }) {
  const at = toDate(now);
  const fields = pickMentorPageInput(input);
  try {
    return await withTransaction(db, async (client) => {
      const { rows } = await client.query(
        "select id, slug, published_at from mentor_pages where mentor_id = $1 for update",
        [mentorId],
      );
      const page = rows[0];
      // Akceptacja zaproszenia zawsze tworzy stronę; jej brak to błąd danych, nie błąd formularza.
      if (!page) throw new Error("mentor-page: mentor nie ma strony (mentor_pages).");

      const alreadyPublished = page.published_at !== null;
      const validation = alreadyPublished
        ? validateMentorPage(fields, "publish", { publishedSlug: page.slug })
        : validateMentorPage(fields, publish === true ? "publish" : "draft");
      if (!validation.ok) return { ok: false, errors: validation.errors };

      const v = validation.values;
      const publishAt = !alreadyPublished && publish === true ? at : null;
      let updated;
      try {
        ({ rows: updated } = await client.query(
          `update mentor_pages
              set display_name = $2, public_work_url = $3, description = $4,
                  price_25_minor = $5, price_50_minor = $6, slug = $7,
                  published_at = coalesce(published_at, $8), updated_at = $9
            where id = $1
            returning slug, published_at`,
          [page.id, v.displayName, v.publicWorkUrl, v.description, v.price25Minor, v.price50Minor, v.slug, publishAt, at],
        ));
      } catch (error) {
        const errors = fieldErrorsFromDbError(error);
        // Rzucenie wycofuje całą transakcję — nic nie zostaje zapisane.
        if (errors) throw new FieldErrorsRejection(errors);
        throw error;
      }

      const saved = updated[0];
      const published = saved.published_at !== null;
      /** @type {SaveMentorPageResult} */
      const result = published
        ? { ok: true, published, shareUrl: shareUrlFor(appUrl, saved.slug) }
        : { ok: true, published };
      return result;
    });
  } catch (error) {
    if (error instanceof FieldErrorsRejection) return { ok: false, errors: error.errors };
    throw error;
  }
}

/** @returns {UnauthorizedResult} świeży obiekt */
export function unauthorizedResult() {
  return { ok: false, reason: "unauthorized" };
}

/**
 * Zapis z perspektywy server action: bez aktywnej sesji (brak, wygasła, odwołana) → `unauthorized` i nic
 * nie jest zapisywane (baza nie jest nawet pytana). `publish` liczy się tylko jako dokładnie `true`.
 *
 * @param {object} options
 * @param {Queryable} options.db
 * @param {{ mentorId: string } | null | undefined} options.mentor wynik `getCurrentMentor()`
 * @param {unknown} options.input
 * @param {unknown} [options.publish]
 * @param {Date} [options.now]
 * @param {string} options.appUrl
 * @returns {Promise<SaveMentorPageResult | UnauthorizedResult>}
 */
export async function saveMentorPageForSession({ db, mentor, input, publish, now, appUrl }) {
  if (!mentor || typeof mentor.mentorId !== "string" || mentor.mentorId === "") return unauthorizedResult();
  return saveMentorPage({ db, mentorId: mentor.mentorId, input, publish: publish === true, now, appUrl });
}
