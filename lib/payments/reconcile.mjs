// Rekonsyliacja płatności (spec #24 Proposed Solution „Reconciliation job”; Edge Cases „Webhook down”,
// „Checkout create timed out”). Zadanie `payments.reconcilePending`.
//
// Płatności `pending` minutę po `checkout_expires_at` → `expireCheckout`: Stripe odpowiada `expired` (→ expired,
// slot wolny) albo `complete` (płatność zdążyła przejść → succeeded). Lokalnie nic nie wygasa bez odpowiedzi Stripe.
import { expireCheckout, clock } from "./payments.mjs";

const MINUTE_MS = 60_000;
export const RECONCILE_GRACE_MINUTES = 1;

/**
 * @param {import("./payments.mjs").PaymentsDeps} deps
 * @param {{ limit?: number, deadline?: number }} [options]
 */
export async function reconcilePending(deps, { limit = 50, deadline = Infinity } = {}) {
  const now = clock(deps);
  const counts = { checked: 0, succeeded: 0, expired: 0, unchanged: 0 };
  const { rows } = await deps.db.query(
    `select id from payments
      where status = 'pending' and checkout_expires_at < $1
      order by checkout_expires_at
      limit $2`,
    [new Date(now.getTime() - RECONCILE_GRACE_MINUTES * MINUTE_MS), limit],
  );
  for (const { id } of rows) {
    if (Date.now() > deadline) break;
    counts.checked += 1;
    const payment = await expireCheckout(id, deps);
    if (payment?.status === "succeeded") counts.succeeded += 1;
    else if (payment?.status === "expired") counts.expired += 1;
    else counts.unchanged += 1;
  }
  return counts;
}
