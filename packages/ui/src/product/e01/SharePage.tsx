"use client";

// E01 · #16 — what a developer sees on /m/{slug}, in the required order:
// identity → public work → description → prices → slots (spec #16 UI/UX).

import { useId, useMemo, useState } from "react";

import { Button } from "../../components/button/Button";
import { RadioGroup } from "../../components/radio-group/RadioGroup";
import { Skeleton } from "../../components/skeleton/Skeleton";
import { NETWORK_LOAD_MESSAGE } from "../shared/form";
import { StateMessage } from "../../components/state-message/StateMessage";
import { TextLink } from "../../components/text-link/TextLink";
import { cn } from "../../lib/cn";
import { Amount } from "../shared/Amount";
import { displayUrl, formatMoney, groupSlotsByDay, SLOTS_PER_DAY } from "../shared/format";
import type { LoadState, OpenSlot, SessionLength } from "../shared/types";

/* ---------------------------------------------------------------- identity */

export type MentorIdentityProps = { displayName: string; publicWorkUrl: string };

/** Who the mentor is and the proof of their work, right under the name (N02: "my GitHub is my profile"). */
export function MentorIdentity({ displayName, publicWorkUrl }: MentorIdentityProps) {
  return (
    <header className="flex flex-col gap-in-group">
      <h1 className="text-heading-page font-strong break-words">{displayName}</h1>
      <p className="flex flex-wrap items-baseline gap-inline">
        <span className="text-muted">Publiczna praca:</span>
        <TextLink href={publicWorkUrl} external rel="nofollow noopener ugc" className="break-all font-strong">
          {displayUrl(publicWorkUrl)}
        </TextLink>
      </p>
    </header>
  );
}

/* ------------------------------------------------------------- description */

export type MentorDescriptionProps = { text: string };

/** What the mentor has done, as plain text with line breaks kept; never truncated (#16). */
export function MentorDescription({ text }: MentorDescriptionProps) {
  return <p className="max-w-text whitespace-pre-line break-words">{text}</p>;
}

/* ------------------------------------------------------------------ prices */

export type Prices = { price25Minor: number; price50Minor: number; currency?: string };

