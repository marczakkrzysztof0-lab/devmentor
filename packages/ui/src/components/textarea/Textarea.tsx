"use client";

import type { TextareaHTMLAttributes } from "react";

import { cn } from "../../lib/cn";
import { useFormField } from "../form-field/FormField";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Shows the error border; set automatically inside a FormField with `error`. */
  invalid?: boolean;
};

/** Several lines of free text: the question (#17) or the mentor's description (#14). */
export function Textarea({ invalid, className, id, rows = 6, ...props }: TextareaProps) {
  const field = useFormField();
  const isInvalid = invalid ?? field?.invalid ?? false;
  return (
    <textarea
      {...props}
      id={id ?? field?.id}
      rows={rows}
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
  );
}
