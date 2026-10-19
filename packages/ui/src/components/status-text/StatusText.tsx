import { Check, CircleAlert, Clock } from "lucide-react";
import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export type StatusTone = "neutral" | "waiting" | "success" | "danger";

export type StatusTextProps = HTMLAttributes<HTMLSpanElement> & {
  /** neutral: plain fact · waiting: someone has to act · success: done and good · danger: failed. */
  tone?: StatusTone;
  /** Add the tone icon (status lines on top of a page). Rows in a list usually go without. */
  withIcon?: boolean;
};

const toneClass: Record<StatusTone, string> = {
  neutral: "text-primary",
  waiting: "text-primary",
  success: "text-status-success",
  danger: "text-status-danger",
};

const toneIcon = { neutral: null, waiting: Clock, success: Check, danger: CircleAlert } as const;

/** The state of something, written as a word („Czeka na decyzję”) — never a coloured pill. */
export function StatusText({ tone = "neutral", withIcon = false, className, children, ...props }: StatusTextProps) {
  const Icon = toneIcon[tone];
  return (
    <span className={cn("inline-flex items-start gap-inline font-ui font-strong", toneClass[tone], className)} {...props}>
      {withIcon && Icon ? (
        // One line box high, so the icon sits on the first line at any text size (meta … page heading).
        <span aria-hidden="true" className="inline-flex h-lh shrink-0 items-center">
          <Icon className="size-icon-md" />
        </span>
      ) : null}
      <span>{children}</span>
    </span>
  );
}
