"use client";

// E04 · #22 — the mentor's payouts screen (/mentor/payouts). Agent test of the design system:
// composed only from existing primitives, product components and tokens. Not exported (test rule 4).
// No spec for #22 exists; copy and states follow the brief (D07, R13) and the E02 examples.
// DRAFT from the agent test — not exported; needs spec #22 (What is missing). Updated after the test:
// DescriptionList (A1), MentorNav without current (A2), attention tone (B1), hosted redirect pattern (A4).

import { Button } from "../../components/button/Button";
import { CopyField } from "../../components/copy-field/CopyField";
import { DescriptionList } from "../../components/description-list/DescriptionList";
import { List, ListRow } from "../../components/list/List";
import { Skeleton } from "../../components/skeleton/Skeleton";
import { StateMessage } from "../../components/state-message/StateMessage";
import { StatusText, type StatusTone } from "../../components/status-text/StatusText";
import { MentorNav } from "../e01/Mentor";
import { Amount } from "../shared/Amount";
import { formatSlotRange } from "../shared/format";
import { HostedRedirectAction, HostedReturnNotice } from "../shared/HostedRedirect";
import { PageLayout } from "../shared/PageLayout";
import type { LoadState, SessionLength } from "../shared/types";

/** Payout setup at the payment provider (Stripe hosted onboarding, #25). */
export type PayoutSetupStatus = "not_started" | "pending" | "ready" | "action_required";

/** Payout state of one completed session. */
export type SessionPayoutStatus = "on_hold" | "scheduled" | "in_transit" | "paid";

export type PayoutSession = {
  id: string;
  /** First name only (#17 Q5). */
  menteeName: string;
  lengthMinutes: SessionLength;
  slotStart: string;
  slotEnd: string;
  /** What the mentor gets for this session, in grosze. */
  amountMinor: number;
  payoutStatus: SessionPayoutStatus;
};

/** Server action: creates a Stripe onboarding / dashboard link. Throwing = no network. */
export type OpenStripeResult = { ok: true; url: string } | { ok: false };

export type MentorPayoutsProps = {
  state?: LoadState;
  /** No paid request yet → payout setup is not available (R13, D07). */
  hasPaidRequest: boolean;
  setupStatus: PayoutSetupStatus;
  /** Owed and not yet paid out, in grosze. */
  owedMinor: number;
  /** Already paid out, in grosze. */
  paidOutMinor: number;
  currency?: string;
  sessions: PayoutSession[];
  /** Back from Stripe: `?stripe=return` (completed the flow) or `?stripe=refresh` (link expired / left). */
  returnFrom?: "completed" | "interrupted";
  timeZone: string;
  now?: Date;
  shareUrl: string;
  pendingCount?: number;
  onOpenStripe: () => Promise<OpenStripeResult>;
  /** Sends the browser to Stripe; default `window.location.assign`. */
  onRedirect?: (url: string) => void;
  onRefresh?: () => void;
};

const SETUP: Record<PayoutSetupStatus, { text: string; tone: StatusTone; body: string }> = {
  not_started: {
    text: "Wypłaty nie są skonfigurowane — kwota czeka na wypłatę",
    tone: "attention",
    body: "Dane do wypłaty podajesz na stronie Stripe, nie w DevMentorze. Bez nich Stripe nie przeleje pieniędzy.",
  },
  pending: {
    text: "Stripe sprawdza dane — wypłaty ruszą po weryfikacji",
    tone: "waiting",
    body: "Nic nie trzeba robić. Stan zmieni się na tej stronie, gdy Stripe skończy.",
  },
  ready: {
    text: "Wypłaty skonfigurowane — Stripe przelewa pieniądze na konto podane w Stripe",
    tone: "success",
    body: "Dane do wypłaty zmienisz w panelu Stripe.",
  },
  action_required: {
    text: "Stripe prosi o uzupełnienie danych — wypłaty są wstrzymane",
    tone: "attention",
    body: "Brakujące informacje zobaczysz na stronie Stripe. Kwota czeka do czasu ich uzupełnienia.",
  },
};

const SESSION_WORD: Record<SessionPayoutStatus, { text: string; tone: StatusTone }> = {
  on_hold: { text: "Wstrzymane — czeka na dane do wypłaty", tone: "attention" },
  scheduled: { text: "Do wypłaty", tone: "neutral" },
  in_transit: { text: "Wypłata w drodze", tone: "neutral" },
  paid: { text: "Wypłacone", tone: "success" },
};

const ACTION_LABEL: Record<PayoutSetupStatus, string | null> = {
  not_started: "Skonfiguruj wypłaty w Stripe",
  action_required: "Uzupełnij dane w Stripe",
  pending: null,
  ready: null,
};

