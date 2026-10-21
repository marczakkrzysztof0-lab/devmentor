// Storybook-only screen compositions (S1–S9). They assemble REAL components from
// @devmentor/ui and @devmentor/ui/product with spec data; the app builds the same screens
// from its routes. Never exported from the package.
import type { Decorator } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import { Skeleton } from "../src/components/skeleton/Skeleton";
import { StateMessage } from "../src/components/state-message/StateMessage";
import {
  AccessMessage,
  AvailabilityEditor,
  CancelNotPossible,
  CancelRequest,
  InvitationPanel,
  LengthToggle,
  MentorDescription,
  MentorIdentity,
  MentorNav,
  MentorNotFound,
  MentorPageForm,
  NETWORK_LOAD_MESSAGE,
  NoAvailabilityNotice,
  PageLayout,
  PriceList,
  QuestionCopyBox,
  QuestionText,
  RequestDecision,
  RequestForm,
  RequestList,
  RequestNotFound,
  RequestStatusView,
  RequestSummary,
  SaveLinkBox,
  SlotList,
  type AvailabilityWindow,
  type MentorPageValues,
  type MentorRequestDetail,
  type MentorRequestItem,
  type RefundStatus,
  type RequestStatus,
  type SaveAvailabilityResult,
  type SaveMentorPageResult,
  type SessionLength,
  type StartRequestResult,
} from "../src/product";
import { ANNA, ANNA_SLOTS, LONG_DESCRIPTION, NOW, QUESTION, REQUEST_URL, SHARE_URL, ZONE, never, wait, warsaw } from "./fixtures";

/** 375 px phone frame (spec #16: first screen at 375 × 812). */
export const phone: Decorator = (Story) => (
  <div data-testid="phone-frame" style={{ width: 375, minHeight: 812 }} className="border border-divider">
    <Story />
  </div>
);

/* ---------------------------------------------------------------- E01 */

export function InvitationScreen({ state }: { state: "valid" | "accepting" | "inactive" | "network" }) {
  if (state === "inactive")
    return (
      <PageLayout width="narrow">
        <AccessMessage kind="inactive-link" />
      </PageLayout>
    );
  const onAccept =
    state === "accepting"
      ? never<{ ok: true }>
      : state === "network"
        ? async (): Promise<{ ok: true }> => {
            throw new TypeError("Failed to fetch");
          }
        : fn(async () => ({ ok: true as const }));
  return (
    <PageLayout width="narrow">
      <InvitationPanel kind="invite" expiresLabel="2.11.2026, 19:00" onAccept={onAccept} />
    </PageLayout>
  );
}

export function SignInScreen({ state }: { state: "valid" | "inactive" }) {
  return (
    <PageLayout width="narrow">
      {state === "valid" ? (
        <InvitationPanel kind="sign-in" expiresLabel="22.10.2026, 19:00" onAccept={async () => ({ ok: true })} />
      ) : (
        <AccessMessage kind="inactive-link" />
      )}
    </PageLayout>
  );
}

export function NoSessionScreen() {
  return (
    <PageLayout width="narrow">
      <AccessMessage kind="invitation-only" />
    </PageLayout>
  );
}

/** First visit: empty draft with the random placeholder slug given at acceptance (spec #14 Q6). */
const EMPTY_PAGE: MentorPageValues = { displayName: "", publicWorkUrl: "", description: "", price25: "", price50: "", slug: "mentor-k3x7qa" };
const ANNA_PAGE: MentorPageValues = {
  displayName: ANNA.displayName,
  publicWorkUrl: ANNA.publicWorkUrl,
  description: ANNA.description,
  price25: "150",
  price50: "280",
  slug: ANNA.slug,
};

