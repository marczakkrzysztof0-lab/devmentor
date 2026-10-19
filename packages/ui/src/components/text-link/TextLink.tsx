import { ExternalLink } from "lucide-react";
import { Slot } from "radix-ui";
import type { AnchorHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export type TextLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Opens in a new tab: adds the icon, a hidden „(otwiera się w nowej karcie)” and `rel="noopener"`. */
  external?: boolean;
  /** Render the child element (e.g. a Next.js `<Link>`) with link styles. */
  asChild?: boolean;
};

/** Takes the user to another page or site. Underlined, so it is never recognised by colour alone. */
export function TextLink({ external = false, asChild = false, className, children, rel, target, ...props }: TextLinkProps) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      className={cn(
        "inline-flex items-center gap-inline rounded-control font-ui text-link underline underline-offset-4",
        "decoration-1 hover:decoration-2 transition-colors duration-(--ds-duration-control) ease-standard",
        "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
        className,
      )}
      target={external ? "_blank" : target}
      rel={external ? (rel ?? "noopener") : rel}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {children}
          {external ? (
            <>
              <ExternalLink aria-hidden="true" className="size-icon-sm shrink-0" />
              <span className="sr-only"> (otwiera się w nowej karcie)</span>
            </>
          ) : null}
        </>
      )}
    </Comp>
  );
}