export function MentorPayouts({
  state = "ready",
  hasPaidRequest,
  setupStatus,
  owedMinor,
  paidOutMinor,
  currency = "PLN",
  sessions,
  returnFrom,
  timeZone,
  now = new Date(),
  shareUrl,
  pendingCount = 0,
  onOpenStripe,
  onRedirect = (url) => window.location.assign(url),
  onRefresh,
}: MentorPayoutsProps) {
  // A2: „Wypłaty” is not a navigation item yet (What is missing) → no current item.
  const nav = <MentorNav pendingCount={pendingCount} />;
  const heading = <h1 className="text-heading-page font-strong">Wypłaty</h1>;

  if (state === "loading")
    return (
      <PageLayout nav={nav}>
        {heading}
        <Skeleton label="Wczytywanie wypłat" lines={6} />
      </PageLayout>
    );

  if (state === "error")
    return (
      <PageLayout nav={nav}>
        {heading}
        <StateMessage
          kind="error"
          title="Nie udało się wczytać wypłat — odśwież"
          action={
            <Button variant="secondary" onClick={onRefresh}>
              Odśwież
            </Button>
          }
        >
          Kwoty i dane do wypłaty się nie zmieniły.
        </StateMessage>
      </PageLayout>
    );

  if (!hasPaidRequest)
    return (
      <PageLayout nav={nav}>
        {heading}
        <StateMessage kind="empty" title="Wypłaty skonfigurujesz po pierwszym opłaconym pytaniu">
          <div className="flex flex-col gap-between-groups">
            <p>Do tego czasu DevMentor nie potrzebuje danych do wypłaty. Udostępnij swój link, żeby dostać pierwsze pytanie.</p>
            <CopyField label="Twój link" value={shareUrl} hint="Wklej go tam, gdzie ludzie już cię pytają." />
          </div>
        </StateMessage>
      </PageLayout>
    );

  const setup = SETUP[setupStatus];
  const actionLabel = ACTION_LABEL[setupStatus];
  const byNewest = (a: PayoutSession, b: PayoutSession) => b.slotStart.localeCompare(a.slotStart);
  const groups = [
    { id: "owed", title: "Do wypłaty", items: sessions.filter((s) => s.payoutStatus !== "paid").sort(byNewest) },
    { id: "paid", title: "Wypłacone", items: sessions.filter((s) => s.payoutStatus === "paid").sort(byNewest) },
  ].filter((group) => group.items.length > 0);

  return (
    <PageLayout nav={nav}>
      <section aria-labelledby="payouts-title" className="flex max-w-text flex-col gap-between-groups">
        <header className="flex flex-col gap-in-group" aria-live="polite">
          <h1 id="payouts-title" className="text-heading-page font-strong">
            Wypłaty
          </h1>
          <StatusText tone={setup.tone} withIcon>
            {setup.text}
          </StatusText>
          <p className="text-muted">{setup.body}</p>
        </header>

        {returnFrom ? (
          <HostedReturnNotice result={returnFrom} provider="Stripe">
            {returnFrom === "completed"
              ? setupStatus === "ready"
                ? "Wypłaty są gotowe."
                : setupStatus === "action_required"
                  ? "Stripe potrzebuje jeszcze kilku informacji — szczegóły poniżej."
                  : "Stripe je teraz sprawdza. Stan zobaczysz na tej stronie."
              : "Dane podane do tej pory zostały w Stripe. Dokończysz konfigurację przyciskiem poniżej; nic nie zostało pobrane."}
          </HostedReturnNotice>
        ) : null}

        <DescriptionList
          aria-label="Kwoty"
          items={[
            { label: "Do wypłaty", value: <Amount minor={owedMinor} currency={currency} />, emphasis: true },
            { label: "Wypłacone do tej pory", value: <Amount minor={paidOutMinor} currency={currency} /> },
          ]}
        />

        {actionLabel ? (
          <HostedRedirectAction label={actionLabel} provider="Stripe" open={onOpenStripe} onRedirect={onRedirect} unchanged="Dane do wypłaty i kwoty się nie zmieniły." />
        ) : setupStatus === "ready" ? (
          <HostedRedirectAction label="Otwórz panel wypłat w Stripe" provider="Stripe" variant="secondary" open={onOpenStripe} onRedirect={onRedirect} unchanged="Dane do wypłaty i kwoty się nie zmieniły." />
        ) : (
          // B2/D1: nothing to do while Stripe checks the data → no primary action, only a secondary refresh.
          <div>
            <Button variant="secondary" onClick={onRefresh}>
              Odśwież stan
            </Button>
          </div>
        )}
      </section>

      {groups.length === 0 ? (
        <StateMessage kind="empty" title="Nie ma jeszcze zakończonych sesji">
          Kwota do wypłaty pojawi się po pierwszej odbytej sesji.
        </StateMessage>
      ) : (
        <div className="flex flex-col gap-between-sections">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`payout-group-${group.id}`} className="flex flex-col gap-in-group">
              <h2 id={`payout-group-${group.id}`} className="text-heading-section font-strong">
                {group.title}
              </h2>
              <List aria-labelledby={`payout-group-${group.id}`}>
                {group.items.map((s) => {
                  const word = SESSION_WORD[s.payoutStatus];
                  return (
                    <ListRow
                      key={s.id}
                      title={`${s.menteeName} · ${s.lengthMinutes} min`}
                      meta={
                        <>
                          {formatSlotRange(s.slotStart, s.slotEnd, timeZone, now)} · <Amount minor={s.amountMinor} currency={currency} />
                        </>
                      }
                      end={<StatusText tone={word.tone}>{word.text}</StatusText>}
                    />
                  );
                })}
              </List>
            </section>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
