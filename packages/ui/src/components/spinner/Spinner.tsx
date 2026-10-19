import { LoaderCircle } from "lucide-react";
import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export type SpinnerProps = HTMLAttributes<HTMLSpanElement> & {
  /** Visible text that says what we are waiting for. Without it the spinner is decorative (inside a button). */
  label?: string;
  /** `sm` 16 px next to text, `md` 20 px in buttons and status lines (P1). */
  size?: "sm" | "md";
};

/** Shows that the product is waiting for something; always paired with words. */
export function Spinner({ label, size = "md", className, ...props }: SpinnerProps) {
  const icon = (
    <LoaderCircle
      aria-hidden="true"
      className={cn(
        "shrink-0 animate-spin motion-reduce:animate-none",
        size === "sm" ? "size-icon-sm" : "size-icon-md",
      )}
    />
  );
  if (!label) {
    return (
      <span className={cn("inline-flex", className)} {...props}>
        {icon}
      </span>
    );
  }
  return (
    <span role="status" className={cn("inline-flex items-center gap-in-group", className)} {...props}>
      {icon}
      <span>{label}</span>
    </span>
  );
}
