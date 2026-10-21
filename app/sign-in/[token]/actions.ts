"use server";
// Server action strony linku logowania (spec #14, API Contracts `redeemSignInLink`). GET strony niczego
// nie zużywa — dopiero przycisk „Zaloguj” używa linku (warunkowy UPDATE, jedna sesja przy dwóch kliknięciach).
import { redirect } from "next/navigation";
import { redeemSignInLinkAndSignIn } from "@/lib/auth/session";
import { isLinkTokenShape } from "@/lib/auth/tokens.mjs";

export async function redeemSignInLinkAction(token: unknown): Promise<{ ok: false }> {
  if (!isLinkTokenShape(token)) return { ok: false };
  const result = await redeemSignInLinkAndSignIn(token);
  if (!result.ok) return { ok: false };
  // Druga karta / podwójne kliknięcie tej samej osoby też kończy się na /mentor (Z39).
  redirect("/mentor");
}
