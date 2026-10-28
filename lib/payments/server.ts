// Moduł płatności dla kodu aplikacji Next.js — tylko serwer (spec #24 Architecture).
//
// Składa zależności `lib/payments/*.mjs` z konfiguracji środowiska: pula bazy, klient Stripe (jeden na proces,
// trzymany w `globalThis` jak pula), lista subskrybentów, `resolveCheckoutRequest`. Brak albo zła konfiguracja
// (brak klucza, klucz live, zła lista walut…) → `PaymentsUnavailable` — webhook i zadania odpowiadają 503,
// formularz „Płatności są chwilowo niedostępne”. Sekrety nie trafiają do logów (tylko kod przyczyny).
import "server-only";
import { getPool } from "@/lib/db";
import { readPaymentsConfig } from "./config.mjs";
import { PaymentsUnavailable } from "./errors.mjs";
import type { PaymentsDeps } from "./payments.mjs";
import { createStripeClient, verifyStripeEvent } from "./stripe-client.mjs";
import { PAYMENT_SUBSCRIBERS, resolveCheckoutRequest } from "./subscribers.mjs";

export { PaymentsUnavailable, verifyStripeEvent };
export type { PaymentsDeps };

const CLIENT_KEY = Symbol.for("devmentor.payments.stripe");

type CachedClient = { fingerprint: string; client: ReturnType<typeof createStripeClient> };

/** Zależności modułu płatności. Rzuca `PaymentsUnavailable`, gdy konfiguracja jest niepoprawna. */
export function getPaymentsDeps(): PaymentsDeps {
  const config = readPaymentsConfig(process.env);
  const store = globalThis as unknown as Record<symbol, CachedClient | undefined>;
  const fingerprint = `${config.secretKey}|${config.apiBaseUrl ?? ""}`;
  let cached = store[CLIENT_KEY];
  if (!cached || cached.fingerprint !== fingerprint) {
    cached = { fingerprint, client: createStripeClient(config) };
    store[CLIENT_KEY] = cached;
  }
  return {
    db: getPool(),
    stripe: cached.client,
    config,
    subscribers: PAYMENT_SUBSCRIBERS,
    resolveCheckoutRequest,
    log: console,
  };
}

/** Jak `getPaymentsDeps`, ale `null` zamiast wyjątku `PaymentsUnavailable` (z ostrzeżeniem w logu: tylko kod). */
export function tryGetPaymentsDeps(): PaymentsDeps | null {
  try {
    return getPaymentsDeps();
  } catch (error) {
    if (error instanceof PaymentsUnavailable) {
      console.warn(`[payments] płatności niedostępne: ${error.reason}`);
      return null;
    }
    throw error;
  }
}
