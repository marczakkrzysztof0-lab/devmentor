"use server";
// Server action formularza zapytania na /m/[slug] (spec #17 API Contracts `startRequest`).
//
// Akcja jest osiągalna bezpośrednim POST-em (data-security.md), więc wejście jest niezaufane: walidacja, cena i
// termin liczone od nowa na serwerze (`lib/requests/start.mjs`). Kształt wyniku = DS `StartRequestResult`
// (`RequestForm` sam przechodzi do Stripe po `{ ok: true, checkoutUrl }`). Nic z pytania nie idzie do Stripe.
import { startRequestFromForm, type StartRequestResult } from "@/lib/requests/server";

export async function startRequestAction(input: unknown): Promise<StartRequestResult> {
  return startRequestFromForm(input);
}
