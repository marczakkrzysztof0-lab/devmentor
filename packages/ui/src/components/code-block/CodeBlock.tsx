import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export type CodeBlockProps = HTMLAttributes<HTMLPreElement> & {
  /** The code, exactly as typed. Rendered as text — never as HTML. */
  code: string;
  /** Names the block for screen readers, e.g. „Kod z pytania”. */
  label?: string;
};

/** Shows pasted code as written: monospace, line breaks kept, scrolls sideways instead of wrapping. */
export function CodeBlock({ code, label = "Kod", className, ...props }: CodeBlockProps) {
  return (
    <pre
      // Keyboard users must be able to scroll a wide block (WCAG 2.1.1, axe scrollable-region-focusable).
      tabIndex={0}
      aria-label={label}
      className={cn(
        "overflow-x-auto rounded-control bg-surface-code p-inside-panel font-mono text-meta text-primary",
        "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
        className,
      )}
      {...props}
    >
      <code>{code}</code>
    </pre>
  );
}

export type InlineCodeProps = HTMLAttributes<HTMLElement>;

/** A short piece of code, a path or a slug inside a sentence, e.g. /m/anna-k. */
export function InlineCode({ className, ...props }: InlineCodeProps) {
  return (
    <code
      className={cn("rounded-control bg-surface-code px-inline font-mono text-primary break-all", className)}
      {...props}
    />
  );
}
