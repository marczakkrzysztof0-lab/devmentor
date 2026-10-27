// Fałszywy klient Stripe dla testów `lib/payments` (spec #24: „Stripe client injected; a fake in tests”).
// To nie jest plik testowy (*.test.mjs).
//
// Naśladuje to, na czym polega moduł płatności:
// - klucze idempotencji: ten sam klucz + te same parametry → ta sama odpowiedź (także po „timeoucie” po utworzeniu),
//   ten sam klucz + inne parametry → błąd idempotencji (400);
// - Checkout: `create` / `retrieve` / `expire` (wygaszenie zakończonej sesji → 400), `completeSession` (test „płaci”);
// - zwroty: `list` / `create` / `retrieve`, pełny zwrot, odmowa zwrotu ponad kwotę (`charge_already_refunded`);
// - wstrzykiwanie błędów: `fail(metoda, błąd, { times, afterEffect })` — `afterEffect: true` = Stripe wykonał
//   operację, ale odpowiedź nie dotarła (timeout);
// - opóźnienie (`delayMs`) do testów współbieżności; lista wywołań (`calls`) do asercji.

/** Błąd w kształcie błędów SDK Stripe (`statusCode`, `code`, `type`, `requestId`). */
export function stripeError({ statusCode, code = null, type = "StripeAPIError", message = "fake stripe error" } = {}) {
  const error = new Error(message);
  Object.assign(error, { statusCode, code, type, requestId: `req_fake_${Math.random().toString(36).slice(2, 8)}` });
  return error;
}

export const timeoutError = () => stripeError({ type: "StripeConnectionError", message: "timeout" });
export const serverError = () => stripeError({ statusCode: 500, type: "StripeAPIError", code: "api_error" });
export const invalidRequestError = (code = "parameter_invalid") => stripeError({ statusCode: 400, type: "StripeInvalidRequestError", code });

const clone = (value) => structuredClone(value);

