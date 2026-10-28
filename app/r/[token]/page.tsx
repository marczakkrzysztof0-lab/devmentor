// /r/[token] — prywatna strona zapytania dewelopera (spec #17 API Contracts „Page /r/{token}”, UI/UX; ekran s07).
//
// - Token rozpoznawany WYŁĄCZNIE po hashu (`lib/requests/view.mjs`); 404 dla nieznanego / wygasłego tokenu robi
//   `proxy.ts` przed renderem (z `cacheComponents` `notFound()` w stronie dałby 200). `notFound()` tu to siatka
//   bezpieczeństwa. `Referrer-Policy: no-referrer` i `X-Robots-Tag` ustawia proxy; meta `noindex` + `referrer` tu.
// - Powrót ze Stripe: `?checkout=return&session_id=…` → `syncCheckout` (tylko sesja tej płatności),
//   `?checkout=cancel` → `expireCheckout` — Stripe jest źródłem prawdy (jeśli płatność zdążyła przejść, anulowanie
//   kończy się „Opłacone”). Tylko gdy płatność jest jeszcze `pending`; potem zwykły odczyt.
// - Dynamiczna (odczyt w czasie żądania, `connection()`), za <Suspense> obejmującym cały PageLayout.
// - Do klienta: stan, kwota, termin, pytanie, slug mentora i link tej strony — bez id zapytania i płatności.
// - #19: anulowanie — server action z tokenem tej strony (`bind`), przycisk tylko do akceptacji.
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Skeleton } from "@devmentor/ui";
import { PageLayout } from "@devmentor/ui/product";
import { appBaseUrl, requestPageUrl } from "@/lib/requests/links.mjs";
import { getRequestPage, settleCheckoutFromReturn } from "@/lib/requests/server";
import { cancelRequestAction } from "./actions";
import { RequestView } from "./request-view";

export const metadata: Metadata = {
  title: "Twoje zapytanie — DevMentor",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RequestPage({ params, searchParams }: PageProps<"/r/[token]">) {
  return (
    <Suspense
      fallback={
        <PageLayout width="narrow">
          <Skeleton label="Wczytywanie zapytania" lines={4} />
        </PageLayout>
      }
    >
      <RequestContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestContent({ params, searchParams }: Pick<PageProps<"/r/[token]">, "params" | "searchParams">) {
  const { token } = await params;
  const query = await searchParams;
  let request = await getRequestPage(token);
  if (!request) notFound();

  const checkout = query.checkout === "return" || query.checkout === "cancel" ? query.checkout : null;
  if (checkout && request.paymentStatus === "pending") {
    const sessionId = typeof query.session_id === "string" ? query.session_id : null;
    await settleCheckoutFromReturn(request.paymentId, checkout, sessionId);
    request = (await getRequestPage(token)) ?? request;
  }

  return (
    <PageLayout width="narrow">
      <RequestView
        status={request.status}
        refundStatus={request.refundStatus === "pending" ? "requested" : request.refundStatus}
        lengthMinutes={request.lengthMinutes}
        slotStart={request.slotStart}
        slotEnd={request.slotEnd}
        amountMinor={request.amountMinor}
        currency={request.currency}
        question={request.question}
        mentorHref={request.mentorSlug ? `/m/${request.mentorSlug}` : "/"}
        requestUrl={requestPageUrl(appBaseUrl(), token)}
        cancelAction={cancelRequestAction.bind(null, token)}
      />
    </PageLayout>
  );
}
