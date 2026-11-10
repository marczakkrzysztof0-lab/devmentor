# Lekcja 21 — prompt do `om-implement-feature-multi-optimized` (E04-S01 wypłaty)

Wpisywany po nazwie skilla. Struktura jak w lekcji: kto i po co, źródła prawdy, rozbieżności, reguły, wymagania, zakres, przypadki brzegowe, testy, ręczne sprawdzenie, warunek zakończenia.

---

Feature for DevMentor: a mentor sets up Stripe payouts after their first paid request, and money earned for held sessions is paid out (issue #22 E04-S01 and its task #25 E04-S01-T01).

## Who and why
Mentors (senior engineers signed in with founder-issued links, D12) publish a page and get paid requests without any payout details (R13, D07: a list mentor refuses bank details before a booking). Today the platform charges the mentee (E02, Stripe Checkout in test mode) and settles each session (E03-S02: `held`, `mentee_no_show`, `mentor_no_show`), but nothing ever reaches the mentor. This task closes the money loop: ask for payout details only after the first paid request, hold money while details are missing, pay out what is owed once they exist, never pay out refunded requests.

## Sources of truth
- Issues #22 and #25 (`gh issue view 22`, `gh issue view 25`), epic #11.
- `.ai/specs/product-brief.md`: D07, D12, R09, R13, R15, Q01, Q05.
- Existing specs: `.ai/specs/2026-10-19-stripe-card-payment-refund-and-webhook.md`, `.ai/specs/2026-10-30-no-show-settlement.md`.
- Migration `db/migrations/0008_session_outcomes.sql` states the contract for #22: earned by the mentor = payments of requests in `held` or `mentee_no_show`.
- `BACKWARD_COMPATIBILITY.md`, `SDLC.md`, `AGENTS.md`, `db/AGENTS.md`, `docs/design-system.md`.
- Write the spec as `.ai/specs/2026-11-09-mentor-payouts.md`.

## Known discrepancies, already decided (record each in the spec as a deviation)
- Both issues say "greenfield, no product code". That is stale: E01–E03 are merged. Build on the existing code in `lib/payments`, `lib/requests`, `lib/sessions`, `lib/jobs`.
- #25 is a "technical task with no user-facing outcome". Deliver it inside this one change together with #22; the PR will close both.
- Real Stripe keys are not available. Everything runs against the existing fake Stripe server (`tests/e2e/fake-stripe-server.mjs`) and `STRIPE_API_BASE_URL` (localhost only). Extend the fake; do not call real Stripe in tests.

## Rules (use exactly these definitions in code, tests and spec)
1. Payout account. One Stripe Connect Express account per mentor, created on demand. States: `none` (no account), `pending` (account created, onboarding not finished or requirements due), `ready` (Stripe reports payouts enabled and charges/transfers capability active). The app's state comes from Stripe (account read or `account.updated` webhook), never from the mentor returning to a URL.
2. When to ask. A mentor is asked to set up payouts once they have at least one request whose payment succeeded (status not `awaiting_payment`/`payment_failed`) and their payout account is not `ready`. Before that, nothing in the mentor UI mentions payouts. Publishing, availability and requests keep working in every payout state (R13).
3. Owed amount. For each request in `held` or `mentee_no_show` whose payment succeeded and was not refunded: mentor share = `amount_minor − floor(amount_minor × commission_bps / 10000)`, using the commission snapshot already stored on the payment. Integer grosze, PLN. Requests in any other state, and any payment with a refund (full or partial), are never owed.
4. Payout. A scheduled job (existing `lib/jobs` mechanism, not a cron service) creates one Stripe transfer per owed request to the mentor's connected account, only when the account is `ready`. Each request is transferred at most once, enforced by the database (unique key) and by a Stripe idempotency key derived from the request id. While the account is not `ready`, owed requests stay `held_for_payout` and no Stripe call is made (R13, D07).
5. Failure. A failed transfer is recorded with its Stripe error, retried by the next job run with bounded attempts (same pattern as refund retries in E02), and after the limit is left for manual handling in the Stripe dashboard (D12, Q05) with a visible state for the operator log.

## Requirements
1. Migration(s) with up and down: payout account per mentor (Stripe account id, state, timestamps) and payout record per request (amount, status `held_for_payout` / `transferring` / `paid` / `failed`, attempts, Stripe transfer id, last error). Additive only.
2. Mentor panel: when rule 2 applies, a clear prompt "Set up payouts to receive your earnings" with a button that creates/reuses the Express account and redirects to a Stripe account link. Return and refresh URLs come back to the panel and re-read the state from Stripe. Shows "Payouts ready" when `ready`. Shows the total held and total paid (grosze formatted as PLN via the existing money helpers).
3. Webhook: handle `account.updated` (state sync) and `transfer.*` events the fake can emit, with signature verification already used by `app/api/webhooks/stripe/route.ts`. Unknown events stay ignored as today.
4. Job: payout run as described in rules 3–5, safe to run concurrently (row locks or `for update skip locked`), idempotent on re-run.
5. All amounts integers in grosze; no floating point in money math.
6. Text in the UI in English, following the design system (`@devmentor/ui`); new components get stories.

## Out of scope, do not do
- Commission value decisions (Q01): keep using the stored snapshot.
- Refund rules, disputes, chargebacks, Stripe dashboard flows for operators.
- Collecting bank details in our own forms (Stripe-hosted onboarding only).
- Real Stripe keys, live mode, 1Password entries.
- Changes to E02/E03 behaviour except the minimal hook to read settled outcomes.
- New dependencies beyond what is already in package.json (stripe SDK is there), unrelated refactors.

## Edge cases to handle and test
- Mentor with zero paid requests sees no payout prompt; after the first successful payment the prompt appears; page and requests keep working while it is shown.
- Mentor abandons Stripe onboarding (account `pending`): prompt stays, money stays `held_for_payout`, no transfer attempted.
- Account becomes `ready` via webhook: next job run transfers all owed requests, each exactly once.
- Same job run twice concurrently: each request transferred exactly once.
- Request refunded (any refund row) after being `held`: never paid out; if already paid out, record and surface it for manual handling, never reverse automatically.
- `mentor_no_show`, `declined`, `lapsed`, `cancelled`: never owed.
- Commission rounding: 1 grosz amounts, 0 bps, 10000 bps.
- Stripe transfer fails (fake returns error / timeout): attempt recorded, retried, stops at the limit.
- Webhook replayed or out of order: state never goes backwards from `ready` because of an older event.
- Another mentor cannot start or read someone else's onboarding (access control as in L16).

## Tests the change must add
- Unit tests for owed-amount math and state rules (node:test, fake clock).
- DB tests next to `tests/db/payments-*.test.mjs` for the payout job, concurrency and idempotency.
- E2E scenario next to `tests/e2e/session-settlement.e2e.mjs`: mentor gets a paid request → session held → prompt visible → onboarding via the fake → job pays out → panel shows "Payouts ready" and the paid total.
- Migration up/down/up covered by the existing migration test.

## Manual check before staging (record in the handoff)
Run the app against the local Docker Postgres and the fake Stripe server, sign in as a seeded mentor, walk the flow from the E2E scenario, check the panel at 390 px width, and try to open another mentor's onboarding URL. Anything that differs from this prompt is a finding to fix.

## Done when
All acceptance criteria of #22 and the "Done when" of #25 pass, every rule and edge case above is covered by a test, the validation gate is green (`npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, storybook and e2e as in CI), and the manual check is recorded.

If the brief, the issues and the code disagree in a way not listed above, do not pick silently: record it in the spec as an open question.