export function EditorScreen({
  state,
}: {
  state:
    | "loading"
    | "first-visit"
    | "filled-draft"
    | "published-no-availability"
    | "published"
    | "slug-taken"
    | "server-error"
    | "network"
    | "session-expired"
    | "publishing";
}) {
  // The app wraps the whole page in <Suspense>; the fallback is its own PageLayout (gap D9).
  if (state === "loading")
    return (
      <PageLayout nav={<MentorNav current="page" sections={["page", "availability"]} />}>
        <Skeleton label="Wczytywanie strony" lines={6} className="max-w-text" />
      </PageLayout>
    );
  const action: (v: MentorPageValues, o: { publish: boolean }) => Promise<SaveMentorPageResult> =
    state === "slug-taken"
      ? async () => ({ ok: false, errors: { slug: "Ten adres jest zajęty" } })
      : state === "server-error"
        ? async () => ({ ok: false, code: "server_error" })
        : state === "session-expired"
          ? async () => ({ ok: false, reason: "unauthorized" })
        : state === "network"
          ? async () => {
              throw new TypeError("Failed to fetch");
            }
          : state === "publishing"
            ? never
            : async () => {
                await wait(300);
                return { ok: true, shareUrl: SHARE_URL };
              };
  const published = state === "published" || state === "published-no-availability";
  return (
    <PageLayout nav={<MentorNav current="page" sections={["page", "availability"]} signOutAction={async () => {}} />}>
      <MentorPageForm
        initial={state === "first-visit" ? EMPTY_PAGE : ANNA_PAGE}
        slugIsPlaceholder={state === "first-visit"}
        published={published}
        shareUrl={published ? SHARE_URL : null}
        baseUrl="http://localhost:3000"
        currencyLabel="zł"
        notice={state === "published-no-availability" || state === "first-visit" ? <NoAvailabilityNotice /> : undefined}
        action={action}
      />
    </PageLayout>
  );
}

const ZONES = [
  { label: "Europa", options: ["Europe/Warsaw", "Europe/London", "Europe/Berlin"].map((z) => ({ value: z, label: z })) },
  { label: "Ameryka", options: ["America/New_York"].map((z) => ({ value: z, label: z })) },
];
const WINDOWS: AvailabilityWindow[] = [
  { weekday: 1, start: "18:00", end: "20:00" },
  { weekday: 3, start: "12:00", end: "13:00" },
];

export type AvailabilityScreenState = "loading" | "first-visit" | "set" | "empty" | "zone-differs" | "server-error" | "network" | "session-expired";

export function AvailabilityScreen({ state }: { state: AvailabilityScreenState }) {
  const nav = <MentorNav current="availability" sections={["page", "availability"]} signOutAction={async () => {}} />;
  // The app wraps the whole page in <Suspense>; the fallback is its own PageLayout (gap D9).
  if (state === "loading")
    return (
      <PageLayout nav={nav}>
        <Skeleton label="Wczytywanie dostępności" lines={8} className="max-w-text" />
      </PageLayout>
    );
  const action: (input: { timeZone: string; windows: AvailabilityWindow[] }) => Promise<SaveAvailabilityResult> =
    state === "server-error"
      ? async () => ({ ok: false })
      : state === "session-expired"
        ? async () => ({ ok: false, reason: "unauthorized" })
        : state === "network"
          ? async () => {
              throw new TypeError("Failed to fetch");
            }
          : async () => ({ ok: true, preview: ANNA_SLOTS });
  const empty = state === "empty" || state === "first-visit";
  return (
    <PageLayout nav={nav}>
      <AvailabilityEditor
        timeZone={state === "first-visit" ? null : state === "zone-differs" ? "Europe/London" : ZONE}
        detectTimeZone={() => ZONE}
        zones={ZONES}
        windows={empty ? [] : WINDOWS}
        preview={empty ? [] : ANNA_SLOTS}
        now={NOW}
        action={action}
      />
    </PageLayout>
  );
}

/* S6 · #16 only (gap D1, closed in epic 01 task 5.2; slot section in task 6.1): /m/{slug} without the request form of #17. */

/** A 400-character description: the first-screen check at 375 × 812 (spec #16 UI/UX, K2). */
export const DESCRIPTION_400 = `${ANNA.description}\n${"Pracuję z zespołami, które przenoszą duże aplikacje na nowe wersje frameworków. ".repeat(4)}`.slice(0, 400);

export type ShareProfileState = "ready" | "long-description" | "description-400" | "not-found";
/** Slot section of #16 phase 2 (app/m/[slug]): slots, none, loading, load error, no network while loading. */
export type ShareSlotsState = "slots" | "no-slots" | "loading" | "error" | "offline";

/**
 * #16 as the app renders it (app/m/[slug]/page.tsx): identity → public work → description → prices → slots, in
 * that order, and no request form, question field or booking control (L1, Z1, F4).
 */
export function ShareProfileScreen({ state, slots = "slots" }: { state: ShareProfileState; slots?: ShareSlotsState }) {
  if (state === "not-found")
    return (
      <PageLayout width="narrow">
        <MentorNotFound />
      </PageLayout>
    );
  const description =
    state === "long-description" ? LONG_DESCRIPTION : state === "description-400" ? DESCRIPTION_400 : ANNA.description;
  return (
    <PageLayout width="narrow">
      <section className="flex flex-col gap-between-groups">
        <MentorIdentity displayName={ANNA.displayName} publicWorkUrl={ANNA.publicWorkUrl} />
        <MentorDescription text={description} />
      </section>
      <PriceList price25Minor={ANNA.price25Minor} price50Minor={ANNA.price50Minor} currency={ANNA.currency} />
      <ShareSlotSection state={slots} />
    </PageLayout>
  );
}

