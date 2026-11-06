"use client";
// Czat sesji na stronie zapytania mentora (spec #20): DS `SessionChat` z transportem na
// `/api/mentor/requests/{id}/session` (mentor z ciasteczka sesji). Strefa: strefa mentora (#15/#18).
import { useMemo } from "react";
import { SessionChat, type SessionSnapshot } from "@devmentor/ui/product";
import { sessionTransport } from "@/lib/sessions/transport";

export function MentorSessionPanel({ requestId, initial, timeZone }: { requestId: string; initial: SessionSnapshot; timeZone: string }) {
  const transport = useMemo(() => sessionTransport(`/api/mentor/requests/${encodeURIComponent(requestId)}/session`), [requestId]);
  return <SessionChat initial={initial} timeZone={timeZone} load={transport.load} send={transport.send} />;
}
