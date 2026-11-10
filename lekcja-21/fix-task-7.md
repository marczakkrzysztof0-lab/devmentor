IMPORTANT: edit files ONLY with apply_patch. Never rewrite files with PowerShell (it corrupts UTF-8 Polish text on this machine). No commits, never print `.env*`.

Touch ONLY `lekcja-21/qa/manual-check.e2e.mjs` (a manual-check script, run with `npm.cmd run test:e2e -- lekcja-21/qa/manual-check.e2e.mjs`; it writes screenshots and `lekcja-21/qa/manual-check-result.json`). Do not run it; the orchestrator runs it.

Update it to the current UI and to two review findings:
1. Held state must come from the real path, not SQL: replace `update requests set status = 'held'` with acceptance + both sides writing in the slot + time shift + POST `/api/internal/jobs`, exactly as `tests/e2e/mentor-payouts.e2e.mjs` now does (read it and copy the approach).
2. Mentor B must have their OWN paid request and their OWN pending payout account (B clicks the setup button and abandons the fake onboarding). Then, as B: open A's return URL `/mentor/payouts?stripe=return&account=<A's account id>` and A's fake onboarding link; assert B sees only B's state (B's amounts, no A data), nothing is created for A, A's account row is unchanged. Record each as a step.
3. Current wording: abandoned onboarding shows "Konfiguracja w Stripe nie jest dokończona — kwota czeka na wypłatę" with "Dokończ konfigurację w Stripe"; when the account is ready, held rows say "Do wypłaty". The /mentor prompt is now above the form (in the notice slot): add a step asserting the prompt's bounding box top is within the first 844 px viewport at 390 px width, and that /mentor/payouts nav has "Wyloguj".
Keep the 390 px viewport, screenshots per step (overwrite the same file names, add new ones for B), the no-horizontal-scroll checks and the result JSON format.
Done when: ESLint 0 errors on the file. Report the list of steps.
