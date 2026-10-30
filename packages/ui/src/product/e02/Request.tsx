"use client";

// E02 · #17, #18, #19 — the developer's side: request form on /m/{slug} and the request page /r/{token}.

import { Copy } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { Alert } from "../../components/alert/Alert";
import { Button } from "../../components/button/Button";
import { CodeBlock } from "../../components/code-block/CodeBlock";
import { ConfirmDialog } from "../../components/confirm-dialog/ConfirmDialog";
import { CopyField } from "../../components/copy-field/CopyField";
import { DescriptionList } from "../../components/description-list/DescriptionList";
import { FormField } from "../../components/form-field/FormField";
import { Panel } from "../../components/panel/Panel";
import { Spinner } from "../../components/spinner/Spinner";
import { StatusText, type StatusTone } from "../../components/status-text/StatusText";
import { TextInput } from "../../components/text-input/TextInput";
import { Textarea } from "../../components/textarea/Textarea";
import { LengthToggle, payLabel, SlotList, type Prices } from "../e01/SharePage";
import { Amount } from "../shared/Amount";
import { NETWORK_ACTION_MESSAGE, NETWORK_MESSAGE } from "../shared/form";
import { useFocusFirstError } from "../shared/use-focus-first-error";
import { formatDay, formatMoney, formatSlotRange, formatTime } from "../shared/format";
import type { FieldErrors, LoadState, OpenSlot, RefundStatus, RequestStatus, SessionLength } from "../shared/types";

/* ---------------------------------------------------------- request form */

export type StartRequestInput = {
  slug: string;
  submissionId: string;
  lengthMinutes: SessionLength;
  slotStart: string;
  expectedAmountMinor: number;
  menteeName: string;
  question: string;
};

type RequestField = "slotStart" | "menteeName" | "question";

/** `startRequest` results (#17 API contract). Throwing = no network. */
export type StartRequestResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; code: "field"; errors: FieldErrors<RequestField> }
  | { ok: false; code: "slot_taken" | "slot_not_offered" | "page_unavailable" | "payments_unavailable" }
  | { ok: false; code: "price_changed"; newAmountMinor: number }
  | { ok: false; code: "checkout_failed"; retryable: boolean };

export type RequestFormProps = Prices & {
  slug: string;
  slots: OpenSlot[];
  slotsState?: LoadState;
  timeZone?: string;
  now?: Date;
  action: (input: StartRequestInput) => Promise<StartRequestResult>;
  /** Sends the browser to Stripe Checkout; default `window.location.assign`. */
  onRedirect?: (checkoutUrl: string) => void;
  /** Ask the page to reload the slots (after `slot_taken` / `slot_not_offered`). */
  onRefreshSlots?: () => void;
  /** Fresh id per attempt (#17: `submissionId` generated in the browser). */
  createSubmissionId?: () => string;
};

const QUESTION_MIN = 20;
const QUESTION_MAX = 4000;

/** Spec #17 validation (R05): name 2–80, question 20–4000 characters after trim, a slot chosen. */
export function validateRequest(v: { slotStart?: string; menteeName: string; question: string }, mode: "blur" | "submit") {
  const errors: FieldErrors<RequestField> = {};
  const name = v.menteeName.trim();
  const question = v.question.trim();
  if (mode === "submit" && !v.slotStart) errors.slotStart = "Wybierz termin";
  if ((mode === "submit" || name) && (name.length < 2 || name.length > 80)) errors.menteeName = "Wpisz imię (od 2 do 80 znaków)";
  if ((mode === "submit" || question) && question.length < QUESTION_MIN)
    errors.question = "Opisz problem w co najmniej 20 znakach — mentor zdecyduje na podstawie pytania";
  return errors;
}

