IMPORTANT: edit files ONLY with apply_patch. Never rewrite files with PowerShell (it corrupts UTF-8 Polish text on this machine). No commits, never print `.env*`, no new dependencies.

Task: pure reformatting, no behaviour change. Reformat these three test files to the repo test style used in `tests/db/payouts-jobs.test.mjs` and `tests/db/session-settle.test.mjs`: 2-space indentation, one statement per line, spaces around operators and after commas, multi-line SQL strings for long queries, named intermediate variables instead of chained expressions, no line longer than ~120 characters:
- tests/db/payouts-schema.test.mjs
- tests/db/payouts-onboarding.test.mjs
- tests/db/payouts-money.test.mjs

Keep every test and every assertion (same count, same values). Touch no other file (other workers edit lib/payouts/transfers.mjs and UI files in parallel; some DB tests may fail temporarily because of that, which is not your concern; compare against failures before your change).

Done when: ESLint 0 errors on the three files (`node node_modules/eslint/bin/eslint.js <files>`), and `node --test` on them gives the same pass/fail per test as before your change (run before and after). Report test counts before/after.
