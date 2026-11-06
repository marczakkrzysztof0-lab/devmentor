// POST /api/webhooks/stripe — webhook płatności Stripe (spec #24 API Contracts; publiczny kontrakt,
// BACKWARD_COMPATIBILITY.md „Webhooki płatności”).
//
// Cienki wrapper: surowe ciało (`request.text()` — bez parsowania JSON przed weryfikacją podpisu, guides
// route.md „Webhooks”), nagłówek `Stripe-Signature`, logika w `lib/payments/webhook.mjs`. Handler POST jest
// zawsze dynamiczny (bez cache). Brak konfiguracji płatności → 503 (Stripe ponowi).
import { handleStripeWebhook } from "@/lib/payments/webhook.mjs";
import { tryGetPaymentsDeps, verifyStripeEvent } from "@/lib/payments/server";

export async function POST(request: Request) {
  const deps = tryGetPaymentsDeps();
  if (!deps) return Response.json({ error: "payments_unavailable" }, { status: 503 });
  const rawBody = await request.text();
  const { status, body } = await handleStripeWebhook(
    { rawBody, signature: request.headers.get("stripe-signature") },
    deps,
    verifyStripeEvent,
  );
  return Response.json(body, { status });
}
