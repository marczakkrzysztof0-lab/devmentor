// Błędy modułu płatności (spec #24, API Contracts). Wywołujący rozpoznaje je po `name` (albo `instanceof`),
// nigdy po treści komunikatu. Komunikaty nie zawierają sekretów ani treści błędów Stripe.

/** Brak albo niepoprawna konfiguracja płatności (brak klucza, klucz live, zła waluta…). Webhook i zadania → 503. */
export class PaymentsUnavailable extends Error {
  /** @param {string} reason krótki kod przyczyny, np. `missing_secret_key`, `live_key` */
  constructor(reason) {
    super(`Płatności niedostępne: ${reason}`);
    this.name = "PaymentsUnavailable";
    this.reason = reason;
  }
}

/** Kwota albo waluta, której nie da się pobrać (spoza listy `PAYMENT_CURRENCIES` albo poniżej minimum Stripe). */
export class InvalidAmount extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(`Niepoprawna kwota płatności: ${reason}`);
    this.name = "InvalidAmount";
    this.reason = reason;
  }
}

/**
 * Nie udało się otworzyć Checkout. `retryable: true` — odpowiedź niejednoznaczna (timeout, sieć, 5xx, 409, 429):
 * płatność zostaje `pending`, ponowienie z tym samym kluczem idempotencji odzyska sesję. `retryable: false` —
 * odpowiedź jednoznaczna (4xx): płatność już `expired`.
 */
export class CheckoutFailed extends Error {
  /** @param {{ retryable: boolean, code?: string | null }} details */
  constructor({ retryable, code = null }) {
    super(`Nie udało się otworzyć płatności (${retryable ? "do ponowienia" : "ostatecznie"})`);
    this.name = "CheckoutFailed";
    this.retryable = retryable;
    this.code = code;
  }
}

/**
 * Czy błąd Stripe jest JEDNOZNACZNY (4xx inne niż 409/429): Stripe na pewno nic nie utworzył.
 * Brak statusu (sieć, timeout), 5xx, 409 (konflikt klucza idempotencji), 429 → niejednoznaczny.
 * @param {unknown} error
 */
export function isDefinitiveStripeError(error) {
  const e = /** @type {{ statusCode?: unknown, type?: unknown, rawType?: unknown }} */ (error ?? {});
  // Błąd idempotencji (ten sam klucz, inne parametry) znaczy, że Stripe JUŻ coś utworzył pod tym kluczem.
  if (String(e.type ?? "").toLowerCase().includes("idempotency") || String(e.rawType ?? "").includes("idempotency")) return false;
  const status = e.statusCode;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 409 && status !== 429;
}

/**
 * Zapis błędu Stripe do bazy i logów: TYLKO kod i id żądania Stripe — nigdy komunikat (może powtarzać dane wejściowe).
 * @param {unknown} error
 * @returns {string}
 */
export function stripeErrorSummary(error) {
  const e = /** @type {{ code?: unknown, type?: unknown, statusCode?: unknown, requestId?: unknown }} */ (error ?? {});
  const code = typeof e.code === "string" ? e.code : typeof e.type === "string" ? e.type : "unknown_error";
  const status = typeof e.statusCode === "number" ? ` http=${e.statusCode}` : "";
  const request = typeof e.requestId === "string" ? ` request=${e.requestId}` : "";
  return `${code}${status}${request}`.slice(0, 200);
}
