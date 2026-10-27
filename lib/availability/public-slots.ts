// Wolne terminy na publicznej stronie mentora `/m/{slug}` (spec #16 Phase 2, krok 4; Q3, Q5; #15 API Contracts) —
// tylko serwer.
//
// - `mentorId` WYŁĄCZNIE z `getPublishedPageBySlug` (opublikowana strona, ten sam wiersz `mentor_pages`) — nigdy
//   z parametrów żądania ani z danych od klienta. Dzięki temu terminy czyta się tylko dla opublikowanej strony.
// - Terminy liczone przy każdym żądaniu przez `listOpenSlots` (jedno źródło prawdy R06) z prawdziwym „teraz”
//   (`connection()` przed `new Date()` — odczyt zależny od czasu nie może trafić do prerenderu) i `busy` = zajęte
//   przedziały zapytań (#17 Q7, `lib/requests/held.mjs`: opłacone, przyjęte i trzymane na czas płatności). Bez cache (Q5).
// - Do klienta wychodzi WYŁĄCZNIE lista `{ startsAt: UTC ISO, lengthMinutes }` — okna i `mentors.time_zone`
//   zostają na serwerze (mapowanie jawne, żeby przypadkowe pole z `listOpenSlots` nie trafiło do ładunku RSC).
// - Brak strefy mentora albo brak okien → `[]` (pusty stan „Brak wolnych terminów…”, P2/Z38).
// - Błąd bazy wylatuje wyjątkiem — łapie go granica błędu sekcji terminów (`app/m/[slug]/slot-section-boundary.tsx`).
import "server-only";
import { connection } from "next/server";
import { getPool } from "@/lib/db";
import { listHeldRanges } from "@/lib/requests/server";
import { listOpenSlotsForMentor } from "./queries.mjs";
import { HORIZON_DAYS } from "./slots.mjs";

/** Termin jak DS `OpenSlot` (`startsAt` — UTC ISO). */
export type PublicOpenSlot = { startsAt: string; lengthMinutes: 25 | 50 };

/** Wolne terminy opublikowanej strony mentora w horyzoncie 14 dni, rosnąco (od najwcześniejszego, Q3). */
export async function listPublicOpenSlots(mentorId: string): Promise<PublicOpenSlot[]> {
  await connection();
  const now = new Date();
  const busy = await listHeldRanges(mentorId, now, HORIZON_DAYS);
  const slots = await listOpenSlotsForMentor({ db: getPool(), mentorId, now, busy });
  return slots.map(({ startsAt, lengthMinutes }) => ({ startsAt, lengthMinutes }));
}