export function createFakeStripe({ delayMs = 0 } = {}) {
  let seq = 0;
  const run = Math.random().toString(36).slice(2, 8);
  const next = (prefix) => `${prefix}_test_fake${run}${++seq}`;
  /** @type {Map<string, any>} */
  const sessions = new Map();
  /** @type {Map<string, any>} */
  const refunds = new Map();
  /** @type {Map<string, { params: string, result: any }>} */
  const idempotency = new Map();
  /** @type {Map<string, Array<{ error: Error, afterEffect: boolean }>>} */
  const failures = new Map();
  /** @type {Array<{ method: string, params?: any, options?: any }>} */
  const calls = [];
  const state = { delayMs, refundStatus: "succeeded" };

  const wait = () => (state.delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, state.delayMs)) : Promise.resolve());

  async function call(method, params, options, effect) {
    calls.push({ method, params: params === undefined ? undefined : clone(params), options });
    await wait();
    const queue = failures.get(method) ?? [];
    const failure = queue.shift();
    if (failure && !failure.afterEffect) throw failure.error;
    const key = options?.idempotencyKey;
    // Jak Stripe: odpowiedź na klucz idempotencji to migawka z chwili pierwszego wykonania.
    let snapshot;
    if (key && idempotency.has(key)) {
      const saved = idempotency.get(key);
      if (saved.params !== JSON.stringify(params)) throw stripeError({ statusCode: 400, type: "StripeIdempotencyError", code: "idempotency_error" });
      snapshot = saved.result;
    } else {
      const result = effect();
      snapshot = typeof result === "string" ? clone(sessions.get(result) ?? refunds.get(result)) : clone(result);
      if (key) idempotency.set(key, { params: JSON.stringify(params), result: snapshot });
    }
    if (failure?.afterEffect) throw failure.error;
    return clone(snapshot);
  }

  const paidAmount = (paymentIntent) => [...sessions.values()].find((s) => s.payment_intent === paymentIntent)?.amount_total ?? 0;
  const refundedAmount = (paymentIntent) =>
    [...refunds.values()].filter((r) => r.payment_intent === paymentIntent && r.status !== "failed" && r.status !== "canceled").reduce((sum, r) => sum + r.amount, 0);

  const stripe = {
    checkout: {
      sessions: {
        create: (params, options) =>
          call("checkout.sessions.create", params, options, () => {
            const id = next("cs");
            const item = params.line_items[0].price_data;
            sessions.set(id, {
              id,
              object: "checkout.session",
              status: "open",
              payment_status: "unpaid",
              url: `https://checkout.stripe.test/c/pay/${id}`,
              amount_total: item.unit_amount,
              currency: item.currency,
              metadata: { ...params.metadata },
              expires_at: params.expires_at,
              success_url: params.success_url,
              cancel_url: params.cancel_url,
              payment_intent: null,
              customer_details: null,
            });
            return id;
          }),
        retrieve: (id) =>
          call("checkout.sessions.retrieve", { id }, undefined, () => {
            if (!sessions.has(id)) throw stripeError({ statusCode: 404, type: "StripeInvalidRequestError", code: "resource_missing" });
            return id;
          }),
        expire: (id) =>
          call("checkout.sessions.expire", { id }, undefined, () => {
            const session = sessions.get(id);
            if (!session) throw stripeError({ statusCode: 404, type: "StripeInvalidRequestError", code: "resource_missing" });
            if (session.status !== "open") throw invalidRequestError("checkout_session_not_open");
            session.status = "expired";
            session.url = null;
            return id;
          }),
      },
    },
    refunds: {
      list: (params) =>
        call("refunds.list", params, undefined, () => ({
          object: "list",
          data: [...refunds.values()].filter((r) => r.payment_intent === params.payment_intent).map(clone),
        })),
      create: (params, options) =>
        call("refunds.create", params, options, () => {
          const total = paidAmount(params.payment_intent);
          if (total === 0) throw invalidRequestError("resource_missing");
          if (refundedAmount(params.payment_intent) >= total) throw invalidRequestError("charge_already_refunded");
          const id = next("re");
          refunds.set(id, { id, object: "refund", status: state.refundStatus, amount: total, payment_intent: params.payment_intent, metadata: { ...params.metadata } });
          return id;
        }),
      retrieve: (id) =>
        call("refunds.retrieve", { id }, undefined, () => {
          if (!refunds.has(id)) throw stripeError({ statusCode: 404, type: "StripeInvalidRequestError", code: "resource_missing" });
          return id;
        }),
    },
  };

  return {
    stripe,
    calls,
    sessions,
    refunds,
    /** Ustawia stan zwrotów tworzonych od teraz (`succeeded` | `pending`). */
    setRefundStatus(status) {
      state.refundStatus = status;
    },
    setDelay(ms) {
      state.delayMs = ms;
    },
    /** Kolejny wywołanie `method` rzuci `error` (`times` razy); `afterEffect` — po wykonaniu operacji. */
    fail(method, error, { times = 1, afterEffect = false } = {}) {
      const queue = failures.get(method) ?? [];
      for (let i = 0; i < times; i += 1) queue.push({ error: typeof error === "function" ? error() : error, afterEffect });
      failures.set(method, queue);
    },
    /** Deweloper płaci: sesja `complete` + `paid`, nowy PaymentIntent. */
    completeSession(id, { email = "kuba@example.com" } = {}) {
      const session = sessions.get(id);
      session.status = "complete";
      session.payment_status = "paid";
      session.payment_intent = next("pi");
      session.customer_details = { email };
      session.url = null;
      return clone(session);
    },
    /** Stripe sam wygasza sesję (czas minął). */
    expireSession(id) {
      const session = sessions.get(id);
      session.status = "expired";
      session.url = null;
      return clone(session);
    },
    /** Zmienia stan istniejącego zwrotu (np. `pending → succeeded`). */
    setRefund(id, status) {
      refunds.get(id).status = status;
      return clone(refunds.get(id));
    },
    count: (method) => calls.filter((c) => c.method === method).length,
  };
}
