You are the IMPLEMENTER of the mentor-payouts feature (current working directory). Spec: `.ai/specs/2026-11-09-mentor-payouts.md`. No new dependencies, no commits, never print `.env*`. UI text stays in Polish like the rest of the app.

Fix three findings from the manual check (screenshots in `lekcja-21/qa/`), plus two small defects found while reading the code.

1. Contradictory `pending` message. `packages/ui/src/product/e04/MentorPayouts.tsx` shows for `pending` the header "Stripe sprawdza dane — ... Nic nie trzeba robić", while the action button below says "Dokończ konfigurację w Stripe". `pending` covers two cases: onboarding abandoned (`details_submitted = false`) and Stripe verifying (`details_submitted = true`). Expose `detailsSubmitted` from `lib/payouts/summary.mjs` (the column already exists in `payout_accounts`, see `lib/payouts/accounts.mjs`) through `lib/payouts/server.ts` to `app/mentor/payouts/page.tsx`, and add an optional prop `detailsSubmitted?: boolean` to `MentorPayouts`. For `pending` + not submitted: header "Konfiguracja w Stripe nie jest dokończona — kwota czeka na wypłatę" (tone attention), body says the mentor needs to finish it at Stripe, keep the button "Dokończ konfigurację w Stripe". For `pending` + submitted: the current "Stripe sprawdza dane" text, no primary button, only the secondary refresh. Also remove the dead `false ? ... :` branch in the `returnFrom` notice (use `detailsSubmitted` there instead).

2. "Odśwież stan" does nothing. `app/mentor/payouts/page.tsx` passes no `onRefresh`. Since the page is a server component and `MentorPayouts` is a client component, give `MentorPayouts` a default `onRefresh` that calls `router.refresh()` from `next/navigation` when the prop is not supplied (check how other product components in `packages/ui` handle refresh first, and follow that pattern if one exists; stories must still render).

3. Payout prompt is buried. On `/mentor` (`app/mentor/page.tsx`) the `PayoutSetupPrompt` (and the payouts link) is rendered after the whole `MentorPageForm`; at 390 px the mentor has to scroll ~1300 px. Render it ABOVE the form, right after the nav.

4. No sign-out on `/mentor/payouts`. `MentorPayouts` renders `<MentorNav pendingCount={...} />` without `signOutAction`. Add an optional `signOutAction` prop to `MentorPayouts`, pass it to `MentorNav`, and pass `signOutAction` (from `app/mentor/actions`) and the real `pendingCount` (`pendingDecisionCount()` from `lib/requests/mentor-area`) from the page, like `app/mentor/page.tsx` does.

5. Stories: update `MentorPayouts.stories.tsx` with a story for each `pending` variant (abandoned / verifying).

Tests: add unit/DB coverage that `getPayoutSummary` returns `detailsSubmitted` (extend an existing `tests/db/payouts-*.test.mjs`). If `tests/e2e/payouts.e2e.mjs` (or the payouts e2e scenario) asserts the old `pending` text or the prompt position, update it.

Done when: `npm.cmd test` all pass, `node node_modules/eslint/bin/eslint.js` 0 errors on touched files, `npx.cmd tsc --noEmit -p .` clean. Report what you changed and the results.
