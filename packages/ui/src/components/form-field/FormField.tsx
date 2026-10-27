"use client";

import { CircleAlert } from "lucide-react";
import { Label as LabelPrimitive } from "radix-ui";
import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "../../lib/cn";

type FormFieldContextValue = {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
};

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/** Lets a control (TextInput, Textarea, Select) pick up the id, description and error of its field. */
export function useFormField() {
  return useContext(FormFieldContext);
}

export type LabelProps = ComponentProps<typeof LabelPrimitive.Root> & {
  /** Adds „(opcjonalnie)” after the text. Required fields carry no mark (S12). */
  optional?: boolean;
};

/** The visible name of a control. Always visible; a placeholder is never a label. */
export function Label({ optional = false, className, children, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root className={cn("font-ui text-body font-strong text-primary", className)} {...props}>
      {children}
      {optional ? <span className="font-regular text-muted"> (opcjonalnie)</span> : null}
    </LabelPrimitive.Root>
  );
}

export type FormFieldProps = {
  /** Field name, e.g. „Imię”, „Twoje pytanie”. */
  label: ReactNode;
  /** One sentence that helps fill the field, e.g. „Mentor zobaczy tylko imię.” */
  hint?: ReactNode;
  /**
   * Where the hint sits: under the control (default) or directly under the label — for a hint that says why
   * the field exists and should be read before typing (spec #14 F1, „Twoje doświadczenie”). Either way it is
   * part of the control's accessible description.
   */
  hintPlacement?: "control" | "label";
  /** What is wrong and what to do, e.g. „Dodaj link do publicznej pracy”. Shown under the field. */
  error?: ReactNode;
  /** Marks the field „(opcjonalnie)”; otherwise the control gets `required`. */
  optional?: boolean;
  /** Use your own id (e.g. to focus the first invalid field); generated otherwise. */
  id?: string;
  className?: string;
  /** Exactly one control: TextInput, Textarea or Select. */
  children: ReactNode;
};

/** Label + control + hint + error, wired together for assistive technology. */
export function FormField({ label, hint, hintPlacement = "control", error, optional = false, id, className, children }: FormFieldProps) {
  const generated = useId();
  const controlId = id ?? `${generated}-control`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  // `break-words`: a hint may carry an unbroken string (the full share URL of a 40-character slug, #42) that
  // must wrap inside 320 px instead of pushing the page sideways; ordinary text wraps as before.
  const hintNode = hint ? (
    <p id={hintId} className="text-meta text-muted break-words">
      {hint}
    </p>
  ) : null;
  const labelNode = (
    <Label htmlFor={controlId} optional={optional}>
      {label}
    </Label>
  );

  return (
    <FormFieldContext.Provider value={{ id: controlId, describedBy, invalid: Boolean(error), required: !optional }}>
      <div className={cn("flex flex-col gap-in-group", className)}>
        {hintPlacement === "label" && hintNode ? (
          <div className="flex flex-col gap-inline">
            {labelNode}
            {hintNode}
          </div>
        ) : (
          labelNode
        )}
        <div className="flex flex-col gap-inline">
          {children}
          {hintPlacement === "control" ? hintNode : null}
          {error ? (
            <p id={errorId} className="flex items-start gap-inline text-meta text-status-danger">
              <CircleAlert aria-hidden="true" className="size-icon-sm shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
      </div>
    </FormFieldContext.Provider>
  );
}
