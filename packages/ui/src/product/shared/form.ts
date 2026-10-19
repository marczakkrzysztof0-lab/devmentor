// Shared server-action handling for product forms (Form pattern):
// pending → field errors (focus the first) → server error → no network → success.

import { useEffect, type RefObject } from "react";


/** Copy for failures the specs do not word themselves (proposals C1–C2, POSTEP.md). */
export const NETWORK_MESSAGE = "Brak połączenia z internetem — sprawdź sieć i spróbuj ponownie. Wpisane dane zostały w formularzu.";
/** No network on an action that is not a form (accept, cancel, open a provider page) — C6. */
export const NETWORK_ACTION_MESSAGE = "Brak połączenia z internetem — sprawdź sieć i spróbuj ponownie. Nic się nie zmieniło.";
/** No network while loading a region (list, slots) — C6. */
export const NETWORK_LOAD_MESSAGE = "Brak połączenia z internetem — nie udało się wczytać danych. Sprawdź sieć i odśwież.";
export const SERVER_MESSAGE = "Nie udało się zapisać po naszej stronie — spróbuj ponownie za chwilę. Wpisane dane zostały w formularzu.";

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
