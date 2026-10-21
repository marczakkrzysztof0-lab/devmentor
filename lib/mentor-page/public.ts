// Publiczna strona mentora `/m/{slug}` (spec #16) — dostęp z aplikacji, tylko serwer.
//
// - Logika i SQL: `lib/mentor-page/public.mjs` (jedno zapytanie na `mentor_pages`, allowlista kluczy).
// - `page` ma dokładnie kształt `MentorPublicPage` z DS (`@devmentor/ui/product`) — bez mapowania.
// - `mentorId` tylko dla serwerowego zapytania o terminy (#16 Phase 2); nigdy do klienta / HTML.
// - Bez cache (Q5): wołaj w czasie żądania.
import "server-only";
import type { MentorPublicPage } from "@devmentor/ui/product";
import { getPool } from "@/lib/db";
import { getPublishedPageBySlug as getPublishedPageBySlugFrom, PUBLIC_PAGE_KEYS } from "./public.mjs";

export { PUBLIC_PAGE_KEYS };

export type PublishedMentorPage = {
  /** Publiczny DTO — można przekazać do komponentów (także klienckich). */
  page: MentorPublicPage;
  /** Tylko serwer (zapytanie o terminy). Nie serializować do klienta. */
  mentorId: string;
};

/** Opublikowana strona po slugu albo `null` (szkic, nieznany lub niepoprawny slug — ten sam wynik, Q4). */
export async function getPublishedPageBySlug(slug: string): Promise<PublishedMentorPage | null> {
  return getPublishedPageBySlugFrom({ db: getPool(), slug });
}
