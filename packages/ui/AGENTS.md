# packages/ui — @devmentor/ui

Plain React + Tailwind 4 with Storybook; the Next.js block of the root `AGENTS.md` does not apply here.

- Rules, components and tokens: `../../docs/design-system.md`. Style decisions and dates: `POSTEP.md`.
- Every component or product screen has a story; stories run as tests with axe (`a11y.test: 'error'`).
- Before handing over: `npm run check:tokens`, `npm run typecheck:ui`, `npm run test:storybook` (from the repository root).
- Reference component: `src/components/state-message/`.
