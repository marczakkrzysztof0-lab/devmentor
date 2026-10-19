// Storybook-only helpers for stories (never exported from @devmentor/ui).
import type { Decorator } from "@storybook/react-vite";
import type { ReactNode } from "react";

/** Labelled grid for state matrices and variant overviews. Labels are documentation, in English. */
export function StateGrid({ items }: { items: { label: string; node: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap items-start gap-between-groups">
      {items.map((item) => (
        <figure key={item.label} className="flex flex-col gap-in-group">
          <figcaption className="text-meta text-muted font-mono">{item.label}</figcaption>
          {item.node}
        </figure>
      ))}
    </div>
  );
}

/** Renders the story inside a 320 px wide frame (smallest supported width, WCAG 1.4.10). */
export const narrow: Decorator = (Story) => (
  <div data-testid="narrow-frame" style={{ width: 320 }} className="border border-divider p-in-group">
    <Story />
  </div>
);
