"use client";

// E01 · #16 — what a developer sees on /m/{slug}, in the required order:
// identity → public work → description → prices → slots (spec #16 UI/UX).

import { useMemo } from "react";

import { RadioGroup } from "../../components/radio-group/RadioGroup";
import { Skeleton } from "../../components/skeleton/Skeleton";
import { NETWORK_LOAD_MESSAGE } from "../shared/form";
import { StateMessage } from "../../components/state-message/StateMessage";
import { TextLink } from "../../components/text-link/TextLink";
import { cn } from "../../lib/cn";
import { Amount } from "../shared/Amount";
import { displayUrl, formatDay, formatDayFull, formatMoney, formatTime, localDayKey, resolveTimeZone } from "../shared/format";
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

/** Next open slots in the viewer's zone, by day, with the zone printed in the heading (#16). */
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
  const zone = resolveTimeZone(timeZone);
  const heading = zone.fallback
    ? "Najbliższe terminy (czas UTC)"
    : `Najbliższe terminy (twoja strefa: ${zone.timeZone})`;

  const days = useMemo(() => {
    const map = new Map<string, { label: string; long: string; slots: OpenSlot[] }>();
    for (const slot of slots.filter((s) => s.lengthMinutes === length)) {
      const key = localDayKey(slot.startsAt, zone.timeZone);
      if (!map.has(key)) {
        map.set(key, {
          label: formatDay(slot.startsAt, zone.timeZone, now),
          long: formatDayFull(slot.startsAt, zone.timeZone, now),
          slots: [],
        });
      }
      map.get(key)!.slots.push(slot);
    }
    return [...map.values()];
  }, [slots, length, zone.timeZone, now]);

  let body;
  if (state === "loading") {
    body = <Skeleton label="Wczytywanie terminów" />;
  } else if (state === "offline") {
    body = <StateMessage kind="error" titleAs="h3" title={NETWORK_LOAD_MESSAGE} className="py-0" />;
  } else if (state === "error") {
    body = <StateMessage kind="error" titleAs="h3" title="Nie udało się wczytać terminów — odśwież stronę" className="py-0" />;
  } else if (days.length === 0) {
    body = <StateMessage kind="empty" titleAs="h3" title="Brak wolnych terminów w najbliższych 14 dniach" className="py-0" />;
  } else if (selectable) {
    body = (
      <RadioGroup
        legend={heading}
        legendHidden
        name="slotStart"
        value={value}
        onValueChange={onValueChange}
        error={error}
        groups={days.map((day) => ({
          label: day.label,
          options: day.slots.map((slot) => ({
            value: slot.startsAt,
            label: (
              <>
                <span className="sr-only">{day.long}, </span>
                <span className="font-mono">{formatTime(slot.startsAt, zone.timeZone)}</span>
              </>
            ),
          })),
        }))}
      />
    );
  } else {
    body = (
      <ul className="flex flex-col border-t border-divider">
        {days.map((day) => (
          <li key={day.long} className="flex flex-wrap gap-in-group border-b border-divider py-list-row-y">
            <span className="min-w-0 font-strong">{day.label}</span>
            <span className="font-mono">
              {day.slots.map((slot) => formatTime(slot.startsAt, zone.timeZone)).join(", ")}
            </span>
          </li>
        ))}
      </ul>
    );
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
