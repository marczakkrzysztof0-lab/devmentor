// /api/mentor/requests/{id}/session — czat sesji po stronie mentora (spec #20 API Contracts). Mentor wyłącznie
// z ciasteczka sesji; id zapytania z adresu niezaufane. Logika w `lib/sessions`.
import { mentorSessionGet, mentorSessionPost } from "@/lib/sessions/server";

export async function GET(request: Request, ctx: RouteContext<"/api/mentor/requests/[id]/session">) {
  const { id } = await ctx.params;
  return mentorSessionGet(request, id);
}

export async function POST(request: Request, ctx: RouteContext<"/api/mentor/requests/[id]/session">) {
  const { id } = await ctx.params;
  return mentorSessionPost(request, id);
}
