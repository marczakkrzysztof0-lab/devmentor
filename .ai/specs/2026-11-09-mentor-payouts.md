# After the first paid request a mentor sets up payouts, and money owed for held sessions is paid out

Issues: #22 (E04-S01) and its task #25 (E04-S01-T01), one change, one PR closing both · Epic: #11 · Depends on: #24 payments/webhook/jobs (spec `2026-10-19-stripe-card-payment-refund-and-webhook.md`), #17 requests, #21 settlement (spec `2026-10-30-no-show-settlement.md`, contract in `db/migrations/0008_session_outcomes.sql`) · Risk: `risk-high` (money, schema migration, new webhook events, new job)

## TLDR

Today the developer pays (E02) and every session is settled (E03-S02: `held`, `mentee_no_show`, `mentor_no_show`), but nothing ever reaches the mentor. This change closes the money loop with Stripe Connect Express in **test mode only**: the mentor is asked for payout details only after their first paid request (D07, R13), sets them up on a Stripe-hosted page, and a scheduled job transfers each owed request exactly once to the mentor's connected account. Money stays `held_for_payout` while the account is not `ready`; refunded requests are never paid out; a refund discovered after a transfer is flagged for manual handling, never reversed automatically.

## Deviations from the issues (decided in the brief, recorded here)

| # | Issue text | What we do | Why |
|---|---|---|---|
| DV1 | #22/#25: "greenfield, no product code" | Build on `lib/payments`, `lib/requests`, `lib/sessions`, `lib/jobs`, `app/mentor`, `@devmentor/ui` | E01–E03 are merged; the issue text is stale. |
| DV2 | #25 is a separate "technical task with no user-facing outcome" | Delivered inside this change together with #22; the PR closes both | One reviewable money loop; onboarding without payouts has no testable outcome. |
| DV3 | "In Stripe test mode a mentor can complete payout onboarding" | Everything runs against the fake Stripe (`tests/payments/fake-stripe.mjs` for unit/DB tests, `tests/e2e/fake-stripe-server.mjs` for E2E/QA via `STRIPE_API_BASE_URL`, localhost only). No real Stripe calls in tests. | Real Stripe keys are not available. |

## Open questions (brief, issues and code disagree; default chosen, owner Krzysztof Marczak)

Known gaps: transfers.list pagination is not exercised by the fake Stripe client; tests do not exercise a request inserted while onboarding is in progress or the no-payments-configured server wrappers.

