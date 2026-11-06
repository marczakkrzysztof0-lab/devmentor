// /api/r/session — czat sesji po stronie dewelopera (spec #20 API Contracts). Token z linku /r/{token} tylko
// w nagłówku `X-Request-Token`; logika w `lib/sessions`.
import { menteeSessionGet, menteeSessionPost } from "@/lib/sessions/server";

export function GET(request: Request) {
  return menteeSessionGet(request);
}

export function POST(request: Request) {
  return menteeSessionPost(request);
}
