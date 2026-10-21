// /m/[slug] — publiczna strona mentora: profil, ceny i wolne terminy (spec #16 Phase 1–2; ekran s06, mapa ekranów).
//
// Kolejność na stronie to wymaganie (UI/UX): tożsamość → praca publiczna → opis → ceny → terminy. BEZ formularza
// zapytania, pola pytania i przycisku/linku rezerwacji (Q1/L1, Z1; F4: rezerwacja przychodzi z #17) — godziny są
// tekstem. Brak ocen, opinii, katalogu i wyszukiwarki (N02, R14).
//
// Status 404 (Q5, Z19): z `cacheComponents` ta trasa ma statyczną powłokę (PPR) wysyłaną przed odczytem sluga,
// więc o 404 decyduje `proxy.ts` PRZED renderem (szkic, nieznany i niepoprawny slug nigdy tu nie docierają).
// `notFound()` poniżej to tylko siatka bezpieczeństwa na wyścig (mentor cofnął publikację między Proxy a
// stroną): wtedy not-found segmentu (`app/m/not-found.tsx`) z `noindex`, ale już ze statusem 200.
//
// Bez cache (Q5): odczyt przy każdym żądaniu (`connection()`), edycja mentora widoczna od razu. Odczyt za
// <Suspense> obejmującym cały PageLayout (zasada z track.md).
//
// Terminy (Q5, krok 4): pod cenami, we WŁASNYM <Suspense> (szkielet; przy utracie sieci komunikat w sekcji, Z28)
// i we własnej granicy błędu (`slot-section-boundary.tsx`) — profil i ceny są POZA nimi, więc wolne lub
// nieudane wczytanie terminów nigdy ich nie zasłania („Nie udało się wczytać terminów — odśwież stronę”).
// Brak terminów → pusty stan renderowany na serwerze (bez godzin). Są terminy → `slot-list.tsx` (klient,
// strefa widza).
//
// `mentorId` z odczytu zostaje na serwerze: jest propsem komponentu SERWEROWEGO `SlotSection` (props komponentów
// serwerowych nie są serializowane), do klienta idzie tylko lista `{ startsAt, lengthMinutes }` i publiczne ceny.
// Tekst mentora renderowany jako zwykły tekst (bez dangerouslySetInnerHTML).
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Skeleton } from "@devmentor/ui";
import { MentorDescription, MentorIdentity, PageLayout, PriceList } from "@devmentor/ui/product";
import { listPublicOpenSlots } from "@/lib/availability/public-slots";
import { getPublishedPageBySlug } from "@/lib/mentor-page/public";
import SlotSectionBoundary from "./slot-section-boundary";
import { SlotListClient, SlotsLoading } from "./slot-list";
import { SlotSectionMessage } from "./slot-section-states";

/** Jeden odczyt na żądanie dla metadanych i strony (`cache` z React = deduplikacja w obrębie żądania). */
const findPublishedPage = cache(async (slug: string) => {
  await connection();
  return getPublishedPageBySlug(slug);
});

export async function generateMetadata({ params }: PageProps<"/m/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await findPublishedPage(slug);
  // Bez strony: tytuł i robots z `app/m/layout.tsx`.
  return found ? { title: `${found.page.displayName} — DevMentor` } : {};
}

export default function MentorSharePage({ params }: PageProps<"/m/[slug]">) {
  return (
    <Suspense
      fallback={
        <PageLayout width="narrow">
          <Skeleton label="Wczytywanie strony mentora" lines={6} />
        </PageLayout>
      }
    >
      <MentorProfile params={params} />
    </Suspense>
  );
}

async function MentorProfile({ params }: Pick<PageProps<"/m/[slug]">, "params">) {
  const { slug } = await params;
  const found = await findPublishedPage(slug);
  if (!found) notFound();
  const { displayName, publicWorkUrl, description, price25Minor, price50Minor, currency } = found.page;
  const prices = { price25Minor, price50Minor, currency };

  return (
    <PageLayout width="narrow">
      <section className="flex flex-col gap-between-groups">
        <MentorIdentity displayName={displayName} publicWorkUrl={publicWorkUrl} />
        <MentorDescription text={description} />
      </section>
      <PriceList {...prices} />
      <SlotSectionBoundary>
        <Suspense fallback={<SlotsLoading />}>
          <SlotSection mentorId={found.mentorId} prices={prices} />
        </Suspense>
      </SlotSectionBoundary>
    </PageLayout>
  );
}

/** Sekcja terminów (serwer): `mentorId` tylko z opublikowanej strony, do klienta wyłącznie lista ISO. */
async function SlotSection({
  mentorId,
  prices,
}: {
  mentorId: string;
  prices: { price25Minor: number; price50Minor: number; currency: string };
}) {
  const slots = await listPublicOpenSlots(mentorId);
  if (slots.length === 0) return <SlotSectionMessage kind="empty" />;
  return <SlotListClient slots={slots} {...prices} />;
}
