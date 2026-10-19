"use client";

// E02 · #18 — the mentor's request list (/mentor/requests) and decision (/mentor/requests/[id]).

import { useState } from "react";

import { Alert } from "../../components/alert/Alert";
import { Button } from "../../components/button/Button";
import { ConfirmDialog } from "../../components/confirm-dialog/ConfirmDialog";
import { CopyField } from "../../components/copy-field/CopyField";
import { List, ListRow } from "../../components/list/List";
import { Skeleton } from "../../components/skeleton/Skeleton";
import { StateMessage } from "../../components/state-message/StateMessage";
import { StatusText, type StatusTone } from "../../components/status-text/StatusText";
import { NETWORK_MESSAGE } from "../shared/form";
import { formatDay, formatMoney, formatSlotRange, formatTime } from "../shared/format";
import type { LoadState, RequestStatus, SessionLength } from "../shared/types";
import { QuestionText, RequestSummary } from "./Request";

export type MentorRequestItem = {
  id: string;
  /** First name only (#17 Q5). */
  menteeName: string;
  lengthMinutes: SessionLength;
  slotStart: string;
  slotEnd: string;
  status: Extract<RequestStatus, "awaiting_mentor" | "overdue" | "accepted" | "declined" | "lapsed" | "cancelled">;
};

/** „Zdecyduj do jutra 12:30” / „Zdecyduj dziś do 12:30” / „Zdecyduj przed czw. 22.10, 12:30”. */
export function decideBy(slotStart: string, timeZone: string, now: Date) {
  const day = formatDay(slotStart, timeZone, now);
  const time = formatTime(slotStart, timeZone);
  if (day === "jutro") return `Zdecyduj do jutra ${time}`;
  if (day === "dziś") return `Zdecyduj dziś do ${time}`;
  return `Zdecyduj przed ${day}, ${time}`;
}

const STATUS_WORD: Record<MentorRequestItem["status"], { text: string; tone: StatusTone }> = {
  awaiting_mentor: { text: "Czeka na decyzję", tone: "waiting" },
  overdue: { text: "Termin minął", tone: "waiting" },
  accepted: { text: "Zaakceptowane", tone: "success" },
  declined: { text: "Zakończone — odrzucone", tone: "neutral" },
  lapsed: { text: "Zakończone — przeterminowane", tone: "neutral" },
  cancelled: { text: "Zakończone — anulowane", tone: "neutral" },
};

export type RequestListProps = {
  requests: MentorRequestItem[];
  state?: LoadState;
  timeZone: string;
  now?: Date;
  /** Shown in the empty state: „udostępnij swój link” (#18). */
  shareUrl: string;
  hrefFor?: (id: string) => string;
};

