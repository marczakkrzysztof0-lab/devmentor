// Zapytania w panelu mentora dla kodu aplikacji Next.js — tylko serwer (spec #18 Proposed Solution „Screens”,
// „Transitions”).
//
// - Jedyna bramka to DAL: id mentora WYŁĄCZNIE z `getCurrentMentor()` (ciasteczko sesji), nigdy z adresu ani z
//   argumentów server action. Bez sesji: `null` (strona pokazuje „Dostęp tylko przez zaproszenie…”), decyzja →
//   `not_found` (bez danych, nic się nie zmienia).
// - Strefa listy i szczegółów: strefa mentora z dostępności (#15); brak → Europe/Warsaw (jak edytor, Q2).
// - Logika i SQL: `mentor.mjs` (odczyty) i `decision.mjs` (przejścia), testowane `node --test`.
import "server-only";
import { getCurrentMentor } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { appBaseUrl } from "@/lib/mentor-page/editor";
import { shareUrlFor } from "@/lib/mentor-page/mentor-page.mjs";
import { tryGetPaymentsDeps } from "@/lib/payments/server";
import { acceptRequest, declineRequest, type DecisionOutcome } from "./decision.mjs";
import { countAwaitingDecision, getMentorRequest, listMentorRequests } from "./mentor.mjs";

const DEFAULT_ZONE = "Europe/Warsaw";

export type MentorDecisionResult =
  | { ok: true }
  | { ok: false; code: Exclude<DecisionOutcome, { ok: true }>["code"]; refundStatus?: "requested" | "succeeded" | "failed" | null };

async function mentorContext(mentorId: string) {
  const { rows } = await getPool().query(
    "select m.time_zone, mp.slug from mentors m left join mentor_pages mp on mp.mentor_id = m.id where m.id = $1",
    [mentorId],
  );
  return {
    timeZone: (rows[0]?.time_zone as string | null) ?? DEFAULT_ZONE,
    shareUrl: rows[0]?.slug ? shareUrlFor(appBaseUrl(), rows[0].slug as string) : `${appBaseUrl()}/mentor`,
  };
}

/** Licznik „N zapytań czeka na decyzję” dla `MentorNav` (0 bez sesji albo przy błędzie bazy — licznik nie blokuje ekranu). */
export async function pendingDecisionCount(): Promise<number> {
  const mentor = await getCurrentMentor();
  if (!mentor) return 0;
  try {
    return await countAwaitingDecision(getPool(), { mentorId: mentor.mentorId, now: new Date() });
  } catch {
    return 0;
  }
}

/**
 * `/mentor/requests`: lista albo `null` bez sesji. Błąd odczytu listy → `state: "error"` bez częściowych danych
 * („Nie udało się wczytać zapytań — odśwież”).
 */
export async function loadMentorRequests() {
  const mentor = await getCurrentMentor();
  if (!mentor) return null;
  const now = new Date();
  const context = await mentorContext(mentor.mentorId);
  try {
    const [requests, pendingCount] = await Promise.all([
      listMentorRequests(getPool(), { mentorId: mentor.mentorId, now }),
      countAwaitingDecision(getPool(), { mentorId: mentor.mentorId, now }),
    ]);
    return { state: "ready" as const, requests, pendingCount, now, ...context };
  } catch (error) {
    console.error(`[requests] lista zapytań mentora nie wczytana: ${error instanceof Error ? error.name : "Error"}`);
    return { state: "error" as const, requests: [], pendingCount: 0, now, ...context };
  }
}

/** `/mentor/requests/[id]`: `null` bez sesji; `request: null` dla cudzego / nieznanego / nieopłaconego (bez danych). */
export async function loadMentorRequest(requestId: string) {
  const mentor = await getCurrentMentor();
  if (!mentor) return null;
  const now = new Date();
  const [request, pendingCount, context] = await Promise.all([
    getMentorRequest(getPool(), { mentorId: mentor.mentorId, requestId, now }),
    countAwaitingDecision(getPool(), { mentorId: mentor.mentorId, now }),
    mentorContext(mentor.mentorId),
  ]);
  return { request, pendingCount, now, timeZone: context.timeZone };
}

/** Decyzja bieżącego mentora (server action). Wynik w kształcie DS `DecisionResult`. */
export async function decideAsCurrentMentor(kind: "accept" | "decline", requestId: unknown): Promise<MentorDecisionResult> {
  const mentor = await getCurrentMentor();
  if (!mentor) return { ok: false, code: "not_found" };
  const deps = { db: getPool(), payments: tryGetPaymentsDeps() };
  const outcome = await (kind === "accept" ? acceptRequest : declineRequest)({ mentorId: mentor.mentorId, requestId }, deps);
  if (outcome.ok) return { ok: true };
  return outcome.refundStatus === undefined ? { ok: false, code: outcome.code } : { ok: false, code: outcome.code, refundStatus: outcome.refundStatus };
}
