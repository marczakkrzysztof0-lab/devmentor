import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /** Read by screen readers instead of the grey blocks: „Wczytywanie terminów”. */
  label: string;
  /** How many placeholder lines to draw (default 3). */
  lines?: number;
};

/** Holds the place of content with a known shape while it loads. Static: nothing moves (P7). */
export function Skeleton({ label, lines = 3, className, ...props }: SkeletonProps) {
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-in-group", className)} {...props}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "block h-between-groups rounded-control bg-surface-code",
            index === lines - 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  );
}
