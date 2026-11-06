// Rejestr zadań okresowych w kolejności uruchamiania (spec #24 Architecture „Jobs route”).
// Kolejne historie dopisują tu swoje zadania (#17 `email.sendDue`, #18 `requests.lapseOverdue`, #21 `sessions.settleEnded`).
import { sendDue } from "../email/outbox.mjs";
import { reconcilePending } from "../payments/reconcile.mjs";
import { retryRefunds } from "../payments/refunds.mjs";
import { lapseOverdue } from "../requests/lapse.mjs";
import { settleEnded } from "../sessions/settle.mjs";

/**
 * Kontekst zadań: `{ db, payments: PaymentsDeps | null, email }`. Bez konfiguracji płatności (`payments: null`)
 * zadania płatności są pomijane (endpoint i tak odpowiada wtedy 503 — patrz trasa).
 * @type {ReadonlyArray<import("./jobs.mjs").Job>}
 */
export const JOBS = Object.freeze([
  { name: "payments.reconcilePending", run: (ctx, options) => reconcilePending(ctx.payments, options) },
  // #18: zapytania bez decyzji do startu terminu → `lapsed` + zwrot (przed ponowieniami zwrotów i e-mailami,
  // żeby ten sam przebieg wysłał e-mail i ponowił nieudany zwrot).
  { name: "requests.lapseOverdue", run: (ctx, options) => lapseOverdue({ db: ctx.db, payments: ctx.payments }, options) },
  // #21: zakończone sesje → wynik wg R15 + D11 (zwrot `mentor_no_show`) — też przed ponowieniami i e-mailami.
  { name: "sessions.settleEnded", run: (ctx, options) => settleEnded({ db: ctx.db, payments: ctx.payments }, options) },
  { name: "payments.retryRefunds", run: (ctx, options) => retryRefunds(ctx.payments, options) },
  // #17: e-maile z outboxu (potwierdzenie, mentor, zwroty).
  { name: "email.sendDue", run: (ctx, options) => sendDue(ctx.db, ctx.email, options) },
]);

export const JOB_NAMES = Object.freeze(JOBS.map((job) => job.name));
