// /m/[slug] — publiczna strona mentora, faza 1: profil i ceny (spec #16 Phase 1; ekran s06, mapa ekranów).
//
// Kolejność na stronie to wymaganie (UI/UX): tożsamość → praca publiczna → opis → ceny. W tej fazie BEZ sekcji
// terminów (faza 6) i BEZ formularza zapytania, pola pytania i przycisku/linku rezerwacji (Q1/L1, Z1; F4:
// rezerwacja przychodzi z #17). Brak ocen, opinii, katalogu i wyszukiwarki (N02, R14).
//
// Status 404 (Q5, Z19): z `cacheComponents` ta trasa ma statyczną powłokę (PPR) wysyłaną przed odczytem sluga,
// więc o 404 decyduje `proxy.ts` PRZED renderem (szkic, nieznany i niepoprawny slug nigdy tu nie docierają).
// `notFound()` poniżej to tylko siatka bezpieczeństwa na wyścig (mentor cofnął publikację między Proxy a
// stroną): wtedy not-found segmentu (`app/m/not-found.tsx`) z `noindex`, ale już ze statusem 200.
//
// Bez cache (Q5): odczyt przy każdym żądaniu (`connection()`), edycja mentora widoczna od razu. Odczyt za
// <Suspense> obejmującym cały PageLayout (zasada z track.md). Faza 6 doda terminy we własnym <Suspense> +
// error boundary pod cenami.
//
// `mentorId` z odczytu zostaje na serwerze (przyszłe zapytanie o terminy) — do komponentów idą wyłącznie pola
// publicznego DTO. Tekst mentora renderowany jako zwykły tekst (bez dangerouslySetInnerHTML).
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Skeleton } from "@devmentor/ui";
import { MentorDescription, MentorIdentity, PageLayout, PriceList } from "@devmentor/ui/product";
import { getPublishedPageBySlug } from "@/lib/mentor-page/public";

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

  return (
    <PageLayout width="narrow">
      <section className="flex flex-col gap-between-groups">
        <MentorIdentity displayName={displayName} publicWorkUrl={publicWorkUrl} />
        <MentorDescription text={description} />
      </section>
      <PriceList price25Minor={price25Minor} price50Minor={price50Minor} currency={currency} />
    </PageLayout>
  );
}
