"use server";
// Server action anulowania z `/r/{token}` (spec #19 API Contracts `cancelRequest(token)`). Osiągalna bezpośrednim
// POST-em, więc niczego nie zakłada: token to niezaufane wejście, zapytanie rozpoznawane wyłącznie po jego hashu
// (`lib/requests/cancel.mjs`). Po każdej odpowiedzi `refresh()` — strona pokazuje stan, który wygrał (anulowane ze
// zwrotem, zaakceptowane albo zwrot już w toku), nie błąd.
import { refresh } from "next/cache";
import { cancelFromRequestPage, type CancelResult } from "@/lib/requests/server";

export async function cancelRequestAction(token: unknown): Promise<CancelResult> {
  const result = await cancelFromRequestPage(token);
  refresh();
  return result;
}