const FORM_ERRORS: Record<string, { title: string; body?: string }> = {
  slot_taken: { title: "Ten termin właśnie się zajął — wybierz inny", body: "Twoje pytanie zostało w formularzu. Lista terminów jest odświeżona." },
  slot_not_offered: { title: "Tego terminu nie ma już w ofercie — wybierz inny", body: "Twoje pytanie zostało w formularzu." },
  page_unavailable: { title: "Ten mentor nie przyjmuje teraz zapytań", body: "Nic nie zostało pobrane." },
  payments_unavailable: { title: "Płatności są chwilowo niedostępne — spróbuj za chwilę", body: "Nic nie zostało pobrane." },
  checkout_failed: { title: "Nie udało się otworzyć płatności — spróbuj ponownie", body: "Nic nie zostało pobrane." },
  network: { title: NETWORK_MESSAGE },
};

const defaultId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));

/** Length → slot → name → question → pay with the exact amount (#17). Prices stay visible above (R07). */
export function RequestForm({
  slug,
  price25Minor,
  price50Minor,
  currency = "PLN",
  slots,
  slotsState = "ready",
  timeZone,
  now,
  action,
  onRedirect = (url) => window.location.assign(url),
  onRefreshSlots,
  createSubmissionId = defaultId,
}: RequestFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const submissionId = useRef<string | null>(null);
  const [length, setLength] = useState<SessionLength>(25);
  const [slotStart, setSlotStart] = useState<string | undefined>();
  const [menteeName, setMenteeName] = useState("");
  const [question, setQuestion] = useState("");
  const [errors, setErrors] = useState<FieldErrors<RequestField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [priceOverride, setPriceOverride] = useState<Partial<Record<SessionLength, number>>>({});
  const [pending, setPending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusFirstError(formRef, attempt);

  const price = priceOverride[length] ?? (length === 25 ? price25Minor : price50Minor);
  const blur = (field: RequestField) =>
    setErrors((current) => ({ ...current, [field]: validateRequest({ slotStart, menteeName, question }, "blur")[field] }));

  const changeLength = (next: SessionLength) => {
    setLength(next);
    if (slotStart && !slots.some((s) => s.startsAt === slotStart && s.lengthMinutes === next)) setSlotStart(undefined);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || redirecting) return; // double click → nothing (#17)
    const clientErrors = validateRequest({ slotStart, menteeName, question }, "submit");
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length > 0) {
      setAttempt((n) => n + 1);
      return;
    }
    submissionId.current ??= createSubmissionId();
    setPending(true);
    try {
      const result = await action({
        slug,
        submissionId: submissionId.current,
        lengthMinutes: length,
        slotStart: slotStart!,
        expectedAmountMinor: price,
        menteeName: menteeName.trim(),
        question: question.trim(),
      });
      if (result.ok) {
        setRedirecting(true);
        onRedirect(result.checkoutUrl);
        return;
      }
      if (result.code === "field") {
        setErrors(result.errors);
        setAttempt((n) => n + 1);
      } else if (result.code === "price_changed") {
        setPriceOverride((current) => ({ ...current, [length]: result.newAmountMinor }));
        setFormError("price_changed");
      } else {
        setFormError(result.code);
        if (result.code === "slot_taken" || result.code === "slot_not_offered") {
          setSlotStart(undefined);
          onRefreshSlots?.();
        }
      }
      // A retryable checkout failure reuses the same request; everything else starts a new attempt (#17).
      if (!(result.code === "checkout_failed" && result.retryable)) submissionId.current = null;
    } catch {
      setFormError("network");
    } finally {
      setPending(false);
    }
  };

  const formAlert =
    formError === "price_changed" ? (
      <Alert tone="danger" title={`Cena zmieniła się na ${formatMoney(price, currency)}`}>
        Cena zmieniła się w trakcie pisania pytania. Sprawdź kwotę na przycisku i wyślij jeszcze raz.
      </Alert>
    ) : formError ? (
      <Alert tone="danger" title={FORM_ERRORS[formError].title}>
        {FORM_ERRORS[formError].body}
      </Alert>
    ) : null;

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} aria-labelledby="request-title" className="flex flex-col gap-between-groups">
      <h2 id="request-title" className="text-heading-section font-strong">
        Zadaj pytanie
      </h2>
      <LengthToggle
        price25Minor={priceOverride[25] ?? price25Minor}
        price50Minor={priceOverride[50] ?? price50Minor}
        currency={currency}
        value={length}
        onValueChange={changeLength}
      />
      <SlotList
        slots={slots}
        length={length}
        timeZone={timeZone}
        now={now}
        state={slotsState}
        selectable
        value={slotStart}
        onValueChange={(value) => {
          setSlotStart(value);
          setErrors((current) => ({ ...current, slotStart: undefined }));
        }}
        error={errors.slotStart}
        headingId="request-slots-heading"
      />
      <FormField label="Imię" hint="Mentor zobaczy tylko imię." error={errors.menteeName}>
        <TextInput name="menteeName" autoComplete="given-name" value={menteeName} onChange={(e) => setMenteeName(e.target.value)} onBlur={() => blur("menteeName")} />
      </FormField>
      <FormField label="Twoje pytanie" hint="Mentor przeczyta je przed decyzją. Możesz wkleić kod." error={errors.question}>
        <Textarea
          name="question"
          rows={8}
          maxLength={QUESTION_MAX}
          placeholder="Co próbujesz zrobić, co już działa, a co nie?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onBlur={() => blur("question")}
        />
      </FormField>
      {formAlert}
      <div className="flex flex-col gap-in-group">
        <Button type="submit" variant="primary" fullWidth loading={pending || redirecting}>
          {payLabel(price, currency)}
        </Button>
        {redirecting ? <Spinner size="sm" label="Przekierowujemy do płatności…" className="text-meta" /> : null}
        <p className="text-meta text-muted">Płacisz z góry. Jeśli mentor odrzuci pytanie albo nie zdecyduje przed terminem, zwrot jest automatyczny.</p>
      </div>
    </form>
  );
}

