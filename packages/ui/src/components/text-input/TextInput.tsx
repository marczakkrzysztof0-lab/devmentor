"use client";

import { useId, type InputHTMLAttributes } from "react";

import { cn } from "../../lib/cn";
import { useFormField } from "../form-field/FormField";

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  /** Unit shown inside the field after the value, e.g. „zł” (spec #14). Not editable. */
  suffix?: string;
  /** Shows the error border; set automatically inside a FormField with `error`. */
  invalid?: boolean;
};

/** One line of text the user types: name, link, price, slug. */
export function TextInput({ suffix, invalid, className, id, readOnly, disabled, ...props }: TextInputProps) {
  const field = useFormField();
  const suffixId = useId();
  const describedBy = [field?.describedBy, props["aria-describedby"], suffix ? suffixId : undefined].filter(Boolean).join(" ") || undefined;
  const isInvalid = invalid ?? field?.invalid ?? false;
  const previewState = (props as Record<string, unknown>)["data-preview-state"] as string | undefined;

  return (
    <div
      data-preview-state={previewState}
      className={cn(
        "flex w-full items-stretch rounded-control border border-control bg-surface-panel font-ui text-body text-primary",
        "transition-colors duration-(--ds-duration-control) ease-standard",
        "outline-offset-2 focus-within:outline-2 focus-within:outline-focus-ring",
        isInvalid && "border-status-danger",
        (readOnly || disabled) && "bg-surface-code",
        disabled && "text-muted",
        className,
      )}
    >
      <input
        {...props}
        id={id ?? field?.id}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        required={field ? field.required : props.required}
        readOnly={readOnly}
        disabled={disabled}
        className="min-w-0 flex-1 bg-transparent px-inside-panel py-in-group outline-none placeholder:text-muted disabled:cursor-not-allowed"
      />
      {suffix ? (
        <span id={suffixId} className="flex items-center pr-inside-panel text-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
