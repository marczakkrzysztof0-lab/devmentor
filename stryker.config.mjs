// Lekcja 17 — test mutacyjny jednego modułu logiki biznesowej: walidacja zapytania (spec #17, R01/R05, kwota).
// Runner „command”: Stryker podmienia mutanta i uruchamia node:test na testach tego modułu (bez Jest/Vitest).
// Uruchomienie: npm run test:mutation  → raport w reports/mutation/ (ignorowany przez git).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: "command",
  commandRunner: { command: "node --test tests/requests/validate.test.mjs" },
  mutate: ["lib/requests/validate.mjs"],
  coverageAnalysis: "off",
  reporters: ["clear-text", "progress", "json", "html"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  ignorePatterns: [".next", "reports", "prototypes", "packages/ui/storybook-static", "docs", ".ai", "lekcja-*"],
  tempDirName: ".stryker-tmp",
  concurrency: 2,
  timeoutMS: 30000,
  thresholds: { high: 90, low: 75, break: null },
};

export default config;
