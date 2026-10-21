// Data Access Layer sesji mentora (spec #14, Proposed Solution / Architecture) — wyłącznie po stronie serwera.
//
// - Jedyna bramka stron i server actions mentora: `getCurrentMentor()`. Id mentora pochodzi WYŁĄCZNIE
//   z ciasteczka `dm_session` (hash → `mentor_sessions`), nigdy z danych od klienta.
// - Odczyt sesji to odczyt żądania (`cookies()`): z `cacheComponents` musi być w czasie żądania, za granicą
//   <Suspense>; bez 'use cache' (authentication-with-cache-components.md). `cache` z React tylko deduplikuje
//   odczyt w obrębie jednego renderu.
// - Zapis ciasteczka (`set`/`delete`) działa tylko w Server Function / Route Handler — wrappery
//   `acceptInvitationAndSignIn`, `redeemSignInLinkAndSignIn`, `signOutCurrentMentor` wołaj z server action.
// - Logika domenowa i SQL: `lib/auth/mentor-auth.mjs` (testowana przez `node --test`).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db";
import {
  acceptInvitation,
  endSession,
  getMentorForSession,
  inspectInvitation,
  inspectSignInLink,
  redeemSignInLink,
  SESSION_COOKIE,
} from "./mentor-auth.mjs";

export { INACTIVE_LINK_MESSAGE, SESSION_COOKIE } from "./mentor-auth.mjs";

export type CurrentMentor = { mentorId: string };

export type LinkInspection =
  | { status: "valid"; expiresAt: Date }
  | { status: "inactive" }
  | { status: "signed-in-as-owner" };

export type SignInOutcome =
  | { ok: true; alreadySignedIn: false; mentorId: string }
  | { ok: true; alreadySignedIn: true; mentorId: string }
  | { ok: false; reason: "inactive" };

/** Token z ciasteczka `dm_session` (albo `undefined`). Odczyt żądania — tylko w czasie żądania. */
export async function readSessionToken(): Promise<string | undefined> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? value : undefined;
}

/**
 * Ustawia ciasteczko sesji: httpOnly, Secure w produkcji, SameSite=Lax, path "/", wygasa razem z sesją.
 * Tylko w Server Function / Route Handler.
 */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Usuwa ciasteczko sesji. Tylko w Server Function / Route Handler. */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/" });
}

/**
 * Bieżący mentor z aktywnej sesji albo `null` (brak ciasteczka, sesja nieznana, wygasła lub odwołana).
 * Wywołuj w komponencie za <Suspense> albo na początku każdej server action (autoryzacja przy danych).
 * Nieaktywnego ciasteczka nie usuwa (render nie może zapisywać ciasteczek) — jest po prostu ignorowane.
 */
export const getCurrentMentor = cache(async (): Promise<CurrentMentor | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const session = await getMentorForSession({ db: getPool(), token });
  return session ? { mentorId: session.mentorId } : null;
});

/** Stan zaproszenia dla strony `/invite/[token]` (GET, tylko odczyt). */
export async function inspectInvitationLink(token: string): Promise<LinkInspection> {
  return inspectInvitation({ db: getPool(), token, currentSessionToken: await readSessionToken() });
}

/** Stan linku logowania dla strony `/sign-in/[token]` (GET, tylko odczyt). */
export async function inspectSignInLinkForRequest(token: string): Promise<LinkInspection> {
  return inspectSignInLink({ db: getPool(), token, currentSessionToken: await readSessionToken() });
}

/**
 * Akceptuje zaproszenie i loguje (server action). Przy nowej sesji ustawia ciasteczko.
 * Wywołujący robi `redirect("/mentor")` przy `ok`, a przy `inactive` pokazuje `INACTIVE_LINK_MESSAGE`.
 */
export async function acceptInvitationAndSignIn(token: string): Promise<SignInOutcome> {
  const result = await acceptInvitation({
    db: getPool(),
    token,
    currentSessionToken: await readSessionToken(),
  });
  return finishSignIn(result);
}

/** Używa linku logowania i loguje (server action). Semantyka wyniku jak w `acceptInvitationAndSignIn`. */
export async function redeemSignInLinkAndSignIn(token: string): Promise<SignInOutcome> {
  const result = await redeemSignInLink({
    db: getPool(),
    token,
    currentSessionToken: await readSessionToken(),
  });
  return finishSignIn(result);
}

/** Wylogowanie (server action): odwołuje bieżącą sesję w bazie i usuwa ciasteczko. Idempotentne. */
export async function signOutCurrentMentor(): Promise<void> {
  const token = await readSessionToken();
  if (token) await endSession({ db: getPool(), token });
  await clearSessionCookie();
}

type CoreSignInResult =
  | { ok: true; alreadySignedIn?: false; mentorId: string; sessionToken: string; sessionExpiresAt: Date }
  | { ok: true; alreadySignedIn: true; mentorId: string }
  | { ok: false; reason: "inactive" };

async function finishSignIn(result: CoreSignInResult): Promise<SignInOutcome> {
  if (!result.ok) return { ok: false, reason: "inactive" };
  if (result.alreadySignedIn) return { ok: true, alreadySignedIn: true, mentorId: result.mentorId };
  await setSessionCookie(result.sessionToken, result.sessionExpiresAt);
  return { ok: true, alreadySignedIn: false, mentorId: result.mentorId };
}
