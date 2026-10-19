import { Check, CircleAlert, Info } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

export type AlertTone = "info" | "success" | "danger";

export type AlertProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  /** info: worth knowing before acting · success: it worked · danger: something failed and needs action. */
  tone?: AlertTone;
  /** One line: what happened. */
  title: ReactNode;
  /** What it means or what to do next. */
  children?: ReactNode;
  /** One action that resolves it (a Button or TextLink). */
  action?: ReactNode;
};

const icons = { info: Info, success: Check, danger: CircleAlert } as const;

/** An inline message inside the page, next to what it is about. Never a toast for something that needs action. */
export function Alert({ tone = "info", title, children, action, className, ...props }: AlertProps) {
  const Icon = icons[tone];
  return (
    <div
      // danger interrupts (assertive), the others are announced politely when they appear.
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-in-group rounded-control bg-surface-code p-inside-panel text-primary", className)}
      {...props}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-inline size-icon-sm shrink-0",
          tone === "success" && "text-status-success",
          tone === "danger" && "text-status-danger",
        )}
      />
      <div className="flex min-w-0 flex-col gap-inline">
        <p className={cn("font-strong", tone === "danger" && "text-status-danger")}>{title}</p>
        {children ? <div className="max-w-text">{children}</div> : null}
        {action ? <div className="pt-in-group">{action}</div> : null}
      </div>
    </div>
  );
}
