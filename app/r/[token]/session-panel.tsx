"use client";
// Czat sesji na stronie dewelopera `/r/{token}` (spec #20): DS `SessionChat` z transportem na `/api/r/session`;
// token tej strony tylko w nagłówku `X-Request-Token`.
import { useMemo } from "react";
import { SessionChat, type SessionSnapshot } from "@devmentor/ui/product";
import { sessionTransport } from "@/lib/sessions/transport";

export function MenteeSessionPanel({ token, initial, timeZone }: { token: string; initial: SessionSnapshot; timeZone: string }) {
  const transport = useMemo(() => sessionTransport("/api/r/session", { "X-Request-Token": token }), [token]);
  return <SessionChat initial={initial} timeZone={timeZone} load={transport.load} send={transport.send} />;
}
