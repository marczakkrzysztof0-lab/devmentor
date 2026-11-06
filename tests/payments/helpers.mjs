// Wspólne pomocniki testów płatności (to nie jest plik testowy). Konfiguracja z oczywistymi atrapami — żadnych
// prawdziwych kluczy; klient Stripe to fałszywka z `fake-stripe.mjs`.
import { createFakeStripe } from "./fake-stripe.mjs";

/** Atrapy w kształcie trybu testowego (strażnik wymaga prefiksu `sk_test_`). */
export const TEST_CONFIG = Object.freeze({
  secretKey: "sk_test_PLACEHOLDER_not_a_real_key",
  webhookSecret: "whsec_PLACEHOLDER_tests_only",
  currencies: ["PLN"],
  commissionBps: 1000,
  apiBaseUrl: null,
});

export const CHECKOUT_REQUEST = Object.freeze({
  successUrl: "http://localhost:3000/r/TOKEN?checkout=return&session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "http://localhost:3000/r/TOKEN?checkout=cancel",
  productName: "DevMentor — sesja 25 min (czat tekstowy)",
});

/**
 * Zależności `lib/payments` na pulę schematu testowego: fałszywy Stripe, sterowany zegar, zbierane logi i zdarzenia.
 * @param {{ pool: import("pg").Pool }} db
 * @param {{ subscribers?: any[], start?: Date, record?: boolean }} [options]
 */
export function makeDeps(db, { subscribers, start = new Date("2026-10-27T10:00:00Z"), record = true } = {}) {
  const fake = createFakeStripe();
  const clock = { now: new Date(start) };
  /** @type {Array<{ type: string, paymentId: string }>} */
  const events = [];
  /** @type {Array<[string, string]>} */
  const logs = [];
  const recorder = async (_tx, event) => {
    events.push({ type: event.type, paymentId: event.paymentId });
  };
  const deps = {
    db: db.pool,
    stripe: fake.stripe,
    config: TEST_CONFIG,
    subscribers: subscribers ?? (record ? [recorder] : []),
    now: () => new Date(clock.now),
    log: {
      warn: (...args) => logs.push(["warn", args.join(" ")]),
      error: (...args) => logs.push(["error", args.join(" ")]),
      info: (...args) => logs.push(["info", args.join(" ")]),
    },
    resolveCheckoutRequest: async () => CHECKOUT_REQUEST,
  };
  return {
    deps,
    fake,
    events,
    logs,
    clock,
    /** Przesuwa zegar o `minutes`. */
    advance(minutes) {
      clock.now = new Date(clock.now.getTime() + minutes * 60_000);
    },
  };
}

/** Wiersz płatności z bazy. */
export async function paymentRow(db, id) {
  const { rows } = await db.query("select * from payments where id = $1", [id]);
  return rows[0];
}
