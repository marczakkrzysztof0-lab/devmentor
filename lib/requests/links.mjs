// Adresy związane z zapytaniem (spec #17 Proposed Solution: successUrl / cancelUrl, Token contract).
//
// `NEXT_PUBLIC_APP_URL` czytany w czasie działania przez `Reflect.get` (Next.js wkleja `process.env.NEXT_PUBLIC_*`
// przy buildzie — patrz `lib/mentor-page/editor.ts`).

const APP_URL_ENV = "NEXT_PUBLIC_APP_URL";

/** Adres aplikacji bez końcowego ukośnika; brak → błąd (link w e-mailu i powrót ze Stripe muszą być poprawne). */
export function appBaseUrl(env = process.env) {
  const value = String(Reflect.get(env, APP_URL_ENV) ?? "").trim().replace(/\/+$/, "");
  if (value === "") throw new Error("Brak NEXT_PUBLIC_APP_URL. Uzupełnij plik zmiennych (wzór w .env.example).");
  return value;
}

/** `https://…/r/{token}` — prywatny link dewelopera (token tylko tu; w bazie SHA-256). */
export const requestPageUrl = (/** @type {string} */ baseUrl, /** @type {string} */ token) => `${baseUrl}/r/${token}`;

/** `https://…/mentor/requests/{id}` — szczegóły zapytania dla mentora (#18). */
export const mentorRequestUrl = (/** @type {string} */ baseUrl, /** @type {string} */ requestId) => `${baseUrl}/mentor/requests/${requestId}`;

/**
 * Parametry powrotu z Checkout dla zapytania — deterministyczne z linku i długości (ten sam klucz idempotencji
 * `checkout:<paymentId>` musi dostać te same parametry). Do Stripe nie idzie nic o treści zapytania.
 * @param {string} requestUrl
 * @param {number} lengthMinutes
 * @returns {import("../payments/payments.mjs").CheckoutRequest}
 */
export function checkoutRequestFor(requestUrl, lengthMinutes) {
  return {
    successUrl: `${requestUrl}?checkout=return&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${requestUrl}?checkout=cancel`,
    productName: `DevMentor — sesja ${lengthMinutes} min (czat tekstowy)`,
  };
}
