// Czat sesji: odczyt i zapis wiadomości (spec #20 Proposed Solution, API Contracts; Implementation Plan krok 1).
//
// - Sesja = zaakceptowane zapytanie (kontrakt #18). Strona sesji wynika WYŁĄCZNIE z poświadczenia:
//   deweloper — token z linku /r/{token} (szukany po SHA-256, ważny do 30 dni po `slot_end`, jak #17);
//   mentor — `mentorId` z sesji (ciasteczko) + id zapytania z adresu (niezaufane, kształt sprawdzany przed bazą).
//   Cudza, nieznana albo nie-zaakceptowana sesja → `null` / `not_found` (bez informacji, czy istnieje).
// - Pisanie tylko w terminie `[slot_start, slot_end)` według zegara bazy (testy wstrzykują `at`). Zapis w jednej
//   transakcji z `FOR UPDATE` na wierszu zapytania: serializuje zapisy w sesji (kursor `seq` nie przeskoczy
//   wiadomości) i rozliczenie #21 (wiadomość albo jest zapisana przed rozliczeniem, albo odrzucona jako `closed`).
// - Treść nigdy nie trafia do logów ani e-maili (R04); błędy logują tylko nazwę.
import { hashToken, isLinkTokenShape } from "../auth/tokens.mjs";
import { withTransaction } from "../db/pool.mjs";
import { TOKEN_VALID_DAYS_AFTER_SLOT } from "../requests/view.mjs";

export const MESSAGE_MAX_LENGTH = 4000;
/** Limit wiadomości w jednej sesji (obie strony razem, Q6). */
export const SESSION_MESSAGE_LIMIT = 500;
/** Najwięcej wiadomości w jednej odpowiedzi odczytu (`hasMore` = jest dalej). */
export const MESSAGE_PAGE_SIZE = 200;

/**
 * Stany zapytania, w których czat istnieje: `accepted` (pisanie w terminie) i stany po rozliczeniu (#21, tylko
 * odczyt). Pozostałe (przed akceptacją, odrzucone, anulowane…) nie mają czatu.
 */
export const SESSION_STATUSES = Object.freeze(["accepted", "held", "mentee_no_show", "mentor_no_show"]);

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @typedef {{ kind: "mentee", token: unknown } | { kind: "mentor", mentorId: string, requestId: unknown }} SessionViewer
 * @typedef {"before" | "open" | "ended"} SessionPhase
 * @typedef {{ id: string, seq: number, author: "me" | "other", body: string, createdAt: string }} SessionMessage
 * @typedef {{ phase: SessionPhase, opensAt: string, closesAt: string, now: string, viewer: "mentor" | "mentee",
 *   otherName: string, messages: SessionMessage[], hasMore: boolean, limitReached: boolean }} SessionSnapshot
 * @typedef {{ ok: true, message: SessionMessage } | { ok: false, code: "invalid_body" | "not_found" | "not_open" | "closed" | "limit_reached" }} PostResult
 */

/** Długość w punktach kodowych (jak `char_length` w Postgresie). */
const codePoints = (/** @type {string} */ text) => [...text].length;

/**
 * Treść wiadomości: napis 1–4000 znaków po obcięciu białych znaków. Zapisywana tak, jak wysłana (wcięcia kodu).
 * @param {unknown} body
 * @returns {{ ok: true, body: string } | { ok: false }}
 */
export function validateMessageBody(body) {
  if (typeof body !== "string") return { ok: false };
  const length = codePoints(body.trim());
  if (length < 1 || length > MESSAGE_MAX_LENGTH) return { ok: false };
  return { ok: true, body };
}

/**
 * Kursor `after` z adresu: liczba całkowita ≥ 0, inaczej 0.
 * @param {unknown} value
 */
export function parseAfter(value) {
  if (typeof value !== "string" || !/^\d{1,15}$/.test(value)) return 0;
  return Number(value);
}

/**
 * Faza sesji w chwili `now`: przed terminem, w terminie (tylko `accepted`), po terminie / po rozliczeniu.
 * @param {{ status: string, slotStart: Date, slotEnd: Date }} session
 * @param {Date} now
 * @returns {SessionPhase}
 */
export function sessionPhase({ status, slotStart, slotEnd }, now) {
  if (status !== "accepted") return "ended";
  if (now.getTime() < slotStart.getTime()) return "before";
  if (now.getTime() < slotEnd.getTime()) return "open";
  return "ended";
}

/**
 * Sesja widziana przez poświadczenie (opcjonalnie z blokadą wiersza). `null` = brak dostępu / brak czatu.
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {SessionViewer} viewer
 * @param {{ at: Date | null, lock?: boolean }} options
 */
