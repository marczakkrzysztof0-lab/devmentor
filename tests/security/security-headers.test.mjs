// Nagłówki bezpieczeństwa z `next.config.ts` (lekcja 16, model zagrożeń T-07; ZAP Baseline: brak CSP,
// anty-clickjacking, nosniff, ujawnienie X-Powered-By). Konfiguracja czytana wprost z pliku (Node 24 usuwa typy TS),
// bez buildu i bez serwera; zachowanie na żywym serwerze sprawdza `tests/e2e/security-headers.e2e.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../next.config.ts";

/** Nagłówki dla ścieżki: wpisy pasujące po kolei, późniejszy wygrywa (jak w Next.js). */
async function headersFor(pathname) {
  assert.equal(typeof nextConfig.headers, "function", "next.config.ts nie definiuje headers()");
  const entries = await nextConfig.headers();
  /** @type {Record<string, string>} */
  const result = {};
  for (const entry of entries) {
    const prefix = entry.source.replace("/:path*", "");
    const matches = entry.source === "/:path*" || pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (!matches) continue;
    for (const { key, value } of entry.headers) result[key.toLowerCase()] = value;
  }
  return result;
}

/** Dyrektywy CSP jako mapa nazwa → lista źródeł. */
function directives(csp) {
  return Object.fromEntries(
    csp
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name, sources];
      }),
  );
}

test("X-Powered-By wyłączony (poweredByHeader: false)", () => {
  assert.equal(nextConfig.poweredByHeader, false);
});

test("każda strona: anty-clickjacking, nosniff, Referrer-Policy", async () => {
  for (const pathname of ["/", "/mentor", "/mentor/requests/abc", "/m/anna", "/api/mentor/requests/x/session"]) {
    const headers = await headersFor(pathname);
    assert.equal(headers["x-frame-options"], "DENY", pathname);
    assert.equal(headers["x-content-type-options"], "nosniff", pathname);
    assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin", pathname);
  }
});

test("CSP: domyślnie tylko własny origin, frame-ancestors 'none', bez obiektów i obcego base/form", async () => {
  const csp = directives((await headersFor("/"))["content-security-policy"] ?? "");
  assert.deepEqual(csp["default-src"], ["'self'"]);
  assert.deepEqual(csp["frame-ancestors"], ["'none'"]);
  assert.deepEqual(csp["object-src"], ["'none'"]);
  assert.deepEqual(csp["base-uri"], ["'self'"]);
  assert.deepEqual(csp["form-action"], ["'self'"]);
  assert.ok(csp["script-src"]?.includes("'self'"));
  assert.ok(!csp["script-src"]?.includes("*"), "script-src bez wieloznacznika");
  assert.ok(!(csp["connect-src"] ?? []).some((source) => source === "*" || source === "https:"), "connect-src tylko własny origin");
});

test("/r/{token}: Referrer-Policy no-referrer (token w adresie nie wycieka), pozostałe nagłówki też", async () => {
  const headers = await headersFor("/r/abc");
  assert.equal(headers["referrer-policy"], "no-referrer");
  assert.equal(headers["x-frame-options"], "DENY");
  assert.ok(headers["content-security-policy"]?.includes("frame-ancestors 'none'"));
});