/** Requests grouped by state: Czeka na decyzję (by slot) · Zaakceptowane · Zakończone (last 30 days) (#18). */
export function RequestList({ requests, state = "ready", timeZone, now = new Date(), shareUrl, hrefFor = (id) => `/mentor/requests/${id}` }: RequestListProps) {
  if (state === "loading") return <Skeleton label="Wczytywanie zapytań" lines={5} />;
  if (state === "error") return <StateMessage kind="error" title="Nie udało się wczytać zapytań — odśwież" />;
  if (requests.length === 0) {
    return (
      <StateMessage kind="empty" title="Nie masz jeszcze zapytań — udostępnij swój link">
        <CopyField label="Twój link" value={shareUrl} hint="Wklej go tam, gdzie ludzie już cię pytają." />
      </StateMessage>
    );
  }
  const bySlot = (a: MentorRequestItem, b: MentorRequestItem) => a.slotStart.localeCompare(b.slotStart);
  const groups = [
    { id: "waiting", title: "Czeka na decyzję", items: requests.filter((r) => r.status === "awaiting_mentor" || r.status === "overdue").sort(bySlot) },
    { id: "accepted", title: "Zaakceptowane", items: requests.filter((r) => r.status === "accepted").sort(bySlot) },
    { id: "done", title: "Zakończone", items: requests.filter((r) => ["declined", "lapsed", "cancelled"].includes(r.status)).sort(bySlot).reverse() },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-between-sections">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`group-${group.id}`} className="flex flex-col gap-in-group">
          <h2 id={`group-${group.id}`} className="text-heading-section font-strong">
            {group.title}
          </h2>
          <List aria-labelledby={`group-${group.id}`}>
            {group.items.map((r) => {
              const word = STATUS_WORD[r.status];
              const slot = formatSlotRange(r.slotStart, r.slotEnd, timeZone, now);
              return (
                <ListRow
                  key={r.id}
                  href={hrefFor(r.id)}
                  title={`${r.menteeName} · ${r.lengthMinutes} min`}
                  meta={r.status === "awaiting_mentor" ? `${slot} · ${decideBy(r.slotStart, timeZone, now).toLowerCase()}` : slot}
                  end={<StatusText tone={word.tone}>{word.text}</StatusText>}
                />
              );
            })}
          </List>
        </section>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- decision */

export type DecisionRefusal = "not_found" | "cancelled" | "declined" | "lapsed" | "already_accepted" | "already_declined" | "slot_started";
export type DecisionResult = { ok: true } | { ok: false; code: DecisionRefusal };

export type MentorRequestDetail = MentorRequestItem & { question: string; amountMinor: number; currency?: string };

export type RequestDecisionProps = {
  request: MentorRequestDetail;
  timeZone: string;
  now?: Date;
  /** `acceptRequest(id)` / `declineRequest(id)` (#18). Throwing = no network. */
  onAccept: (id: string) => Promise<DecisionResult>;
  onDecline: (id: string) => Promise<DecisionResult>;
};

/** Refusal messages (#18 codes); the cancelled one is worded in the spec, the rest are proposals C9–C10 (POSTEP.md). */
export const REFUSAL_MESSAGE: Record<DecisionRefusal, string> = {
  cancelled: "Nie można zaakceptować — deweloper anulował zapytanie",
  declined: "To pytanie jest już odrzucone",
  lapsed: "Termin minął — zwrot został zlecony automatycznie",
  already_accepted: "To pytanie jest już zaakceptowane",
  already_declined: "To pytanie jest już odrzucone",
  slot_started: "Termin już się zaczął — nie można już zdecydować",
  not_found: "Nie ma takiego zapytania albo nie masz do niego dostępu",
};

/** Question, length and slot first, then „Akceptuję” / „Odrzucam” with their consequences (#18 AC). */
export function RequestDecision({ request, timeZone, now = new Date(), onAccept, onDecline }: RequestDecisionProps) {
  const [status, setStatus] = useState(request.status);
  const [dialog, setDialog] = useState<null | "accept" | "decline">(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const amount = formatMoney(request.amountMinor, request.currency);
  const when = `${formatDay(request.slotStart, timeZone, now)} ${formatTime(request.slotStart, timeZone)}`;

  const run = async (kind: "accept" | "decline") => {
    setPending(true);
    setProblem(null);
    try {
      const result = await (kind === "accept" ? onAccept : onDecline)(request.id);
      if (result.ok) setStatus(kind === "accept" ? "accepted" : "declined");
      else setProblem(REFUSAL_MESSAGE[result.code]);
    } catch {
      setProblem(NETWORK_MESSAGE);
    } finally {
      setPending(false);
      setDialog(null);
    }
  };

  return (
    <article aria-labelledby="request-detail-title" className="flex max-w-text flex-col gap-between-groups">
      <header className="flex flex-col gap-in-group">
        <h1 id="request-detail-title" className="text-heading-page font-strong break-words">
          Pytanie — {request.menteeName}
        </h1>
        {status === "awaiting_mentor" ? (
          <StatusText tone="waiting" withIcon>{decideBy(request.slotStart, timeZone, now)}</StatusText>
        ) : status === "overdue" ? (
          <StatusText tone="waiting" withIcon>Termin minął — zwrot zostanie zlecony automatycznie</StatusText>
        ) : status === "accepted" ? (
          <StatusText tone="success" withIcon>{`Zaakceptowane — sesja ${when} (czat tekstowy)`}</StatusText>
        ) : status === "declined" ? (
          <StatusText tone="neutral" withIcon>Odrzucone — deweloper dostaje pełny zwrot</StatusText>
        ) : status === "lapsed" ? (
          <StatusText tone="neutral" withIcon>Zakończone — przeterminowane, zwrot zlecony</StatusText>
        ) : (
          <StatusText tone="neutral" withIcon>Zakończone — deweloper anulował zapytanie</StatusText>
        )}
      </header>
      <RequestSummary lengthMinutes={request.lengthMinutes} slotStart={request.slotStart} slotEnd={request.slotEnd} timeZone={timeZone} amountMinor={request.amountMinor} currency={request.currency} now={now} />
      <QuestionText text={request.question} />
      {problem ? <Alert tone="danger" title={problem} /> : null}
      {status === "awaiting_mentor" ? (
        <div className="flex flex-col gap-in-group">
          <div className="flex flex-wrap gap-in-group">
            <ConfirmDialog
              trigger={<Button variant="primary">Akceptuję</Button>}
              open={dialog === "accept"}
              onOpenChange={(open) => setDialog(open ? "accept" : null)}
              loading={pending && dialog === "accept"}
              title="Zaakceptować to pytanie?"
              description={`${request.menteeName}, ${when}. Sesja odbędzie się jako czat tekstowy. Po akceptacji deweloper nie może już anulować ze zwrotem.`}
              confirmLabel="Akceptuję pytanie"
              onConfirm={() => void run("accept")}
            />
            <ConfirmDialog
              trigger={<Button variant="secondary">Odrzucam</Button>}
              open={dialog === "decline"}
              onOpenChange={(open) => setDialog(open ? "decline" : null)}
              loading={pending && dialog === "decline"}
              title="Odrzucić to pytanie?"
              description={`${request.menteeName}, ${when}. Odrzucenie zwraca pieniądze deweloperowi (${amount}). Tego nie da się cofnąć.`}
              confirmLabel="Odrzucam pytanie"
              onConfirm={() => void run("decline")}
            />
          </div>
          <p className="text-meta text-muted">Akceptacji i odrzucenia nie da się cofnąć. Odrzucenie zwraca pieniądze deweloperowi.</p>
        </div>
      ) : null}
    </article>
  );
}

/** Another mentor's or an unknown request: no data at all (#18). */
export function RequestNotFound() {
  return <StateMessage kind="not-found" titleAs="h1" title={REFUSAL_MESSAGE.not_found} />;
}
