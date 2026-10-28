"use server";
// Server actions decyzji mentora (spec #18 API Contracts `acceptRequest`, `declineRequest`). Server action jest
// osiągalna bezpośrednim POST-em, więc każda sama sprawdza sesję (`decideAsCurrentMentor` → `getCurrentMentor()`);
// id mentora nigdy nie przychodzi z klienta, a id zapytania jest niezaufane (kształt sprawdzany przed bazą).
// Po decyzji `refresh()` — licznik w nawigacji i lista pokazują nowy stan.
import { refresh } from "next/cache";
import { decideAsCurrentMentor, type MentorDecisionResult } from "@/lib/requests/mentor-area";

export async function acceptRequestAction(requestId: unknown): Promise<MentorDecisionResult> {
  const result = await decideAsCurrentMentor("accept", requestId);
  refresh();
  return result;
}

export async function declineRequestAction(requestId: unknown): Promise<MentorDecisionResult> {
  const result = await decideAsCurrentMentor("decline", requestId);
  refresh();
  return result;
}
