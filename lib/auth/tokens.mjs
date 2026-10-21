// Tokeny linków (zaproszenie, logowanie) i ciasteczka sesji mentora (spec #14, API Contracts „Token links”).
//
// Wspólna reguła: 32 losowe bajty (base64url) w linku / ciasteczku; w bazie wyłącznie hash SHA-256 (hex).
// Sam token nigdy nie jest zapisywany — znika po wypisaniu linku albo ustawieniu ciasteczka.
import { createHash, randomBytes } from "node:crypto";

/** Liczba losowych bajtów tokenu (256 bitów). */
export const TOKEN_BYTES = 32;

/** Ważność zaproszenia od utworzenia (Q5). */
export const INVITATION_TTL_DAYS = 14;

/** Ważność jednorazowego linku logowania od utworzenia (Data Model, `mentor_sign_in_links`). */
export const SIGN_IN_LINK_TTL_HOURS = 72;

/** Ważność sesji od utworzenia, bez przedłużania (Data Model, `mentor_sessions`). */
export const SESSION_TTL_DAYS = 30;

/**
 * Nowy losowy token: 32 bajty z CSPRNG zakodowane base64url (43 znaki `[A-Za-z0-9_-]`, bez `=`).
 * @returns {string}
 */
export function generateToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hash tokenu do zapisu i wyszukiwania w bazie (`token_hash`): SHA-256 jako 64 znaki hex.
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
  if (typeof token !== "string" || token === "") {
    throw new TypeError("hashToken: token musi być niepustym napisem.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const LINK_EXPIRY_FORMAT = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Data ważności linku w czasie polskim, np. „04.11.2026, 12:00” — wypisuje ją CLI założycieli i pokazują
 * strony `/invite/[token]`, `/sign-in/[token]` (pilotaż: mentorzy z Polski, D09).
 * @param {Date} date
 * @returns {string}
 */
export function formatLinkExpiry(date) {
  return LINK_EXPIRY_FORMAT.format(date);
}

/** Najdłuższy token, jaki w ogóle sprawdzamy w bazie (nasze mają 43 znaki; reszta to śmieci z adresu). */
export const MAX_LINK_TOKEN_LENGTH = 256;

/**
 * Czy wartość z adresu / argumentu server action może być tokenem linku: niepusty napis rozsądnej długości.
 * Nie mówi nic o ważności — tę sprawdza baza; inna wartość dostaje ten sam neutralny komunikat.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isLinkTokenShape(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_LINK_TOKEN_LENGTH;
}
