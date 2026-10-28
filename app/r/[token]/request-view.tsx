"use client";

// Treść /r/[token] w strefie WIDZA (spec #17 UI/UX; DS: RequestStatusView, SaveLinkBox, RequestSummary,
// QuestionText, QuestionCopyBox — ekran `RequestPageScreen` w Storybooku).
//
// - Stan zawsze pierwszy, jako h1 (D2: tylko /r/{token} ma stan jako h1).
// - „Czekamy na potwierdzenie płatności”: odświeżanie co 3 s przez minutę (`router.refresh()` — serwer pyta
//   Stripe przy powrocie), potem przycisk „Odśwież” i „nic nie zostanie pobrane dwa razy”.
// - „Opłacone — czeka na mentora”: „Zapisz ten link” jako główna treść (kopia w e-mailu), potem szczegóły i pytanie.
// - „Płatność przerwana — nic nie pobrano”: pytanie w polu do skopiowania i „Wybierz inny termin” (/m/{slug}).
// - Czasy w strefie przeglądarki (fallback UTC) — po hydracji, jak lista terminów na /m/[slug].
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Skeleton } from "@devmentor/ui";
import {
  QuestionCopyBox,
  QuestionText,
  RequestStatusView,
  RequestSummary,
  SaveLinkBox,
  type RefundStatus,
  type RequestStatus,
  type SessionLength,
} from "@devmentor/ui/product";

const POLL_INTERVAL_MS = 3_000;
const POLL_FOR_MS = 60_000;

const noSubscription = () => () => {};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export type RequestViewProps = {
  status: RequestStatus;
  refundStatus: RefundStatus;
  lengthMinutes: SessionLength;
  slotStart: string;
  slotEnd: string;
  amountMinor: number;
  currency: string;
  question: string;
  mentorHref: string;
  requestUrl: string;
};

export function RequestView(props: RequestViewProps) {
  const { status, refundStatus, lengthMinutes, slotStart, slotEnd, amountMinor, currency, question, mentorHref, requestUrl } = props;
  const router = useRouter();
  const zone = useSyncExternalStore(noSubscription, browserTimeZone, () => null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (status !== "payment_pending") return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started >= POLL_FOR_MS) {
        window.clearInterval(timer);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [status, router]);

  if (zone === null) return <Skeleton label="Wczytywanie zapytania" lines={4} />;

  const details = (
    <section aria-labelledby="request-details" className="flex flex-col gap-in-group">
      <h2 id="request-details" className="text-heading-section font-strong">
        Szczegóły
      </h2>
      <RequestSummary lengthMinutes={lengthMinutes} slotStart={slotStart} slotEnd={slotEnd} timeZone={zone} amountMinor={amountMinor} currency={currency} />
      <QuestionText text={question} heading="Twoje pytanie" />
    </section>
  );

  return (
    <>
      <RequestStatusView
        status={status}
        refundStatus={refundStatus}
        amountMinor={amountMinor}
        currency={currency}
        slotStart={slotStart}
        timeZone={zone}
        pendingTimedOut={timedOut}
        onRefresh={() => router.refresh()}
      />
      {status === "payment_failed" ? (
        <QuestionCopyBox question={question} pageHref={mentorHref} />
      ) : (
        <>
          {status === "awaiting_mentor" ? <SaveLinkBox url={requestUrl} /> : null}
          {details}
        </>
      )}
    </>
  );
}