| # | Conflict | Default in this change | Reversible by |
|---|---|---|---|
| OQ1 | Brief: "Text in the UI in English" and quotes English copy. `AGENTS.md` hard rule: "UI copy: Polish, gender-neutral"; `CODE_REVIEW.md`: user texts in Polish; every page is Polish (`lang="pl"`); the existing DS draft `packages/ui/src/product/e04/MentorPayouts.tsx` is Polish. | **Polish**, gender-neutral. Brief copy is translated 1:1: "Set up payouts to receive your earnings" → *Skonfiguruj wypłaty, żeby otrzymać zarobione pieniądze*; "Payouts ready" → *Wypłaty gotowe*. Code identifiers, comments in code may stay as the module already does. | Changing the strings in the DS component and the E2E assertions. |
| OQ2 | Brief rule 1: `ready` = "payouts enabled and charges/transfers capability active". With separate charges and transfers the connected account only receives transfers. | `ready` ⇔ `payouts_enabled === true` **and** `capabilities.transfers === "active"`. The account is created with `card_payments` **and** `transfers` requested (Stripe's standard Express configuration for a same-country account; a transfers-only account would need the recipient service agreement, which we do not use), but `ready` does not depend on `charges_enabled`. | Pure function `payoutAccountState(account)`; one place. |
| OQ3 | `account.updated` for connected accounts is delivered by Stripe to a **Connect** endpoint, which has its own signing secret. Brief: "signature verification already used by `route.ts`". | Same route `POST /api/webhooks/stripe`. `handleStripeWebhook` (`lib/payments/webhook.mjs`, where the secret is chosen today) verifies with `config.webhookSecret` and, only if that fails and `config.connectWebhookSecret` is set (new optional `STRIPE_CONNECT_WEBHOOK_SECRET`), with that one. Unset → behaviour exactly as today; the job's periodic resync (Account state sync) then keeps account states current without Connect webhooks. In Stripe a Connect endpoint pointing to the same URL must be registered (documented in README and `BACKWARD_COMPATIBILITY.md`). | Env var documented in README and in the protected env-var row of `BACKWARD_COMPATIBILITY.md`; additive. |
| OQ4 | Brief rule 4: "Stripe idempotency key derived from the request id". Stripe caches a response under a key, errors included, so retrying with the same key after a received error would replay it forever; changing the key after an outcome Stripe may have executed could create a second transfer — unlike refunds, Stripe has no "cannot exceed the charge" guard for transfers. | Key `payout:<requestId>:<key_version>`. `payouts.key_version` starts at 1. Stripe stores the first response under a key, errors included (also 4xx and 500), except requests it never executed (validation failure, 409 concurrent use). So: after **no response** (timeout, network error), 409 or 429, or an expired lease, the next attempt keeps the same key (Stripe either returns the transfer it created or executes the request for the first time); after a **received** error response (4xx other than 409/429, or 5xx) the next attempt first runs the take-over list and, when no transfer of this request exists, increments `key_version` before creating (a cached error would otherwise be replayed forever). In addition, before every create: take-over via `transfers.list({ destination: <account>, created: { gte: <payout.created_at − 1 day> }, limit: 100 })` with pagination — a transfer whose `metadata.payout_id` is this payout (and amount, currency match; not fully reversed) is adopted. We do not rely on `transfer_group` for matching (with `source_transaction` Stripe may manage the group itself). Lease 15 min: one attempt makes up to four sequential Stripe calls (refunds.list, paymentIntents.retrieve, transfers.list, transfers.create), each ≤ ~60 s with SDK retries; before `transfers.create` the worker checks that at least 2 min of the lease remain, otherwise it abandons the attempt without writing (the next claim reconciles). The database unique keys (`payouts.request_id`, `payouts.stripe_transfer_id`) guarantee one payout record per request; the stable key + take-over guarantee one Stripe transfer. | — |
| OQ5 | Funds availability: card funds reach the platform's available balance days after the charge, so a plain transfer from the balance would fail with `balance_insufficient` and exhaust the attempts (non-blocking question in #22: "payout timing after a held session"). | Transfers use `source_transaction: <charge id>`: under the claim the job reads `paymentIntents.retrieve(payments.stripe_payment_intent_id).latest_charge` (no E02 change); Stripe then accepts the transfer before the funds are available. A missing payment intent / charge is a failed attempt (`missing_charge`). | — |
| OQ6 | A disputed payment (`payments.disputed_at`, chargeback) on a held session: the brief puts disputes out of scope, but paying out disputed money is a loss. | A payout whose payment has `disputed_at` is not transferred: it goes straight to `failed` with `last_error = 'disputed'`, no Stripe call, manual (same as refunds in E02: "Płatność ze sporem → failed od razu, bez Stripe"). | Rule in one place (`transferOne`). |
| OQ7 | Brief statuses are `held_for_payout` / `transferring` / `paid` / `failed`. A request refunded **before** its transfer needs a terminal state that is not "failed" and never pays. | Fifth status `cancelled` (refund seen before any transfer; never paid, not an error). The mentor sees it in the list as *Zwrócone deweloperowi — bez wypłaty*; it never counts in "held" or "paid". | — |
| OQ10 | E02 only records **full** refunds on `payments` (`refund_status`); a partial or foreign refund from the Stripe dashboard is logged and ignored (`lib/payments/webhook.mjs` `onChargeRefunded` amount check, `onRefund` `isOurFullRefund`). The brief: "any refund row (full or partial) … never paid out". | Minimal additive hook in E02: new nullable column `payments.refund_seen_at`, set (`coalesce`) by `onChargeRefunded` and `onRefund` whenever the payment is matched and the Stripe object shows **any refund**, **before** their existing early returns. One predicate `hasAnyRefund` is used everywhere (webhook and the `refunds.list` check under the claim), following the brief literally ("any refund row, full or partial"): a charge with `amount_refunded > 0` or any refund in `charge.refunds`, or any refund object of this payment intent **in any status** (incl. `failed` / `canceled`). Conservative on purpose: a request with a failed dashboard refund is not paid out automatically; operators decide by hand (D12, Q05); E02 transitions are otherwise unchanged. "Has a refund" everywhere in payouts = `refund_status IS NOT NULL OR refund_seen_at IS NOT NULL`. In-app refunds are never requested for `held` / `mentee_no_show` (E02/E03 only refund declined, lapsed, cancelled, `mentor_no_show`), so on owed requests a refund can only come from the dashboard. | Additive column; unused if payout code is reverted. |
| OQ8 | Owed amount 0 (commission 10000 bps) cannot be transferred (Stripe rejects amount 0). | No payout row is created when the mentor share is 0 (nothing owed). The total "held" shows only positive shares. | — |
| OQ9 | Where the mentor sees payouts. The DS draft is a full screen `/mentor/payouts`; the brief says "mentor panel". | New page `/mentor/payouts` (finalized DS screen) + a prompt on the panel home `/mentor` when rule 2 applies, and a one-line status with a link once an account exists. `MentorNav` is unchanged (no new nav item). While rule 2 does not hold and no account exists, `/mentor/payouts` redirects to `/mentor` (nothing mentions payouts before the first paid request). | — |

## Rules (exact definitions used in code, tests and this spec)

1. **Payout account.** At most one Stripe Connect Express account per mentor, created on demand. Derived state: `none` (no row), `pending` (row exists, Stripe does not report `ready`), `ready` (OQ2). The state comes only from Stripe: `accounts.retrieve` (on return/refresh to the panel) or the `account.updated` webhook — never from the mentor merely landing on a return URL.
2. **When to ask.** The mentor is asked to set up payouts when they have at least one request whose status is not `awaiting_payment` / `payment_failed` **and** their payout account is not `ready`. Before the first such request nothing in the mentor UI mentions payouts (`/mentor/payouts` redirects to `/mentor`, and the server refuses to start onboarding). Publishing, availability and requests work identically in every payout state (R13).
3. **Owed amount.** For each request in `held` or `mentee_no_show` whose payment is `succeeded` and has **no refund of any kind** (`refund_status IS NULL AND refund_seen_at IS NULL`, OQ10): `share = amount_minor − floor(amount_minor × commission_bps / 10000)` with the `commission_bps` snapshot stored on the payment. Integers only (grosze, currency of the payment); in SQL the product is computed as `bigint` (500000 grosze × 10000 bps exceeds `integer`). A disputed payment is owed but never transferred (OQ6). `mentor_no_show`, `declined`, `lapsed`, `cancelled`, `accepted`, `awaiting_*`, `payment_failed` are never owed. A payment with a full or partial refund (any non-null `refund_status`) is never owed.
4. **Payout.** Job `payouts.transferOwed` (existing `lib/jobs` registry, existing `POST /api/internal/jobs`, no new route) creates **one Stripe transfer per owed request** to the mentor's connected account, only when the account is `ready`. Each request is transferred at most once: DB unique key on `payouts.request_id`, guarded state transitions, and the Stripe idempotency key + take-over of OQ4. While the account is not `ready`, owed requests stay `held_for_payout` and **no Stripe call** is made for them.
5. **Failure.** A failed attempt is recorded (`status = 'failed'`, `attempts`, `last_error` = Stripe code + request id only, `next_attempt_at`) and retried by later job runs with backoff 1, 5, 15, 60 min (as `refundBackoffMinutes`); after `PAYOUT_MAX_ATTEMPTS = 5` attempts it stays `failed` with `next_attempt_at = NULL` (manual in the Stripe dashboard, D12/Q05) and is counted in the jobs health (`failedPayouts`). A `transferring` payout whose lease expired on its last allowed attempt is resolved by a take-over check only (no create): an existing transfer → `paid`; none → `failed`, `last_error = 'lease_expired'`, `next_attempt_at = NULL` (counted in `failedPayouts`); it never stays `transferring` forever. A refund seen on a payment (OQ10) **after** its payout is `paid` (or while it is `transferring` and the transfer then succeeds) sets `manual_reason = 'refunded_after_payout'` (once, with an error log); it is never reversed automatically and is counted in `payoutsNeedingAttention`.

## User stories

1. **First paid request.** Anna published her page without payout details. Kuba pays for a 25 min session (150 zł). Anna's `/mentor` now shows a prompt *Skonfiguruj wypłaty, żeby otrzymać zarobione pieniądze* with the button *Skonfiguruj wypłaty w Stripe*. Her page, availability and requests keep working; ignoring the prompt changes nothing else.
2. **Onboarding.** Anna clicks the button → the server creates (or reuses) her Express account and an account link → the browser goes to the Stripe-hosted onboarding → on return (`/mentor/payouts?stripe=return`) the page re-reads the account from Stripe and shows *Wypłaty gotowe* or *Stripe sprawdza dane*. Leaving the onboarding early (refresh URL `/mentor/payouts?stripe=refresh`) shows that setup was not finished and offers the button again.
3. **Held money.** The session is settled `held`. While Anna's account is not `ready`, `/mentor/payouts` shows *Wstrzymane — czeka na dane do wypłaty* for the request and the total held (150 zł − 10% = 135 zł with 1000 bps). No transfer is attempted.
4. **Paid out.** Once the account is `ready` (return re-read or `account.updated`), the next job run transfers 135 zł; the page shows *Wypłaty gotowe*, *Wypłacone do tej pory: 135 zł*.
5. **Refunded.** A held request refunded from the Stripe dashboard (`external`) is never paid out; if it had already been paid out, operators see it in the jobs health and log, nothing is reversed automatically.

## Data model — migration `0009_mentor_payouts.sql` (additive only)

```
mentor_payout_accounts
  mentor_id uuid PK, FK mentors(id) ON DELETE RESTRICT
  stripe_account_id text UNIQUE      -- NULL = placeholder while the account is being created (derived state 'none')
  create_key_version integer NOT NULL DEFAULT 1 CHECK (create_key_version >= 1)
  payouts_enabled boolean NOT NULL DEFAULT false
  transfers_active boolean NOT NULL DEFAULT false
  details_submitted boolean NOT NULL DEFAULT false
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready'))
  CHECK ((state = 'ready') = (payouts_enabled AND transfers_active))
  last_event_created timestamptz    -- newest applied account.updated event.created (Stripe clock only)
  checked_at timestamptz            -- last accounts.retrieve applied (our clock only)
  CHECK (stripe_account_id IS NOT NULL OR state = 'pending')
  resync_requested_at timestamptz    -- set by every account.updated; cleared by a retrieval started after it
  created_at, updated_at timestamptz NOT NULL DEFAULT now()

payouts
  id uuid PK DEFAULT gen_random_uuid()
  request_id uuid NOT NULL UNIQUE, FK requests(id) ON DELETE RESTRICT
  mentor_id uuid NOT NULL, FK mentors(id) ON DELETE RESTRICT
  payment_id uuid NOT NULL, FK payments(id) ON DELETE RESTRICT
  amount_minor integer NOT NULL CHECK (amount_minor > 0)
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$')
  status text NOT NULL DEFAULT 'held_for_payout'
    CHECK (status IN ('held_for_payout','transferring','paid','failed','cancelled'))
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
  key_version integer NOT NULL DEFAULT 1 CHECK (key_version >= 1)   -- OQ4
  key_bump_due boolean NOT NULL DEFAULT false                        -- last attempt got a stored Stripe error response
  lease_until timestamptz            -- claim of a 'transferring' attempt (15 min)
  next_attempt_at timestamptz        -- 'failed' + retry due; NULL after the limit
  stripe_transfer_id text UNIQUE
  last_error text                    -- Stripe code + request id only, never the message
  manual_reason text CHECK (manual_reason IS NULL OR manual_reason IN ('refunded_after_payout','transfer_reversed'))
  paid_at timestamptz, cancelled_at timestamptz
  created_at, updated_at timestamptz NOT NULL DEFAULT now()
  CHECK ((status = 'paid') = (paid_at IS NOT NULL))
  CHECK ((status = 'paid') <= (stripe_transfer_id IS NOT NULL))   -- paid ⇒ transfer id
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
  INDEX payouts_mentor_idx (mentor_id, status)
  INDEX payouts_open_idx (status, next_attempt_at) WHERE status IN ('held_for_payout','failed')
  INDEX payouts_transferring_idx (lease_until) WHERE status = 'transferring'
```

Plus `ALTER TABLE payments ADD COLUMN refund_seen_at timestamptz` (nullable, OQ10). `disputed` (OQ6) is a `last_error` of a `failed` row, not a `manual_reason`.

`updated_at` is set by the application (no triggers), as in 0001/0005. **Down:** refuses (`RAISE EXCEPTION`) when any payout has `attempts > 0` or `stripe_transfer_id` set (a Stripe transfer may exist, incl. a `failed` row after an ambiguous outcome — dev/test only, like 0008); otherwise drops both tables and `payments.refund_seen_at`. Covered by `tests/db/migrations.test.mjs` (up/down/up, list of migrations + tables) and a refusal test.

## Architecture

- `lib/payouts/` (new module, plain `.mjs` + `server.ts`, mirroring `lib/payments`):
  - `amounts.mjs` — pure: `mentorShareMinor(amountMinor, commissionBps)` (integer; throws on non-integer / negative / bps outside 0–10000), `payoutAccountState(account)` (OQ2), `shouldAskForPayouts({ hasPaidRequest, accountState })` (rule 2), `payoutBackoffMinutes(attempt)`, `PAYOUT_MAX_ATTEMPTS = 5`, `PAYOUT_LEASE_MINUTES = 15`.
  - `accounts.mjs` — `startOnboarding({ mentorId, returnUrl, refreshUrl }, deps)`; `syncAccountFromStripe(mentorId, deps)` (retrieve + guarded apply); `applyAccountObject(tx, account, asOf)` (shared by webhook and sync).
  - `transfers.mjs` — `recordOwed(db, { limit })`, `cancelRefunded(db)`, `flagRefundedAfterPayout(db, deps)`, `transferOne(payoutId, deps)`, job `transferOwed(deps, { limit, deadline })`.
  - `summary.mjs` — `getPayoutSummary(db, { mentorId })` → `{ hasPaidRequest, accountState, askForPayouts, heldMinor, paidMinor, currency, items[] }`. `heldMinor` = shares of all requests **owed** by rule 3 that are not `paid` and not `cancelled` — computed from `requests` + `payments` (left join `payouts`), so a request settled `held` counts immediately, before the job records its row; `paidMinor` = sum of `paid` rows. Items: request id, mentee first name, length, slot, share, status `held_for_payout` | `transferring` | `paid` | `failed` | `cancelled` (an owed request without a row shows as `held_for_payout`). DS wording: `held_for_payout` → *Wstrzymane — czeka na dane do wypłaty* while the account is not ready, *Do wypłaty* when ready; `transferring` → *Wypłata w toku*; `paid` → *Wypłacone*; `failed` → *Wypłata wstrzymana — wyjaśniamy*; `cancelled` → *Zwrócone deweloperowi — bez wypłaty*.
  - `server.ts` — `import "server-only"`; wrappers that take the mentor id **only** from `getCurrentMentor()`.
- `lib/payments/webhook.mjs` — `onChargeRefunded` / `onRefund` set `payments.refund_seen_at` (OQ10) and call `onRefundSeen(tx, paymentId)` from `lib/payouts` (cancel unpaid payout rows, flag paid ones) before their existing early returns. `HANDLED_EVENT_TYPES` gains `account.updated`, `transfer.created`, `transfer.reversed`, `transfer.updated` (the last treated like `transfer.reversed` when `amount_reversed > 0`, otherwise `noop`); dispatch to `lib/payouts` handlers inside the same transaction that inserts `stripe_events` (idempotent). Unknown types → `ignored` as today.
- `lib/payments/webhook.mjs` `handleStripeWebhook` — verification tries `config.webhookSecret`, then `config.connectWebhookSecret` when configured (OQ3); `route.ts` and `stripe-client.mjs` unchanged. `readPaymentsConfig` gains optional `connectWebhookSecret` (empty → null).
- `lib/jobs/registry.mjs` — `payouts.transferOwed` after `sessions.settleEnded` and `payments.retryRefunds`, before `email.sendDue`. `jobsHealth` adds `failedPayouts` and `payoutsNeedingAttention` (additive fields of `GET /api/internal/jobs`).
- `app/mentor/payouts/page.tsx` (+ `actions.ts`) — re-reads the session mentor's account from Stripe on every visit when one exists (Stripe error → stored state); redirects to `/mentor` while rule 2 does not hold and no account exists; Server Component behind `<Suspense>` (cacheComponents), `connection()`, renders DS `MentorPayouts`; on `?stripe=return|refresh` it first calls `syncAccountFromStripe` for the **session mentor only** (query params carry no account id and nothing from them is trusted besides the two literal values). Server action `openPayoutOnboardingAction()` (no arguments) → `{ ok: true, url } | { ok: false }`.
- `app/mentor/page.tsx` — loads `getPayoutSummary` for the session mentor; when `askForPayouts` renders DS `PayoutSetupPrompt` (button = same server action, `HostedRedirectAction`); when an account exists and is `ready` renders a one-line *Wypłaty gotowe* with a link to `/mentor/payouts`; with no paid request renders nothing about payouts. A payout read error never blocks the panel (the prompt is skipped, logged by error name).
- Design system (`packages/ui/src/product/e04/`): finalize `MentorPayouts` (states mapped to `none`/`pending`/`ready`; session statuses `held_for_payout` (two wordings: account ready / not ready), `transferring`, `paid`, `failed`, `cancelled` (wording in `summary.mjs` above, a story for each); remove the `action_required` and `in_transit` draft states; keep loading/error/empty), add `PayoutSetupPrompt`, export both from `product/index.ts`, stories for every state including 390 px (`phone`) and dark theme; remove "draft" wording.

### Onboarding (`startOnboarding`)

1. Refuse with `{ ok: false, code: "not_available" }` unless rule 2 holds or an account row exists and is not `ready`; `ready` → `{ ok: false, code: "already_ready" }`.
2. **Short committed claim** (no transaction held across Stripe calls, like refunds): `insert into mentor_payout_accounts (mentor_id) values ($1) on conflict (mentor_id) do nothing` — a placeholder row with `stripe_account_id = NULL` (derived state stays `none` until an id is stored). If the row has no account id: `stripe.accounts.create({ type: "express", country: "PL", capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, business_type: "individual", metadata: { mentor_id } }, { idempotencyKey: "payout-account:<mentorId>:<create_key_version>" })` — params contain nothing that can change between clicks (no email; the mentor types it at Stripe), then guarded `update … set stripe_account_id = $acct where mentor_id = $1 and stripe_account_id is null`; if another click stored an id first, that id is used (both calls used the same key → the same account, or the second got 409 → `stripe_error`, button can be pressed again). A received Stripe error response (4xx other than 409/429, 5xx) bumps `create_key_version` (the stored error would otherwise be replayed for 24 h); no response / 409 / 429 keep it. → `{ ok: false, code: "stripe_error" }`. Residual risk (documented for operators): an orphan test-mode account in Stripe when the id never got stored and the key later changed; Stripe cannot list accounts by metadata, so it is not looked up.
3. `stripe.accountLinks.create({ account, type: "account_onboarding", return_url: <app>/mentor/payouts?stripe=return, refresh_url: <app>/mentor/payouts?stripe=refresh })` → `{ ok: true, url }`. Stripe errors → `{ ok: false, code: "stripe_error" }` (logged with `stripeErrorSummary`), nothing in the DB changes except a possibly created account row (harmless, reused next time).

### Account state sync (`applyAccountObject`)

Stripe's clock and ours are never compared. Two paths:
- **Webhook `account.updated`**: applied only if `last_event_created IS NULL OR event.created > last_event_created` (**strict**) — events are ordered among themselves, so a replayed or older event never moves `ready` back to `pending`; an event with an **equal** `event.created` (one-second resolution) is not applied (state stays as it is, e.g. `ready`, until the next retrieval); a **newer** event saying payouts are disabled does move `ready → pending` (Stripe is the source of truth). Every `account.updated` (applied or not) also sets `resync_requested_at = now()`.
- **Retrieval** (`accounts.retrieve`: return/refresh, every visit of `/mentor/payouts` by its owner, job step 0): the moment `t0` is taken before the call; the object is applied (state, `checked_at`, `resync_requested_at = NULL`) only `where resync_requested_at is null or resync_requested_at <= t0`. If a webhook arrived during the call, the retrieval is discarded and the flag stays — job step 0 re-reads before any transfer (step 0 runs before step 4 in the same run).
Unknown account id → log, `ignored`.

### Payout job (`transferOwed`)

Each step bounded by `limit` and the jobs `deadline`:
0. **Resync accounts** (bounded, ≤ `limit`): accounts with `resync_requested_at` set, and `pending` accounts whose mentor has owed money and whose `checked_at` is older than 30 min — so an account verified asynchronously by Stripe becomes `ready` even without Connect webhooks.
1. **Record owed**: `insert into payouts (request_id, mentor_id, payment_id, amount_minor, currency) select … where r.status in ('held','mentee_no_show') and p.status = 'succeeded' and p.refund_status is null and p.refund_seen_at is null and share > 0 on conflict (request_id) do nothing` (share = `p.amount_minor - (p.amount_minor::bigint * p.commission_bps / 10000)::int`; identical to `mentorShareMinor`, asserted by a test incl. 500000 grosze at 9999/10000 bps).
2. **Cancel refunded**: `held_for_payout` / `failed` payouts whose payment "has a refund" (OQ10) → `cancelled` (guarded update; never touches `transferring`/`paid`). The webhook hook `onRefundSeen` does steps 2–3 at once for one payment; the job repeats them as a safety net.
3. **Flag refunded after payout**: `paid` payouts whose payment has a refund and `manual_reason is null` → `manual_reason = 'refunded_after_payout'` + `log.error`. No Stripe call.
4. **Transfer due**: candidates = `held_for_payout`, or `failed` with `next_attempt_at <= now`, or `transferring` with expired `lease_until`; joined to a `ready` account. For each, `transferOne`:
   - **Claim** (autocommit, guarded, one statement): `update payouts set status = 'transferring', attempts = attempts + 1, lease_until = now + 15 min where id = $1 and (status = 'held_for_payout' or (status = 'failed' and next_attempt_at <= now) or (status = 'transferring' and lease_until < now)) and attempts < PAYOUT_MAX_ATTEMPTS returning …` — zero rows → another runner has it → skip. Two concurrent runs: only one claim succeeds per payout. An expired lease is re-claimed with the **same** `key_version` (OQ4), so a stalled first worker and the new one send the same idempotency key → at most one Stripe transfer.
   - **Expired on the last attempt**: `transferring`, lease expired, `attempts >= PAYOUT_MAX_ATTEMPTS` → guarded take-over check only (list by destination + metadata; no create): found → `paid`; none → `failed`, `lease_expired`, `next_attempt_at = NULL`.
   - **Re-check under claim** (fresh read of the payment): has a refund (OQ10) → `cancelled`; disputed → `failed`, `last_error = 'disputed'`, `next_attempt_at = NULL`, no Stripe call (OQ6); account no longer `ready` → back to `held_for_payout` (`attempts - 1`, no Stripe call).
   - **Stripe refunds check**: `refunds.list({ payment_intent })`; any refund (`hasAnyRefund`) → set `payments.refund_seen_at`, payout `cancelled`, no transfer (a dashboard refund whose webhook has not arrived yet).
   - **Charge**: `paymentIntents.retrieve(pi)` → `latest_charge` (OQ5).
   - **Take-over**: `transfers.list({ destination, created: { gte }, limit: 100 })`, paginated; a transfer with `metadata.payout_id` = this payout, matching amount and currency, not fully reversed, is adopted.
   - **Create**: `transfers.create({ amount, currency: lower(currency), destination, source_transaction: <charge>, metadata: { payout_id, request_id } }, { idempotencyKey: "payout:<requestId>:<key_version>" })`.
   - **Write result** in a transaction, guarded by `attempts = $attempt and status = 'transferring'`: success → `paid`, `stripe_transfer_id`, `paid_at`, lease cleared; if the payment "has a refund" by then (a refund raced the Stripe call) → also `manual_reason = 'refunded_after_payout'` + `log.error` (surfaced, never reversed). Received error response → `failed`, `last_error`, marked `key_bump_due` (the next attempt bumps `key_version` after its take-over finds nothing), backoff; no response / 409 / 429 → `failed`, `last_error`, same key, backoff. After any outcome Stripe may have executed (no response, 409, 429, 5xx) the worker first runs the take-over list once, immediately: a transfer found → `paid` in the same run (safe adoption, decided during implementation); `next_attempt_at = NULL` when `attempt >= PAYOUT_MAX_ATTEMPTS` (+ `log.error` "manual") — but before writing that terminal `failed` after an outcome Stripe may have executed (no response, 409, 429, 5xx) the worker runs the take-over list once more: a transfer found → `paid`. A write that finds 0 rows (lease lost) changes nothing; the next attempt's take-over reconciles.
5. Returns counts `{ recorded, cancelled, flagged, transferred, failed, skipped }`.

### Webhook handlers (in the existing webhook transaction)

- `account.updated` → `applyAccountObject(tx, event.data.object, new Date(event.created * 1000))`.
- `transfer.created` → payout found by `metadata.payout_id` (UUID shape) with `stripe_transfer_id` null and status `transferring` **or `failed`**, amount/currency/destination matching → `paid` with the transfer id (+ `refunded_after_payout` if the payment has a refund by then) (a webhook that beats the worker's write; the worker's guarded write then finds nothing). Otherwise `noop`.
- `transfer.reversed` (and `transfer.updated` with `amount_reversed > 0`) → payout by `stripe_transfer_id` → `manual_reason = 'transfer_reversed'` if null + `log.error`; status unchanged (money handled manually, D12).

## API contracts

| Call | Result |
|---|---|
| `mentorShareMinor(amountMinor, commissionBps)` | integer ≥ 0 |
| `payoutAccountState(account \| null)` | `"none" \| "pending" \| "ready"` |
| `shouldAskForPayouts({ hasPaidRequest, accountState })` | boolean (rule 2) |
| `startOnboarding({ mentorId, returnUrl, refreshUrl }, deps)` | `{ ok: true, url } \| { ok: false, code: "not_available" \| "already_ready" \| "stripe_error" }` |
| `syncAccountFromStripe(mentorId, deps)` | `"none" \| "pending" \| "ready"` (state after sync; Stripe error → stored state, logged) |
| `getPayoutSummary(db, { mentorId })` | see Architecture; scoped by `mentor_id` in every query |
| Job `payouts.transferOwed` | counts; registered in `JOBS` |
| `GET /api/internal/jobs` | adds `failedPayouts`, `payoutsNeedingAttention` (integers) |
| `POST /api/webhooks/stripe` | adds `account.updated`, `transfer.created`, `transfer.reversed`, `transfer.updated` |
| Page `/mentor/payouts` | new mentor-only page (no session → *Dostęp tylko przez zaproszenie…*, as `/mentor`) |

## Access control (L16)

The mentor id comes **only** from `getCurrentMentor()` (cookie `dm_session`) in the page, the server action and every query; no route or action accepts a mentor id or Stripe account id from the client. Another mentor therefore cannot start, continue or read someone else's onboarding: opening `/mentor/payouts?stripe=return` as mentor B re-reads B's own account (or shows B's state), never A's. The Stripe account link URL itself is a short-lived, single-use Stripe URL (outside our app). Tests (AGENTS.md rule: two accounts, three checks): DB tests with mentors A and B — **positive path for both** (each starts onboarding and gets their own account link; each summary shows their own totals); **denied read** (B's summary, B's sync and B's `/mentor/payouts` data never contain A's account id, requests or amounts); **denied write** (B's onboarding/sync calls never create, change or link A's account; A's `mentor_payout_accounts` row and A's payouts are byte-for-byte unchanged afterwards). E2E/manual: B opens `/mentor/payouts?stripe=return` and A's fake onboarding link after A started onboarding — B sees only B's state, A's state unchanged. A failing positive path = inconclusive, never PASS.

## Edge cases → tests

| Edge case (brief) | Expected | Test |
|---|---|---|
| Zero paid requests | no prompt; `startOnboarding` → `not_available`; panel and page work | unit `shouldAskForPayouts`; DB `payouts-onboarding`; E2E before payment |
| First successful payment | prompt appears; publishing/requests unchanged | DB summary; E2E |
| Onboarding abandoned (`pending`) | prompt stays; owed stays `held_for_payout`; **zero** `transfers.*` calls | DB `payouts-transfer` |
| Account `ready` via webhook | next run transfers every owed request once | DB `payouts-webhook` + `payouts-transfer` |
| Two concurrent runs | each request one transfer (`transfers.create` count = owed count; one `paid` row per request) | DB, `Promise.all` with fake delay |
| Re-run | no-op | DB |
| Refund (any refund row, full/partial, any status) before transfer | never paid (`cancelled` or never recorded) | DB |
| Refund after transfer | `manual_reason = refunded_after_payout`, no Stripe call, counted in health | DB |
| Partial / dashboard refund (ignored by E02) before or after transfer | `refund_seen_at` set by the webhook → never paid / flagged | DB |
| Dashboard refund whose webhook has not arrived, at transfer time | `refunds.list` under the claim → `cancelled`, zero `transfers.create` | DB |
| Refund recorded while the Stripe call is in flight | `paid` + `refunded_after_payout` (deterministic hook in the fake) | DB |
| Lease expired (stalled worker) and re-claim | same idempotency key → one Stripe transfer; on the last attempt → take-over or `failed`/`lease_expired` | DB |
| SQL commission math at the max price | 500000 grosze × 9999/10000 bps, no overflow, equals JS | DB |
| Same-second `account.updated` with another state (both delivery orders); retrieval racing a newer webhook | equal timestamp not applied, flag set → job resync; retrieval started before the flag is discarded | DB |
| Two concurrent onboarding clicks of one mentor | one `accounts.create`, one row; a request insert for that mentor is not blocked meanwhile | DB |
| Stripe 5xx on attempt 1 (stored under the key), success later | take-over finds nothing → `key_version` 2 → exactly one transfer (fake replays stored errors per key) | DB |
| Timeout after Stripe executed `transfers.create` | same key on the next attempt → the same transfer, one in total | DB |
| Account verified by Stripe later, no webhook | job resync of `pending` accounts with owed money → `ready` → paid | DB |
| Clock skew between `event.created` and our clock | no comparison across clocks; webhook ordering among events only | DB |
| Timeout with effect on the last allowed attempt | final take-over finds the transfer → `paid`, one transfer | DB |
| `transfer.created` arriving for a `failed` payout | adopted → `paid` | DB |
| `accounts.create` received error, then retry | key version bumped → account created; no-response → same key | DB |
| Failed / canceled dashboard refund | counts as a refund row → never paid out automatically (manual) | DB |
| Down migration after any transfer attempt | refused | DB |
| Connect-signed webhook; wrong secret | accepted; 400 | DB/unit |
| `mentor_no_show`, `declined`, `lapsed`, `cancelled` | never owed | DB |
| Commission rounding: 1 grosz, 0 bps, 10000 bps, odd amounts | `1→1` (1000 bps), `x,0→x`, `x,10000→0` (no row), `15000,1000→13500`, `199,333→193` | unit |
| Transfer fails (error / timeout) | attempt recorded, retried after backoff (fake clock), stops at 5, `next_attempt_at` NULL, health `failedPayouts` | DB |
| Timeout after Stripe created the transfer | next attempt adopts it via `transfers.list` → one transfer | DB (`afterEffect`) |
| Webhook replayed / out of order | duplicate event id → `duplicate`; older `account.updated` (pending) after newer (ready) → stays `ready` | DB |
| Another mentor's onboarding | denied by construction; tested with two mentors | DB + manual |
| Disputed payment | `failed`/`disputed`, no Stripe call | DB |
| Payments not configured | job skipped like other payment jobs; page shows state from DB; button → `{ ok: false }` | DB/unit |

## Fakes

- `tests/payments/fake-stripe.mjs`: stores the first response **or error** per idempotency key and replays it (like Stripe), with an option for "no response" failures that are not stored; `accounts.create/retrieve`, `accountLinks.create`, `transfers.create/list`, `paymentIntents.retrieve` (`latest_charge`), helpers `setAccount(id, { payouts_enabled, transfers })`, failure injection via existing `fail("transfers.create", …)`, `afterEffect`, `calls`, `count`.
- `tests/e2e/fake-stripe-server.mjs`: `POST /v1/accounts`, `GET /v1/accounts/:id`, `POST /v1/account_links` (url `<fake>/connect/<acct>`), hosted page `/connect/<acct>` with *Dokończ konfigurację (test)* (sets payouts enabled + transfers active, redirects to `return_url`) and *Wróć* (redirects to `refresh_url`, account unchanged), `POST/GET /v1/transfers` (idempotency keys honoured), `GET /v1/payment_intents/:id` (`latest_charge`), exported maps for assertions.

## Tests to add

- Unit (`tests/payouts/amounts.test.mjs`, node:test, no DB): share math table incl. rounding cases and invalid input; `payoutAccountState`; `shouldAskForPayouts`; backoff; fake clock where time matters.
- DB (`tests/db/payouts-*.test.mjs`, `describeDb`): onboarding (rule 2, idempotent account, two mentors), summary scoping, webhook `account.updated` ordering/replay + `transfer.*`, job (held while not ready, transfer when ready, concurrency, idempotent re-run, refunds before/after, never-owed statuses, failure/backoff/limit, take-over, dispute), registry order, health fields, migration 0009 checks and down refusal; `tests/db/migrations.test.mjs` updated with `0009_mentor_payouts` and its tables.
- E2E `tests/e2e/mentor-payouts.e2e.mjs` (next to `session-settlement.e2e.mjs`): mentor signs in → no prompt → developer pays via fake Checkout → prompt visible, `/mentor/requests` still works → session accepted + settled `held` (SQL time shift + jobs endpoint, as in settlement E2E) → `/mentor/payouts` shows held 135 zł → onboarding via fake hosted page → return shows *Wypłaty gotowe* → jobs endpoint → *Wypłacone do tej pory: 135 zł*, one transfer in the fake; screenshots when `E2E_SCREENSHOT_DIR` is set; 390 px check of `/mentor/payouts`.
- Storybook: stories for `MentorPayouts` and `PayoutSetupPrompt` states (run as tests with axe in both themes).

## Docs to update

README (job `payouts.transferOwed`, optional `STRIPE_CONNECT_WEBHOOK_SECRET`), `.env.example` (commented placeholder only), `BACKWARD_COMPATIBILITY.md` (page `/mentor/payouts`, webhook events incl. `transfer.updated` and the Connect endpoint registration on the same URL, env var `STRIPE_CONNECT_WEBHOOK_SECRET`, job name, health fields, migrations 0001–0009, #22 contract moved to "today"), `track.md` if it lists built stories.

## Risks and rollback

Irreversible money moves: a transfer cannot be undone by the app; wrong payouts are corrected by hand in Stripe (D12, Q05). Rollback: remove the job from the registry first (money then simply stays `held_for_payout`), then revert; the down migration refuses once money moved. Test mode only (`sk_test_`/`rk_test_` guard unchanged). Out of scope: commission value (Q01), refund/dispute rules, operator dashboard flows, own bank-detail forms, live mode, new dependencies.

## Implementation plan

1. Migration 0009 + pure `amounts.mjs` + unit tests + migration test update.
2. Fakes (unit/DB fake and E2E fake server).
3. `accounts.mjs` (onboarding, sync, apply) + webhook dispatch + optional connect secret + DB tests.
4. `transfers.mjs` job + registry + health + DB tests.
5. `summary.mjs` + DS components and stories + `/mentor/payouts` page + action + `/mentor` prompt.
6. E2E scenario; docs.

## Spec review log

| Round | Reviewer | Findings (real / not real) | Changes |
|---|---|---|---|
| R1 | Codex (gpt-6-luna) | 2 / 0 | refund racing an in-flight transfer → refunds.list under claim + post-success flag; account ordering → strict guard, retrieval `asOf` before the call, same-second tie → resync |
| R1 | Claude (opus, fresh) | 9 / 0 | OQ10 `refund_seen_at`; stable idempotency key (`key_version`); bigint share; `source_transaction`; lease expiry on the last attempt; secret choice in `handleStripeWebhook`; mentor-row lock on onboarding; `cancelled` display + held from owed requests; `/mentor/payouts` redirect |
| R2 | Codex (gpt-6-luna) | 3 / 0 (F1 accepted as "one predicate"; failed/canceled refunds deliberately not counted, rationale in OQ10) | down migration refuses after any attempt; explicit two-account denied read/write tests |
| R2 | Claude (opus, fresh) | 11 / 0 | stored-5xx key bump after take-over; no cross-clock ordering (event order + retrieval always applied + resync flag); periodic resync of pending accounts; one `isLiveRefund` predicate; advisory lock instead of row lock; card_payments+transfers; lease 15 min + remaining-lease check; DS `cancelled`; BC env var + Connect endpoint; indexes; `transfer.updated` |
| R3 | Codex (gpt-6-luna) | 2 / 0 (F1 duplicate of Claude F1) | strict event ordering; refund predicate follows the brief literally (any refund object, any status) |
| R3 | Claude (opus, fresh) | 6 / 0 | strict ordering; last-attempt take-over + `transfer.created` adopts `failed`; take-over by destination + metadata (not transfer_group); retrieval discarded when a webhook arrived meanwhile; account creation as committed placeholder + key version, no transaction across Stripe |
