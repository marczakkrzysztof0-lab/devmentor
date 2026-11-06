// Proxy dla publicznych stron mentora `/m/*` (spec #16 Q2, Q4, Q5, story 4–5; Z19, Z20) i prywatnych stron
// zapytań `/r/*` (spec #17 API Contracts „Page /r/{token}”).
//
// Prawdziwy status 404 przed renderem: z `cacheComponents` `/m/[slug]` i `/r/[token]` mają statyczną powłokę (PPR)
// wysyłaną od razu, więc `notFound()` w stronie dałby 200. Tu — zanim cokolwiek się wyrenderuje — lekkie
// sprawdzenie w bazie (bez danych strony / zapytania):
// - `/m/*`: wszystko, co nie jest opublikowaną stroną (szkic, nieznany, niepoprawny slug, `/m`, `/m?search=…`,
//   głębsze ścieżki), jest przepisywane na nieistniejącą ścieżkę → `app/not-found.tsx` ze statusem 404 i neutralnym
//   „Nie ma takiej strony mentora” (ten sam wynik dla szkicu i nieznanego sluga — Q4). Adres się nie zmienia.
//   Każda odpowiedź dostaje `X-Robots-Tag: noindex, nofollow` (Q2, best effort).
// - `/r/*`: nieznany, wygasły (30 dni po terminie) albo źle zbudowany token → 404 z ogólnym „Nie ma takiej strony”
//   (bez szczegółów). Każda odpowiedź: `Referrer-Policy: no-referrer` (token z adresu nie wycieka w Referer)
//   i `X-Robots-Tag: noindex, nofollow`.
import { NextResponse, type NextRequest } from "next/server";
import { isPublishedMentorSlug } from "@/lib/mentor-page/public";
import {
  MENTOR_NOT_FOUND_HEADER,
  MENTOR_NOT_FOUND_REWRITE_PATH,
  MENTOR_NOT_FOUND_VALUE,
  MENTOR_ROBOTS,
  mentorSlugFromPath,
} from "@/lib/mentor-page/share-route.mjs";
import {
  REQUEST_NOT_FOUND_REWRITE_PATH,
  REQUEST_REFERRER_POLICY,
  REQUEST_ROBOTS,
  requestTokenFromPath,
} from "@/lib/requests/request-route.mjs";
import { isValidRequestTokenNow } from "@/lib/requests/token-check";

export const config = {
  matcher: ["/m", "/m/:path*", "/r", "/r/:path*"],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/r" || pathname.startsWith("/r/")) return requestPageProxy(request);

  const slug = mentorSlugFromPath(pathname);
  if (slug !== null && (await isPublishedMentorSlug(slug))) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", MENTOR_ROBOTS);
    return response;
  }
  const headers = new Headers(request.headers);
  headers.set(MENTOR_NOT_FOUND_HEADER, MENTOR_NOT_FOUND_VALUE);
  const response = NextResponse.rewrite(new URL(MENTOR_NOT_FOUND_REWRITE_PATH, request.url), { request: { headers } });
  response.headers.set("X-Robots-Tag", MENTOR_ROBOTS);
  return response;
}

async function requestPageProxy(request: NextRequest) {
  const token = requestTokenFromPath(request.nextUrl.pathname);
  const valid = token !== null && (await isValidRequestTokenNow(token));
  const response = valid ? NextResponse.next() : NextResponse.rewrite(new URL(REQUEST_NOT_FOUND_REWRITE_PATH, request.url));
  response.headers.set("Referrer-Policy", REQUEST_REFERRER_POLICY);
  response.headers.set("X-Robots-Tag", REQUEST_ROBOTS);
  return response;
}
