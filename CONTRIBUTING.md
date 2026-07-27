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
- For first paint, theme-sensitive visuals should come from CSS classes or variables keyed off the bootstrapped `html.dark` / `html[data-theme]` state. Avoid initial SVG plot fills, grid strokes, or other visible theme colours that depend on React state after hydration.
- Keep calculator math pure in `src/lib/riskModel.ts`; UI components should consume those helpers rather than duplicating formulas.
- Package dependency lookup belongs in `src/routes/api/package-deps.ts` and `src/server/packageDeps.ts`; scenario image generation belongs in `src/routes/api/og.ts`.
- Use runtime-appropriate relative import specifiers. Vite/TanStack-only app modules should use extensionless imports, such as `../lib/riskModel`.
- Keep explicit `.ts` extensions in TypeScript loaded directly by `node --test`: test files and the `src/lib` or `src/server` model modules they import.
- Two colour families, kept apart: the severity ramp (`moss` / `ochre` / `levy`) says how bad a scenario is, and the categorical `series-*` tokens identify chart lines and package-field bands. Categorical colours are never red or green, so a category is never read as a verdict.
- Never let colour be the only cue. Chart series pair a colour with a distinct dash pattern and weight, the package field uses a three-step luminance ramp, and severity is always spelled out in text next to its colour.
- The OG card renders through satori, not a browser: flexbox only, literal hex rather than CSS variables, registered font families only, and no arrays returned from components. Check your change by fetching `/api/og` and looking at the PNG, then bump `OG_IMAGE_VERSION` in `src/lib/riskSearch.ts` so caches pick it up.
- Typography is vendored rather than installed. Do not add font packages; the woff2 files live in `public/fonts/` and the OG card's TTF subsets in `src/server/fonts/`, with the OFL texts beside them.
