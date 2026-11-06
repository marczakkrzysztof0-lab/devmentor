import type { NextConfig } from "next";

// Nagłówki bezpieczeństwa (lekcja 16, model zagrożeń T-07, docs/security/threat-model.md; ZAP Baseline 10020,
// 10021, 10037, 10038, 10063). Testy: tests/security/security-headers.test.mjs i tests/e2e/security-headers.e2e.mjs.
//
// CSP: `script-src 'unsafe-inline'`, bo Next.js wstrzykuje skrypty inline (RSC payload) — CSP z nonce wymaga
// dynamicznego renderu każdej strony w proxy.ts, co wyłącza PPR (`cacheComponents`). Decyzja do akceptacji:
// docs/security/plan-poprawek.md. `'unsafe-eval'` tylko w `next dev` (React w trybie deweloperskim).
// Płatność to przekierowanie na Stripe Checkout (nawigacja, nie fetch ani formularz), więc `connect-src` i
// `form-action` zostają przy własnym originie.
const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Bez `X-Powered-By: Next.js` (ZAP 10037).
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // /r/{token}: token w adresie nie może wyciec w Referer — ten sam nagłówek co w proxy.ts, późniejszy wpis wygrywa.
      { source: "/r/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
