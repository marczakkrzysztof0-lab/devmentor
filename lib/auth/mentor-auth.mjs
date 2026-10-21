// Rdzeń logowania mentora (spec #14, Q1, Q6, API Contracts, UI/UX „Active session and a link” L5/Z6, P3/Z39).
//
// Czysta logika domenowa bez Next.js: każda funkcja dostaje `db` (pg.Pool albo PoolClient) i `now`
// (Date, domyślnie bieżąca chwila), więc testy `node --test` sterują bazą i czasem. Ciasteczko obsługuje
// cienki wrapper `lib/auth/session.ts` (server-only).
//
// Zasady:
// - Wszystkie tokeny (zaproszenie, link logowania, ciasteczko sesji) wyszukiwane wyłącznie po hashu SHA-256.
// - Każdy nieaktywny przypadek (nieznany, wygasły, odwołany, użyty, przyjęty, e-mail z kontem) daje TĘ SAMĄ
//   neutralną odpowiedź `{ status: "inactive" }` / `{ ok: false, reason: "inactive" }` — bez szczegółu (L3/L4, Z4/Z5).
// - `inspect*` tylko czytają (renderowanie GET); niczego nie zużywają ani nie tworzą.
// - Sesja: 30 dni od utworzenia, bez przedłużania; „aktywna” = nieodwołana i `expires_at > now`.
import { randomInt } from "node:crypto";
import { withTransaction } from "../db/pool.mjs";
import { generateToken, hashToken, SESSION_TTL_DAYS } from "./tokens.mjs";

/** Nazwa ciasteczka sesji mentora. */
export const SESSION_COOKIE = "dm_session";

/** Jedyny komunikat dla każdego nieaktywnego linku (zaproszenie i logowanie). */
export const INACTIVE_LINK_MESSAGE = "Ten link jest nieaktywny — poproś zespół o nowy";

/** Prefiks neutralnego sluga szkicu nadawanego przy akceptacji (Q6). */
export const PLACEHOLDER_SLUG_PREFIX = "mentor-";

/** Alfabet base32 (RFC 4648) małymi literami: a–z i 2–7. */
const PLACEHOLDER_SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const PLACEHOLDER_SLUG_RANDOM_LENGTH = 6;
/** Ile razy losujemy slug, zanim uznamy kolizje za błąd (32^6 ≈ 1,07 mld wartości). */
export const PLACEHOLDER_SLUG_ATTEMPTS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Dłuższy „token” to na pewno nie nasz (base64url z 32 bajtów ma 43 znaki) — nie hashujemy śmieci. */
const MAX_TOKEN_LENGTH = 256;

const UNIQUE_VIOLATION = "23505";

/** @typedef {import("../db/pool.mjs").Queryable} Queryable */
/** @typedef {{ status: "valid", expiresAt: Date } | { status: "inactive" } | { status: "signed-in-as-owner" }} LinkInspection */
/**
 * @typedef {{ ok: true, alreadySignedIn?: false, mentorId: string, sessionToken: string, sessionExpiresAt: Date }
 *   | { ok: true, alreadySignedIn: true, mentorId: string }
 *   | { ok: false, reason: "inactive" }} SignInResult
 */

/** @type {{ status: "inactive" }} */
const INACTIVE_STATUS = Object.freeze({ status: "inactive" });
/** @type {{ status: "signed-in-as-owner" }} */
const OWNER_STATUS = Object.freeze({ status: "signed-in-as-owner" });

/** @returns {{ ok: false, reason: "inactive" }} świeży obiekt (wywołujący może go zmieniać) */
function inactiveResult() {
  return { ok: false, reason: "inactive" };
}

/**
 * Losowy slug szkicu: `mentor-` + 6 znaków base32 (a–z, 2–7) z CSPRNG, np. `mentor-k3x7qa`.
 * Spełnia CHECK `mentor_pages_slug_format` z migracji 0001. Nie wynika z e-maila (Q6).
 * @returns {string}
 */
export function generatePlaceholderSlug() {
  let suffix = "";
  for (let i = 0; i < PLACEHOLDER_SLUG_RANDOM_LENGTH; i += 1) {
    suffix += PLACEHOLDER_SLUG_ALPHABET[randomInt(PLACEHOLDER_SLUG_ALPHABET.length)];
  }
  return `${PLACEHOLDER_SLUG_PREFIX}${suffix}`;
}

/**
 * @param {unknown} now
 * @returns {Date}
 */
function toDate(now) {
  const date = now === undefined ? new Date() : now instanceof Date ? now : new Date(/** @type {any} */ (now));
  if (Number.isNaN(date.getTime())) throw new TypeError("mentor-auth: niepoprawna data bieżąca (now).");
  return date;
}

