"use client";

// E01 · #14, #15 — the mentor's side: navigation, invitation and sign-in, page editor,
// share link, availability editor and slot preview.

import { Plus, X } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { Alert } from "../../components/alert/Alert";
import { Button } from "../../components/button/Button";
import { CopyField } from "../../components/copy-field/CopyField";
import { FormField } from "../../components/form-field/FormField";
import { IconButton } from "../../components/icon-button/IconButton";
import { List, ListRow } from "../../components/list/List";
import { Panel } from "../../components/panel/Panel";
import { Select } from "../../components/select/Select";
import { StateMessage } from "../../components/state-message/StateMessage";
import { TextInput } from "../../components/text-input/TextInput";
import { TextLink } from "../../components/text-link/TextLink";
import { Textarea } from "../../components/textarea/Textarea";
import { cn } from "../../lib/cn";
import { NETWORK_MESSAGE, SERVER_MESSAGE, useFocusFirstError } from "../shared/form";
import { formatDay, formatTime } from "../shared/format";
import type { FieldErrors, OpenSlot } from "../shared/types";

/* ------------------------------------------------------------- navigation */

export type MentorSection = "requests" | "page" | "availability";

export type MentorNavProps = {
  current: MentorSection;
  /** Requests awaiting a decision — the only counter in the product (R01.6, P19). */
  pendingCount?: number;
  /** Paths; the defaults are the routes from the specs. */
  hrefs?: Partial<Record<MentorSection, string>>;
};

const NAV: { key: MentorSection; label: string; href: string }[] = [
  { key: "requests", label: "Zapytania", href: "/mentor/requests" },
  { key: "page", label: "Strona", href: "/mentor" },
  { key: "availability", label: "Dostępność", href: "/mentor/availability" },
];

/** „1 zapytanie czeka”, „2 zapytania czekają”, „5 zapytań czeka” na decyzję. */
export function pendingLabel(count: number) {
  const form = new Intl.PluralRules("pl-PL").select(count);
  if (form === "one") return `${count} zapytanie czeka na decyzję`;
  if (form === "few") return `${count} zapytania czekają na decyzję`;
  return `${count} zapytań czeka na decyzję`;
}