/** Both prices, always visible before any question field (R07, #16). */
export function PriceList({ price25Minor, price50Minor, currency = "PLN" }: Prices) {
  return (
    <section aria-labelledby="prices-heading" className="flex flex-col gap-in-group">
      <h2 id="prices-heading" className="text-heading-section font-strong">
        Ceny
      </h2>
      <dl className="flex flex-col">
        {([
          [25, price25Minor],
          [50, price50Minor],
        ] as const).map(([minutes, minor]) => (
          <div key={minutes} className="flex justify-between gap-in-group border-b border-divider py-list-row-y">
            <dt>{minutes} min</dt>
            <dd>
              <Amount minor={minor} currency={currency} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export type LengthToggleProps = Prices & {
  value: SessionLength;
  onValueChange: (value: SessionLength) => void;
};

/** Pick 25 or 50 minutes; each option shows its price (R07, tokeny.md: 25/50 switch). */
export function LengthToggle({ price25Minor, price50Minor, currency = "PLN", value, onValueChange }: LengthToggleProps) {
  return (
    <RadioGroup
      legend="Długość sesji"
      variant="segmented"
      name="lengthMinutes"
      value={String(value)}
      onValueChange={(next) => onValueChange(Number(next) as SessionLength)}
      options={[
        { value: "25", label: <>25 min — <Amount minor={price25Minor} currency={currency} /></> },
        { value: "50", label: <>50 min — <Amount minor={price50Minor} currency={currency} /></> },
      ]}
    />
  );
}

/* ------------------------------------------------------------------- slots */

export type SlotListProps = {
  slots: OpenSlot[];
  /** Only slots where this length fits are shown (#16 story 2). */
  length: SessionLength;
  /** The viewer's browser zone; falls back to UTC (#16). */
  timeZone?: string;
  /** "Today" for relative day names; injected for stable stories and tests. */
  now?: Date;
  state?: LoadState;
  /** #17: slots become a radio group. Before #17 (and for the mentor preview) they are plain text. */
  selectable?: boolean;
  value?: string;
  onValueChange?: (startsAt: string) => void;
  error?: string;
  /** Heading level: h2 on the share page. */
  headingId?: string;
};

/** „Pokaż więcej (4)” — the per-day disclosure of #16 F3 (k = times hidden on that day). */
export function showMoreLabel(hidden: number) {
  return `Pokaż więcej (${hidden})`;
}

/** Text of the empty list when only the other length has slots (#16 story 2, task 6.2). */
export function noSlotsForLengthMessage(length: SessionLength) {
  return `Brak terminów ${length} min w najbliższych 14 dniach — wybierz ${length === 25 ? 50 : 25} min`;
}

/**
 * Next open slots in the viewer's zone, with the zone printed in the heading (#16).
 *
 * Text mode (E01, `selectable={false}`; spec #16 Q7/F3): grouped by the viewer's local day — each day once as an
 * `h3` („jutro”, „czw. 22.10”), its times as a wrapping list with one `li` per time, each carrying the date in text
 * (visually hidden „jutro, wtorek 20.10,” before „18:00”). At most 6 times per day; the rest behind „Pokaż więcej (k)”
 * (`aria-expanded`, `aria-controls` = that day's list), which shows that day only. A new `length` resets every
 * expansion. These disclosures are the only buttons in the list — no time is a control (Z1).
 *
 * Selectable mode (#17 F4 + F3): the same days (shared `groupSlotsByDay`) as radio groups — every time is a radio
 * of the request form, at most 6 per day and the rest behind that day's „Pokaż więcej (k)” (also a reset on a new
 * `length`). A chosen time hidden by the limit stays visible, so the selection is never out of sight.
 *
 * While loading (`state="loading"`, e.g. before the viewer's zone is known) the heading names no zone — the zone is
 * printed only above real times (D3), never a provisional „czas UTC”.
 */
export function SlotList({
  slots,
  length,
  timeZone,
  now = new Date(),
  state = "ready",
  selectable = false,
  value,
  onValueChange,
  error,
  headingId = "slots-heading",
}: SlotListProps) {
  const grouped = useMemo(
    () => groupSlotsByDay(slots, { lengthMinutes: length, timeZone, now, maxPerDay: SLOTS_PER_DAY }),
    [slots, length, timeZone, now],
  );
  const heading =
    state === "loading"
      ? "Najbliższe terminy"
      : grouped.fallback
        ? "Najbliższe terminy (czas UTC)"
        : `Najbliższe terminy (twoja strefa: ${grouped.timeZone})`;
  const days = grouped.days;

  let body;
  if (state === "loading") {
    body = <Skeleton label="Wczytywanie terminów" />;
  } else if (state === "offline") {
    body = <StateMessage kind="error" titleAs="h3" title={NETWORK_LOAD_MESSAGE} className="py-0" />;
  } else if (state === "error") {
    body = <StateMessage kind="error" titleAs="h3" title="Nie udało się wczytać terminów — odśwież stronę" className="py-0" />;
  } else if (days.length === 0) {
    const otherLengthHasSlots = slots.some((slot) => slot.lengthMinutes !== length);
    body = (
      <StateMessage
        kind="empty"
        titleAs="h3"
        title={otherLengthHasSlots ? noSlotsForLengthMessage(length) : "Brak wolnych terminów w najbliższych 14 dniach"}
        className="py-0"
      />
    );
  } else if (selectable) {
    // Keyed by length: switching 25/50 starts with every day collapsed (F3).
    body = <SelectableSlotDays key={length} days={days} heading={heading} value={value} onValueChange={onValueChange} error={error} />;
  } else {
    // Keyed by length: switching 25/50 starts with every day collapsed (F3).
    body = <SlotDays key={length} days={days} />;
  }

  return (
    <section aria-labelledby={headingId} aria-busy={state === "loading" || undefined} className="flex flex-col gap-in-group">
      <h2 id={headingId} className={cn("text-heading-section font-strong break-words")}>
        {heading}
      </h2>
      {body}
    </section>
  );
}

type SlotDay = ReturnType<typeof groupSlotsByDay>["days"][number];

/** Selectable mode of `SlotList` (#17): one radio group, days as visual groups, 6 per day + „Pokaż więcej (k)”. */
function SelectableSlotDays({
  days,
  heading,
  value,
  onValueChange,
  error,
}: {
  days: SlotDay[];
  heading: string;
  value?: string;
  onValueChange?: (startsAt: string) => void;
  error?: string;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (dayKey: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  return (
    <RadioGroup
      legend={heading}
      legendHidden
      name="slotStart"
      value={value}
      onValueChange={onValueChange}
      error={error}
      groups={days.map((day) => {
        const open = expanded.has(day.dayKey);
        const shown = open ? day.times : day.times.filter((time, index) => index < day.visible.length || time.startsAt === value);
        return {
          label: day.dayLabel,
          options: shown.map((time) => ({
            value: time.startsAt,
            label: (
              <>
                <span className="sr-only">{day.dayLabelFull}, </span>
                <span className="font-mono">{time.label}</span>
              </>
            ),
          })),
          footer:
            day.hiddenCount > 0 ? (
              <Button variant="secondary" className="mt-inline self-start" aria-expanded={open} onClick={() => toggle(day.dayKey)}>
                {open ? "Pokaż mniej" : showMoreLabel(day.hiddenCount)}
              </Button>
            ) : null,
        };
      })}
    />
  );
}

/** Text mode of `SlotList`: one block per day, with its own „Pokaż więcej (k)”. */
function SlotDays({ days }: { days: SlotDay[] }) {
  const base = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (dayKey: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });

  return (
    <div className="flex flex-col border-t border-divider">
      {days.map((day, index) => {
        const open = expanded.has(day.dayKey);
        const headingId = `${base}-day-${index}`;
        const listId = `${base}-times-${index}`;
        const shown = open ? day.times : day.visible;
        return (
          <div key={day.dayKey} className="flex flex-col gap-inline border-b border-divider py-list-row-y">
            <h3 id={headingId} className="min-w-0 font-ui text-body font-strong">
              {day.dayLabel}
            </h3>
            <ul id={listId} aria-labelledby={headingId} className="flex flex-wrap gap-x-in-group gap-y-inline font-mono">
              {shown.map((time) => (
                <li key={time.startsAt}>
                  <span className="sr-only">{day.dayLabelFull}, </span>
                  {time.label}
                </li>
              ))}
            </ul>
            {day.hiddenCount > 0 ? (
              <Button
                variant="secondary"
                className="self-start"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => toggle(day.dayKey)}
              >
                {open ? "Pokaż mniej" : showMoreLabel(day.hiddenCount)}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- not found */

/** Wrong or unpublished link: a neutral message and no mentor data at all (#16 story 4). */
export function MentorNotFound() {
  return (
    <StateMessage kind="not-found" titleAs="h1" title="Nie ma takiej strony mentora" />
  );
}

/** Formats the pay button label used by the request form (#17): „Zapłać 150 zł i wyślij pytanie”. */
export function payLabel(minor: number, currency = "PLN") {
  return `Zapłać ${formatMoney(minor, currency)} i wyślij pytanie`;
}
