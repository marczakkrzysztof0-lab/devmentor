// Konfiguracja płatności i klasyfikacja błędów Stripe (spec #24 Q3–Q5, Q9; lib/payments/config.mjs, errors.mjs).
// Wyłącznie oczywiste atrapy wartości — żadnych prawdziwych kluczy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readPaymentsConfig, readCronSecret } from "../../lib/payments/config.mjs";
import { PaymentsUnavailable, isDefinitiveStripeError, stripeErrorSummary } from "../../lib/payments/errors.mjs";

const SECRET = "sk_test_PLACEHOLDER";
const WEBHOOK = "whsec_PLACEHOLDER";

const baseEnv = (overrides = {}) => ({
  STRIPE_SECRET_KEY: SECRET,
  STRIPE_WEBHOOK_SECRET: WEBHOOK,
  PAYMENT_CURRENCIES: "PLN",
  PLATFORM_COMMISSION_BPS: "1000",
  ...overrides,
});

function reasonOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof PaymentsUnavailable, `oczekiwano PaymentsUnavailable, jest: ${error}`);
    assert.equal(error.name, "PaymentsUnavailable");
    return error.reason;
  }
  assert.fail("oczekiwano błędu PaymentsUnavailable");
}

test("poprawna konfiguracja: wartości przepisane, apiBaseUrl null", () => {
  assert.deepEqual(readPaymentsConfig(baseEnv()), {
    secretKey: SECRET,
    webhookSecret: WEBHOOK,
    currencies: ["PLN"],
    commissionBps: 1000,
    apiBaseUrl: null,
  });
});

test("brak klucza albo klucz z samych spacji → missing_secret_key", () => {
  assert.equal(reasonOf(() => readPaymentsConfig(baseEnv({ STRIPE_SECRET_KEY: undefined }))), "missing_secret_key");
  assert.equal(reasonOf(() => readPaymentsConfig(baseEnv({ STRIPE_SECRET_KEY: "   " }))), "missing_secret_key");
});

test("klucz live albo klucz publikowalny → live_key", () => {
  for (const key of ["sk_live_PLACEHOLDER", "pk_test_PLACEHOLDER", "rk_live_PLACEHOLDER", "cokolwiek"]) {
    assert.equal(reasonOf(() => readPaymentsConfig(baseEnv({ STRIPE_SECRET_KEY: key }))), "live_key", key);
  }
});

test("klucze sk_test_ i rk_test_ są przyjmowane", () => {
  for (const key of ["sk_test_PLACEHOLDER", "rk_test_PLACEHOLDER"]) {
    assert.equal(readPaymentsConfig(baseEnv({ STRIPE_SECRET_KEY: key })).secretKey, key);
  }
});

test("brak sekretu webhooka → missing_webhook_secret", () => {
  assert.equal(reasonOf(() => readPaymentsConfig(baseEnv({ STRIPE_WEBHOOK_SECRET: undefined }))), "missing_webhook_secret");
  assert.equal(reasonOf(() => readPaymentsConfig(baseEnv({ STRIPE_WEBHOOK_SECRET: " " }))), "missing_webhook_secret");
});

test("waluty: wielkie litery, obcięte spacje, puste elementy pomijane", () => {
  const config = readPaymentsConfig(baseEnv({ PAYMENT_CURRENCIES: " pln , eur,, Usd " }));
  assert.deepEqual(config.currencies, ["PLN", "EUR", "USD"]);
});

test("waluty: brak, pusta lista albo zły format → invalid_currencies", () => {
  for (const value of [undefined, "", " , ", "PL", "PLNN", "P1N", "PLN,PL"]) {
    assert.equal(
      reasonOf(() => readPaymentsConfig(baseEnv({ PAYMENT_CURRENCIES: value }))),
      "invalid_currencies",
      String(value),
    );
  }
});

test("prowizja: 0 i 10000 poprawne", () => {
  assert.equal(readPaymentsConfig(baseEnv({ PLATFORM_COMMISSION_BPS: "0" })).commissionBps, 0);
  assert.equal(readPaymentsConfig(baseEnv({ PLATFORM_COMMISSION_BPS: "10000" })).commissionBps, 10000);
});

test("prowizja: -1, 10001, 1.5, abc, pusta, brak → invalid_commission_bps", () => {
  for (const value of ["-1", "10001", "1.5", "abc", "", undefined, "1e3"]) {
    assert.equal(
      reasonOf(() => readPaymentsConfig(baseEnv({ PLATFORM_COMMISSION_BPS: value }))),
      "invalid_commission_bps",
      String(value),
    );
  }
});