/** Top navigation of the mentor's three screens; no sidebar (R02.6, P22). */
export function MentorNav({ current, pendingCount = 0, hrefs }: MentorNavProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-in-group border-b border-divider px-page-gutter py-in-group">
      <span className="font-strong">DevMentor</span>
      <nav aria-label="Panel mentora">
        <ul className="flex flex-wrap gap-in-group">
          {NAV.map((item) => (
            <li key={item.key}>
              <a
                href={hrefs?.[item.key] ?? item.href}
                aria-current={item.key === current ? "page" : undefined}
                className={cn(
                  "inline-flex rounded-control px-in-group py-inline text-primary underline-offset-4 hover:underline",
                  "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
                  item.key === current && "font-strong underline decoration-2",
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {pendingCount > 0 ? (
        <a
          href={hrefs?.requests ?? "/mentor/requests"}
          className="rounded-control text-meta text-primary underline underline-offset-4 outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          {pendingLabel(pendingCount)}
        </a>
      ) : null}
    </header>
  );
}

/* ---------------------------------------------------- invitation, sign-in */

export type InvitationPanelProps = {
  kind: "invite" | "sign-in";
  /** Founder who sent the link (#14: "Founder X invited you"). */
  inviterName?: string;
  /** Link expiry as shown to the user, e.g. „2.11.2026, 19:00”. */
  expiresLabel: string;
  /** Server action; resolves when the user is signed in (the app then redirects to the editor). */
  onAccept: () => Promise<{ ok: true } | { ok: false }>;
};

/** One button, no form, no password, no bank fields (#14). A failed accept shows the neutral inactive message. */
export function InvitationPanel({ kind, inviterName, expiresLabel, onAccept }: InvitationPanelProps) {
  const [state, setState] = useState<"idle" | "pending" | "inactive" | "network">("idle");
  if (state === "inactive") return <AccessMessage kind="inactive-link" />;
  const accept = async () => {
    if (state === "pending") return;
    setState("pending");
    try {
      const result = await onAccept();
      setState(result.ok ? "pending" : "inactive");
    } catch {
      setState("network");
    }
  };
  return (
    <section aria-labelledby="invitation-title" className="flex max-w-text flex-col items-start gap-between-groups">
      <div className="flex flex-col gap-in-group">
        <h1 id="invitation-title" className="text-heading-page font-strong">
          {kind === "invite" ? `${inviterName ?? "Zespół DevMentora"} zaprasza cię do DevMentora` : "Zaloguj się do DevMentora"}
        </h1>
        <p className="text-meta text-muted">Link ważny do {expiresLabel}.</p>
      </div>
      {state === "network" ? <Alert tone="danger" title={NETWORK_MESSAGE} /> : null}
      <Button variant="primary" loading={state === "pending"} onClick={accept}>
        {kind === "invite" ? "Akceptuję zaproszenie" : "Zaloguj"}
      </Button>
    </section>
  );
}

export type AccessMessageProps = { kind: "inactive-link" | "invitation-only" };

/** Neutral messages for links that do not work and for /mentor without a session — never which reason (#14). */
export function AccessMessage({ kind }: AccessMessageProps) {
  return kind === "inactive-link" ? (
    <StateMessage kind="not-found" titleAs="h1" title="Ten link jest nieaktywny — poproś zespół o nowy" />
  ) : (
    <StateMessage kind="not-found" titleAs="h1" title="Dostęp tylko przez zaproszenie — poproś zespół o link do logowania" />
  );
}

/* ------------------------------------------------------------ page editor */

export type MentorPageValues = {
  displayName: string;
  publicWorkUrl: string;
  description: string;
  price25: string;
  price50: string;
  slug: string;
};
type PageField = keyof MentorPageValues;

export type SaveMentorPageResult =
  | { ok: true; shareUrl?: string }
  | { ok: false; errors?: FieldErrors<PageField>; code?: "server_error" };

export type MentorPageFormProps = {
  initial: MentorPageValues;
  /** Already published: the slug is locked and the main button saves changes (#14). */
  published?: boolean;
  /** Origin of the share link, from NEXT_PUBLIC_APP_URL. */
  baseUrl: string;
  /** `saveMentorPage(fields, { publish })` (#14). Throwing = no network. */
  action: (values: MentorPageValues, options: { publish: boolean }) => Promise<SaveMentorPageResult>;
};

/** Spec #14 validation, run in the browser too so the mentor sees it on blur. */
export function validateMentorPage(values: MentorPageValues, mode: "blur" | "publish"): FieldErrors<PageField> {
  const errors: FieldErrors<PageField> = {};
  const filled = (v: string) => v.trim().length > 0;
  const check = (field: PageField, ok: boolean, message: string) => {
    if ((mode === "publish" || filled(values[field])) && !ok) errors[field] = message;
  };
  const name = values.displayName.trim();
  check("displayName", name.length >= 2 && name.length <= 80, "Wpisz imię i nazwisko (od 2 do 80 znaków)");
  if (mode === "publish" && !filled(values.publicWorkUrl)) errors.publicWorkUrl = "Dodaj link do publicznej pracy";
  else check("publicWorkUrl", /^https?:\/\/\S+$/.test(values.publicWorkUrl.trim()) && values.publicWorkUrl.length <= 500, "Link musi zaczynać się od https:// albo http://");
  check("description", filled(values.description) && values.description.length <= 2000, "Opisz swoje doświadczenie (do 2000 znaków)");
  for (const field of ["price25", "price50"] as const) {
    const n = Number(values[field]);
    check(field, /^\d+$/.test(values[field].trim()) && n >= 20 && n <= 5000, "Podaj cenę od 20 do 5000 zł, bez groszy");
  }
  check("slug", /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(values.slug), "Adres: 3–40 znaków — małe litery, cyfry i myślniki");
  return errors;
}

/** „Anna K.” → „anna-k” (suggested link, #14). */
export function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** The one editor of the mentor's page: five fields + link, Save draft and Publish (#14). */
export function MentorPageForm({ initial, published: initiallyPublished = false, baseUrl, action }: MentorPageFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<PageField>>({});
  const [published, setPublished] = useState(initiallyPublished);
  const [slugTouched, setSlugTouched] = useState(initiallyPublished || initial.slug !== "");
  const [pending, setPending] = useState<null | "draft" | "publish">(null);
  const [outcome, setOutcome] = useState<"none" | "draft-saved" | "changes-saved" | "server" | "network">("none");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusFirstError(formRef, attempt);

  const set = (field: PageField, value: string) => {
    setValues((current) => {
      const next = { ...current, [field]: value };
      if (field === "displayName" && !slugTouched && !published) next.slug = slugify(value);
      return next;
    });
  };
  const blur = (field: PageField) => {
    const fieldError = validateMentorPage(values, "blur")[field];
    setErrors((current) => ({ ...current, [field]: fieldError }));
  };

  const submit = async (publish: boolean) => {
    if (pending) return;
    // Publishing, and any save after publishing, must keep the page publishable (#14).
    const mustBeComplete = publish || published;
    const clientErrors = validateMentorPage(values, mustBeComplete ? "publish" : "blur");
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setAttempt((n) => n + 1);
      return;
    }
    setPending(publish ? "publish" : "draft");
    setOutcome("none");
    try {
      const result = await action(values, { publish });
      if (result.ok) {
        setErrors({});
        if (publish && !published) {
          setPublished(true);
          setShareUrl(result.shareUrl ?? `${baseUrl}/m/${values.slug}`);
        } else {
          setOutcome(published ? "changes-saved" : "draft-saved");
        }
      } else if (result.errors && Object.keys(result.errors).length > 0) {
        setErrors(result.errors);
        setAttempt((n) => n + 1);
      } else {
        setOutcome("server");
      }
    } catch {
      setOutcome("network");
    } finally {
      setPending(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(true);
  };

  return (
    <div className="flex max-w-text flex-col gap-between-groups">
      {shareUrl ? <ShareLinkPanel shareUrl={shareUrl} /> : null}
      <form ref={formRef} noValidate onSubmit={onSubmit} aria-labelledby="editor-title" className="flex flex-col gap-between-groups">
        <h1 id="editor-title" className="text-heading-page font-strong">
          Twoja strona
        </h1>
        {outcome === "server" ? <Alert tone="danger" title={SERVER_MESSAGE} /> : null}
        {outcome === "network" ? <Alert tone="danger" title={NETWORK_MESSAGE} /> : null}
        {outcome === "draft-saved" ? <Alert tone="success" title="Szkic zapisany — strona nie jest jeszcze widoczna" /> : null}
        {outcome === "changes-saved" ? <Alert tone="success" title="Zmiany są już na twojej stronie — link się nie zmienił" /> : null}

        <FormField label="Imię i nazwisko" hint="Tak zobaczy cię deweloper, np. Anna K." error={errors.displayName}>
          <TextInput name="displayName" autoComplete="name" value={values.displayName} onChange={(e) => set("displayName", e.target.value)} onBlur={() => blur("displayName")} />
        </FormField>
        <FormField label="Link do publicznej pracy" hint="GitHub, blog albo prezentacja — deweloper zobaczy pełny adres." error={errors.publicWorkUrl}>
          <TextInput name="publicWorkUrl" type="url" inputMode="url" placeholder="https://github.com/annak" value={values.publicWorkUrl} onChange={(e) => set("publicWorkUrl", e.target.value)} onBlur={() => blur("publicWorkUrl")} />
        </FormField>
        <FormField label="Twoje doświadczenie" hint="Np. upgrade ingress-nginx do 1.28, migracja do TypeScript 5. Prostym językiem, bez ocen i opinii." error={errors.description}>
          <Textarea name="description" rows={5} maxLength={2000} value={values.description} onChange={(e) => set("description", e.target.value)} onBlur={() => blur("description")} />
        </FormField>
        <div className="flex flex-wrap gap-between-groups">
          <FormField label="Cena za 25 min" hint="Tyle zapłaci deweloper." error={errors.price25} className="min-w-0 flex-1 basis-0">
            <TextInput name="price25" inputMode="numeric" suffix="zł" value={values.price25} onChange={(e) => set("price25", e.target.value)} onBlur={() => blur("price25")} />
          </FormField>
          <FormField label="Cena za 50 min" hint="Tyle zapłaci deweloper." error={errors.price50} className="min-w-0 flex-1 basis-0">
            <TextInput name="price50" inputMode="numeric" suffix="zł" value={values.price50} onChange={(e) => set("price50", e.target.value)} onBlur={() => blur("price50")} />
          </FormField>
        </div>
        <FormField
          label="Adres strony"
          hint={published ? "Adresu nie można zmienić po publikacji." : `Pełny link: ${baseUrl}/m/${values.slug || "…"}`}
          error={errors.slug}
        >
          <TextInput
            name="slug"
            className="font-mono"
            readOnly={published}
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
            onBlur={() => blur("slug")}
          />
        </FormField>

        <div className="flex flex-wrap gap-in-group">
          <Button type="submit" variant="primary" loading={pending === "publish"}>
            {published ? "Zapisz zmiany" : "Opublikuj stronę"}
          </Button>
          {!published ? (
            <Button variant="secondary" loading={pending === "draft"} onClick={() => void submit(false)}>
              Zapisz szkic
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------- share link */

/** After publishing: the link, „Kopiuj link”, and where to paste it; focus moves here (#14). */
export function ShareLinkPanel({ shareUrl }: { shareUrl: string }) {
  return (
    <Panel title="Strona opublikowana">
      <CopyField label="Twój link" value={shareUrl} hint="Wklej go tam, gdzie ludzie już cię pytają." autoFocus />
    </Panel>
  );
}

/** Editor banner when there is no availability (#15 story 3). */
export function NoAvailabilityNotice({ href = "/mentor/availability" }: { href?: string }) {
  return (
    <Alert
      tone="info"
      title="Nie masz dostępności — nikt nie może wybrać terminu"
      action={<TextLink href={href}>Dodaj dostępność</TextLink>}
    />
  );
}

/* ------------------------------------------------------------ availability */

export const WEEKDAYS = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"] as const;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type AvailabilityWindow = { weekday: Weekday; start: string; end: string };

export type SaveAvailabilityResult = { ok: true; preview: OpenSlot[] } | { ok: false };

export type AvailabilityEditorProps = {
  /** Saved zone (prefilled from the browser on first visit, #15). */
  timeZone: string;
  /** Zones to choose from, grouped by region. */
  zones: { label: string; options: { value: string; label: string }[] }[];
  windows: AvailabilityWindow[];
  /** `saveAvailability` — replaces the whole set atomically and returns the next offered slots (#15). */
  action: (input: { timeZone: string; windows: AvailabilityWindow[] }) => Promise<SaveAvailabilityResult>;
  /** Preview shown on load (the next 10 offered slots). */
  preview?: OpenSlot[];
  now?: Date;
};

/** 00:00 … 24:00 in 30-minute steps (#15). */
const TIMES = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** Weekly windows in the mentor's zone: day rows, „+ okno”, start/end in 30-minute steps, Save (#15). */
export function AvailabilityEditor({ timeZone: savedZone, zones, windows: savedWindows, action, preview: initialPreview = [], now = new Date() }: AvailabilityEditorProps) {
  const [timeZone, setTimeZone] = useState(savedZone);
  const [windows, setWindows] = useState(savedWindows);
  const [preview, setPreview] = useState(initialPreview);
  const [savedCount, setSavedCount] = useState(savedWindows.length);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<"none" | "saved" | "server" | "network">("none");
  const zoneChanged = timeZone !== savedZone && savedCount > 0;

  const update = (index: number, patch: Partial<AvailabilityWindow>) =>
    setWindows((list) =>
      list.map((w, i) => {
        if (i !== index) return w;
        const next = { ...w, ...patch };
        // The end can never be before the start: the end options start 30 minutes later (#15).
        if (next.end <= next.start) next.end = TIMES[TIMES.indexOf(next.start) + 1] ?? "24:00";
        return next;
      }),
    );

  const save = async () => {
    if (pending) return;
    setPending(true);
    setOutcome("none");
    try {
      const result = await action({ timeZone, windows });
      if (result.ok) {
        setPreview(result.preview);
        setSavedCount(windows.length);
        setOutcome("saved");
      } else setOutcome("server");
    } catch {
      setOutcome("network");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex max-w-text flex-col gap-between-groups">
      <h1 className="text-heading-page font-strong">Dostępność</h1>
      {savedCount === 0 ? <NoAvailabilityNotice href="#windows" /> : null}
      {outcome === "server" ? <Alert tone="danger" title="Nie udało się zapisać dostępności — spróbuj ponownie">Twoje okna zostały na ekranie.</Alert> : null}
      {outcome === "network" ? <Alert tone="danger" title={NETWORK_MESSAGE} /> : null}

      <FormField label="Strefa czasowa" hint="Godziny okien są w tej strefie.">
        <Select name="timeZone" groups={zones} value={timeZone} onValueChange={setTimeZone} />
      </FormField>
      {zoneChanged ? <Alert tone="info" title="Okna zachowają godziny (np. 18:00) w nowej strefie">Nic się nie zmieni, dopóki nie zapiszesz.</Alert> : null}

      <List id="windows" aria-label="Okna w tygodniu">
        {WEEKDAYS.map((day, weekday) => {
          const dayWindows = windows.map((w, index) => ({ w, index })).filter(({ w }) => w.weekday === weekday);
          return (
            <li key={day} className="flex flex-col gap-in-group border-b border-divider py-list-row-y">
              <div className="flex flex-wrap items-center justify-between gap-in-group">
                <span className="font-strong">{day}</span>
                <Button
                  variant="secondary"
                  aria-label={`Dodaj okno: ${day}`}
                  onClick={() => setWindows((list) => [...list, { weekday: weekday as Weekday, start: "18:00", end: "20:00" }])}
                >
                  <Plus aria-hidden="true" className="size-icon-sm" />
                  okno
                </Button>
              </div>
              {dayWindows.length === 0 ? <span className="text-meta text-muted">Brak okien</span> : null}
              {dayWindows.map(({ w, index }) => (
                <div key={index} className="flex flex-wrap items-center gap-in-group">
                  <div className="min-w-0 flex-1 basis-0">
                    <Select aria-label={`${day}, od`} options={TIMES.slice(0, -1).map((t) => ({ value: t, label: t }))} value={w.start} onValueChange={(start) => update(index, { start })} />
                  </div>
                  <span aria-hidden="true">–</span>
                  <div className="min-w-0 flex-1 basis-0">
                    <Select aria-label={`${day}, do`} options={TIMES.filter((t) => t > w.start).map((t) => ({ value: t, label: t }))} value={w.end} onValueChange={(end) => update(index, { end })} />
                  </div>
                  <IconButton label={`Usuń okno ${day} ${w.start}–${w.end}`} icon={<X />} onClick={() => setWindows((list) => list.filter((_, i) => i !== index))} />
                </div>
              ))}
            </li>
          );
        })}
      </List>

      <div>
        <Button variant="primary" loading={pending} onClick={save}>
          {zoneChanged ? "Zapisz i zmień strefę" : "Zapisz"}
        </Button>
      </div>
      {outcome === "saved" ? <Alert tone="success" title="Dostępność zapisana" /> : null}
      <SlotPreview slots={preview} timeZone={timeZone} now={now} />
    </div>
  );
}

/* --------------------------------------------------------------- preview */

export type SlotPreviewProps = { slots: OpenSlot[]; timeZone: string; now?: Date; limit?: number };

/** The next offered slots in the mentor's zone, with the lengths that fit (#15). */
export function SlotPreview({ slots, timeZone, now = new Date(), limit = 10 }: SlotPreviewProps) {
  const starts = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const slot of slots) map.set(slot.startsAt, [...(map.get(slot.startsAt) ?? []), slot.lengthMinutes]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, limit);
  }, [slots, limit]);
  return (
    <section aria-labelledby="preview-heading" className="flex flex-col gap-in-group">
      <h2 id="preview-heading" className="text-heading-section font-strong">
        Najbliższe terminy
      </h2>
      {starts.length === 0 ? (
        <p className="text-muted">Nie masz dostępności — nikt nie może wybrać terminu.</p>
      ) : (
        <List aria-label="Najbliższe terminy">
          {starts.map(([startsAt, lengths]) => (
            <ListRow
              key={startsAt}
              title={
                <>
                  {formatDay(startsAt, timeZone, now)} <span className="font-mono">{formatTime(startsAt, timeZone)}</span>
                </>
              }
              meta={lengths.length === 2 ? "25 lub 50 min" : `tylko ${lengths[0]} min`}
            />
          ))}
        </List>
      )}
    </section>
  );
}