/**
 * Hash tokenu z linku / ciasteczka albo `undefined`, gdy wartość nie może być naszym tokenem.
 * @param {unknown} token
 * @returns {string | undefined}
 */
function hashOrUndefined(token) {
  if (typeof token !== "string" || token === "" || token.length > MAX_TOKEN_LENGTH) return undefined;
  return hashToken(token);
}

/**
 * Tworzy nową sesję mentora: losowy token (do ciasteczka), w bazie tylko hash; ważna dokładnie 30 dni
 * od `now`, bez przedłużania.
 * @param {object} options
 * @param {Queryable} options.db
 * @param {string} options.mentorId
 * @param {Date} [options.now]
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export async function startSession({ db, mentorId, now }) {
  const createdAt = toDate(now);
  const token = generateToken();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_DAYS * DAY_MS);
  await db.query(
    "insert into mentor_sessions (mentor_id, token_hash, expires_at, created_at) values ($1, $2, $3, $4)",
    [mentorId, hashToken(token), expiresAt, createdAt],
  );
  return { token, expiresAt };
}

/**
 * Mentor aktywnej sesji (nieodwołanej, `expires_at > now`) albo `null` (brak, nieznany, wygasły, odwołany).
 * Zwraca tylko identyfikatory.
 * @param {object} options
 * @param {Queryable} options.db
 * @param {string | null | undefined} options.token token z ciasteczka
 * @param {Date} [options.now]
 * @returns {Promise<{ mentorId: string, sessionId: string } | null>}
 */
export async function getMentorForSession({ db, token, now }) {
  const at = toDate(now);
  const tokenHash = hashOrUndefined(token);
  if (!tokenHash) return null;
  const { rows } = await db.query(
    `select id, mentor_id from mentor_sessions
      where token_hash = $1 and revoked_at is null and expires_at > $2`,
    [tokenHash, at],
  );
  const row = rows[0];
  return row ? { mentorId: row.mentor_id, sessionId: row.id } : null;
}

/**
 * Wylogowanie: ustawia `revoked_at` sesji. Idempotentne — ponowne wywołanie nie zmienia pierwszej daty;
 * nieznany albo pusty token to brak operacji.
 * @param {object} options
 * @param {Queryable} options.db
 * @param {string | null | undefined} options.token
 * @param {Date} [options.now]
 * @returns {Promise<void>}
 */
export async function endSession({ db, token, now }) {
  const at = toDate(now);
  const tokenHash = hashOrUndefined(token);
  if (!tokenHash) return;
  await db.query(
    "update mentor_sessions set revoked_at = $2 where token_hash = $1 and revoked_at is null",
    [tokenHash, at],
  );
}

/**
 * Odwołuje bieżącą sesję, gdy jest aktywna i należy do INNEGO mentora niż `mentorId` (L5/Z6).
 * @param {Queryable} db
 * @param {{ mentorId: string, sessionId: string } | null} current
 * @param {string} mentorId
 * @param {Date} at
 */
async function revokeOtherMentorsSession(db, current, mentorId, at) {
  if (!current || current.mentorId === mentorId) return;
  await db.query("update mentor_sessions set revoked_at = $2 where id = $1 and revoked_at is null", [
    current.sessionId,
    at,
  ]);
}

/**
 * @param {Queryable} db
 * @param {string} email
 * @returns {Promise<boolean>}
 */
async function mentorWithEmailExists(db, email) {
  const { rows } = await db.query("select 1 from mentors where lower(email) = lower($1)", [email]);
  return rows.length > 0;
}

/**
 * Stan zaproszenia do wyrenderowania `/invite/[token]` (GET). TYLKO ODCZYT — niczego nie zmienia.
 * - `valid` (+ `expiresAt`) — pokaż „Akceptuję zaproszenie”; także gdy zalogowany jest inny mentor (L5/Z6).
 * - `signed-in-as-owner` — zaproszenie już przyjęte, a bieżąca sesja należy do jego mentora → redirect `/mentor`.
 * - `inactive` — nieznane, wygasłe, odwołane, przyjęte (bez sesji właściciela) albo e-mail ma już konto.
 * @param {object} options
 * @param {Queryable} options.db
 * @param {string} options.token token z adresu
 * @param {string | null} [options.currentSessionToken] token z ciasteczka `dm_session`
 * @param {Date} [options.now]
 * @returns {Promise<LinkInspection>}
 */
