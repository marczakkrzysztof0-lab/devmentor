// Routing prywatnej strony zapytania `/r/{token}` (spec #17 API Contracts „Page /r/{token}”) — czysta logika
// dla `proxy.ts`, testowana `node --test`.
//
// Z `cacheComponents` strona ma statyczną powłokę (PPR) wysyłaną przed odczytem tokenu, więc `notFound()` w samej
// stronie dałby 200 (patrz `lib/mentor-page/share-route.mjs`). Proxy sprawdza token PRZED renderem i nieznany /
// wygasły / zły token przepisuje na nieistniejącą ścieżkę → główne `app/not-found.tsx` z 404 i ogólnym
// „Nie ma takiej strony” (bez szczegółów). Każda odpowiedź `/r/*` dostaje `Referrer-Policy: no-referrer`
// (token w adresie nie wycieka w nagłówku Referer) i `X-Robots-Tag: noindex, nofollow`.
import { isLinkTokenShape } from "../auth/tokens.mjs";

export const REQUEST_NOT_FOUND_REWRITE_PATH = "/r/_/nie-ma-takiej-strony";
export const REQUEST_ROBOTS = "noindex, nofollow";
export const REQUEST_REFERRER_POLICY = "no-referrer";

/**
 * Token z adresu `/r/{token}` albo `null` (samo `/r`, głębsza ścieżka, zły kształt). Tokeny są base64url, więc
 * znak `%` (zakodowany) nigdy nie jest poprawny.
 * @param {string} pathname
 * @returns {string | null}
 */
export function requestTokenFromPath(pathname) {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== 2 || segments[0] !== "r") return null;
  const token = segments[1];
  return isLinkTokenShape(token) && /^[A-Za-z0-9_-]+$/.test(token) ? token : null;
}
