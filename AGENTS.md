<!-- intent-skills:start -->

## Skill Loading

Before substantial work:

- Skill check: run `pnpm dlx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# AGENTS.md

## Project overview

Interactive npm supply-chain risk visualization built with TanStack Start and deployed on Netlify.

## Architecture

- **Framework**: TanStack Start/React with file-system routes under `src/routes/`.
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite`.
- **Build/deploy**: Vite with `@netlify/vite-plugin-tanstack-start`.
- **Charts**: Custom inline SVG; do not add a charting library for the current charts or visual analogies.
- **Bundle analysis**: Sonda via the Vite plugin, enabled only for `pnpm run build:analyze`; it emits client JavaScript reports under `.sonda/`.
- **Server route**: `src/routes/api/package-deps.ts` exposes a package lookup endpoint backed by `src/server/packageDeps.ts`, npmx, npm registry metadata, Netlify Cache API, and Netlify CDN caching.
- **OG image route**: `src/routes/api/og.ts` generates dynamic Open Graph images from URL-backed scenarios.

## Key directories

```text
src/
  components/
    SupplyChainRisk.tsx   # Main UI, calculator state, SVG charts
  routes/
    __root.tsx             # HTML shell, metadata, pre-render theme script
    index.tsx              # Home route and URL search validation
    api/og.ts              # Dynamic Open Graph image route
    api/package-deps.ts    # Server route for package dependency lookup
  server/
    packageDeps.ts         # Upstream package lookup + Cache API
  lib/
    riskModel.ts           # Pure risk math, defaults, formatting, share copy
  styles.css               # Tailwind import + base styles
```

## Coding conventions

- TypeScript strict mode.
- Tailwind utility classes for styling; no CSS modules or styled-components.
- SVG charts and visual analogies drawn inline in React.
- Keep calculator math pure in `src/lib/riskModel.ts`.
- Keep all interactive calculator state shareable through URL search params.
- First-paint theme-sensitive visuals must be CSS-driven from the bootstrapped
  `html.dark` / `html[data-theme]` state. Do not derive initial SVG plot fills,
  grid strokes, or other visible theme colors from React state after hydration.
- Use runtime-appropriate relative import specifiers. Vite/TanStack-only app modules should use extensionless imports, such as `../lib/riskModel`.
- Keep explicit `.ts` extensions in TypeScript loaded directly by `node --test`: test files and the `src/lib` or `src/server` model modules they import.
- Do not hand-edit generated `src/routeTree.gen.ts`; it may use generated import specifiers that differ from hand-written source style.

## Checks

- `pnpm run test`
- `pnpm run test:a11y`
- `pnpm run build`
- `pnpm run build:analyze`
- `pnpm run knip`
