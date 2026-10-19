"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  /** Accessible name naming the action AND the object, e.g. „Usuń okno wtorek 18:00–20:00” (P1). */
  label: string;
  /** A lucide-react icon. It is hidden from screen readers; `label` is the name. */
  icon: ReactNode;
};

/** A small action without visible text. Only for "×" (remove) in repeated rows (P1). */
export function IconButton({ label, icon, className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-control border border-transparent p-inline text-muted",
        "cursor-pointer transition-colors duration-(--ds-duration-control) ease-standard",
        "hover:bg-surface-code hover:text-primary active:bg-surface-code active:text-primary",
        "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
        "disabled:cursor-not-allowed disabled:text-muted",
        "[&_svg]:size-icon-md [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
}
