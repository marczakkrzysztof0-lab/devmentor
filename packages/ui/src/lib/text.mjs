// Shared text rules of the mentor page form (spec #14, `saveMentorPage`), used IDENTICALLY by the browser
// (`src/product/e01/Mentor.tsx`, `validateMentorPage`) and by the server (`lib/mentor-page/validate.mjs`,
// imported as `@devmentor/ui/text`). Plain ESM + JSDoc (no TS, no React) so `node --test` imports it
// without a loader; keep it dependency-free.

/** Display name limits, in Unicode code points. */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 80;
/** Public-work link limit, in Unicode code points. */
export const PUBLIC_WORK_URL_MAX = 500;
/** Description limit, in Unicode code points (after `normalizeDescription`). */
export const DESCRIPTION_MAX = 2000;

/**
 * Length in Unicode code points (an emoji such as „😀” counts as 1), not in UTF-16 code units.
 * The one length rule of the form: every limit above is counted with it, in the browser and on the server.
 * @param {string} text
 * @returns {number}
 */
export function textLength(text) {
  return [...text].length; // string iteration goes by code points
}

/**
 * Display name as stored: trimmed, every run of whitespace (newlines too) → one space.
 * @param {string} text
 * @returns {string}
 */
export function normalizeDisplayName(text) {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Description as stored: plain text, CRLF/CR → LF, edges trimmed, inner newlines kept.
 * @param {string} text
 * @returns {string}
 */
export function normalizeDescription(text) {
  return text.replace(/\r\n?/g, "\n").trim();
}

/**
 * Checks a trimmed, non-empty public-work link (spec #14: `http(s)://` only, ≤ 500 characters).
 * Accepted: starts with `http://` or `https://` (any case), no whitespace, parses as a URL with the
 * http/https protocol and a host, no credentials in it (e.g. „https://github.com@evil.example”).
 * Any host is fine, also `localhost` or a host with a port.
 * @param {string} url
 * @returns {"tooLong" | "invalid" | null} the problem, or null when the link is valid
 */
export function publicWorkUrlProblem(url) {
  if (textLength(url) > PUBLIC_WORK_URL_MAX) return "tooLong";
  if (!/^https?:\/\//i.test(url) || /\s/.test(url)) return "invalid";
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "invalid";
  if (parsed.hostname === "") return "invalid";
  if (parsed.username !== "" || parsed.password !== "") return "invalid";
  return null;
}
