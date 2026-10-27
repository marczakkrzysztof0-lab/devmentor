// Konfiguracja płatności i strażnik trybu testowego (spec #24 Q3–Q5, Q9, Architecture „Env”, krok 1).
//
// - Tylko tryb testowy Stripe (Q5): `STRIPE_SECRET_KEY` musi zaczynać się od `sk_test_` albo `rk_test_`.
//   Klucz live (albo dowolny inny) → `PaymentsUnavailable("live_key")`. Przejście na live to osobna specyfikacja.
// - `PAYMENT_CURRENCIES` to TYLKO lista dozwolonych walut (Q4) — walutę płatności podaje wywołujący
//   (`mentor_pages.currency`). Zapis wielkimi literami, do Stripe małymi.
// - `PLATFORM_COMMISSION_BPS` (0–10000) jest zapisywane na każdej płatności jako migawka (Q3); E02 go nie używa.
// - `CRON_SECRET` (≥ 32 znaki) chroni `/api/internal/jobs` (Q9) — sprawdzany osobno (`readCronSecret`), bo
//   webhook go nie potrzebuje.
// - Żadna z tych zmiennych nie może mieć prefiksu `NEXT_PUBLIC_` (trafiłaby do przeglądarki).
// - Wartości sekretów nigdy nie trafiają do komunikatów błędów ani logów (tylko kod przyczyny).
import { PaymentsUnavailable } from "./errors.mjs";

/** Prefiksy dozwolonych kluczy (tryb testowy: klucz tajny albo ograniczony). */
export const TEST_KEY_PREFIXES = Object.freeze(["sk_test_", "rk_test_"]);
/** Minimalna długość sekretu zadań okresowych (Q9). */
export const CRON_SECRET_MIN_LENGTH = 32;
/**
 * Czas życia sesji Checkout. Spec: 30 min; Stripe wymaga `expires_at` ≥ 30 min od utworzenia sesji, a sesja
 * powstaje po commicie (i bywa ponawiana z tym samym `expires_at` po timeoucie) — 3 min zapasu. Slot zwalnia się
 * najpóźniej po `checkout_expires_at + 10 min` (#17), więc „≤ ~35 min” ze specyfikacji się nie zmienia w praktyce.
 */
export const CHECKOUT_TTL_MINUTES = 33;

/**
 * Minimalne kwoty obciążenia Stripe (jednostki podrzędne). Waluta spoza tabeli nie jest obsługiwana, nawet gdy
 * jest na liście `PAYMENT_CURRENCIES` (bezpieczniej odmówić niż wysłać kwotę, której Stripe nie przyjmie).
 */
export const STRIPE_MINIMUM_MINOR = Object.freeze({
  PLN: 200,
  EUR: 50,
  USD: 50,
  GBP: 30,
  CHF: 50,
  CZK: 1500,
  SEK: 300,
  NOK: 300,
  DKK: 250,
});

/**
 * @typedef {object} PaymentsConfig
 * @property {string} secretKey  klucz Stripe trybu testowego (nigdy nie logować)
 * @property {string} webhookSecret  sekret podpisu webhooka (nigdy nie logować)
 * @property {string[]} currencies  dozwolone waluty, wielkie litery
 * @property {number} commissionBps  prowizja platformy w punktach bazowych (migawka na płatności)
 * @property {string | null} apiBaseUrl  TYLKO testy e2e: adres lokalnego fałszywego Stripe (`STRIPE_API_BASE_URL`)
 */

/**
 * Czyta i sprawdza konfigurację płatności. Rzuca `PaymentsUnavailable` z kodem przyczyny.
 * @param {Record<string, string | undefined>} [env]
 * @returns {PaymentsConfig}
 */
export function readPaymentsConfig(env = process.env) {
  const secretKey = (env.STRIPE_SECRET_KEY ?? "").trim();
  if (secretKey === "") throw new PaymentsUnavailable("missing_secret_key");
  if (!TEST_KEY_PREFIXES.some((prefix) => secretKey.startsWith(prefix))) throw new PaymentsUnavailable("live_key");

  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (webhookSecret === "") throw new PaymentsUnavailable("missing_webhook_secret");

  const currencies = (env.PAYMENT_CURRENCIES ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c !== "");
  if (currencies.length === 0 || currencies.some((c) => !/^[A-Z]{3}$/.test(c))) {
    throw new PaymentsUnavailable("invalid_currencies");
  }

  const bpsText = (env.PLATFORM_COMMISSION_BPS ?? "").trim();
  const commissionBps = Number(bpsText);
  if (!/^\d+$/.test(bpsText) || !Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new PaymentsUnavailable("invalid_commission_bps");
  }

  const apiBaseUrl = readApiBaseUrl(env.STRIPE_API_BASE_URL);
  return { secretKey, webhookSecret, currencies, commissionBps, apiBaseUrl };
}

/**
 * `STRIPE_API_BASE_URL` — wyłącznie dla testów e2e (lokalny fałszywy Stripe). Przyjmowany tylko dla
 * `http://localhost` / `http://127.0.0.1`; każda inna wartość → `PaymentsUnavailable` (nie da się nim
 * przekierować ruchu płatności na obcy host).
 * @param {string | undefined} value
 * @returns {string | null}
 */
function readApiBaseUrl(value) {
  const text = (value ?? "").trim();
  if (text === "") return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new PaymentsUnavailable("invalid_api_base_url");
  }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new PaymentsUnavailable("invalid_api_base_url");
  }
  return url.origin;
}

/**
 * Sekret zadań okresowych. Brak albo krótszy niż 32 znaki → `PaymentsUnavailable("invalid_cron_secret")`
 * (endpoint zadań odpowiada wtedy 503).
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function readCronSecret(env = process.env) {
  const secret = env.CRON_SECRET ?? "";
  if (secret.length < CRON_SECRET_MIN_LENGTH) throw new PaymentsUnavailable("invalid_cron_secret");
  return secret;
}
