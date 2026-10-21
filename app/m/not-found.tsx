// 404 segmentu /m/* (spec #16 story 4–5, Q4): szkic, nieznany slug, literówka, niepoprawny slug i samo /m
// dostają TEN SAM neutralny komunikat — bez imienia, opisu, cen i bez podpowiedzi, czy slug istnieje.
// Metadane (`noindex, nofollow`, tytuł) z `app/m/layout.tsx`.
import { MentorNotFound, PageLayout } from "@devmentor/ui/product";

export default function MentorPageNotFound() {
  return (
    <PageLayout width="narrow">
      <MentorNotFound />
    </PageLayout>
  );
}
