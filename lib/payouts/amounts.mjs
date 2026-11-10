// Kwoty i reguły wypłat mentora (spec 2026-11-09, sekcje Rules 1, 3 i 5).

export const PAYOUT_MAX_ATTEMPTS = 5;
export const PAYOUT_LEASE_MINUTES = 15;

/** Wylicza udział mentora w groszach po odjęciu prowizji.
 * @param {number} amountMinor kwota płatności w najmniejszej jednostce waluty
 * @param {number} commissionBps prowizja w punktach bazowych
 * @returns {number} udział mentora w najmniejszej jednostce waluty
 */
export function mentorShareMinor(amountMinor, commissionBps) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError("invalid amountMinor");
  }
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new RangeError("invalid commissionBps");
  }
  return amountMinor - Math.floor((amountMinor * commissionBps) / 10_000);
}

/** Wyznacza stan konta wypłat z danych Stripe lub rekordu bazy.
 * @param {Record<string, any> | null | undefined} account konto Stripe lub rekord lokalny
 * @returns {"none" | "pending" | "ready"} stan konta
 */
export function payoutAccountState(account) {
  if (!account?.stripe_account_id && !account?.id) return "none";
  const payouts = account.payouts_enabled === true;
  const transfers = account.capabilities?.transfers === "active" || account.transfers_active === true;
  return payouts && transfers ? "ready" : "pending";
}

/** Sprawdza, czy istnieje opłacone żądanie wymagające konfiguracji wypłat.
 * @param {{ hasPaidRequest: boolean, accountState: string }} input dane mentora
 * @returns {boolean} czy należy pokazać prośbę o konfigurację
 */
export function shouldAskForPayouts({ hasPaidRequest, accountState }) {
  return Boolean(hasPaidRequest && accountState !== "ready");
}

/** Zwraca czas oczekiwania przed kolejną próbą wypłaty.
 * @param {number} attempt numer próby liczony od 1
 * @returns {number} liczba minut do ponowienia
 */
export function payoutBackoffMinutes(attempt) {
  return [1, 5, 15, 60][Math.max(0, Math.min(3, attempt - 1))];
}

/** Wykrywa dowolny zwrot widoczny w obiekcie płatności Stripe.
 * @param {{ charge?: any, refunds?: any }} [input] obiekt Charge lub wynik refunds.list
 * @returns {boolean} czy istnieje co najmniej jeden zwrot
 */
export function hasAnyRefund({ charge, refunds } = {}) {
  return (
    Number(charge?.amount_refunded ?? 0) > 0 ||
    (charge?.refunds?.data?.length ?? 0) > 0 ||
    (refunds?.data?.length ?? 0) > 0
  );
}
