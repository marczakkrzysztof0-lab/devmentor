import { CircleAlert, Inbox, SearchX } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

export type StateKind = "empty" | "error" | "not-found";

export type StateMessageProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  /** empty: nothing here yet · error: could not load · not-found: no such page or no access. */
  kind: StateKind;
  /** Why it is like this, in one line: „Nie masz jeszcze zapytań”. */
  title: ReactNode;
  /** Optional detail or the next step in words. */
  children?: ReactNode;
  /** The one next step (Button or TextLink): „Odśwież”, „Udostępnij swój link”. */
  action?: ReactNode;
  /** Heading level of the title: h1 when the state IS the page (not found), h2 inside a section. */
  titleAs?: "h1" | "h2" | "h3";
};

const icons = { empty: Inbox, error: CircleAlert, "not-found": SearchX } as const;

/** Replaces content that is empty, failed to load or does not exist — and says what to do next. */
export function StateMessage({
  kind,
  title,
  children,
  action,
  titleAs: Heading = "h2",
  className,
  ...props
}: StateMessageProps) {
  const Icon = icons[kind];
  return (
    <div
      role={kind === "error" ? "alert" : undefined}
      className={cn("flex max-w-text flex-col items-start gap-in-group py-between-groups text-primary", className)}
      {...props}
    >
      <Icon aria-hidden="true" className={cn("size-icon-md", kind === "error" ? "text-status-danger" : "text-muted")} />
      <Heading className="font-ui text-heading-section font-strong">{title}</Heading>
      {children ? <div className="text-body text-muted">{children}</div> : null}
      {action ? <div className="pt-in-group">{action}</div> : null}
    </div>
  );
}
