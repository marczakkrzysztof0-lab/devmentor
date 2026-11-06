// Wspólna obsługa HTTP tras czatu sesji (spec #20 API Contracts): limit rozmiaru, typ treści, nagłówek `Origin`,
// kody statusów. Czyste funkcje (testowane `node --test`); trasy w `app/api/**/session/route.ts` tylko je składają.
//
// Ochrona przed żądaniami z obcych stron (CSRF): (1) tylko `Content-Type: application/json` — obca strona nie wyśle
// takiego POST-a bez preflightu CORS, na który aplikacja nigdy nie odpowiada zgodą; (2) obecny nagłówek `Origin` musi
// być originem `NEXT_PUBLIC_APP_URL` (ten sam kanoniczny adres co w e-mailach). Brak `Origin` (klient spoza
// przeglądarki) jest dopuszczony — bez przeglądarki nie ma ciasteczka do nadużycia, a trasa dewelopera i tak
// wymaga tokenu.

/** Największa przyjmowana treść żądania (bajty). Wiadomość ≤ 4000 znaków mieści się z zapasem. */
export const MAX_BODY_BYTES = 16 * 1024;

/** Nagłówek z tokenem z linku /r/{token} (nigdy w adresie ani w treści żądania). */
export const REQUEST_TOKEN_HEADER = "x-request-token";

export const NO_STORE = Object.freeze({ "Cache-Control": "no-store" });

/** @type {Record<string, number>} */
const POST_STATUS = {
  invalid_body: 400,
  not_found: 404,
  not_open: 409,
  closed: 409,
  limit_reached: 409,
};

/**
 * Status HTTP dla wyniku zapisu wiadomości.
 * @param {{ ok: boolean, code?: string }} result
 */
export function postStatus(result) {
  if (result.ok) return 201;
  return POST_STATUS[result.code ?? ""] ?? 400;
}

/**
 * Czy nagłówek `Origin` jest dozwolony: brak albo równy originowi aplikacji.
 * @param {string | null} origin
 * @param {string} appUrl
 */
export function isAllowedOrigin(origin, appUrl) {
  if (origin === null || origin === "") return true;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Treść żądania jako tekst, czytana strumieniowo do `limit` bajtów (`Content-Length` można pominąć albo zaniżyć).
 * @param {Request} request
 * @param {number} limit
 * @returns {Promise<string | null>} `null` = przekroczony limit
 */
async function readLimited(request, limit) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Sprawdza nagłówki POST-a i czyta treść JSON z limitem rozmiaru.
 * @param {Request} request
 * @param {string} appUrl
 * @returns {Promise<{ ok: true, body: unknown } | { ok: false, status: number, error: string }>}
 */
export async function readPostBody(request, appUrl) {
  if (!isAllowedOrigin(request.headers.get("origin"), appUrl)) return { ok: false, status: 403, error: "forbidden_origin" };
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { ok: false, status: 415, error: "unsupported_media_type" };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return { ok: false, status: 413, error: "too_large" };
  const raw = await readLimited(request, MAX_BODY_BYTES);
  if (raw === null) return { ok: false, status: 413, error: "too_large" };
  try {
    const parsed = JSON.parse(raw);
    return { ok: true, body: parsed !== null && typeof parsed === "object" ? parsed.body : undefined };
  } catch {
    return { ok: true, body: undefined };
  }
}
