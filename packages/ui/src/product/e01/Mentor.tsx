"use client";

// E01 · #14, #15 — the mentor's side: navigation, invitation and sign-in, page editor,
// share link, availability editor and slot preview.

import { CircleAlert, Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";

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
import {
  DESCRIPTION_MAX,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  normalizeDescription,
  normalizeDisplayName,
  publicWorkUrlProblem,
  textLength,
} from "../../lib/text.mjs";
import { isNavigationError, NETWORK_ACTION_MESSAGE, NETWORK_MESSAGE, SERVER_MESSAGE } from "../shared/form";
import { useFocusFirstError } from "../shared/use-focus-first-error";
import { formatDay, formatTime } from "../shared/format";
import type { FieldErrors, OpenSlot } from "../shared/types";

/* ------------------------------------------------------------- navigation */

export type MentorSection = "requests" | "page" | "availability";

export type MentorNavProps = {
  /** The screen the mentor is on; omit on screens that are not in the navigation yet (A2). */
  current?: MentorSection;
  /** Requests awaiting a decision — the only counter in the product (R01.6, P19). */
  pendingCount?: number;
  /** Paths; the defaults are the routes from the specs. */
  hrefs?: Partial<Record<MentorSection, string>>;
  /**
   * Items to show, always in the fixed order „Zapytania”, „Strona”, „Dostępność”; default: all three.
   * E01 without E02 shows no „Zapytania” and no counter (gap D2, spec #14 L10/Z11).
   */
  sections?: MentorSection[];
  /**
   * Server action that ends the session (`signOut()`, spec #14). When given, „Wyloguj” is shown as the
   * last item (gap D3, L7). Throwing = no network; a framework redirect is a navigation, not an error.
   */
  signOutAction?: () => Promise<void>;
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
export function MentorNav({ current, pendingCount = 0, hrefs, sections, signOutAction }: MentorNavProps) {
  const items = sections ? NAV.filter((item) => sections.includes(item.key)) : NAV;
  const showCounter = pendingCount > 0 && items.some((item) => item.key === "requests");
  return (
    <header className="flex flex-wrap items-center justify-between gap-in-group border-b border-divider px-page-gutter py-in-group">
      <span className="font-strong">DevMentor</span>
      <nav aria-label="Panel mentora">
        <ul className="flex flex-wrap gap-in-group">
          {items.map((item) => (
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
          {signOutAction ? (
            <li>
              <SignOutControl action={signOutAction} />
            </li>
          ) : null}
        </ul>
      </nav>
      {showCounter ? (
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

/** „Wyloguj”: a form with one submit button (keyboard: Tab + Enter/Space); no network → inline message (C6). */
function SignOutControl({ action }: { action: () => Promise<void> }) {
  const [state, setState] = useState<"idle" | "pending" | "network">("idle");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state === "pending") return;
    setState("pending");
    try {
      await action();
      setState("idle");
    } catch (error) {
      // The app redirects after signing out (s03): keep the pending state while the router navigates.
      if (!isNavigationError(error)) setState("network");
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-in-group">
      <Button type="submit" variant="secondary" loading={state === "pending"}>
        Wyloguj
      </Button>
      {state === "network" ? (
        <p role="alert" className="text-meta text-status-danger">
          {NETWORK_ACTION_MESSAGE}
        </p>
      ) : null}
    </form>
  );
}

/* ---------------------------------------------------- invitation, sign-in */

export type InvitationPanelProps = {
  kind: "invite" | "sign-in";
  /** Link expiry as shown to the user, e.g. „2.11.2026, 19:00”. */
  expiresLabel: string;
  /**
   * Server action. `{ ok: false }` → the neutral inactive-link message. On success the app navigates to the
   * editor — either the action calls `redirect()` (the rejected promise is treated as navigation, the button
   * stays busy) or it resolves `{ ok: true }` and the app navigates itself. Throwing = no network (C6, Z28).
   */
  onAccept: () => Promise<{ ok: true } | { ok: false }>;
};

/**
 * One button, no form, no password, no bank fields (#14). The invitation never names a person: always
 * „Zespół DevMentora zaprasza cię do DevMentora” (L2, Z2). A failed accept shows the neutral inactive message.
 */
export function InvitationPanel({ kind, expiresLabel, onAccept }: InvitationPanelProps) {
  const [state, setState] = useState<"idle" | "pending" | "inactive" | "network">("idle");
  if (state === "inactive") return <AccessMessage kind="inactive-link" />;
  const accept = async () => {
    if (state === "pending") return;
    setState("pending");
    try {
      const result = await onAccept();
      setState(result.ok ? "pending" : "inactive");
    } catch (error) {
      if (!isNavigationError(error)) setState("network");
    }
  };
  return (
    <section aria-labelledby="invitation-title" className="flex max-w-text flex-col items-start gap-between-groups">
      <div className="flex flex-col gap-in-group">
        <h1 id="invitation-title" className="text-heading-page font-strong">
          {kind === "invite" ? "Zespół DevMentora zaprasza cię do DevMentora" : "Zaloguj się do DevMentora"}
        </h1>
        <p className="text-meta text-muted">Link ważny do {expiresLabel}.</p>
      </div>
      {state === "network" ? <Alert tone="danger" title={NETWORK_ACTION_MESSAGE} /> : null}
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
  | { ok: false; errors?: FieldErrors<PageField>; code?: "server_error" }
  /** No session any more (expired or revoked, spec #14 L6/Z7): nothing saved, the input stays (gap D5). */
  | { ok: false; reason: "unauthorized" };

/** Shown when a save is refused because the session expired or was revoked (spec #14 L6, Z7). */
export const SESSION_EXPIRED_MESSAGE = "Sesja wygasła — poproś zespół o link do logowania";

/** Why „Twoje doświadczenie” exists, directly under its label (spec #14 Q13, F1). */
export const DESCRIPTION_HINT =
  "Deweloper zobaczy to na twojej stronie zamiast ocen. Wpisz konkretne rzeczy, które masz za sobą, np. upgrade ingress-nginx do 1.28 w trzech klastrach, migracja 40 tys. linii do TypeScript 5.";

/** „Cena za 25 min (zł)” — the unit comes from one formatter of `mentor_pages.currency` (spec #14 F2). */
export function priceLabel(minutes: 25 | 50, currencyLabel = "zł") {
  return `Cena za ${minutes} min (${currencyLabel})`;
}

export type MentorPageFormProps = {
  initial: MentorPageValues;
  /** Already published: the slug is locked and the main button saves changes (#14). */
  published?: boolean;
  /**
   * `initial.slug` is the random draft placeholder (`mentor-xxxxxx`, spec #14 Q6): the field shows it, and the
   * suggestion from the name overwrites it until the mentor edits the field by hand (L9, Z10; gap D4).
   * Without this flag a non-empty starting slug counts as chosen by the mentor.
   */
  slugIsPlaceholder?: boolean;
  /**
   * Share link of an already published page (gap D6): shown above the form on every visit without moving
   * focus; focus moves to the link only right after publishing (L8, Z9).
   */
  shareUrl?: string | null;
  /** Origin of the share link, from NEXT_PUBLIC_APP_URL. */
  baseUrl: string;
  /**
   * A notice under the heading, above the share panel and the form — `<NoAvailabilityNotice />` while the
   * mentor has no availability windows (#15 story 3; P4, Z40: the notice first, then the share panel).
   */
  notice?: ReactNode;
  /** Unit of the prices from one formatter of the page currency (PLN → „zł”): labels and suffix (F2). */
  currencyLabel?: string;
  /**
   * `saveMentorPage(fields, { publish })` (#14). `{ ok: false, reason: "unauthorized" }` → the session alert,
   * input kept, no redirect (D5). Throwing = no network.
   */
  action: (values: MentorPageValues, options: { publish: boolean }) => Promise<SaveMentorPageResult>;
};

/** Slug of `/m/{slug}`: 3–40 characters, lowercase letters, digits, hyphens not at the edges (#23). */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/**
 * Spec #14 validation, run in the browser too so the mentor sees it on blur. The messages are the server's
 * (`lib/mentor-page/validate.mjs`, `MESSAGES`) word for word; lengths (Unicode code points), the name and
 * description normalisation and the link rule come from the module the server uses too (`src/lib/text.mjs`,
 * `@devmentor/ui/text`), so both sides accept exactly the same input.
 */
export function validateMentorPage(values: MentorPageValues, mode: "blur" | "publish"): FieldErrors<PageField> {
  const errors: FieldErrors<PageField> = {};
  const filled = (v: string) => v.trim().length > 0;
  const check = (field: PageField, ok: boolean, message: string) => {
    if ((mode === "publish" || filled(values[field])) && !ok) errors[field] = message;
  };
  const nameLength = textLength(normalizeDisplayName(values.displayName));
  check("displayName", nameLength >= DISPLAY_NAME_MIN && nameLength <= DISPLAY_NAME_MAX, "Wpisz imię i nazwisko (od 2 do 80 znaków)");
  const url = values.publicWorkUrl.trim();
  const urlProblem = filled(url) ? publicWorkUrlProblem(url) : null;
  if (mode === "publish" && !filled(url)) errors.publicWorkUrl = "Dodaj link do publicznej pracy";
  else if (urlProblem === "tooLong") errors.publicWorkUrl = "Link może mieć najwyżej 500 znaków";
  else if (urlProblem === "invalid") errors.publicWorkUrl = "Link musi zaczynać się od https:// albo http://";
  const description = normalizeDescription(values.description);
  check("description", description !== "" && textLength(description) <= DESCRIPTION_MAX, "Opisz swoje doświadczenie (do 2000 znaków)");
  const priceMessages = {
    price25: "Podaj cenę za 25 min od 20 do 5000 zł, bez groszy",
    price50: "Podaj cenę za 50 min od 20 do 5000 zł, bez groszy",
  } as const;
  for (const field of ["price25", "price50"] as const) {
    const price = values[field].trim();
    const n = Number(price);
    check(field, /^\d+$/.test(price) && n >= 20 && n <= 5000, priceMessages[field]);
  }
  // The slug is always required (a draft has the placeholder), as on the server.
  if (!SLUG_PATTERN.test(values.slug.trim())) errors.slug = "Adres: 3–40 znaków — małe litery, cyfry i myślniki";
  return errors;
}

/** „Anna K.” → „anna-k” (suggested link, #14); the same rules as the server's `slugFromName`. */
export function slugify(name: string) {
  return name
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** The one editor of the mentor's page: five fields + link, Save draft and Publish (#14). */
export function MentorPageForm({
  initial,
  published: initiallyPublished = false,
  slugIsPlaceholder = false,
  shareUrl: savedShareUrl = null,
  baseUrl,
  currencyLabel = "zł",
  notice,
  action,
}: MentorPageFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<PageField>>({});
  const [published, setPublished] = useState(initiallyPublished);
  const [slugTouched, setSlugTouched] = useState(initiallyPublished || (!slugIsPlaceholder && initial.slug !== ""));
  const [placeholderSlug] = useState(slugIsPlaceholder ? initial.slug : "");
  const [pending, setPending] = useState<null | "draft" | "publish">(null);
  const [outcome, setOutcome] = useState<"none" | "draft-saved" | "changes-saved" | "server" | "network" | "unauthorized">("none");
  // Set only right after publishing in this visit: the panel then takes focus (L8, Z9).
  const [publishedNowUrl, setPublishedNowUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusFirstError(formRef, attempt);

  const shareUrl = publishedNowUrl ?? (initiallyPublished ? savedShareUrl : null);
  const fullUrl = shareUrl ?? `${baseUrl}/m/${values.slug || "…"}`;

  const set = (field: PageField, value: string) => {
    setValues((current) => {
      const next = { ...current, [field]: value };
      if (field === "displayName" && !slugTouched && !published) {
        // The suggestion replaces the placeholder; until it is a valid address the placeholder stays (Q6).
        const suggestion = slugify(value);
        next.slug = placeholderSlug && !SLUG_PATTERN.test(suggestion) ? placeholderSlug : suggestion;
      }
      return next;
    });
    // A shown error disappears as soon as the value is fixed — not on blur, where the layout would shift
    // under a click on „Opublikuj stronę” and the click would miss the button.
    if (errors[field] && !validateMentorPage({ ...values, [field]: value }, "blur")[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
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
          setPublishedNowUrl(result.shareUrl ?? `${baseUrl}/m/${values.slug}`);
        } else {
          setOutcome(published ? "changes-saved" : "draft-saved");
        }
      } else if ("reason" in result) {
        setOutcome("unauthorized");
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
      <h1 id="editor-title" className="text-heading-page font-strong">
        Twoja strona
      </h1>
      {notice}
      {shareUrl ? <ShareLinkPanel shareUrl={shareUrl} autoFocus={publishedNowUrl !== null} /> : null}
      <form ref={formRef} noValidate onSubmit={onSubmit} aria-labelledby="editor-title" className="flex flex-col gap-between-groups">
        {outcome === "unauthorized" ? <Alert tone="danger" title={SESSION_EXPIRED_MESSAGE} /> : null}
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
        <FormField label="Twoje doświadczenie" hint={DESCRIPTION_HINT} hintPlacement="label" error={errors.description}>
          <Textarea name="description" rows={5} maxLength={2000} value={values.description} onChange={(e) => set("description", e.target.value)} onBlur={() => blur("description")} />
        </FormField>
        <div className="flex flex-wrap gap-between-groups">
          <FormField label={priceLabel(25, currencyLabel)} hint="Tyle zapłaci deweloper." error={errors.price25} className="min-w-0 flex-1 basis-0">
            <TextInput name="price25" inputMode="numeric" suffix={currencyLabel} value={values.price25} onChange={(e) => set("price25", e.target.value)} onBlur={() => blur("price25")} />
          </FormField>
          <FormField label={priceLabel(50, currencyLabel)} hint="Tyle zapłaci deweloper." error={errors.price50} className="min-w-0 flex-1 basis-0">
            <TextInput name="price50" inputMode="numeric" suffix={currencyLabel} value={values.price50} onChange={(e) => set("price50", e.target.value)} onBlur={() => blur("price50")} />
          </FormField>
        </div>
        <FormField
          label="Adres strony"
          hint={published ? `Pełny link: ${fullUrl}. Adresu nie można zmienić po publikacji.` : `Pełny link: ${fullUrl}`}
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

export type ShareLinkPanelProps = {
  shareUrl: string;
  /**
   * Move focus to the link when the panel appears — only right after publishing (L8, Z9). An already published
   * page shows the panel on every visit without moving focus. Default `true` (the moment of publishing).
   */
  autoFocus?: boolean;
};

/** The share link of a published page, „Kopiuj link”, and where to paste it (#14). */
export function ShareLinkPanel({ shareUrl, autoFocus = true }: ShareLinkPanelProps) {
  return (
    <Panel title="Strona opublikowana">
      <CopyField label="Twój link" value={shareUrl} hint="Wklej go tam, gdzie ludzie już cię pytają." autoFocus={autoFocus} />
    </Panel>
  );
}

/**
 * Editor banner when there is no availability (#15 story 3), on `/mentor` (also on a draft at the first visit,
 * L20/Z21) and on `/mentor/availability`. On `/mentor` it sits above the share panel (P4, Z40) — pass it as
 * `MentorPageForm notice`. `href={null}` drops the „Dodaj dostępność” link — on `/mentor/availability` itself
 * it would lead to the same page.
 */
export function NoAvailabilityNotice({ href = "/mentor/availability" }: { href?: string | null }) {
  return (
    <Alert
      tone="info"
      title="Nie masz dostępności — nikt nie może wybrać terminu"
      action={href ? <TextLink href={href}>Dodaj dostępność</TextLink> : undefined}
    />
  );
}

/* ------------------------------------------------------------ availability */

/**
 * Day names in the editor's order. **Indexing: 0–6, Monday = 0** (`AvailabilityWindow.weekday`). The spec and
 * the database use ISO 1–7 (Monday = 1): the app maps `iso = weekday + 1` both ways (gap D8).
 */
export const WEEKDAYS = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"] as const;
/** 0–6, Monday = 0 (ISO weekday − 1; gap D8). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** One weekly window: `weekday` 0–6 (Monday = 0), `start`/`end` „HH:MM” in 30-minute steps, end up to „24:00”. */
export type AvailabilityWindow = { weekday: Weekday; start: string; end: string };

/** Most windows in a week (#15 L16, Z17). */
export const MAX_WINDOWS = 21;
/** Why „+ okno” is unavailable at the limit, and the server's message for a set over it (L16, Z17). */
export const MAX_WINDOWS_MESSAGE = "Maksymalnie 21 okien w tygodniu";
/** Zone used when the browser gives no zone or one that is not on the list (#15 Q2, L15, Z16). */
export const DEFAULT_TIME_ZONE = "Europe/Warsaw";
/** Shown when the zone of a saved set changes — nothing changes until saved (#15, 15-A4, Z27). */
export const ZONE_CHANGE_WARNING = "Okna zachowają godziny (np. 18:00) w nowej strefie";

/**
 * Field errors of `saveAvailability` (#15): `timeZone` (at the zone field), `windows` (the whole set, e.g.
 * „Maksymalnie 21 okien w tygodniu”, under the list) and `windows.<i>` (the window at index i of the sent list,
 * at its row via `aria-describedby`, never a separate „Błąd” column — W4, Z26).
 */
export type AvailabilityErrors = Partial<Record<"timeZone" | "windows" | `windows.${number}`, string>>;

export type SaveAvailabilityResult =
  | { ok: true; preview: OpenSlot[] }
  /** Nothing saved: field errors at their place, or (without `errors`) a server error. The set stays on screen. */
  | { ok: false; errors?: AvailabilityErrors; code?: "server_error" }
  /** No session any more (L6, Z7): nothing saved, the set stays, `SESSION_EXPIRED_MESSAGE`, no redirect (gap D5). */
  | { ok: false; reason: "unauthorized" };

export type TimeZoneGroup = { label: string; options: { value: string; label: string }[] };

export type AvailabilityEditorProps = {
  /**
   * Saved zone, or `null` when the mentor has never saved availability: then the browser zone is prefilled
   * (`Intl.DateTimeFormat().resolvedOptions().timeZone`, matched to a list option), and a missing zone or one
   * not on the list falls back to `defaultTimeZone` — the field stays visible for a change (#15 Q2, Z16).
   */
  timeZone: string | null;
  /**
   * Zones to choose from, grouped by region. Values must be the names the server accepts (the app passes its
   * canonical list); a browser alias (e.g. „Europe/Kyiv” vs „Europe/Kiev”) is matched to its list option.
   */
  zones: TimeZoneGroup[];
  windows: AvailabilityWindow[];
  /**
   * `saveAvailability` — replaces the whole set atomically and returns the next offered slots (#15). `errors`
   * are shown at their fields, `reason: "unauthorized"` → the session alert; throwing = no network (Z28). In
   * every failure the unsaved set stays on screen (15-A6).
   */
  action: (input: { timeZone: string; windows: AvailabilityWindow[] }) => Promise<SaveAvailabilityResult>;
  /** Preview shown on load (the next 10 offered slots). */
  preview?: OpenSlot[];
  now?: Date;
  /** Fallback zone (default Europe/Warsaw, Z16). */
  defaultTimeZone?: string;
  /** Reads the browser zone; injectable for stories and tests. Default: `Intl.DateTimeFormat().resolvedOptions()`. */
  detectTimeZone?: () => string | undefined;
};

/** 00:00 … 24:00 in 30-minute steps (#15). */
const TIMES = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function resolvedZoneName(timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** UTC offsets (minutes) of a zone at fixed instants over the next two years — its rules, as far as slots go. */
function offsetSignature(timeZone: string, from: number): string | null {
  try {
    const format = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
    const samples: string[] = [];
    for (let i = 0; i < 48; i += 1) {
      const part = format.formatToParts(from + i * 15 * 86_400_000).find((p) => p.type === "timeZoneName");
      samples.push(part?.value ?? "");
    }
    return samples.join(",");
  } catch {
    return null;
  }
}

const cityOf = (zone: string) => (zone.split("/").pop() ?? zone).toLowerCase();
const regionOf = (zone: string) => (zone.includes("/") ? zone.split("/")[0] : "");
function sharedPrefix(a: string, b: string) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

/**
 * The list option for a zone name (e.g. from the browser), or `null` when it is missing, unknown or not on the
 * list. The list holds the server's names (Node: CLDR names such as „Europe/Kiev”, „Asia/Calcutta”), while a
 * browser may report the current IANA name („Europe/Kyiv”, „Asia/Kolkata”) and may or may not resolve aliases:
 * 1. exact match; 2. this browser resolves the name to an option, or an option to the name; 3. an option with
 * the same UTC offsets over the next two years (same rules = the same slots), preferring the same region and the
 * most similar city name. A name the browser does not know → `null` (the caller falls back to Europe/Warsaw).
 */
export function matchTimeZoneOption(candidate: string | null | undefined, zones: TimeZoneGroup[], now = Date.now()): string | null {
  if (!candidate) return null;
  const values = zones.flatMap((group) => group.options.map((option) => option.value));
  if (values.includes(candidate)) return candidate;
  const target = resolvedZoneName(candidate);
  if (!target) return null;
  if (values.includes(target)) return target;
  const resolvedMatch = values.find((value) => resolvedZoneName(value) === target);
  if (resolvedMatch) return resolvedMatch;
  const signature = offsetSignature(candidate, now);
  if (!signature) return null;
  const region = regionOf(candidate);
  const city = cityOf(candidate);
  let best: { value: string; score: number } | null = null;
  for (const pool of [values.filter((v) => regionOf(v) === region), values.filter((v) => regionOf(v) !== region)]) {
    for (const value of pool) {
      if (offsetSignature(value, now) !== signature) continue;
      const score = sharedPrefix(cityOf(value), city);
      if (!best || score > best.score) best = { value, score };
    }
    if (best) return best.value;
  }
  return null;
}

const noSubscription = () => () => {};

/** Weekly windows in the mentor's zone: day rows, „+ okno”, start/end in 30-minute steps, Save (#15). */
export function AvailabilityEditor({
  timeZone: initialZone,
  zones,
  windows: savedWindows,
  action,
  preview: initialPreview = [],
  now = new Date(),
  defaultTimeZone = DEFAULT_TIME_ZONE,
  detectTimeZone = browserTimeZone,
}: AvailabilityEditorProps) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // The browser zone is known only in the browser: the server render (and hydration) use `null`, so the field
  // shows `defaultTimeZone` (never empty), then switches to the browser zone — no hydration mismatch, no effect.
  const detected = useSyncExternalStore(noSubscription, detectTimeZone, () => null);
  const prefill = useMemo(() => matchTimeZoneOption(detected, zones) ?? defaultTimeZone, [detected, zones, defaultTimeZone]);
  const [savedZone, setSavedZone] = useState(initialZone);
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const timeZone = chosenZone ?? savedZone ?? prefill;
  const [windows, setWindows] = useState(savedWindows);
  const [preview, setPreview] = useState(initialPreview);
  const [savedCount, setSavedCount] = useState(savedWindows.length);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<"none" | "saved" | "server" | "network" | "unauthorized">("none");
  const [errors, setErrors] = useState<AvailabilityErrors>({});
  const [attempt, setAttempt] = useState(0);
  const zoneChanged = savedZone !== null && savedCount > 0 && timeZone !== savedZone;
  const atLimit = windows.length >= MAX_WINDOWS;
  const setErrorId = `${uid}-windows-error`;

  // After a refused save: focus the first invalid control, or the set-level error (Form pattern).
  useEffect(() => {
    if (attempt === 0) return;
    const form = formRef.current;
    const target =
      form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? (form ? document.getElementById(setErrorId) : null);
    target?.focus();
  }, [attempt, setErrorId]);

  /** Any change of the set clears the window errors (their indexes refer to the list that was sent). */
  const changeWindows = (change: (list: AvailabilityWindow[]) => AvailabilityWindow[]) => {
    setWindows(change);
    setErrors((current) => (current.timeZone ? { timeZone: current.timeZone } : {}));
  };

  const update = (index: number, patch: Partial<AvailabilityWindow>) =>
    changeWindows((list) =>
      list.map((w, i) => {
        if (i !== index) return w;
        const next = { ...w, ...patch };
        // The end can never be before the start: the end options start 30 minutes later (#15).
        if (next.end <= next.start) next.end = TIMES[TIMES.indexOf(next.start) + 1] ?? "24:00";
        return next;
      }),
    );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setOutcome("none");
    try {
      const result = await action({ timeZone, windows });
      if (result.ok) {
        setErrors({});
        setPreview(result.preview);
        setSavedCount(windows.length);
        setSavedZone(timeZone);
        setChosenZone(null);
        setOutcome("saved");
      } else if ("reason" in result) {
        setOutcome("unauthorized");
      } else if (result.errors && Object.keys(result.errors).length > 0) {
        setErrors(result.errors);
        setAttempt((n) => n + 1);
      } else {
        setOutcome("server");
      }
    } catch {
      setOutcome("network");
    } finally {
      setPending(false);
    }
  };

  return (
    <form ref={formRef} noValidate onSubmit={save} aria-labelledby={`${uid}-title`} className="flex max-w-text flex-col gap-between-groups">
      <h1 id={`${uid}-title`} className="text-heading-page font-strong">
        Dostępność
      </h1>
      {savedCount === 0 ? <NoAvailabilityNotice href={null} /> : null}
      {outcome === "unauthorized" ? <Alert tone="danger" title={SESSION_EXPIRED_MESSAGE}>Twoje okna zostały na ekranie.</Alert> : null}
      {outcome === "server" ? <Alert tone="danger" title="Nie udało się zapisać dostępności — spróbuj ponownie">Twoje okna zostały na ekranie.</Alert> : null}
      {outcome === "network" ? <Alert tone="danger" title={NETWORK_MESSAGE} /> : null}

      <FormField label="Strefa czasowa" hint="Godziny okien są w tej strefie." error={errors.timeZone}>
        <Select
          name="timeZone"
          groups={zones}
          value={timeZone}
          onValueChange={(zone) => {
            setChosenZone(zone);
            setErrors((current) => {
              const next = { ...current };
              delete next.timeZone;
              return next;
            });
          }}
        />
      </FormField>
      {zoneChanged ? <Alert tone="info" title={ZONE_CHANGE_WARNING}>Nic się nie zmieni, dopóki nie zapiszesz.</Alert> : null}

      <div className="flex flex-col gap-in-group">
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
                    disabledReason={atLimit ? MAX_WINDOWS_MESSAGE : undefined}
                    onClick={() => changeWindows((list) => [...list, { weekday: weekday as Weekday, start: "18:00", end: "20:00" }])}
                  >
                    <Plus aria-hidden="true" className="size-icon-sm" />
                    okno
                  </Button>
                </div>
                {dayWindows.length === 0 ? <span className="text-meta text-muted">Brak okien</span> : null}
                {dayWindows.map(({ w, index }) => {
                  const error = errors[`windows.${index}`];
                  const errorId = error ? `${uid}-window-${index}-error` : undefined;
                  return (
                    <div key={index} className="flex flex-col gap-inline">
                      <div className="flex flex-wrap items-center gap-in-group">
                        <div className="min-w-0 flex-1 basis-0">
                          <Select
                            aria-label={`${day}, od`}
                            aria-describedby={errorId}
                            invalid={Boolean(error)}
                            options={TIMES.slice(0, -1).map((t) => ({ value: t, label: t }))}
                            value={w.start}
                            onValueChange={(start) => update(index, { start })}
                          />
                        </div>
                        <span aria-hidden="true">–</span>
                        <div className="min-w-0 flex-1 basis-0">
                          <Select
                            aria-label={`${day}, do`}
                            aria-describedby={errorId}
                            invalid={Boolean(error)}
                            options={TIMES.filter((t) => t > w.start).map((t) => ({ value: t, label: t }))}
                            value={w.end}
                            onValueChange={(end) => update(index, { end })}
                          />
                        </div>
                        <IconButton
                          label={`Usuń okno ${day} ${w.start}–${w.end}`}
                          icon={<X />}
                          onClick={() => changeWindows((list) => list.filter((_, i) => i !== index))}
                        />
                      </div>
                      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
                    </div>
                  );
                })}
              </li>
            );
          })}
        </List>
        {errors.windows ? (
          <FieldError id={setErrorId} tabIndex={-1}>
            {errors.windows}
          </FieldError>
        ) : null}
      </div>

      <div>
        <Button type="submit" variant="primary" loading={pending}>
          {zoneChanged ? "Zapisz i zmień strefę" : "Zapisz"}
        </Button>
      </div>
      {outcome === "saved" ? <Alert tone="success" title="Dostępność zapisana" /> : null}
      <SlotPreview
        slots={preview}
        timeZone={savedZone ?? timeZone}
        now={now}
        emptyText={savedCount === 0 ? "Terminy pojawią się po zapisaniu okien." : undefined}
      />
    </form>
  );
}

/** An error at its place (like `FormField error`): icon + words, referenced by `aria-describedby`. */
function FieldError({ id, tabIndex, children }: { id?: string; tabIndex?: number; children: ReactNode }) {
  return (
    <p
      id={id}
      tabIndex={tabIndex}
      className="flex items-start gap-inline rounded-control text-meta text-status-danger outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
    >
      <CircleAlert aria-hidden="true" className="size-icon-sm shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/* --------------------------------------------------------------- preview */

export type SlotPreviewProps = {
  slots: OpenSlot[];
  timeZone: string;
  now?: Date;
  limit?: number;
  /**
   * Text when there is nothing to show. Short on purpose: the „Nie masz dostępności” banner above already says
   * why (gap D11). Default „Brak terminów w najbliższych 14 dniach.”
   */
  emptyText?: string;
};

/** The next offered slots in the mentor's zone, with the lengths that fit (#15). */
export function SlotPreview({
  slots,
  timeZone,
  now = new Date(),
  limit = 10,
  emptyText = "Brak terminów w najbliższych 14 dniach.",
}: SlotPreviewProps) {
  const headingId = useId();
  const starts = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const slot of slots) map.set(slot.startsAt, [...(map.get(slot.startsAt) ?? []), slot.lengthMinutes]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, limit);
  }, [slots, limit]);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-in-group">
      <h2 id={headingId} className="text-heading-section font-strong">
        Najbliższe terminy
      </h2>
      <p className="text-meta text-muted">Godziny w strefie {timeZone}.</p>
      {starts.length === 0 ? (
        <p className="text-muted">{emptyText}</p>
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
