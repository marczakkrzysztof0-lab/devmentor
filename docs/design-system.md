# DevMentor design system — short version for agents

Read this file first when you build or change a screen. The Next.js block at the top of `AGENTS.md` is about the app in `app/` (Next.js 16); it does not apply to `packages/ui`, which is plain React + Tailwind 4 with Storybook (D6). The full documentation is the Storybook in `packages/ui` (`npm run storybook`). Decisions and their dates: `packages/ui/POSTEP.md`. Sources of every rule: `lekcja-06/referencje.md` (R, A, K, DK), `lekcja-06/tokeny.md`, specs in `.ai/specs/`.

## Character

DevMentor lets an invited senior engineer publish a page under their own link and lets a stuck developer send a prepaid question for a 25- or 50-minute text session; the mentor accepts or declines, and a decline or no answer refunds automatically. The interface is **concrete, readable, calm, warm** — never generic, noisy, colourless, judgemental or school-like. Dense lists for the mentor, calm pages for the question (K1); one main action with the exact amount (R01.5); states as words (R01.6); warmth from a stone base and plain words, not gradients (DK1, K3).

UI copy: Polish, gender-neutral (2nd person present, nouns, impersonal forms — C12), no emoji, no exclamation marks. Documentation: English.

## Rules added after the agent test (2026-10-19)

- Money: grosze whenever the amount is not whole („134,50 zł”), whole amounts without „,00” (C1).
- Tones: nothing to do → `info`; someone else or time → `waiting`; the viewer must act → `attention`; failure → `danger`. Always words + icon (B1, D7).
- At most one primary action per screen; none when there is nothing to do (D1, B2).
- The h1 names the object; only `/r/{token}` uses the state as h1 (D2).
- Lists: group order „needs your action → in progress → done” (C3); a row has `href` only if a detail page exists (C4); the zone is named once above a list (D3).
- Not available yet because of a business condition → `StateMessage empty` (why + next step); one action waiting for input → `disabledReason` (B3). Empty sub-section → `StateMessage` inside that section (B5).
- No network: form / action / loading variants (`NETWORK_MESSAGE`, `NETWORK_ACTION_MESSAGE`, `NETWORK_LOAD_MESSAGE`) (C6).
- `fullWidth` only for the main action of narrow developer pages (C7).
- Where code lives: components `src/components/<name>/`, product `src/product/e<NN>/`, screens `.storybook/screens.tsx` + `src/product/screens/E<NN>Screens.stories.tsx`, drafts not exported (C8, D5).

## What the source codes mean

| Code | Meaning | File |
|---|---|---|
| R01.x, R02.x | A trait taken from (or rejected in) a reference: R01 = GitHub (lists, mono code, 1 px lines), R02 = Slack (conversation in the centre) | `lekcja-06/referencje.md` |
| A01–A07 | Anti-references — looks to avoid (A01 generic AI, A02 course, A03 ratings, A04 catalogue, A05 subscription, A06 video, A07 gate before the question) | `lekcja-06/referencje.md` |
| K1–K6 | Resolved conflicts between references (e.g. K1 density by zone, K2 phone first screen) | `lekcja-06/referencje.md` |
| DK1–DK4 | Decisions outside references: colour, typography, motion, themes | `lekcja-06/referencje.md` |
| P1–P30 (in referencje.md) | The agent's proposals accepted with the references (character words P1–P9, rules P18–P29) | `lekcja-06/referencje.md` |
| P1–P10, S1–S20, C1–C14, T1, A1, B1… (design system) | Design-system decisions by stage: P = stage 0–1 plan, S = differences from shadcn and screen choices, C = copy, T = tokens, A/B/C/D = gaps from the agent test | `packages/ui/POSTEP.md`, `lekcja-06/test-agentem.md` |
| D01–D12, N01–N05, R01–R15 (brief) | Product decisions, "not now" decisions and rules from the brief and research — note: brief R-codes differ from reference R01.x | `.ai/specs/product-brief.md`, `.ai/specs/research/decisions/` |
| #14–#25 | Backlog items / GitHub issues; their specs are `.ai/specs/2026-10-19-*.md` | `.ai/specs/backlog.md` |
| WCAG x.y.z, WAI-ARIA | Accessibility standards | external |

You do not need the source file to apply a rule — the sentence next to the code is the rule; the code says where it was decided.

## How to build a screen

1. Find the pattern: Form, Grouped list, Detail view, Confirm irreversible decision, Request status page, Share link, Invitation-only gate, Time-zone-aware slots (Storybook → Patterns).
2. Choose components with the tables below. Do not add components or variants for one screen.
3. Use semantic tokens only. `npm run check:tokens` must pass.
4. Design every data state: loading, empty (why + next step), error (what happened + what to do), partial, lots of data, long text, 320 px; forms: pending, field error, server error, no network, success.
5. Check "What to avoid", then run `npm run test:themes`.