test("STRIPE_API_BASE_URL: tylko http://localhost i http://127.0.0.1 (zapisany origin)", () => {
  assert.equal(readPaymentsConfig(baseEnv({ STRIPE_API_BASE_URL: "http://localhost:12111" })).apiBaseUrl, "http://localhost:12111");
  assert.equal(readPaymentsConfig(baseEnv({ STRIPE_API_BASE_URL: "http://127.0.0.1:9/sciezka" })).apiBaseUrl, "http://127.0.0.1:9");
  assert.equal(readPaymentsConfig(baseEnv({ STRIPE_API_BASE_URL: "  " })).apiBaseUrl, null);
});

test("STRIPE_API_BASE_URL: obcy host, https i śmieci → invalid_api_base_url", () => {
  for (const value of [
    "https://evil.example",
    "http://evil.example",
    "https://localhost",
    "http://localhost.evil.example",
    "http://127.0.0.1.evil.example",
    "nie-adres",
  ]) {
    assert.equal(
      reasonOf(() => readPaymentsConfig(baseEnv({ STRIPE_API_BASE_URL: value }))),
      "invalid_api_base_url",
      value,
    );
  }
});

test("komunikaty błędów nigdy nie zawierają wartości sekretów", () => {
  const cases = [
    baseEnv({ STRIPE_SECRET_KEY: "sk_live_PLACEHOLDER_SEKRET" }),
    baseEnv({ STRIPE_WEBHOOK_SECRET: "" }),
    baseEnv({ PAYMENT_CURRENCIES: "PL" }),
    baseEnv({ PLATFORM_COMMISSION_BPS: "-1" }),
    baseEnv({ STRIPE_API_BASE_URL: "https://evil.example" }),
  ];
  for (const env of cases) {
    try {
      readPaymentsConfig(env);
      assert.fail("oczekiwano błędu");
    } catch (error) {
      for (const secret of [env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET, WEBHOOK]) {
        if (secret) assert.ok(!error.message.includes(secret), error.message);
      }
    }
  }
});

test("CRON_SECRET: 32 znaki wystarczą", () => {
  const ok = "x".repeat(32);
  assert.equal(readCronSecret({ CRON_SECRET: ok }), ok);
});

test("CRON_SECRET: brak albo 31 znaków → invalid_cron_secret, bez wartości w komunikacie", () => {
  assert.equal(reasonOf(() => readCronSecret({})), "invalid_cron_secret");
  const short = "krotki-sekret-PLACEHOLDER-31-zn".slice(0, 31);
  assert.equal(short.length, 31);
  try {
    readCronSecret({ CRON_SECRET: short });
    assert.fail("oczekiwano błędu");
  } catch (error) {
    assert.equal(error.reason, "invalid_cron_secret");
    assert.ok(!error.message.includes(short));
  }
});

test("isDefinitiveStripeError: 400, 402, 404 jednoznaczne", () => {
  for (const statusCode of [400, 402, 404]) {
    assert.equal(isDefinitiveStripeError({ statusCode }), true, String(statusCode));
  }
});

test("isDefinitiveStripeError: 409, 429, 5xx, brak statusu i błąd idempotencji niejednoznaczne", () => {
  for (const error of [
    { statusCode: 409 },
    { statusCode: 429 },
    { statusCode: 500 },
    { statusCode: 503 },
    {},
    null,
    undefined,
    { statusCode: "400" },
    { statusCode: 400, type: "StripeIdempotencyError" },
    { statusCode: 400, rawType: "idempotency_error" },
  ]) {
    assert.equal(isDefinitiveStripeError(error), false, JSON.stringify(error));
  }
});

test("stripeErrorSummary: kod, status i id żądania; nigdy message", () => {
  const summary = stripeErrorSummary({
    code: "card_declined",
    statusCode: 402,
    requestId: "req_PLACEHOLDER",
    message: "Twoja karta 4242 została odrzucona dla jan@example.com",
  });
  assert.equal(summary, "card_declined http=402 request=req_PLACEHOLDER");
  assert.ok(!summary.includes("4242"));
  assert.ok(!summary.includes("jan@example.com"));
});

test("stripeErrorSummary: bez kodu używa type, potem unknown_error; przycina do 200 znaków", () => {
  assert.equal(stripeErrorSummary({ type: "StripeConnectionError", message: "tajne" }), "StripeConnectionError");
  assert.equal(stripeErrorSummary(null), "unknown_error");
  assert.equal(stripeErrorSummary({ code: "x".repeat(500) }).length, 200);
});