/**
 * The slot section of /m/[slug] (#16 phase 2), composed like the app: with slots → LengthToggle + SlotList
 * selectable={false} in the viewer's zone (app/m/[slug]/slot-list.tsx); the states without times (empty, loading,
 * load error from the section's error boundary, no network) → an h2 „Najbliższe terminy” without the zone and a
 * Skeleton / StateMessage (app/m/[slug]/slot-section-states.tsx).
 */
function ShareSlotSection({ state }: { state: ShareSlotsState }) {
  const [length, setLength] = useState<SessionLength>(25);
  if (state === "slots")
    return (
      <div className="flex flex-col gap-between-groups">
        <LengthToggle price25Minor={ANNA.price25Minor} price50Minor={ANNA.price50Minor} currency={ANNA.currency} value={length} onValueChange={setLength} />
        <SlotList slots={ANNA_SLOTS} length={length} timeZone={ZONE} now={NOW} selectable={false} />
      </div>
    );
  return (
    <section aria-labelledby="slots-heading" aria-busy={state === "loading" || undefined} className="flex flex-col gap-in-group">
      <h2 id="slots-heading" className="text-heading-section font-strong">
        Najbliższe terminy
      </h2>
      {state === "loading" ? (
        <Skeleton label="Wczytywanie terminów" />
      ) : (
        <StateMessage
          kind={state === "no-slots" ? "empty" : "error"}
          titleAs="h3"
          title={
            state === "no-slots"
              ? "Brak wolnych terminów w najbliższych 14 dniach"
              : state === "error"
                ? "Nie udało się wczytać terminów — odśwież stronę"
                : NETWORK_LOAD_MESSAGE
          }
          className="py-0"
        />
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- E02 */

export type SharePageState = "slots" | "no-slots" | "slots-loading" | "slots-error" | "not-found" | "long-description" | "viewer-london";

export function SharePageScreen({ state, action }: { state: SharePageState; action?: () => Promise<StartRequestResult> }) {
  if (state === "not-found")
    return (
      <PageLayout width="narrow">
        <MentorNotFound />
      </PageLayout>
    );
  const description =
    state === "long-description"
      ? `${ANNA.description}\n\n${"Prowadziłam migracje z pages routera na app router i ustawiałam cache tak, żeby testy dalej działały. ".repeat(18)}`.slice(0, 2000)
      : ANNA.description;
  return (
    <PageLayout width="narrow">
      <section className="flex flex-col gap-between-groups">
        <MentorIdentity displayName={ANNA.displayName} publicWorkUrl={ANNA.publicWorkUrl} />
        <MentorDescription text={description} />
      </section>
      <RequestForm
        slug={ANNA.slug}
        price25Minor={ANNA.price25Minor}
        price50Minor={ANNA.price50Minor}
        slots={state === "no-slots" ? [] : ANNA_SLOTS}
        slotsState={state === "slots-loading" ? "loading" : state === "slots-error" ? "error" : "ready"}
        timeZone={state === "viewer-london" ? "Europe/London" : ZONE}
        now={NOW}
        action={action ?? (async () => ({ ok: true, checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_example" }))}
        onRedirect={fn()}
      />
    </PageLayout>
  );
}

const REQ = { slotStart: warsaw("2026-10-20", "12:30"), slotEnd: warsaw("2026-10-20", "12:55") };

export type RequestPageState =
  | "payment-pending"
  | "payment-pending-long"
  | "paid"
  | "payment-cancelled"
  | "late-payment"
  | "accepted"
  | "declined"
  | "overdue"
  | "lapsed"
  | "cancelled"
  | "refund-failed"
  | "not-found";

export function RequestPageScreen({ state }: { state: RequestPageState }) {
  if (state === "not-found")
    return (
      <PageLayout width="narrow">
        <StateMessage kind="not-found" titleAs="h1" title="Nie ma takiej strony" />
      </PageLayout>
    );
  const status: RequestStatus = (
    {
      "payment-pending": "payment_pending",
      "payment-pending-long": "payment_pending",
      paid: "awaiting_mentor",
      "payment-cancelled": "payment_failed",
      "late-payment": "late_payment",
      accepted: "accepted",
      declined: "declined",
      overdue: "overdue",
      lapsed: "lapsed",
      cancelled: "cancelled",
      "refund-failed": "cancelled",
    } as const
  )[state];
  const refund: RefundStatus =
    state === "refund-failed" ? "failed" : state === "cancelled" ? "succeeded" : ["declined", "lapsed", "late-payment"].includes(state) ? "requested" : null;
  return (
    <PageLayout width="narrow">
      <RequestStatusView
        status={status}
        refundStatus={refund}
        amountMinor={15000}
        slotStart={REQ.slotStart}
        timeZone={ZONE}
        now={NOW}
        pendingTimedOut={state === "payment-pending-long"}
        onRefresh={fn()}
      />
      {state === "payment-cancelled" ? (
        <QuestionCopyBox question={QUESTION} pageHref="/m/anna-k" />
      ) : (
        <>
          {state === "paid" ? <SaveLinkBox url={REQUEST_URL} /> : null}
          {state === "paid" ? <CancelRequest amountMinor={15000} action={async () => ({ ok: true })} /> : null}
          {state === "accepted" ? <CancelNotPossible /> : null}
          <section aria-labelledby="request-details" className="flex flex-col gap-in-group">
            <h2 id="request-details" className="text-heading-section font-strong">
              Szczegóły
            </h2>
            <RequestSummary lengthMinutes={25} {...REQ} timeZone={ZONE} amountMinor={15000} now={NOW} />
            <QuestionText text={QUESTION} heading="Twoje pytanie" />
          </section>
        </>
      )}
    </PageLayout>
  );
}

const item = (id: string, menteeName: string, lengthMinutes: 25 | 50, start: string, status: MentorRequestItem["status"]): MentorRequestItem => ({
  id,
  menteeName,
  lengthMinutes,
  slotStart: start,
  slotEnd: new Date(new Date(start).getTime() + lengthMinutes * 60_000).toISOString(),
  status,
});
export const REQUESTS: MentorRequestItem[] = [
  item("r1", "Kuba", 25, warsaw("2026-10-20", "12:30"), "awaiting_mentor"),
  item("r2", "Ola", 50, warsaw("2026-10-22", "18:00"), "accepted"),
  item("r3", "Kuba", 25, warsaw("2026-10-15", "18:00"), "lapsed"),
  item("r4", "Ola", 25, warsaw("2026-10-13", "12:00"), "cancelled"),
];

export function RequestsScreen({ state }: { state: "ready" | "empty" | "loading" | "error" | "many" }) {
  const many = Array.from({ length: 30 }, (_, i) =>
    item(`m${i}`, i % 2 ? "Ola" : "Kuba", i % 3 ? 25 : 50, warsaw(`2026-10-${String(20 + (i % 10)).padStart(2, "0")}`, i % 2 ? "18:00" : "12:30"), i < 12 ? "awaiting_mentor" : i < 20 ? "accepted" : "declined"),
  );
  const requests = state === "many" ? many : state === "empty" ? [] : REQUESTS;
  const waiting = requests.filter((r) => r.status === "awaiting_mentor").length;
  return (
    <PageLayout nav={<MentorNav current="requests" pendingCount={state === "loading" || state === "error" ? 0 : waiting} />}>
      {/* The counter lives only in the navigation (R01.6, P19). */}
      <h1 className="text-heading-page font-strong">Zapytania</h1>
      <RequestList requests={requests} state={state === "loading" ? "loading" : state === "error" ? "error" : "ready"} timeZone={ZONE} now={NOW} shareUrl={SHARE_URL} />
    </PageLayout>
  );
}

export function RequestDetailScreen({ state }: { state: "awaiting" | "accepted" | "overdue" | "cancelled-race" | "not-found" }) {
  const detail: MentorRequestDetail = {
    ...REQUESTS[0],
    status: state === "accepted" ? "accepted" : state === "overdue" ? "overdue" : "awaiting_mentor",
    question: QUESTION,
    amountMinor: 15000,
  };
  return (
    <PageLayout nav={<MentorNav current="requests" pendingCount={1} />}>
      {state === "not-found" ? (
        <RequestNotFound />
      ) : (
        <RequestDecision
          request={detail}
          timeZone={ZONE}
          now={NOW}
          onAccept={state === "cancelled-race" ? async () => ({ ok: false, code: "cancelled" }) : async () => ({ ok: true })}
          onDecline={async () => ({ ok: true })}
        />
      )}
    </PageLayout>
  );
}
