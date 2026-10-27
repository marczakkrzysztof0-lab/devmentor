// Klient Stripe aplikacji (spec #24 Architecture: „Stripe client injected (`getStripe()`; a fake in tests)”).
//
// - Ponowienia sieciowe SDK: `maxNetworkRetries: 2`, `timeout: 20 s` — razem wyraźnie poniżej dzierżawy zwrotu
//   (5 min); SDK ponawia z TYM SAMYM kluczem idempotencji, więc timeout w obrębie próby nie tworzy drugiego zwrotu.
// - `apiBaseUrl` (tylko e2e, lokalny fałszywy Stripe; walidacja w `config.mjs`) przestawia host/port/protokół.
// - Weryfikacja podpisu webhooka funkcją SDK (`Stripe.webhooks.constructEvent`, domyślna tolerancja 300 s).
import Stripe from "stripe";

/**
 * @param {import("./config.mjs").PaymentsConfig} config
 * @returns {Stripe}
 */
export function createStripeClient(config) {
  /** @type {Record<string, unknown>} */
  const options = { maxNetworkRetries: 2, timeout: 20_000, telemetry: false };
  if (config.apiBaseUrl) {
    const url = new URL(config.apiBaseUrl);
    Object.assign(options, { host: url.hostname, port: Number(url.port || 80), protocol: "http" });
  }
  return new Stripe(config.secretKey, /** @type {any} */ (options));
}

/**
 * Weryfikuje podpis `Stripe-Signature` na SUROWYM ciele żądania i zwraca zdarzenie. Rzuca przy złym podpisie
 * albo znaczniku czasu starszym niż 300 s.
 * @param {string} rawBody
 * @param {string} signature
 * @param {string} secret
 */
export function verifyStripeEvent(rawBody, signature, secret) {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}
