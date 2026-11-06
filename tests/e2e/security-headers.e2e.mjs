// E2E: nagłówki bezpieczeństwa na buildzie produkcyjnym (lekcja 16, model zagrożeń T-07; znaleziska ZAP Baseline
// 10038 CSP, 10020 anty-clickjacking, 10021 nosniff, 10037 X-Powered-By). Zwykłe żądania HTTP, bez przeglądarki.
// Strony: publiczna, panel mentora bez sesji, nieznany link /r/ (404 z proxy) i trasa API czatu.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const BASE_URL = process.env.E2E_BASE_URL;
const skip = BASE_URL ? false : "Uruchom przez npm run test:e2e (brak E2E_BASE_URL).";

const UNKNOWN_REQUEST = `/r/${"A".repeat(43)}`;

describe("nagłówki bezpieczeństwa (T-07)", { skip }, () => {
  for (const pathname of ["/", "/mentor", UNKNOWN_REQUEST, "/api/r/session"]) {
    test(`${pathname}: CSP z frame-ancestors 'none', X-Frame-Options, nosniff, bez X-Powered-By`, async () => {
      const response = await fetch(`${BASE_URL}${pathname}`, { redirect: "manual" });
      await response.arrayBuffer();
      assert.ok(response.status < 500, `HTTP ${response.status}`);
      const csp = response.headers.get("content-security-policy") ?? "";
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-powered-by"), null);
      const expectedReferrer = pathname.startsWith("/r/") ? "no-referrer" : "strict-origin-when-cross-origin";
      assert.equal(response.headers.get("referrer-policy"), expectedReferrer);
    });
  }
});
