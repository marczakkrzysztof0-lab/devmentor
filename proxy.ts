// Proxy dla publicznych stron mentora `/m/*` (spec #16 Q2, Q4, Q5, story 4–5; Z19, Z20).
//
// Prawdziwy status 404 przed renderem: z `cacheComponents` `/m/[slug]` ma statyczną powłokę (PPR) wysyłaną
// od razu, więc `notFound()` w samej stronie dałby 200. Tu — zanim cokolwiek się wyrenderuje — lekkie
// sprawdzenie w bazie (`select 1 … published_at is not null`, bez danych strony). Wszystko, co nie jest
// opublikowaną stroną (szkic, nieznany, niepoprawny slug, `/m`, `/m?search=…`, głębsze ścieżki), jest
// przepisywane na nieistniejącą ścieżkę → `app/not-found.tsx` ze statusem 404 i neutralnym „Nie ma takiej
// strony mentora” (ten sam wynik dla szkicu i nieznanego sluga — Q4). Adres w przeglądarce się nie zmienia.
//
// Każda odpowiedź `/m/*` dostaje też nagłówek `X-Robots-Tag: noindex, nofollow` (Q2, best effort) — działa
// także tam, gdzie meta tag nie trafia do HTML-a z serwera. Strona i tak sprawdza slug drugi raz (dane strony);
// gdyby między sprawdzeniami mentor cofnął publikację, strona pokaże not-found segmentu z `noindex`.
import { NextResponse, type NextRequest } from "next/server";
import { isPublishedMentorSlug } from "@/lib/mentor-page/public";
import {
  MENTOR_NOT_FOUND_HEADER,
  MENTOR_NOT_FOUND_REWRITE_PATH,
  MENTOR_NOT_FOUND_VALUE,
  MENTOR_ROBOTS,
  mentorSlugFromPath,
} from "@/lib/mentor-page/share-route.mjs";

export const config = {
  matcher: ["/m", "/m/:path*"],
};

export async function proxy(request: NextRequest) {
  const slug = mentorSlugFromPath(request.nextUrl.pathname);
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
