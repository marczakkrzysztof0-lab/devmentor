"use client";

// Live text chat of a booked session (#20, E03-S01). Same component on the developer's /r/{token} page and on the
// mentor's request detail; the transport (`load`, `send`) comes from the app, so stories exercise every state.
//
// - Text only (R02, N01): every phase shows the text-only notice; there is no video or voice control.
// - The session window comes from the SERVER clock (`now` in each snapshot); the browser clock only advances it
//   between polls and formats times in the viewer's zone.
// - Polls every `pollMs` while the tab is visible and the session has not ended (one last poll after the end);
//   fetches again at once while `hasMore`. Messages are deduplicated by id and kept in `seq` order.
// - A sent message appears only after the server stored it (no optimistic bubble). A failed send keeps the text.
// - Messages are plain text with whitespace kept (code); never HTML (R02, no `dangerouslySetInnerHTML`).
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { Alert } from "../../components/alert/Alert";
import { Button } from "../../components/button/Button";
import { FormField } from "../../components/form-field/FormField";
import { StatusText } from "../../components/status-text/StatusText";
import { Textarea } from "../../components/textarea/Textarea";
import { NETWORK_MESSAGE } from "../shared/form";
import { formatDay, formatTime } from "../shared/format";

export const SESSION_MESSAGE_MAX = 4000;
export const TEXT_ONLY_NOTICE = "Sesja odbywa się wyłącznie na czacie tekstowym — bez wideo i rozmowy głosowej.";
/** Failed polls in a row before the „no connection” notice (#20 story 4). */
const OFFLINE_AFTER_FAILURES = 3;

export type SessionPhase = "before" | "open" | "ended";
export type SessionMessage = { id: string; seq: number; author: "me" | "other"; body: string; createdAt: string };
export type SessionSnapshot = {
  phase: SessionPhase;
  opensAt: string;
  closesAt: string;
  /** Server time of the snapshot. */
  now: string;
  viewer: "mentor" | "mentee";
  /** The other party: the developer's first name for the mentor, the mentor's display name for the developer. */
  otherName: string;
  messages: SessionMessage[];
  hasMore: boolean;
  limitReached: boolean;
};
export type SessionLoadResult = { ok: true; snapshot: SessionSnapshot } | { ok: false; reason: "signed_out" | "not_found" | "unavailable" };
export type SessionSendResult =
  | { ok: true; message: SessionMessage }
  | { ok: false; reason: "invalid_body" | "not_open" | "closed" | "limit_reached" | "not_found" | "signed_out" | "unavailable" };

export type SessionChatProps = {
  /** First snapshot rendered on the server (no loading flash). */
  initial: SessionSnapshot;
  timeZone: string;
  /** Messages newer than `after`; a thrown error means „no network”. */
  load: (after: number) => Promise<SessionLoadResult>;
  /** Stores one message; a thrown error means „no network”. */
  send: (body: string) => Promise<SessionSendResult>;
  pollMs?: number;
  /** Shown above the chat once the session is settled (#21): the outcome and the money. */
  outcome?: ReactNode;
};

const SEND_MESSAGES: Record<Exclude<SessionSendResult, { ok: true }>["reason"], string> = {
  invalid_body: "Wiadomość musi mieć od 1 do 4000 znaków.",
  not_open: "Czat jeszcze się nie otworzył — wiadomość nie została wysłana.",
  closed: "Sesja już się zakończyła — wiadomość nie została wysłana.",
  limit_reached: "Limit wiadomości w tej sesji został osiągnięty.",
  not_found: "Ta sesja nie jest już dostępna.",
  signed_out: "Sesja logowania wygasła — zaloguj się ponownie. Wpisany tekst został w polu.",
  unavailable: "Nie udało się wysłać — spróbuj ponownie. Wpisany tekst został w polu.",
};

