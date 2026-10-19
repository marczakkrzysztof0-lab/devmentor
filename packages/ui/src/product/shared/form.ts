// Shared server-action handling for product forms (Form pattern):
// pending → field errors (focus the first) → server error → no network → success.

import { useEffect, type RefObject } from "react";


/** Copy for failures the specs do not word themselves (proposals C1–C2, POSTEP.md). */
export const NETWORK_MESSAGE = "Brak połączenia z internetem — sprawdź sieć i spróbuj ponownie. Wpisane dane zostały w formularzu.";
export const SERVER_MESSAGE = "Nie udało się zapisać po naszej stronie — spróbuj ponownie za chwilę. Wpisane dane zostały w formularzu.";

/** After a failed submit, move focus to the first invalid control (spec #14, #17). */
export function useFocusFirstError(formRef: RefObject<HTMLFormElement | null>, attempt: number) {
  useEffect(() => {
    if (attempt === 0) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.focus();
  }, [attempt, formRef]);
}
