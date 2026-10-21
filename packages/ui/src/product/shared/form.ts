// Shared server-action handling for product forms (Form pattern):
// pending → field errors (focus the first) → server error → no network → success.

// No React import here: the barrel `@devmentor/ui/product` re-exports these messages, and an app may
// import the barrel from a Server Component (Next.js). Hooks live in ./use-focus-first-error.ts.

/** Copy for failures the specs do not word themselves (proposals C1–C2, POSTEP.md). */
export const NETWORK_MESSAGE = "Brak połączenia z internetem — sprawdź sieć i spróbuj ponownie. Wpisane dane zostały w formularzu.";
/** No network on an action that is not a form (accept, cancel, open a provider page) — C6. */
export const NETWORK_ACTION_MESSAGE = "Brak połączenia z internetem — sprawdź sieć i spróbuj ponownie. Nic się nie zmieniło.";
/** No network while loading a region (list, slots) — C6. */
export const NETWORK_LOAD_MESSAGE = "Brak połączenia z internetem — nie udało się wczytać danych. Sprawdź sieć i odśwież.";
export const SERVER_MESSAGE = "Nie udało się zapisać po naszej stronie — spróbuj ponownie za chwilę. Wpisane dane zostały w formularzu.";

/**
 * A rejected server action that is really a navigation, not a failure: e.g. Next.js `redirect()` in a
 * server action rejects the caller's promise with an error whose `digest` starts with `NEXT_REDIRECT`
 * while the router already navigates. Components keep their pending state instead of showing the
 * „no network” message (spec #14: accept → /mentor, „Wyloguj” → s03).
 */
export function isNavigationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
