# npm.tax: npm supply chain risk explorer

Interactive app for exploring how npm dependency count, time, and per-package compromise probability combine into cumulative supply-chain risk.

## Features

- URL-backed controls for direct dependencies, transitive dependencies, time horizon, and daily breach probability.
- Real npm package lookup via a server route that calls npmx install-size data and the npm registry, with Netlify Cache API/CDN caching.
- Inline SVG charts and visuals.
- Dynamic Open Graph images for shared scenarios.
- Light/dark/system theme toggle and shareable links.
- Plain-language math notes for the independent Bernoulli model.

## Tech stack

- TanStack Start + TanStack Router + Vite 8
- React 19 + TypeScript strict mode
- Tailwind CSS v4
- Netlify Cache API for package lookup responses
- Netlify Vite plugin for deployment and full platform emulation in dev
- Sonda for bundle visualization
- Formatting with oxfmt + linting with oxlint
- Testing with `node:test` + a11y testing with Axe Core
- Node.js 26
- pnpm 11
- knip to keep things tidy

## Local development

```bash
pnpm install
pnpm run dev
```

The dev server starts at `http://localhost:3000`.

## Checks

```bash
pnpm run test
pnpm run test:a11y
pnpm run build
pnpm run build:analyze
pnpm run knip
```

`pnpm run test` runs unit tests, typecheck, format check, and lint.
`pnpm run build:analyze` writes Sonda HTML and JSON reports for the client JavaScript bundle to `.sonda/`.
CI runs the same analyze build and uploads the reports as the `sonda-bundle-analysis` artifact.

## The model

Each package has a daily compromise probability `p`. With `n` total modeled packages, including the project itself, over `d` days:

```text
P(breach) = 1 - (1 - p)^(n * d)
```

The model intentionally stays simple and assumes independent package-days. Real incidents can be correlated across packages, maintainers, and build systems, so this should be read as an exploratory estimate rather than a precise forecast.
