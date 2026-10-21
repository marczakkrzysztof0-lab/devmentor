// Form pattern: after a failed submit, move focus to the first invalid control. Client components only
// (kept out of ./form.ts so that the messages can be imported from Server Components).
import { useEffect, type RefObject } from "react";

/** After a failed submit, move focus to the first invalid control (spec #14, #17). */
export function useFocusFirstError(formRef: RefObject<HTMLFormElement | null>, attempt: number) {
  useEffect(() => {
    if (attempt === 0) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    // A radio group is not focusable itself: focus its checked radio, or the first one.
    const target = first?.getAttribute("role") === "radiogroup"
      ? (first.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? first.querySelector<HTMLElement>('[role="radio"]'))
      : first;
    target?.focus();
  }, [attempt, formRef]);
}
