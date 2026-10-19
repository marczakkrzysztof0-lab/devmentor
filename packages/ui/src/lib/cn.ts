import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know our token names, otherwise it treats `text-meta` (size)
// and `text-muted` (colour) as the same group and drops one of them.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "surface-page",
        "surface-panel",
        "surface-code",
        "surface-scrim",
        "action-primary-fill",
        "action-primary-fill-hover",
        "primary",
        "muted",
        "on-action",
        "link",
        "status-success",
        "status-danger",
        "divider",
        "control",
        "focus-ring",
      ],
      text: ["meta", "body", "heading-section", "heading-page"],
      spacing: [
        "inline",
        "in-group",
        "inside-panel",
        "between-groups",
        "between-sections",
        "page-gutter",
        "list-row-y",
        "chat-message-gap",
        "icon-sm",
        "icon-md",
      ],
      radius: ["control"],
      "font-weight": ["regular", "strong"],
      container: ["text", "page"],
      ease: ["standard"],
    },
  },
});

/** Joins class names and resolves Tailwind conflicts (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
