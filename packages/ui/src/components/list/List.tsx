import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

export type ListProps = HTMLAttributes<HTMLUListElement>;

/** Rows of one kind, one under another, separated by a 1 px line (R01.1, R01.3). */
export function List({ className, ...props }: ListProps) {
  return <ul className={cn("flex flex-col border-t border-divider", className)} {...props} />;
}

export type ListRowProps = Omit<HTMLAttributes<HTMLLIElement>, "title"> & {
  /** The thing itself, 1 line: „Kuba · 25 min”. */
  title: ReactNode;
  /** One line of details in meta style: „jutro 12:30–12:55 · zdecyduj przed 12:30”. */
  meta?: ReactNode;
  /** Right side: a state word (StatusText) or one small action (IconButton). */
  end?: ReactNode;
  /** Makes the whole row open this address (the title becomes the link). */
  href?: string;
};

/** One row of a List: title, optional meta line, optional end slot. Never a card. */
export function ListRow({ title, meta, end, href, className, ...props }: ListRowProps) {
  return (
    <li
      className={cn(
        "relative flex items-start justify-between gap-in-group border-b border-divider py-list-row-y",
        href && "transition-colors duration-(--ds-duration-control) ease-standard hover:bg-surface-code",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col">
        {href ? (
          <a
            href={href}
            className={cn(
              "font-ui text-body font-strong text-primary underline-offset-4 hover:underline",
              "rounded-control outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
              // Stretched link: the whole row is the target, the DOM keeps one link per row.
              "after:absolute after:inset-0",
            )}
          >
            {title}
          </a>
        ) : (
          <span className="font-ui text-body font-strong text-primary">{title}</span>
        )}
        {meta ? <span className="text-meta text-muted">{meta}</span> : null}
      </div>
      {end ? <div className="relative shrink-0">{end}</div> : null}
    </li>
  );
}
