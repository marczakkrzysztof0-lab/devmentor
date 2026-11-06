// Transport czatu sesji w przeglądarce (spec #20 API Contracts): `load` i `send` dla DS `SessionChat`.
// Odpowiedź HTTP → wynik w kształcie DS; wyjątek `fetch` (brak sieci) przechodzi dalej — komponent pokazuje
// „Brak połączenia”. Token dewelopera tylko w nagłówku `X-Request-Token`, nigdy w adresie.
import type { SessionLoadResult, SessionSendResult } from "@devmentor/ui/product";

type LoadFailure = Extract<SessionLoadResult, { ok: false }>["reason"];
type SendFailure = Extract<SessionSendResult, { ok: false }>["reason"];
const LOAD_FAILURES: LoadFailure[] = ["signed_out", "not_found"];
const SEND_FAILURES: SendFailure[] = ["invalid_body", "not_open", "closed", "limit_reached", "not_found", "signed_out"];

export function sessionTransport(url: string, headers: Record<string, string> = {}) {
  async function load(after: number): Promise<SessionLoadResult> {
    const response = await fetch(`${url}?after=${after}`, { headers, cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok && body) return { ok: true, snapshot: body };
    const reason = body?.error as LoadFailure;
    return { ok: false, reason: LOAD_FAILURES.includes(reason) ? reason : "unavailable" };
  }

  async function send(text: string): Promise<SessionSendResult> {
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.ok) return { ok: true, message: body.message };
    const reason = body?.error as SendFailure;
    return { ok: false, reason: SEND_FAILURES.includes(reason) ? reason : "unavailable" };
  }

  return { load, send };
}
