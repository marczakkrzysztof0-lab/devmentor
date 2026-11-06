// Zapytania opłacone z góry dla kodu aplikacji Next.js — tylko serwer (spec #17).
//
// Cienkie wrappery nad `lib/requests/*.mjs` z zależnościami ze środowiska (pula bazy, moduł płatności #24,
// adres aplikacji). Brak konfiguracji płatności → formularz dostaje `payments_unavailable`, a strona `/r/` pokazuje
// stan z bazy bez pytania Stripe.
import "server-only";
import { connection } from "next/server";
import { getPool } from "@/lib/db";
import { expireCheckout, syncCheckout } from "@/lib/payments/payments.mjs";
import { tryGetPaymentsDeps } from "@/lib/payments/server";
import { cancelByToken, type CancelResult } from "./cancel.mjs";
import { heldRanges } from "./held.mjs";
import { appBaseUrl } from "./links.mjs";
import { startRequest, type StartRequestResult } from "./start.mjs";
import { getRequestByToken } from "./view.mjs";

export type { CancelResult, StartRequestResult };
export type RequestPageData = NonNullable<Awaited<ReturnType<typeof getRequestByToken>>>;

/** `startRequest` z danymi formularza (niezaufane wejście z server action). */
export async function startRequestFromForm(input: unknown): Promise<StartRequestResult> {
  return startRequest(input, { db: getPool(), payments: tryGetPaymentsDeps(), appUrl: appBaseUrl() });
}

/** Zapytanie po tokenie albo `null` (nieznany, wygasły, zły kształt). Wołać w czasie żądania. */
export async function getRequestPage(token: string): Promise<RequestPageData | null> {
  await connection();
  return getRequestByToken(getPool(), token, new Date());
}

/**
 * Powrót ze Stripe (`?checkout=return&session_id=…`) albo „wróć” na stronie Stripe (`?checkout=cancel`): Stripe
 * jest źródłem prawdy (#24 `syncCheckout` / `expireCheckout`). Bez konfiguracji płatności albo przy błędzie —
 * nic (strona pokaże stan z bazy; rekonsyliacja dokończy).
 */
export async function settleCheckoutFromReturn(paymentId: string, checkout: "return" | "cancel", sessionId: string | null) {
  const deps = tryGetPaymentsDeps();
  if (!deps) return;
  try {
    if (checkout === "return" && sessionId) await syncCheckout(paymentId, sessionId, deps);
    if (checkout === "cancel") await expireCheckout(paymentId, deps);
  } catch (error) {
    console.warn(`[requests] rozliczenie powrotu ze Stripe nie powiodło się: ${error instanceof Error ? error.name : "Error"}`);
  }
}

/** Zajęte przedziały mentora w horyzoncie terminów (do `busy` w `listOpenSlots`, #17 Q7). */
export async function listHeldRanges(mentorId: string, now: Date, horizonDays: number) {
  return heldRanges(getPool(), { mentorId, from: now, to: new Date(now.getTime() + (horizonDays + 1) * 86_400_000), now });
}

/**
 * „Anuluj i odzyskaj pieniądze” z `/r/{token}` (#19): uprawnieniem jest sam token z adresu strony. Bez konfiguracji
 * płatności zwrot zostaje tylko zlecony (dokończy zadanie `payments.retryRefunds`).
 */
export async function cancelFromRequestPage(token: unknown): Promise<CancelResult> {
  return cancelByToken(token, { db: getPool(), payments: tryGetPaymentsDeps() });
}
