import { useId, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn";

export type PanelProps = HTMLAttributes<HTMLElement> & {
  /** Optional section heading; when set the panel becomes a labelled region (`<section>`). */
  title?: ReactNode;
  /** Heading level for `title`: h2 on a page, h3 inside a section. */
  titleAs?: "h2" | "h3";
};

/** A quiet surface that groups one block of main content: the editor form, the "save this link" box. */
export function Panel({ title, titleAs: Heading = "h2", className, children, ...props }: PanelProps) {
  const titleId = useId();
  const Tag = title ? "section" : "div";
  return (
    <Tag
      aria-labelledby={title ? titleId : undefined}
      className={cn(
        "flex flex-col gap-in-group rounded-control border border-divider bg-surface-panel p-inside-panel text-primary",
        className,
      )}
      {...props}
    >
      {title ? (
        <Heading id={titleId} className="font-ui text-heading-section font-strong">
          {title}
        </Heading>
      ) : null}
      {children}
    </Tag>
  );
}
