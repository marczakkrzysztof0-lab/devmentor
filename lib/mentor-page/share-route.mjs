// Routing publicznych stron mentora `/m/*` (spec #16 Q2, Q4, Q5; story 4–5) — czysta logika dla `proxy.ts`
// i `app/not-found.tsx`, testowana `node --test` bez Next.js.
//
// Dlaczego Proxy: z `cacheComponents` strona `/m/[slug]` ma statyczną powłokę (PPR), która wychodzi do
// przeglądarki, zanim strona sprawdzi slug — `notFound()` w stronie dałby wtedy status 200 („soft 404”).
// Dokumentacja Next 16 (file-conventions/loading.md, „Status codes”) każe sprawdzić slug w Proxy i przepisać
// żądanie na trasę not-found. Proxy przepisuje więc wszystko, co nie jest opublikowaną stroną (szkic, nieznany,
// niepoprawny slug, samo `/m`, `/m?search=…`, głębsze ścieżki), na nieistniejącą ścieżkę → główne
// `app/not-found.tsx` ze statusem 404 i pełnym HTML-em z serwera.
import { isWellFormedSlug } from "./public.mjs";

/** Nagłówek żądania ustawiany przez Proxy: główne not-found pokazuje wtedy „Nie ma takiej strony mentora”. */
export const MENTOR_NOT_FOUND_HEADER = "x-devmentor-not-found";
export const MENTOR_NOT_FOUND_VALUE = "mentor-page";

/**
 * Cel przepisania dla „nie ma takiej strony mentora”: ścieżka, której nie obsługuje żadna trasa (`/m/[slug]`
 * ma jeden segment), więc Next renderuje główne not-found ze statusem 404. Proxy nie działa ponownie na celu.
 */
export const MENTOR_NOT_FOUND_REWRITE_PATH = "/m/_/nie-ma-takiej-strony";

/** Każda odpowiedź `/m/*` (także 404): wskazówka dla robotów (Q2 — best effort, nie gwarancja). */
export const MENTOR_ROBOTS = "noindex, nofollow";

/**
 * Slug z adresu `/m/{slug}` albo `null`, gdy to nie jest adres strony mentora: samo `/m`, głębsza ścieżka,
 * niepoprawny slug (format i długość jak w edytorze; znaki zakodowane `%..` nigdy nie są poprawne).
 * Parametry zapytania nie mają znaczenia (nie ma wyszukiwarki, R14).
 * @param {string} pathname `request.nextUrl.pathname`
 * @returns {string | null}
 */
export function mentorSlugFromPath(pathname) {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== 2 || segments[0] !== "m") return null;
  return isWellFormedSlug(segments[1]) ? segments[1] : null;
}
