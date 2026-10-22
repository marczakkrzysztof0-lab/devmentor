<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## DevMentor

Next.js 16 app (`app/`, `lib/`, `proxy.ts`) + design system `@devmentor/ui` (`packages/ui`) + PostgreSQL 17 (`db/migrations`). Windows + PowerShell: prefer `npm run …` and `docker compose …` over bash-only syntax.

## Commands

| Need | Command |
|---|---|
| Database (Docker) | `npm run setup` (creates `docker-compose.yml`, runs migrations) |
| Tests | `npm test` (needs Postgres; `tests/db/*` fail on CI without it) |
| Before handing over | `npm run lint` and `npm run build` |
| End-to-end | `npm run build`, then `npm run test:e2e` |
| Agent files | `npm run check:agents` |

## Hard rules

- Never read or print `.env`, `.env.local` or credentials; `.env.example` and `.env.template` are safe.
- UI copy: Polish, gender-neutral.

## Task routing

Read only the rows that match the task. Nested `AGENTS.md` files apply when you work in their directory.

| Task | Read |
|---|---|
| Bug fix | `track.md` (what is built), the spec named there, the failing test in `tests/` |
| New feature | `SDLC.md`, `.ai/specs/backlog.md`, the feature spec in `.ai/specs/` |
| Refactor | `BACKWARD_COMPATIBILITY.md`, tests of the touched module |
| Review | `CODE_REVIEW.md`, `lekcja-09/security-notes.md` |
| UI in `app/` or `packages/ui` | `docs/design-system.md`, then `packages/ui/AGENTS.md` |
| Database, migration, SQL | `db/AGENTS.md` |
| Product question (who, why, price) | `.ai/specs/product-brief.md`, `.ai/specs/research/decisions/` |
| Agent config, hooks, secrets | `lekcja-09/security-notes.md`, `.claude/settings.json` |

Reference examples: server action + form → `app/mentor/availability/`; DB query module + test → `lib/availability/queries.mjs` and `tests/db/availability-queries.test.mjs`.
