// Czat sesji dla kodu aplikacji Next.js — tylko serwer (spec #20 Architecture).
//
// - Deweloper: token WYŁĄCZNIE z nagłówka `X-Request-Token` (nigdy z adresu) — ta sama reguła ważności co strona
//   `/r/{token}` (hash + 30 dni po terminie, `lib/sessions/messages.mjs`).
// - Mentor: id mentora WYŁĄCZNIE z `getCurrentMentor()` (ciasteczko); id zapytania z adresu jest niezaufane.
// - Odpowiedzi JSON z `Cache-Control: no-store`; błąd bazy → 503 z samą nazwą błędu w logu (bez treści wiadomości).
import "server-only";
import { connection } from "next/server";
import { getCurrentMentor } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { appBaseUrl } from "@/lib/requests/links.mjs";
import { NO_STORE, postStatus, readPostBody, REQUEST_TOKEN_HEADER } from "./http.mjs";
import { listSessionMessages, parseAfter, postSessionMessage, type SessionViewer } from "./messages.mjs";

export type { SessionSnapshot, SessionMessage, SessionPhase } from "./messages.mjs";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

async function guarded(run: () => Promise<Response>): Promise<Response> {
  // Zawsze w czasie żądania (cacheComponents): odpowiedź zależy od nagłówków, ciasteczka i zegara bazy.
  await connection();
  try {
    return await run();
  } catch (error) {
    console.error(`[sessions] czat: ${error instanceof Error ? error.name : "Error"}`);
    return json({ error: "unavailable" }, 503);
  }
}

async function get(viewer: SessionViewer, request: Request) {
  const after = parseAfter(new URL(request.url).searchParams.get("after"));
  const snapshot = await listSessionMessages(getPool(), viewer, { after });
  return snapshot ? json(snapshot) : json({ error: "not_found" }, 404);
}

async function post(viewer: SessionViewer, request: Request) {
  const read = await readPostBody(request, appBaseUrl());
  if (!read.ok) return json({ error: read.error }, read.status);
  const result = await postSessionMessage(getPool(), viewer, read.body);
  return result.ok ? json(result, 201) : json({ ok: false, error: result.code }, postStatus(result));
}

const menteeViewer = (request: Request): SessionViewer => ({ kind: "mentee", token: request.headers.get(REQUEST_TOKEN_HEADER) });

async function mentorViewer(requestId: string): Promise<SessionViewer | null> {
  const mentor = await getCurrentMentor();
  return mentor ? { kind: "mentor", mentorId: mentor.mentorId, requestId } : null;
}

export const menteeSessionGet = (request: Request) => guarded(() => get(menteeViewer(request), request));
export const menteeSessionPost = (request: Request) => guarded(() => post(menteeViewer(request), request));

export const mentorSessionGet = (request: Request, requestId: string) =>
  guarded(async () => {
    const viewer = await mentorViewer(requestId);
    return viewer ? get(viewer, request) : json({ error: "signed_out" }, 401);
  });

export const mentorSessionPost = (request: Request, requestId: string) =>
  guarded(async () => {
    const viewer = await mentorViewer(requestId);
    return viewer ? post(viewer, request) : json({ error: "signed_out" }, 401);
  });

/** Pierwszy stan czatu dla strony `/r/{token}` (render na serwerze) albo `null`, gdy czatu nie ma. */
export async function sessionForMentee(token: string) {
  return listSessionMessages(getPool(), { kind: "mentee", token });
}

/** Pierwszy stan czatu dla `/mentor/requests/{id}` (mentor z sesji) albo `null`. */
export async function sessionForCurrentMentor(requestId: string) {
  const viewer = await mentorViewer(requestId);
  return viewer ? listSessionMessages(getPool(), viewer) : null;
}