async function findSession(db, viewer, { at, lock = false }) {
  /** @type {string} */
  let where;
  /** @type {unknown[]} */
  let params;
  if (viewer.kind === "mentee") {
    if (!isLinkTokenShape(viewer.token)) return null;
    where = "r.access_token_hash = $2 and r.slot_end + make_interval(days => $3) > coalesce($1::timestamptz, now())";
    params = [at, hashToken(/** @type {string} */ (viewer.token)), TOKEN_VALID_DAYS_AFTER_SLOT];
  } else {
    if (typeof viewer.requestId !== "string" || !UUID_SHAPE.test(viewer.requestId) || !UUID_SHAPE.test(viewer.mentorId)) return null;
    where = "r.id = $2 and r.mentor_id = $3";
    params = [at, viewer.requestId, viewer.mentorId];
  }
  const { rows } = await db.query(
    `select r.id, r.status, r.slot_start, r.slot_end, r.mentee_name, mp.display_name as mentor_name,
            coalesce($1::timestamptz, now()) as now
       from requests r
       left join mentor_pages mp on mp.mentor_id = r.mentor_id
      where ${where} and r.status = any($${params.length + 1})
      ${lock ? "for update of r" : ""}`,
    [...params, SESSION_STATUSES],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: /** @type {string} */ (row.id),
    status: /** @type {string} */ (row.status),
    slotStart: new Date(row.slot_start),
    slotEnd: new Date(row.slot_end),
    now: new Date(row.now),
    otherName: viewer.kind === "mentee" ? (row.mentor_name ?? "Mentor") : /** @type {string} */ (row.mentee_name),
  };
}

/** @param {Record<string, any>} row @param {"mentor" | "mentee"} role @returns {SessionMessage} */
function toMessage(row, role) {
  return {
    id: row.id,
    seq: Number(row.seq),
    author: row.author === role ? "me" : "other",
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Wiadomości sesji nowsze niż `after` (najstarsze pierwsze, ≤ 200) + faza i czasy z zegara serwera.
 * @param {import("../db/pool.mjs").Queryable} db
 * @param {SessionViewer} viewer
 * @param {{ after?: number, at?: Date | null }} [options]
 * @returns {Promise<SessionSnapshot | null>}
 */
export async function listSessionMessages(db, viewer, { after = 0, at = null } = {}) {
  const session = await findSession(db, viewer, { at });
  if (!session) return null;
  const { rows } = await db.query(
    `select id, seq, author, body, created_at,
            (select count(*)::int from session_messages where request_id = $1) as total
       from session_messages
      where request_id = $1 and seq > $2
      order by seq
      limit $3`,
    [session.id, after, MESSAGE_PAGE_SIZE + 1],
  );
  let total = rows[0]?.total;
  if (total === undefined) {
    const { rows: count } = await db.query("select count(*)::int as n from session_messages where request_id = $1", [session.id]);
    total = count[0].n;
  }
  return {
    phase: sessionPhase(session, session.now),
    opensAt: session.slotStart.toISOString(),
    closesAt: session.slotEnd.toISOString(),
    now: session.now.toISOString(),
    viewer: viewer.kind,
    otherName: session.otherName,
    messages: rows.slice(0, MESSAGE_PAGE_SIZE).map((row) => toMessage(row, viewer.kind)),
    hasMore: rows.length > MESSAGE_PAGE_SIZE,
    limitReached: Number(total) >= SESSION_MESSAGE_LIMIT,
  };
}

/**
 * Zapis wiadomości w transakcji wywołującego (testy wyścigów trzymają ją otwartą).
 * @param {import("pg").PoolClient} tx
 * @param {SessionViewer} viewer
 * @param {string} body  już sprawdzona (`validateMessageBody`)
 * @param {{ at: Date | null }} options
 * @returns {Promise<PostResult>}
 */
export async function postMessageInTx(tx, viewer, body, { at }) {
  const session = await findSession(tx, viewer, { at, lock: true });
  if (!session) return { ok: false, code: "not_found" };
  // Czas czytany PO zajęciu blokady: wpis czekający na blokadę przez `slot_end` jest odrzucany (`closed`), a
  // `created_at` nigdy nie jest wcześniejszy niż chwila, w której wolno było pisać (spec #20 Data Model).
  const { rows: clockRows } = await tx.query("select coalesce($1::timestamptz, clock_timestamp()) as now", [at]);
  session.now = new Date(clockRows[0].now);
  const phase = sessionPhase(session, session.now);
  if (phase === "before") return { ok: false, code: "not_open" };
  if (phase === "ended") return { ok: false, code: "closed" };
  const { rows: count } = await tx.query("select count(*)::int as n from session_messages where request_id = $1", [session.id]);
  if (count[0].n >= SESSION_MESSAGE_LIMIT) return { ok: false, code: "limit_reached" };
  const { rows } = await tx.query(
    `insert into session_messages (request_id, author, body, created_at)
     values ($1, $2, $3, $4)
     returning id, seq, author, body, created_at`,
    [session.id, viewer.kind, body, session.now],
  );
  return { ok: true, message: toMessage(rows[0], viewer.kind) };
}

/**
 * Wysyła wiadomość jako strona sesji wskazana poświadczeniem.
 * @param {import("pg").Pool} pool
 * @param {SessionViewer} viewer
 * @param {unknown} body
 * @param {{ at?: Date | null }} [options]
 * @returns {Promise<PostResult>}
 */
export async function postSessionMessage(pool, viewer, body, { at = null } = {}) {
  const valid = validateMessageBody(body);
  if (!valid.ok) return { ok: false, code: "invalid_body" };
  return withTransaction(pool, (tx) => postMessageInTx(tx, viewer, valid.body, { at }));
}
