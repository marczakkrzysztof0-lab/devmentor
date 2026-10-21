// Główne 404 aplikacji: każdy adres bez trasy, a także adresy `/m/*` przepisane przez `proxy.ts`, gdy nie ma pod
// nimi opublikowanej strony mentora (spec #16 story 4–5, Q4, Q5). Next ustawia tu status 404 przed renderem,
// więc treść może być strumieniowana (za <Suspense>, bo czyta nagłówek żądania) bez utraty statusu.
//
// Dla `/m/*` (nagłówek od Proxy) — neutralne „Nie ma takiej strony mentora” z DS (`MentorNotFound`): bez
// imienia, opisu, cen i bez podpowiedzi, czy slug istnieje. Dla innych adresów — ogólne „Nie ma takiej strony”.
import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Skeleton, StateMessage } from "@devmentor/ui";
import { MentorNotFound, PageLayout } from "@devmentor/ui/product";
import { MENTOR_NOT_FOUND_HEADER, MENTOR_NOT_FOUND_VALUE } from "@/lib/mentor-page/share-route.mjs";

async function isMentorPageNotFound() {
  return (await headers()).get(MENTOR_NOT_FOUND_HEADER) === MENTOR_NOT_FOUND_VALUE;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await isMentorPageNotFound()) ? "Nie ma takiej strony mentora — DevMentor" : "Nie ma takiej strony — DevMentor",
    robots: { index: false, follow: false },
  };
}

export default function NotFound() {
  // Granica <Suspense> obejmuje cały PageLayout (zasada z track.md): fallback i treść mają każde własny <main>.
  return (
    <Suspense
      fallback={
        <PageLayout width="narrow">
          <Skeleton label="Wczytywanie" />
        </PageLayout>
      }
    >
      <NotFoundMessage />
    </Suspense>
  );
}

async function NotFoundMessage() {
  const mentorPage = await isMentorPageNotFound();
  return (
    <PageLayout width="narrow">
      {mentorPage ? <MentorNotFound /> : <StateMessage kind="not-found" titleAs="h1" title="Nie ma takiej strony" />}
    </PageLayout>
  );
}
