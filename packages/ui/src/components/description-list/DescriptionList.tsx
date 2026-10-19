import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export type DescriptionItem = {
  /** What the fact is: „Termin”, „Kwota”, „Do wypłaty”. */
  label: ReactNode;
  /** The fact itself; amounts through `Amount`, times with the zone named nearby. */
  value: ReactNode;
  /** The one main fact of the screen (e.g. the balance): larger, stronger. At most one per list (A3). */
  emphasis?: boolean;
};

export type DescriptionListProps = {
  items: DescriptionItem[];
  /** Names the list for screen readers when there is no heading right above it. */
  "aria-label"?: string;
  className?: string;
};

/** Label–value facts of one object, rows separated by 1 px lines (R01.3). Extracted from RequestSummary (A1). */
export function DescriptionList({ items, className, ...props }: DescriptionListProps) {
  return (
    <dl aria-label={props["aria-label"]} className={cn("flex flex-col border-t border-divider", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex flex-wrap items-baseline justify-between gap-in-group border-b border-divider py-list-row-y">
          <dt className="text-muted">{item.label}</dt>
          <dd className={cn("text-right", item.emphasis && "text-heading-section font-strong")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
