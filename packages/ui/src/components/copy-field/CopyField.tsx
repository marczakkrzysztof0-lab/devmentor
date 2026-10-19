"use client";

import { Check, Copy } from "lucide-react";
import { useId, useRef, useState } from "react";

import { cn } from "../../lib/cn";
import { Button } from "../button/Button";
import { Label } from "../form-field/FormField";

export type CopyFieldProps = {
  /** What the link is: „Twój link”, „Link do zapytania”. */
  label: string;
  /** The text to copy, shown in full. */
  value: string;
  /** One line under the field: „Wklej go tam, gdzie ludzie już cię pytają”. */
  hint?: string;
  /** Button text; default „Kopiuj link”. */
  copyLabel?: string;
  /** Move focus to the field when it appears (after publishing, spec #14). */
  autoFocus?: boolean;
  className?: string;
};

type CopyState = "idle" | "copied" | "failed";

const MESSAGES: Record<CopyState, string> = {
  idle: "",
  copied: "Skopiowano.",
  failed: "Nie udało się skopiować — link jest zaznaczony, skopiuj go ręcznie (Ctrl+C).",
};

/** Shows a link the user needs to keep or share, with one button that copies it. */
export function CopyField({ label, value, hint, copyLabel = "Kopiuj link", autoFocus, className }: CopyFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CopyState>("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Clipboard blocked (permissions, old browser): select the text so the user can copy it by hand.
      inputRef.current?.select();
      setState("failed");
    }
  };

  return (
    <div className={cn("flex flex-col gap-in-group", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-stretch gap-in-group">
        <input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          autoFocus={autoFocus}
          aria-describedby={hint ? hintId : undefined}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(
            "min-w-0 flex-1 basis-0 rounded-control border border-control bg-surface-code px-inside-panel py-in-group",
            "font-mono text-body text-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
          )}
        />
        <Button variant="secondary" onClick={copy}>
          {state === "copied" ? (
            <Check aria-hidden="true" className="size-icon-md" />
          ) : (
            <Copy aria-hidden="true" className="size-icon-md" />
          )}
          {copyLabel}
        </Button>
      </div>
      {hint ? (
        <p id={hintId} className="text-meta text-muted">
          {hint}
        </p>
      ) : null}
      <p
        aria-live="polite"
        className={cn("text-meta", state === "failed" ? "text-status-danger" : "text-status-success")}
      >
        {MESSAGES[state]}
      </p>
    </div>
  );
}
