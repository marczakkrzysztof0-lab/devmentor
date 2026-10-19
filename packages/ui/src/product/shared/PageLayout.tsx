import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export type PageLayoutProps = {
  /** Top navigation (mentor screens only — the developer has none, R02.6). */
  nav?: ReactNode;
  /** `narrow`: text-first pages (share page, request page) at 65 ch; `wide`: mentor lists and editors. */
  width?: "narrow" | "wide";
  children: ReactNode;
  className?: string;
};

/** Page frame: side gutter (16/32 px, K2), max content width (P6), left-aligned, no sidebar (R02.6). */
export function PageLayout({ nav, width = "wide", children, className }: PageLayoutProps) {
  return (
    <div className="min-h-full bg-surface-page font-ui text-primary">
      {nav}
      <main
        className={cn(
          "flex flex-col gap-between-sections px-page-gutter py-between-groups",
          width === "narrow" ? "max-w-text" : "max-w-page",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
