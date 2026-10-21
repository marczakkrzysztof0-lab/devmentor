"use server";
// Server action strony zaproszenia (spec #14, API Contracts `acceptInvitation`). GET strony niczego nie
// zużywa — dopiero to wywołanie (przycisk „Akceptuję zaproszenie”) przyjmuje zaproszenie i loguje.
// Token jest dowiązany przez `bind` na stronie (nigdy id mentora); traktujemy go jak niezaufane wejście.
import { redirect } from "next/navigation";
import { acceptInvitationAndSignIn } from "@/lib/auth/session";
import { isLinkTokenShape } from "@/lib/auth/tokens.mjs";

export async function acceptInvitationAction(token: unknown): Promise<{ ok: false }> {
  if (!isLinkTokenShape(token)) return { ok: false };
  const result = await acceptInvitationAndSignIn(token);
  if (!result.ok) return { ok: false };
  // Poza try/catch: redirect() rzuca wyjątek sterujący (także gdy ta sama osoba jest już zalogowana).
  redirect("/mentor");
}
