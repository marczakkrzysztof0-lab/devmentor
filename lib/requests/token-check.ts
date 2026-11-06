// Lekkie sprawdzenie tokenu `/r/{token}` dla `proxy.ts` — tylko serwer, bez modułu płatności (proxy nie musi
// ładować klienta Stripe).
import "server-only";
import { getPool } from "@/lib/db";
import { isValidRequestToken } from "./view.mjs";

/** Czy token wskazuje ważne zapytanie (nieznany, wygasły, zły kształt → false). */
export async function isValidRequestTokenNow(token: string): Promise<boolean> {
  return isValidRequestToken(getPool(), token, new Date());
}