function merge(current: SessionMessage[], incoming: SessionMessage[]) {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

const minutesBetween = (fromMs: number, toIso: string) => Math.max(0, Math.ceil((new Date(toIso).getTime() - fromMs) / 60_000));

/** The chat of one session, for either party. */
export function SessionChat({ initial, timeZone, load, send, pollMs = 3_000, outcome }: SessionChatProps) {
  const [snapshot, setSnapshot] = useState(initial);
  const [messages, setMessages] = useState(initial.messages);
  // Server time: `now` of the last snapshot, advanced by the browser clock between polls.
  const [serverNow, setServerNow] = useState(() => new Date(initial.now).getTime());
  const [failures, setFailures] = useState(0);
  const [blocked, setBlocked] = useState<null | "signed_out" | "not_found">(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const lastSeq = useRef(initial.messages.at(-1)?.seq ?? 0);
  const form = useRef<HTMLFormElement>(null);

  const apply = useCallback((next: SessionSnapshot) => {
    setSnapshot(next);
    setServerNow(new Date(next.now).getTime());
    if (next.messages.length > 0) {
      lastSeq.current = Math.max(lastSeq.current, next.messages.at(-1)!.seq);
      setMessages((current) => merge(current, next.messages));
      const fromOther = next.messages.filter((message) => message.author === "other").length;
      if (fromOther > 0) setAnnouncement(fromOther === 1 ? `Nowa wiadomość od: ${next.otherName}` : `Nowe wiadomości od: ${next.otherName} (${fromOther})`);
    }
  }, []);

  const poll = useCallback(async (): Promise<SessionSnapshot | null> => {
    try {
      let result = await load(lastSeq.current);
      while (result.ok) {
        apply(result.snapshot);
        setFailures(0);
        if (!result.snapshot.hasMore) return result.snapshot;
        result = await load(lastSeq.current);
      }
      if (result.reason === "unavailable") setFailures((count) => count + 1);
      else setBlocked(result.reason);
      return null;
    } catch {
      setFailures((count) => count + 1);
      return null;
    }
  }, [apply, load]);

  useEffect(() => {
    let last = Date.now();
    const timer = setInterval(() => {
      const current = Date.now();
      setServerNow((value) => value + (current - last));
      last = current;
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  const ended = snapshot.phase === "ended";
  useEffect(() => {
    if (ended || blocked) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return schedule();
        await poll();
        if (!cancelled) schedule();
      }, pollMs);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ended, blocked, poll, pollMs]);

  const sessionDay = new Date(serverNow);
  const opens = `${formatDay(snapshot.opensAt, timeZone, sessionDay)} ${formatTime(snapshot.opensAt, timeZone)}`;
  const range = `${opens}–${formatTime(snapshot.closesAt, timeZone)}`;
  const length = Math.round((new Date(snapshot.closesAt).getTime() - new Date(snapshot.opensAt).getTime()) / 60_000);
  const canWrite = snapshot.phase === "open" && !snapshot.limitReached && !blocked;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canWrite || sending) return;
    if (draft.trim() === "") {
      setSendError(SEND_MESSAGES.invalid_body);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const result = await send(draft);
      if (result.ok) {
        lastSeq.current = Math.max(lastSeq.current, result.message.seq);
        setMessages((current) => merge(current, [result.message]));
        setDraft("");
      } else {
        setSendError(SEND_MESSAGES[result.reason]);
        if (result.reason === "closed" || result.reason === "limit_reached" || result.reason === "not_open") void poll();
        if (result.reason === "signed_out" || result.reason === "not_found") setBlocked(result.reason);
      }
    } catch {
      setSendError(NETWORK_MESSAGE);
    } finally {
      setSending(false);
      form.current?.querySelector("textarea")?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  }

  const phaseLine =
    snapshot.phase === "before" ? (
      <StatusText tone="waiting" withIcon>{`Czat otworzy się ${opens}`}</StatusText>
    ) : snapshot.phase === "open" ? (
      <StatusText tone="success" withIcon>{`Sesja trwa — zostało ${minutesBetween(serverNow, snapshot.closesAt)} min`}</StatusText>
    ) : (
      <StatusText tone="neutral" withIcon>
        Sesja zakończona — czat tylko do odczytu
      </StatusText>
    );

  return (
    <section aria-labelledby="session-chat-heading" className="flex flex-col gap-between-groups">
      <div className="flex flex-col gap-in-group">
        <h2 id="session-chat-heading" className="text-heading-section font-strong">
          Sesja
        </h2>
        <p className="text-muted">{`${range} · ${length} min`}</p>
        <p>{TEXT_ONLY_NOTICE}</p>
        {outcome}
        {phaseLine}
      </div>

      {blocked === "signed_out" ? <Alert tone="attention" title="Sesja logowania wygasła — zaloguj się ponownie" /> : null}
      {blocked === "not_found" ? <Alert tone="danger" title="Ta sesja nie jest już dostępna" /> : null}
      {failures >= OFFLINE_AFTER_FAILURES && !blocked ? <Alert tone="attention" title="Brak połączenia — próbujemy ponownie" /> : null}

      <div className="flex flex-col gap-in-group">
        <h3 className="sr-only">Wiadomości</h3>
        {messages.length === 0 ? (
          <p className="text-muted">
            {snapshot.phase === "open"
              ? "Nikt jeszcze nie napisał. Zacznij od przywitania i krótkiego opisu problemu."
              : snapshot.phase === "before"
                ? "Wiadomości pojawią się tutaj, gdy sesja się zacznie."
                : "W czasie sesji nie było wiadomości."}
          </p>
        ) : (
          <ol aria-label="Wiadomości sesji" className="flex flex-col border-t border-divider">
            {messages.map((message) => (
              <li key={message.id} className="flex flex-col gap-inline border-b border-divider py-list-row-y">
                <p className="text-meta text-muted">
                  <span className="font-strong text-primary">{message.author === "me" ? "Ty" : snapshot.otherName}</span>
                  {" · "}
                  <time dateTime={message.createdAt}>{formatTime(message.createdAt, timeZone)}</time>
                </p>
                <p className="max-w-text whitespace-pre-wrap break-words">{message.body}</p>
              </li>
            ))}
          </ol>
        )}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>

      {snapshot.phase === "open" && !blocked ? (
        <form ref={form} onSubmit={submit} className="flex flex-col gap-in-group" noValidate>
          {snapshot.limitReached ? (
            <Alert tone="attention" title={SEND_MESSAGES.limit_reached} />
          ) : (
            <>
              {sendError ? <Alert tone="danger" title={sendError} /> : null}
              <FormField label="Twoja wiadomość" hint="Ctrl+Enter wysyła. Wiadomości nie da się edytować ani usunąć.">
                <Textarea rows={4} maxLength={SESSION_MESSAGE_MAX} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onKeyDown={onKeyDown} />
              </FormField>
              <div>
                <Button type="submit" variant="primary" loading={sending}>
                  Wyślij
                </Button>
              </div>
            </>
          )}
        </form>
      ) : null}
    </section>
  );
}