export async function inspectInvitation({ db, token, currentSessionToken, now }) {
  const at = toDate(now);
  const tokenHash = hashOrUndefined(token);
  if (!tokenHash) return INACTIVE_STATUS;
  const { rows } = await db.query(
    "select email, expires_at, accepted_at, revoked_at, mentor_id from invitations where token_hash = $1",
    [tokenHash],
  );
  const invitation = rows[0];
  if (!invitation) return INACTIVE_STATUS;
  if (invitation.accepted_at) {
    const current = await getMentorForSession({ db, token: currentSessionToken, now: at });
    return current && current.mentorId === invitation.mentor_id ? OWNER_STATUS : INACTIVE_STATUS;
  }
  if (invitation.revoked_at || invitation.expires_at.getTime() <= at.getTime()) return INACTIVE_STATUS;
  if (await mentorWithEmailExists(db, invitation.email)) return INACTIVE_STATUS;
  return { status: "valid", expiresAt: invitation.expires_at };
}

/**
 * Akceptacja zaproszenia (server action po kliknięciu „Akceptuję zaproszenie”), jedna transakcja:
 * blokuje wiersz zaproszenia (`for update`), sprawdza, że istnieje, nie wygasło, nie jest odwołane ani
 * przyjęte i że e-mail nie ma jeszcze mentora; tworzy `mentors` z e-mailem SKOPIOWANYM z zaproszenia,
 * ustawia `accepted_at`/`mentor_id`, tworzy szkic `mentor_pages` z losowym slugiem `mentor-xxxxxx`,
 * odwołuje bieżącą sesję innego mentora i zakłada nową sesję (30 dni).
 *
 * Zaproszenie już przyjęte, a bieżąca sesja należy do jego mentora → `{ ok: true, alreadySignedIn: true }`
 * (bez nowej sesji). Każdy inny nieaktywny przypadek → `{ ok: false, reason: "inactive" }`.
 *
 * @param {object} options
 * @param {import("pg").Pool} options.db pula (transakcja bierze z niej własnego klienta) albo klient spoza transakcji
 * @param {string} options.token token z adresu
 * @param {string | null} [options.currentSessionToken]
 * @param {Date} [options.now]
 * @param {() => string} [options.generateSlug] tylko dla testów (kolizje / awaria w połowie); domyślnie `generatePlaceholderSlug`
 * @returns {Promise<SignInResult>}
 */
export async function acceptInvitation({ db, token, currentSessionToken, now, generateSlug = generatePlaceholderSlug }) {
  const at = toDate(now);
  const tokenHash = hashOrUndefined(token);
  if (!tokenHash) return inactiveResult();

  try {
    return await withTransaction(db, async (client) => {
      const { rows } = await client.query(
        `select id, email, expires_at, accepted_at, revoked_at, mentor_id
           from invitations where token_hash = $1 for update`,
        [tokenHash],
      );
      const invitation = rows[0];
      if (!invitation) return inactiveResult();

      const current = await getMentorForSession({ db: client, token: currentSessionToken, now: at });
      if (invitation.accepted_at) {
        return current && current.mentorId === invitation.mentor_id
          ? { ok: true, alreadySignedIn: true, mentorId: invitation.mentor_id }
          : inactiveResult();
      }
      if (invitation.revoked_at || invitation.expires_at.getTime() <= at.getTime()) return inactiveResult();
      // Obrona w głąb (CLI też odmawia): drugi mentor na ten sam e-mail → ta sama neutralna odpowiedź (L4, Z5).
      if (await mentorWithEmailExists(client, invitation.email)) return inactiveResult();

      const {
        rows: [mentor],
      } = await client.query(
        "insert into mentors (email, created_at, updated_at) values ($1, $2, $2) returning id",
        [invitation.email, at],
      );
      const mentorId = mentor.id;

      await client.query("update invitations set accepted_at = $2, mentor_id = $3 where id = $1", [
        invitation.id,
        at,
        mentorId,
      ]);

      await insertDraftPage(client, mentorId, at, generateSlug);
      await revokeOtherMentorsSession(client, current, mentorId, at);
      const session = await startSession({ db: client, mentorId, now: at });
      return { ok: true, mentorId, sessionToken: session.token, sessionExpiresAt: session.expiresAt };
    });
  } catch (error) {
    // Wyścig dwóch zaproszeń na ten sam e-mail: wygrywa pierwsze, drugie dostaje neutralną odpowiedź.
    if (isUniqueViolation(error, "mentors_email_lower_key")) return inactiveResult();
    throw error;
  }
}

/**
 * Wstawia szkic strony z losowym slugiem; przy kolizji sluga losuje ponownie (`on conflict (slug) do
 * nothing` nie przerywa transakcji). Po wyczerpaniu prób rzuca — transakcja jest wycofywana.
 * @param {Queryable} client
 * @param {string} mentorId
 * @param {Date} at
 * @param {() => string} generateSlug
 */
async function insertDraftPage(client, mentorId, at, generateSlug) {
  for (let attempt = 0; attempt < PLACEHOLDER_SLUG_ATTEMPTS; attempt += 1) {
    const slug = generateSlug();
    const { rows } = await client.query(
      `insert into mentor_pages (mentor_id, slug, created_at, updated_at) values ($1, $2, $3, $3)
       on conflict (slug) do nothing returning id`,
      [mentorId, slug, at],
    );
    if (rows.length > 0) return;
  }
  throw new Error(`mentor-auth: nie udało się wylosować wolnego sluga szkicu w ${PLACEHOLDER_SLUG_ATTEMPTS} próbach.`);
}

