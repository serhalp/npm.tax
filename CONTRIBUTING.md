# Contributing

## Setup

Use Node.js 26+ and pnpm 11.

```bash
pnpm install
pnpm run dev
```

## Before opening a PR

Run:

```bash
pnpm run test
pnpm run test:a11y
pnpm run build
pnpm run knip
```

## Project notes

- Keep UI state reflected in the URL search params so views remain shareable.
- Use Tailwind utilities for styling.
- Keep charts and visual analogies as inline SVG; do not add a charting library unless the visualization changes substantially.
- For first paint, theme-sensitive visuals should come from CSS classes or variables keyed off the bootstrapped `html.dark` / `html[data-theme]` state. Avoid initial SVG plot fills, grid strokes, or other visible theme colors that depend on React state after hydration.
- Keep calculator math pure in `src/lib/riskModel.ts`; UI components should consume those helpers rather than duplicating formulas.
- Package dependency lookup belongs in `src/routes/api/package-deps.ts` and `src/server/packageDeps.ts`; scenario image generation belongs in `src/routes/api/og.ts`.
- Use runtime-appropriate relative import specifiers. Vite/TanStack-only app modules should use extensionless imports, such as `../lib/riskModel`.
- Keep explicit `.ts` extensions in TypeScript loaded directly by `node --test`: test files and the `src/lib` or `src/server` model modules they import.
