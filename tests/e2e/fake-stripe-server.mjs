// Lokalny fałszywy Stripe dla testów e2e i zrzutów ekranu (to nie jest plik testowy). Bez kluczy i bez sieci:
// aplikacja pod `next start` dostaje `STRIPE_API_BASE_URL=http://127.0.0.1:<port>` (przyjmowane tylko dla
// localhost — `lib/payments/config.mjs`) i atrapy `sk_test_…`/`whsec_…`.
//
// Obsługuje to, czego używa przepływ zapytania: utworzenie sesji Checkout (z kluczem idempotencji), odczyt,
// wygaszenie; prostą „stronę płatności” `/pay/<id>` z przyciskami „Zapłać (test)” (→ success_url z id sesji)
// i „Wróć” (→ cancel_url). Zwroty: lista/utworzenie/odczyt (pełny zwrot, od razu `succeeded`).
// Uruchamiany przez `scripts/test-e2e.mjs` i skrypt zrzutów ekranu.
import { createServer } from "node:http";

/** @param {{ port?: number }} [options] */
export function startFakeStripeServer({ port = 0 } = {}) {
  let seq = 0;
  const id = (prefix) => `${prefix}_test_e2e${Date.now().toString(36)}${++seq}`;
  /** @type {Map<string, any>} */
  const sessions = new Map();
  /** @type {Map<string, any>} */
  const refunds = new Map();
  /** @type {Map<string, string>} */
  const idempotency = new Map();
  let base = "";

  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json", "request-id": `req_e2e_${++seq}` });
    res.end(JSON.stringify(body));
  };
  const error = (res, status, code) => json(res, status, { error: { type: "invalid_request_error", code, message: code } });
  const readBody = (req) =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(new URLSearchParams(data)));
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", base || "http://127.0.0.1");
    const parts = url.pathname.split("/").filter(Boolean);
    const form = req.method === "POST" ? await readBody(req) : new URLSearchParams();
    const key = req.headers["idempotency-key"];

    // ---- strona płatności (zamiast checkout.stripe.com)
    if (parts[0] === "pay" && parts[1] && sessions.has(parts[1])) {
      const session = sessions.get(parts[1]);
      if (req.method === "POST" && parts[2] === "complete") {
        if (session.status === "open") {
          session.status = "complete";
          session.payment_status = "paid";
          session.payment_intent = id("pi");
          session.customer_details = { email: "deweloper@example.com" };
          session.url = null;
        }
        res.writeHead(303, { location: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id) });
        return res.end();
      }
      const amount = (session.amount_total / 100).toFixed(2).replace(".", ",");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><html lang="pl"><meta charset="utf-8"><title>Stripe Checkout (test e2e)</title>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto">
<p><strong>Fałszywy Stripe Checkout — tryb testowy e2e</strong></p>
<h1>${amount} ${session.currency.toUpperCase()}</h1><p>${session.product_name}</p>
<form method="post" action="/pay/${session.id}/complete"><button type="submit">Zapłać (test)</button></form>
<p><a href="${session.cancel_url}">Wróć</a></p></body></html>`);
    }

    if (parts[0] !== "v1") return error(res, 404, "resource_missing");

    // ---- Checkout Sessions
    if (parts[1] === "checkout" && parts[2] === "sessions") {
      if (req.method === "POST" && parts.length === 3) {
        if (key && idempotency.has(key)) return json(res, 200, sessions.get(idempotency.get(key)));
        const expiresAt = Number(form.get("expires_at"));
        if (expiresAt && expiresAt * 1000 < Date.now() + 29 * 60_000) return error(res, 400, "parameter_invalid_integer");
        const sessionId = id("cs");
        const session = {
          id: sessionId,
          object: "checkout.session",
          status: "open",
          payment_status: "unpaid",
          url: `${base}/pay/${sessionId}`,
          amount_total: Number(form.get("line_items[0][price_data][unit_amount]")),
          currency: form.get("line_items[0][price_data][currency]"),
          product_name: form.get("line_items[0][price_data][product_data][name]"),
          metadata: { payment_id: form.get("metadata[payment_id]") },
          success_url: form.get("success_url"),
          cancel_url: form.get("cancel_url"),
          expires_at: expiresAt,
          payment_intent: null,
          customer_details: null,
        };
        sessions.set(sessionId, session);
        if (key) idempotency.set(key, sessionId);
        return json(res, 200, session);
      }
      const session = sessions.get(parts[3]);
      if (!session) return error(res, 404, "resource_missing");
      if (req.method === "GET") return json(res, 200, session);
      if (req.method === "POST" && parts[4] === "expire") {
        if (session.status !== "open") return error(res, 400, "checkout_session_not_open");
        session.status = "expired";
        session.url = null;
        return json(res, 200, session);
      }
    }

    // ---- Refunds
    if (parts[1] === "refunds") {
      if (req.method === "GET" && parts.length === 2) {
        const pi = url.searchParams.get("payment_intent");
        return json(res, 200, { object: "list", data: [...refunds.values()].filter((r) => r.payment_intent === pi), has_more: false });
      }
      if (req.method === "POST" && parts.length === 2) {
        const pi = form.get("payment_intent");
        const session = [...sessions.values()].find((s) => s.payment_intent === pi);
        if (!session) return error(res, 400, "resource_missing");
        if ([...refunds.values()].some((r) => r.payment_intent === pi)) return error(res, 400, "charge_already_refunded");
        const refund = { id: id("re"), object: "refund", status: "succeeded", amount: session.amount_total, currency: session.currency, payment_intent: pi, metadata: { payment_id: form.get("metadata[payment_id]") } };
        refunds.set(refund.id, refund);
        return json(res, 200, refund);
      }
      const refund = refunds.get(parts[2]);
      return refund ? json(res, 200, refund) : error(res, 404, "resource_missing");
    }
    return error(res, 404, "resource_missing");
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = /** @type {import("node:net").AddressInfo} */ (server.address());
      base = `http://127.0.0.1:${address.port}`;
      resolve({ url: base, sessions, refunds, close: () => new Promise((done) => server.close(() => done(undefined))) });
    });
  });
}

/** Zmienne środowiska aplikacji dla fałszywego Stripe — oczywiste atrapy, nie klucze. */
export function fakeStripeEnv(url) {
  return {
    STRIPE_SECRET_KEY: "sk_test_PLACEHOLDER_e2e_fake_stripe",
    STRIPE_WEBHOOK_SECRET: "whsec_PLACEHOLDER_e2e",
    PAYMENT_CURRENCIES: "PLN",
    PLATFORM_COMMISSION_BPS: "1000",
    STRIPE_API_BASE_URL: url,
  };
}