/* -------------------------------------------------------- request page */

/** Refund words follow the data (#18): „zlecony” only when a refund exists. */
export function refundText(status: RefundStatus): { text: string; tone: StatusTone } | null {
  if (status === "requested") return { text: "Zwrot w toku", tone: "waiting" };
  if (status === "succeeded") return { text: "Zwrot wykonany", tone: "success" };
  if (status === "failed") return { text: "Zwrot nie powiódł się — napisz do nas", tone: "danger" };
  return null;
}

export type RequestStatusViewProps = {
  status: RequestStatus;
  refundStatus?: RefundStatus;
  amountMinor: number;
  currency?: string;
  slotStart: string;
  timeZone: string;
  now?: Date;
  /** Payment confirmation took longer than a minute (#17): show „Odśwież”. */
  pendingTimedOut?: boolean;
  onRefresh?: () => void;
};

/** The state is always the first thing on /r/{token} (R01.5, P18), in words (R01.6). */
export function RequestStatusView({
  status,
  refundStatus = null,
  amountMinor,
  currency = "PLN",
  slotStart,
  timeZone,
  now = new Date(),
  pendingTimedOut = false,
  onRefresh,
}: RequestStatusViewProps) {
  const amount = formatMoney(amountMinor, currency);
  const when = `${formatDay(slotStart, timeZone, now)} ${formatTime(slotStart, timeZone)}`;
  const refundRequested = refundStatus !== null;
  const map: Record<RequestStatus, { title: string; tone: StatusTone }> = {
    payment_pending: { title: "Czekamy na potwierdzenie płatności", tone: "waiting" },
    awaiting_mentor: { title: "Opłacone — czeka na mentora", tone: "waiting" },
    payment_failed: { title: "Płatność przerwana — nic nie pobrano", tone: "danger" },
    late_payment: { title: "Płatność dotarła za późno — zwrot zlecony", tone: "danger" },
    accepted: { title: `Zaakceptowane — sesja ${when} (czat tekstowy)`, tone: "success" },
    declined: {
      title: refundRequested
        ? `Mentor nie przyjmie tego pytania — zwrot ${amount} zlecony automatycznie`
        : `Mentor nie przyjmie tego pytania — zwrot ${amount} zostanie zlecony automatycznie`,
      tone: "neutral",
    },
    overdue: { title: "Termin minął — zwrot zostanie zlecony automatycznie", tone: "waiting" },
    lapsed: {
      title: refundRequested ? "Brak odpowiedzi mentora przed terminem — zwrot zlecony" : "Brak odpowiedzi mentora przed terminem — zwrot zostanie zlecony automatycznie",
      tone: "neutral",
    },
    cancelled: { title: refundRequested ? `Anulowane — zwrot ${amount} zlecony` : `Anulowane — zwrot ${amount} zostanie zlecony automatycznie`, tone: "neutral" },
    // #21: the outcome follows the data — no money wording before the session is settled.
    session_ended: { title: "Sesja zakończona — rozliczamy (zwykle do kilku minut)", tone: "waiting" },
    held: { title: "Sesja odbyta", tone: "success" },
    mentee_no_show: { title: "Brak Twojej wiadomości w czasie sesji — zgodnie z zasadami płatność zostaje u mentora", tone: "neutral" },
    mentor_no_show: {
      // A refund that finally failed (#24, 24 h or a dispute) is not „zlecony” any more: the line below says what to do.
      title: refundStatus === "failed"
        ? `Brak wiadomości od mentora w czasie sesji — zwrot ${amount} nie powiódł się automatycznie`
        : refundRequested
        ? `Brak wiadomości od mentora w czasie sesji — zwrot ${amount} zlecony automatycznie`
        : `Brak wiadomości od mentora w czasie sesji — zwrot ${amount} zostanie zlecony automatycznie`,
      tone: "neutral",
    },
  };
  const { title, tone } = map[status];
  const refund = refundText(refundStatus);
  return (
    <div className="flex flex-col gap-in-group" aria-live="polite">
      <h1 className="text-heading-page">
        <StatusText tone={tone} withIcon={status !== "payment_pending"}>
          {status === "payment_pending" ? (
            <span className="inline-flex items-center gap-in-group">
              <Spinner aria-hidden="true" />
              {title}
            </span>
          ) : (
            title
          )}
        </StatusText>
      </h1>
      {refund && status !== "awaiting_mentor" && status !== "accepted" ? <StatusText tone={refund.tone}>{refund.text}</StatusText> : null}
      {status === "payment_pending" && pendingTimedOut ? (
        <div className="flex flex-col items-start gap-in-group">
          <p className="text-muted">Potwierdzenie trwa dłużej niż zwykle. Nic nie zostanie pobrane dwa razy.</p>
          <Button variant="secondary" onClick={onRefresh}>
            Odśwież
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export type RequestSummaryProps = {
  lengthMinutes: SessionLength;
  slotStart: string;
  slotEnd: string;
  timeZone: string;
  amountMinor: number;
  currency?: string;
  now?: Date;
  /** Shown to the mentor only — first name, never the payer's e-mail (#17 Q5, #18). */
  menteeName?: string;
};

/** Slot in the viewer's zone with the zone name, length, amount (#17, #18). */
export function RequestSummary({ lengthMinutes, slotStart, slotEnd, timeZone, amountMinor, currency = "PLN", now = new Date(), menteeName }: RequestSummaryProps) {
  const items: { label: string; value: ReactNode }[] = [
    ...(menteeName ? [{ label: "Deweloper", value: menteeName }] : []),
    { label: "Termin", value: <><span className="font-mono">{formatSlotRange(slotStart, slotEnd, timeZone, now)}</span> <span className="text-muted">({timeZone})</span></> },
    { label: "Sesja", value: `${lengthMinutes} min, czat tekstowy` },
    { label: "Kwota", value: <Amount minor={amountMinor} currency={currency} /> },
  ];
  return <DescriptionList items={items} />;
}

/** The question as written: text paragraphs and ``` fenced code as CodeBlock (R01.2). */
export function QuestionText({ text, heading = "Pytanie" }: { text: string; heading?: string }) {
  const parts = text.split(/```[^\n]*\n?/);
  return (
    <section aria-label={heading} className="flex max-w-text flex-col gap-in-group">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <CodeBlock key={index} label={`Kod z pytania (${Math.ceil(index / 2)})`} code={part.replace(/\n$/, "")} />
        ) : part.trim() ? (
          <p key={index} className="whitespace-pre-line break-words">
            {part.trim()}
          </p>
        ) : null,
      )}
    </section>
  );
}

/** „Zapisz ten link” — main content of /r/{token}, not a footnote (#17). */
export function SaveLinkBox({ url }: { url: string }) {
  return (
    <Panel title="Zapisz ten link">
      <p className="max-w-text">Kopia jest też w e-mailu z potwierdzeniem. Przez ten link sprawdzisz stan zapytania albo je anulujesz.</p>
      <CopyField label="Link do zapytania" value={url} />
    </Panel>
  );
}

/** After an interrupted payment: the question in a box to copy, and „Wybierz inny termin” (#17 story 2). */
export function QuestionCopyBox({ question, pageHref }: { question: string; pageHref: string }) {
  const [message, setMessage] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(question);
      setMessage("Skopiowano.");
    } catch {
      setMessage("Nie udało się skopiować — zaznacz tekst i skopiuj go ręcznie (Ctrl+C).");
    }
  };
  return (
    <Panel title="Twoje pytanie">
      <QuestionText text={question} heading="Treść pytania" />
      <div className="flex flex-wrap items-center gap-in-group">
        <Button variant="secondary" onClick={copy}>
          <Copy aria-hidden="true" className="size-icon-md" />
          Kopiuj pytanie
        </Button>
        <Button asChild variant="primary">
          <a href={pageHref}>Wybierz inny termin</a>
        </Button>
      </div>
      <p aria-live="polite" className="text-meta text-muted">
        {message}
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------- cancel */

export type CancelResult =
  | { ok: true }
  | { ok: false; reason: "accepted" | "already_refunding" | "not_paid" | "not_found" };

export type CancelRequestProps = {
  amountMinor: number;
  currency?: string;
  /** `cancelRequest(token)` (#19). Throwing = no network. */
  action: () => Promise<CancelResult>;
  /** The page re-renders the state the server returned (cancelled, accepted, refunding). */
  onDone?: (result: CancelResult) => void;
};

/** „Anuluj i odzyskaj 150 zł”, only while the mentor has not accepted (#19, D05). */
export function CancelRequest({ amountMinor, currency = "PLN", action, onDone }: CancelRequestProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<null | "accepted" | "network">(null);
  const label = `Anuluj i odzyskaj ${formatMoney(amountMinor, currency)}`;
  const confirm = async () => {
    setPending(true);
    try {
      const result = await action();
      setOpen(false);
      if (!result.ok && result.reason === "accepted") setProblem("accepted");
      onDone?.(result);
    } catch {
      setOpen(false);
      setProblem("network");
    } finally {
      setPending(false);
    }
  };
  if (problem === "accepted") return <CancelNotPossible justAccepted />;
  return (
    <section aria-label="Anulowanie" className="flex flex-col items-start gap-in-group">
      {problem === "network" ? <Alert tone="danger" title={NETWORK_ACTION_MESSAGE} /> : null}
      <p className="text-meta text-muted">Możesz anulować, dopóki mentor nie zaakceptuje.</p>
      <ConfirmDialog
        trigger={<Button variant="secondary">{label}</Button>}
        open={open}
        onOpenChange={setOpen}
        loading={pending}
        title="Anulować zapytanie?"
        description={`Na pewno? Mentor nie zobaczy już tego pytania. Zwrot ${formatMoney(amountMinor, currency)} zlecimy automatycznie.`}
        confirmLabel={label}
        onConfirm={() => void confirm()}
      />
    </section>
  );
}

/**
 * After acceptance: why there is no cancel button (#19 story 2). `justAccepted`: the mentor accepted while this tab
 * still showed the button (race, #19 story 3) — the page keeps saying so after it re-renders as accepted.
 */
export function CancelNotPossible({ justAccepted = false }: { justAccepted?: boolean }) {
  if (justAccepted) {
    return <Alert tone="info" title="Pytanie zostało właśnie zaakceptowane — sesja się odbędzie">Anulowanie ze zwrotem nie jest już możliwe.</Alert>;
  }
  return <p className="text-muted">Pytanie zostało już przyjęte — anulowanie ze zwrotem nie jest już możliwe.</p>;
}