## Components

Imports: `import { … } from "@devmentor/ui"` (primitives), `import { … } from "@devmentor/ui/product"` (product). Text rules shared by the browser and the server (plain ESM, also for `node --test`): `import { textLength, publicWorkUrlProblem, … } from "@devmentor/ui/text"` — lengths in Unicode code points (an emoji is 1). Styles once in the app: `@import "@devmentor/ui/styles.css";` (already in `app/globals.css`).

| Component | Import | When | When not |
|---|---|---|---|
| `Button` (`primary`, `secondary`; `loading`, `disabledReason`, `asChild`) | `@devmentor/ui` | Start an action; exactly one `primary` per screen; label = verb + object (+ amount) | Navigation → `TextLink`; choosing → `RadioGroup` |
| `IconButton` | `@devmentor/ui` | „×” removing one item in a repeated row; `label` names the object | Any other action |
| `TextLink` (`external`, `asChild`) | `@devmentor/ui` | Go to a page or site | Changes data |
| `Spinner` | `@devmentor/ui` | Waiting for an answer, always with `label` | Known-shape content → `Skeleton` |
| `FormField` + `Label` | `@devmentor/ui` | Every typed field (label, hint, error, „(opcjonalnie)”) | Option groups |
| `TextInput` (`suffix`, `readOnly`) | `@devmentor/ui` | One short value; „zł” as suffix | Several lines |
| `Textarea` (`maxLength` in code points → counter from 80 %) | `@devmentor/ui` | Question (≤ 4000), description (≤ 2000) | Displaying sent text |
| `Select` (`options` or `groups`) | `@devmentor/ui` | Long lists: time zone, hour | 2–5 visible options |
| `RadioGroup` (`list`, `segmented`, `groups`) | `@devmentor/ui` | 25/50 min with prices, slots by day | Actions, long lists |
| `Panel` | `@devmentor/ui` | One block of main content | Rows; never nested |
| `List` + `ListRow` (`href`, `meta`, `end`) | `@devmentor/ui` | Many items of one kind, 1 px lines | Card grids |
| `StatusText` (`waiting`, `attention`, `success`, `danger`, `neutral`) | `@devmentor/ui` | State as words | Pills, counters |
| `DescriptionList` (`items`, one `emphasis`) | `@devmentor/ui` | Label–value facts; the main amount as `emphasis` | Many items → `List` |
| `Alert` (`info`, `attention`, `success`, `danger`) | `@devmentor/ui` | Form-level problem or notice next to the work | Field errors; toasts |
| `ConfirmDialog` | `@devmentor/ui` | Irreversible decisions (accept, decline, cancel) | Reversible actions |
| `StateMessage` (`empty`, `error`, `not-found`) | `@devmentor/ui` | Empty/failed/missing region + next step | Loading |
| `Skeleton` | `@devmentor/ui` | Loading known-shape content (static) | Waiting for an action |
| `CodeBlock`, `InlineCode` | `@devmentor/ui` | Code, paths, slugs as written | Input |
| `CopyField` | `@devmentor/ui` | Link to keep or share | Link to click |
| `MentorIdentity`, `MentorDescription`, `PriceList`, `LengthToggle`, `SlotList`, `MentorNotFound` | `@devmentor/ui/product` | `/m/[slug]` (#16) | Mentor screens |
| `MentorNav`, `InvitationPanel`, `AccessMessage`, `MentorPageForm`, `ShareLinkPanel`, `NoAvailabilityNotice`, `AvailabilityEditor`, `SlotPreview` | `@devmentor/ui/product` | Mentor screens (#14, #15) | Developer screens |
| `RequestForm`, `RequestStatusView`, `RequestSummary`, `QuestionText`, `SaveLinkBox`, `QuestionCopyBox`, `CancelRequest`, `CancelNotPossible` | `@devmentor/ui/product` | Request form, `/r/[token]` (#17, #19) | Mentor screens |
| `RequestList`, `RequestDecision`, `RequestNotFound` | `@devmentor/ui/product` | `/mentor/requests`, detail (#18) | Developer screens |
| `HostedRedirectAction`, `HostedReturnNotice` | `@devmentor/ui/product` | Leaving for Stripe Checkout / Connect (Button + „Otworzy się strona Stripe…”) and the notice after return | Links inside DevMentor |
| `Amount`, `PageLayout`, `formatMoney`, `formatTime`, `formatDay`, `formatDayFull`, `displayUrl` | `@devmentor/ui/product` | Every amount (Geist Mono), page frame, times in the viewer's zone | — |

Server actions are props (`action`, `onAccept`, `onDecline`…); a thrown error means "no network".

## Semantic tokens (Tailwind classes)

| Token | Class | Use for |
|---|---|---|
| `surface-page` | `bg-surface-page` | Page background |
| `surface-panel` | `bg-surface-panel` | Fields, panels, editor |
| `surface-code` | `bg-surface-code` | Code blocks, read-only fields, hover of secondary actions |
| `surface-scrim` | `bg-surface-scrim` | Backdrop behind a dialog |
| `text-primary` / `text-muted` | `text-primary` / `text-muted` | Body / metadata, hints |
| `text-on-action` | `text-on-action` | Only on the primary action fill |
| `text-link` | `text-link` | Links |
| `status-success-text` / `status-danger-text` | `text-status-success` / `text-status-danger` | „Opłacone”, errors (always with words) |
| `border-divider` | `border-divider` | 1 px row separators (decorative only) |
| `border-control` | `border-control` | Field edges, secondary buttons (≥ 3 : 1) |
| `action-primary-fill(-hover)` | `bg-action-primary-fill`, `hover:bg-action-primary-fill-hover` | The one primary action |
| `focus-ring` | `outline-2 outline-offset-2 outline-focus-ring` | Focus |
| `font-ui` / `font-mono` | `font-ui` / `font-mono` | Interface / code, amounts, slugs |
| `font-weight-regular` / `-strong` | `font-regular` / `font-strong` | 400 / 600 (headings, labels, buttons) |
| text sizes | `text-meta` 14, `text-body` 16, `text-heading-section` 20, `text-heading-page` 24 | One page heading per screen |
| spacing by relation | `gap-inline` 4, `gap-in-group` 8, `p-inside-panel` 16, `gap-between-groups` 24, `gap-between-sections` 48, `px-page-gutter` 16/32, `py-list-row-y` 8 | Pick by relation, not number |
| widths | `max-w-text` 65 ch, `max-w-page` 1024 px | Running text, page content |
| shape | `rounded-control` 4 px; no shadows | Everything rounded the same |
| motion | `duration-(--ds-duration-control)` 120 ms, `-menu` 180 ms, `-dialog` 240 ms; `ease-standard` | 0 ms with reduced motion |
| icons | `size-icon-sm` 16, `size-icon-md` 20 | lucide-react, with text |

Forbidden in components: hex/rgb/hsl/oklch, palette classes (`bg-zinc-900`, `text-white`), arbitrary values (`p-[13px]`), numeric spacing (`p-4`), `dark:` classes, shadows.

## If … then use …

| If… | Use |
|---|---|
| main action of the screen | `Button primary` with verb + object + amount |
| other actions | `Button secondary` |
| navigation | `TextLink` |
| 2–5 visible options | `RadioGroup` |
| long list | `Select` |
| irreversible decision | `ConfirmDialog` (focus on „Wróć”) |
| more content or a form | a separate page (no generic dialog, no side panel) |
| field error | `FormField error` |
| form-level or server problem | `Alert` |
| empty / failed / not found region | `StateMessage` with the next step |
| quick confirmation | inline text („Skopiowano.”) — no toast |
| error that needs action | never a toast |
| loading known shape / waiting for action | `Skeleton` / `Button loading` or `Spinner` |
| many items | `List` grouped by state, never a card grid |
| switching mentor views | separate pages with `MentorNav`, no tabs |

## What to avoid

- Product anti-patterns: ratings and reviews (A03, N02), catalogue or search of mentors (A04), course look (A02), subscriptions (A05), video cues (A06), sign-up or hidden price before the question (A07), pills and counters on rows (R01.6), emoji and notification noise (R02.4, R02.5), sidebar (R02.6).
- Generic AI look: gradients, glass/blur, glow, emoji as icons, sparkles, three identical icon cards, pills everywhere, card in a card, shadow as the only separation, everything centred, eyebrow over headings (A01).
- Implementation mistakes: values outside tokens, a variant for one screen, `div` instead of a button, placeholder as label, state only by colour, disabled without a reason, toast for an actionable error, tooltip with essential information, gendered copy, `dangerouslySetInnerHTML` for user text.

## Commands

| Command (repository root) | What it does |
|---|---|
| `npm run storybook` | Storybook (port 6006) |
| `npm run build-storybook` | Static Storybook |
| `npm run test:storybook` | All stories as tests (render, play, axe) in Chromium |
| `npm run test:storybook:themes` | The same in light and dark |
| `npm run check:tokens` | Values outside tokens → exit 1 |
| `npm run typecheck:ui` | TypeScript of `packages/ui` |
| `npm run lint` | ESLint incl. stories |