/**
 * @param {unknown} error
 * @param {string} constraint
 */
function isUniqueViolation(error, constraint) {
  const pgError = /** @type {{ code?: string, constraint?: string } | null} */ (error);
  return pgError?.code === UNIQUE_VIOLATION && pgError.constraint === constraint;
}

/**
 * Stan linku logowania do wyrenderowania `/sign-in/[token]` (GET). TYLKO ODCZYT — `used_at` się nie zmienia.
 * - `signed-in-as-owner` — bieżąca sesja należy do mentora tego linku → redirect `/mentor` bez zużycia (Z6).
 * - `valid` (+ `expiresAt`) — pokaż „Zaloguj”; także gdy zalogowany jest inny mentor (L5/Z6).
 * - `inactive` — nieznany, użyty albo wygasły.
 * @param {object} options
 * @param {Queryable} options.db
 * @param {string} options.token
 * @param {string | null} [options.currentSessionToken]
 * @param {Date} [options.now]
 * @returns {Promise<LinkInspection>}
 */
export async function inspectSignInLink({ db, token, currentSessionToken, now }) {
  const at = toDate(now);
  const tokenHash = hashOrUndefined(token);
  if (!tokenHash) return INACTIVE_STATUS;
  const { rows } = await db.query(
    "select mentor_id, expires_at, used_at from mentor_sign_in_links where token_hash = $1",
    [tokenHash],
  );
  const link = rows[0];
  if (!link) return INACTIVE_STATUS;
  const current = await getMentorForSession({ db, token: currentSessionToken, now: at });
  if (current && current.mentorId === link.mentor_id) return OWNER_STATUS;
  if (link.used_at || link.expires_at.getTime() <= at.getTime()) return INACTIVE_STATUS;
  return { status: "valid", expiresAt: link.expires_at };
}

/**
 * Użycie jednorazowego linku logowania (server action po kliknięciu „Zaloguj”).
 * - Bieżąca sesja należy do mentora linku → `{ ok: true, alreadySignedIn: true }`, link NIE jest zużywany (Z6).
 * - W przeciwnym razie jeden warunkowy `UPDATE … SET used_at … WHERE used_at IS NULL AND expires_at > now
 *   RETURNING mentor_id`; tylko gdy wiersz wróci: odwołanie sesji innego mentora i nowa sesja — w tej samej
 *   transakcji. Dwa równoległe kliknięcia → dokładnie jedna sesja.
 * - Brak wiersza, ale bieżąca sesja należy do mentora linku (druga karta, P3/Z39) → `alreadySignedIn`;
 *   inaczej `{ ok: false, reason: "inactive" }`.
 * @param {object} options
 * @param {import("pg").Pool} options.db
 * @param {string} options.token
 * @param {string | null} [options.currentSessionToken]
 * @param {Date} [options.now]
 * @returns {Promise<SignInResult>}
 */
export async function redeemSignInLink({ db, token, currentSessionToken, now }) {
  const at = toDate(now);
  const tokenHash = hashOrUndefined(token);
  if (!tokenHash) return inactiveResult();

  /** @returns {Promise<{ ok: true, alreadySignedIn: true, mentorId: string } | null>} */
  const ownerOfLink = async () => {
    const current = await getMentorForSession({ db, token: currentSessionToken, now: at });
    if (!current) return null;
    const { rows } = await db.query("select mentor_id from mentor_sign_in_links where token_hash = $1", [tokenHash]);
    return rows[0] && rows[0].mentor_id === current.mentorId
      ? { ok: true, alreadySignedIn: true, mentorId: current.mentorId }
      : null;
  };

  const before = await ownerOfLink();
  if (before) return before;

  const redeemed = await withTransaction(db, async (client) => {
    const { rows } = await client.query(
      `update mentor_sign_in_links set used_at = $2
        where token_hash = $1 and used_at is null and expires_at > $2
        returning mentor_id`,
      [tokenHash, at],
    );
    if (rows.length === 0) return null;
    const mentorId = rows[0].mentor_id;
    const current = await getMentorForSession({ db: client, token: currentSessionToken, now: at });
    await revokeOtherMentorsSession(client, current, mentorId, at);
    const session = await startSession({ db: client, mentorId, now: at });
    return { ok: /** @type {const} */ (true), mentorId, sessionToken: session.token, sessionExpiresAt: session.expiresAt };
  });
  if (redeemed) return redeemed;

  return (await ownerOfLink()) ?? inactiveResult();
}
