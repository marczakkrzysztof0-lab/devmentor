"use client";

import { Check, CircleAlert } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Fragment, useId, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "../../lib/cn";

export type RadioOption = {
  value: string;
  /** What the user picks, e.g. „25 min — 150 zł” or „jutro 18:00”. */
  label: ReactNode;
  /** One extra line under the label (list variant only). */
  description?: ReactNode;
  disabled?: boolean;
  /** Documentation only: frozen hover/focus/active preview of this option. */
  previewState?: "hover" | "focus" | "active";
};

export type RadioGroupProps = {
  /** Visible name of the group, e.g. „Długość sesji”, „Najbliższe terminy”. Required. */
  legend: ReactNode;
  /** Hide the legend visually when the screen already shows the same words as a heading. */
  legendHidden?: boolean;
  /** Flat options… */
  options?: RadioOption[];
  /**
   * …or options under visual group headings (list variant), e.g. slots by day (#16).
   * Headings are hidden from screen readers, so each option label must carry the group in text
   * (e.g. a visually hidden „wtorek 20.10,” before „18:00”) — spec #16: dates in text, not only by grouping.
   * `footer` renders after the group's options, inside the radio group (e.g. the per-day „Pokaż więcej (k)” of
   * #17 F3 — a plain button, not a radio; arrow keys skip it).
   */
  groups?: { label: ReactNode; options: RadioOption[]; footer?: ReactNode }[];
  /** `list`: one option per row (slots). `segmented`: 2–3 short options side by side (25/50 min). */
  variant?: "list" | "segmented";
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  /** What is wrong and what to do, e.g. „Wybierz termin”. */
  error?: ReactNode;
  className?: string;
};

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/**
 * WAI-ARIA radio pattern (gap D12, spec #16 Z41): an arrow key moves focus to the next / previous enabled option
 * AND checks it, wrapping at the ends, in both variants and with all four arrows. Radix checks on focus only while
 * it sees the arrow key still held when its delayed focus move runs, so a quick press (keydown + keyup before the
 * move) only moved focus. Here the move and the check happen in the keydown itself; Radix's own arrow handling is
 * skipped (`preventDefault`).
 */
function selectWithArrows(event: KeyboardEvent<HTMLButtonElement>) {
  const forward = NEXT_KEYS.has(event.key);
  if (!forward && !PREVIOUS_KEYS.has(event.key)) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const root = event.currentTarget.closest('[role="radiogroup"]');
  if (!root) return;
  const radios = [...root.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
  const index = radios.indexOf(event.currentTarget);
  if (index === -1 || radios.length < 2) return;
  event.preventDefault();
  const next = radios[(index + (forward ? 1 : -1) + radios.length) % radios.length];
  next.focus();
  // A held key repeats: Radix then sees the key down and checks the option on focus itself — one change, not two.
  if (!event.repeat) next.click();
}

/** Pick exactly one of a few visible options: session length, a slot. */
export function RadioGroup({
  legend,
  legendHidden = false,
  options,
  groups,
  variant = "list",
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  error,
  className,
}: RadioGroupProps) {
  const base = useId();
  const legendId = `${base}-legend`;
  const errorId = error ? `${base}-error` : undefined;
  const segmented = variant === "segmented";

  return (
    <div className={cn("flex flex-col gap-in-group", className)}>
      <div id={legendId} className={cn("font-ui text-body font-strong text-primary", legendHidden && "sr-only")}>
        {legend}
      </div>
      <RadioGroupPrimitive.Root
        aria-labelledby={legendId}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        name={name}
        required={required}
        orientation={segmented ? "horizontal" : "vertical"}
        className={segmented ? "flex flex-wrap gap-in-group" : "flex flex-col"}
      >
        {(groups ?? [{ label: null, options: options ?? [] }]).map((group, groupIndex) => (
          <Fragment key={groupIndex}>
            {group.label ? (
              <p aria-hidden="true" className="pt-in-group font-ui text-meta font-strong text-muted first:pt-0">
                {group.label}
              </p>
            ) : null}
        {group.options.map((option) => {
          const itemId = `${base}-${option.value}`;
          if (segmented) {
            return (
              <RadioGroupPrimitive.Item
                key={option.value}
                id={itemId}
                value={option.value}
                disabled={option.disabled}
                onKeyDown={selectWithArrows}
                data-preview-state={option.previewState}
                className={cn(
                  "group inline-flex cursor-pointer items-center gap-in-group rounded-control border border-control",
                  "bg-surface-panel px-inside-panel py-in-group font-ui text-body font-strong text-primary",
                  "transition-colors duration-(--ds-duration-control) ease-standard",
                  "hover:bg-surface-code active:bg-surface-code",
                  "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
                  "data-[state=checked]:border-action-primary-fill data-[state=checked]:bg-action-primary-fill data-[state=checked]:text-on-action",
                  "disabled:cursor-not-allowed disabled:bg-surface-code disabled:text-muted",
                )}
              >
                <Check aria-hidden="true" className="hidden size-icon-sm shrink-0 group-data-[state=checked]:block" />
                {option.label}
              </RadioGroupPrimitive.Item>
            );
          }
          return (
            <label
              key={option.value}
              htmlFor={itemId}
              data-preview-state={option.previewState === "hover" ? "hover" : undefined}
              className={cn(
                "flex cursor-pointer items-start gap-in-group rounded-control px-in-group py-list-row-y",
                "transition-colors duration-(--ds-duration-control) ease-standard hover:bg-surface-code",
                option.disabled && "cursor-not-allowed text-muted",
              )}
            >
              <RadioGroupPrimitive.Item
                id={itemId}
                value={option.value}
                disabled={option.disabled}
                onKeyDown={selectWithArrows}
                data-preview-state={option.previewState === "hover" ? undefined : option.previewState}
                className={cn(
                  "mt-inline flex size-icon-sm shrink-0 cursor-pointer items-center justify-center rounded-full border border-control bg-surface-panel",
                  "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
                  "data-[state=checked]:border-action-primary-fill disabled:cursor-not-allowed",
                )}
              >
                <RadioGroupPrimitive.Indicator className="block size-in-group rounded-full bg-action-primary-fill" />
              </RadioGroupPrimitive.Item>
              <span className="flex flex-col">
                <span className="font-ui text-body">{option.label}</span>
                {option.description ? <span className="text-meta text-muted">{option.description}</span> : null}
              </span>
            </label>
          );
        })}
            {group.footer ?? null}
          </Fragment>
        ))}
      </RadioGroupPrimitive.Root>
      {error ? (
        <p id={errorId} className="flex items-start gap-inline text-meta text-status-danger">
          <CircleAlert aria-hidden="true" className="size-icon-sm shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
