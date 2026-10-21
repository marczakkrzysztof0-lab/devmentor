"use client";

import { useEffect, useState, type ChangeEvent, type TextareaHTMLAttributes } from "react";

import { cn } from "../../lib/cn";
import { textLength } from "../../lib/text.mjs";
import { useFormField } from "../form-field/FormField";

/** The counter appears from this share of `maxLength` (S14). */
const COUNTER_FROM = 0.8;
/** Screen readers hear the count after the user pauses typing, not on every key (S14). */
const ANNOUNCE_DELAY_MS = 1000;

/**
 * `maxLength` counts Unicode code points (an emoji is 1 character), like the server (`textLength`,
 * `@devmentor/ui/text`). The native `maxlength` counts UTF-16 units (an emoji is 2), so it is not rendered:
 * an edit that would grow the text past the limit is rejected here instead (the text stays as it was).
 */
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Shows the error border; set automatically inside a FormField with `error`. */
  invalid?: boolean;
};

function countLabel(length: number, max: number) {
  return `${length} / ${max} znaków`;
}

/** Several lines of free text: the question (#17) or the mentor's description (#14). */
export function Textarea({ invalid, className, id, rows = 6, maxLength, onChange, ...props }: TextareaProps) {
  const field = useFormField();
  const isInvalid = invalid ?? field?.invalid ?? false;

  const [text, setText] = useState(String(props.value ?? props.defaultValue ?? ""));
  const [announced, setAnnounced] = useState("");
  const accepted = props.value !== undefined ? String(props.value) : text;
  const current = textLength(accepted);
  const showCounter = maxLength !== undefined && current >= Math.ceil(maxLength * COUNTER_FROM);

  useEffect(() => {
    if (!showCounter || maxLength === undefined) return;
    const timer = setTimeout(() => setAnnounced(countLabel(current, maxLength)), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [current, maxLength, showCounter]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    const previous = accepted;
    const next = field.value;
    if (maxLength !== undefined && textLength(next) > maxLength && textLength(next) > textLength(previous)) {
      // Over the limit: keep the previous text and put the caret back where the edit started.
      const caret = Math.max(0, (field.selectionStart ?? next.length) - (next.length - previous.length));
      field.value = previous;
      field.setSelectionRange(caret, caret);
      return;
    }
    setText(next);
    onChange?.(event);
  };

  return (
    <>
      <textarea
        {...props}
        id={id ?? field?.id}
        rows={rows}
        onChange={handleChange}
        aria-describedby={[field?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined}
        aria-invalid={isInvalid || undefined}
        required={field ? field.required : props.required}
        className={cn(
          "block w-full resize-y rounded-control border border-control bg-surface-panel px-inside-panel py-in-group",
          "font-ui text-body text-primary placeholder:text-muted",
          "transition-colors duration-(--ds-duration-control) ease-standard",
          "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
          isInvalid && "border-status-danger",
          (props.readOnly || props.disabled) && "bg-surface-code",
          props.disabled && "cursor-not-allowed text-muted",
          className,
        )}
      />
      {maxLength !== undefined ? (
        <>
          {showCounter ? (
            <p aria-hidden="true" data-testid="char-counter" className="text-right font-mono text-meta text-muted">
              {countLabel(current, maxLength)}
            </p>
          ) : null}
          <span aria-live="polite" className="sr-only">
            {showCounter ? announced : ""}
          </span>
        </>
      ) : null}
    </>
  );
}
