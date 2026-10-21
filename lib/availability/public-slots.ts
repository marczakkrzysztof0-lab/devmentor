// Wolne terminy na publicznej stronie mentora `/m/{slug}` (spec #16 Phase 2, krok 4; Q3, Q5; #15 API Contracts) —
// tylko serwer.
//
// - `mentorId` WYŁĄCZNIE z `getPublishedPageBySlug` (opublikowana strona, ten sam wiersz `mentor_pages`) — nigdy
//   z parametrów żądania ani z danych od klienta. Dzięki temu terminy czyta się tylko dla opublikowanej strony.
// - Terminy liczone przy każdym żądaniu przez `listOpenSlots` (jedno źródło prawdy R06) z prawdziwym „teraz”
//   (`connection()` przed `new Date()` — odczyt zależny od czasu nie może trafić do prerenderu) i `busy = []`,
//   dopóki #17 nie poda zajętych przedziałów. Bez cache (Q5).
// - Do klienta wychodzi WYŁĄCZNIE lista `{ startsAt: UTC ISO, lengthMinutes }` — okna i `mentors.time_zone`
//   zostają na serwerze (mapowanie jawne, żeby przypadkowe pole z `listOpenSlots` nie trafiło do ładunku RSC).
// - Brak strefy mentora albo brak okien → `[]` (pusty stan „Brak wolnych terminów…”, P2/Z38).
// - Błąd bazy wylatuje wyjątkiem — łapie go granica błędu sekcji terminów (`app/m/[slug]/slot-section-boundary.tsx`).
import "server-only";
import { connection } from "next/server";
import { getPool } from "@/lib/db";
import { listOpenSlotsForMentor } from "./queries.mjs";

/** Termin jak DS `OpenSlot` (`startsAt` — UTC ISO). */
export type PublicOpenSlot = { startsAt: string; lengthMinutes: 25 | 50 };

/** Wolne terminy opublikowanej strony mentora w horyzoncie 14 dni, rosnąco (od najwcześniejszego, Q3). */
export async function listPublicOpenSlots(mentorId: string): Promise<PublicOpenSlot[]> {
  await connection();
  const slots = await listOpenSlotsForMentor({ db: getPool(), mentorId, now: new Date(), busy: [] });
  return slots.map(({ startsAt, lengthMinutes }) => ({ startsAt, lengthMinutes }));
}
