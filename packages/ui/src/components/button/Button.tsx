"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { useId, type ButtonHTMLAttributes, type MouseEvent } from "react";

import { cn } from "../../lib/cn";
import { Spinner } from "../spinner/Spinner";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-in-group rounded-control border",
    "px-inside-panel py-in-group font-ui text-body font-strong text-center",
    "cursor-pointer select-none transition-colors duration-(--ds-duration-control) ease-standard",
    "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
    "aria-busy:cursor-progress",
    // Unavailable with a reason (not while loading: a loading button keeps its look, spec #17).
    "data-disabled:cursor-not-allowed data-disabled:border-control data-disabled:bg-surface-code data-disabled:text-muted",
  ],
  {
    variants: {
      variant: {
        /** The one main action of a screen (R01.5, P18). */
        primary: [
          "border-action-primary-fill bg-action-primary-fill text-on-action",
          "hover:border-action-primary-fill-hover hover:bg-action-primary-fill-hover",
          "active:border-action-primary-fill-hover active:bg-action-primary-fill-hover",
        ],
        /** Every other action on the screen. */
        secondary: ["border-control bg-surface-panel text-primary", "hover:bg-surface-code active:bg-surface-code"],
      },
      fullWidth: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "secondary", fullWidth: false },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Next.js `<Link>`) with button styles. */
    asChild?: boolean;
    /** Waiting for the server: shows a spinner, keeps the label, ignores clicks (spec #17). */
    loading?: boolean;
    /** Makes the action unavailable AND says why, as text under the button (never a silent disabled). */
    disabledReason?: string;
  };

/** Starts an action. One `primary` per screen; everything else `secondary`. */
export function Button({
  variant,
  fullWidth,
  asChild = false,
  loading = false,
  disabledReason,
  className,
  children,
  onClick,
  type = "button",
  ...props
}: ButtonProps) {
  const reasonId = useId();
  const unavailable = loading || Boolean(disabledReason);
  const Comp = asChild ? Slot.Root : "button";

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (unavailable) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const button = (
    <Comp
      {...props}
      type={asChild ? undefined : type}
      aria-disabled={unavailable || undefined}
      aria-busy={loading || undefined}
      data-disabled={disabledReason ? "" : undefined}
      aria-describedby={disabledReason ? reasonId : props["aria-describedby"]}
      className={cn(buttonVariants({ variant, fullWidth }), className)}
      onClick={handleClick}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner /> : null}
          {children}
        </>
      )}
    </Comp>
  );

  if (!disabledReason) return button;
  return (
    <span className={cn("inline-flex flex-col gap-inline", fullWidth && "w-full")}>
      {button}
      <span id={reasonId} className="text-meta text-muted">
        {disabledReason}
      </span>
    </span>
  );
}
