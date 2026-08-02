# npm.tax: npm supply chain risk explorer

Interactive app for exploring how npm dependency count, time, and per-package compromise probability combine into cumulative supply-chain risk.

<img width="1317" height="1179" alt="Screenshot showing an example report from npm.tax for nuxt version 4.5.1. It has a 40.54% modeled chance of at least one package compromise in 2 years, given its 512 total packages and a 1.41e-6 daily breach probability per package. The expected time to breach is 3.8 years. A graph shows cumulative risk over time. A field visualization shows each package as a small square. A side panel shows control inputs to tune the model interactively." src="https://github.com/user-attachments/assets/f2d6b2e8-197c-429e-ba3c-f296744d919a" />

## Features

- URL-backed controls for direct dependencies, transitive dependencies, time horizon, and daily breach probability.
- Real npm package lookup via a server route that calls npmx install-size data and the npm registry, with Netlify Cache API/CDN caching.
- Inline SVG charts and visuals, including a unit chart that draws one mark per modeled package so the transitive tree is shown at true scale.
- A named severity assessment (low / medium / high) alongside every figure, so risk level never depends on colour alone.
- A "What can I do about it?" section that turns findings into actions, one column per input you control: fewer packages (`n`), fewer open doors (`p_impacted`), and acting sooner (`d`). It points at valuable, under-utilized tools like knip, e18e, zizmor, and Socket Firewall Free.
- Dynamic Open Graph images for shared scenarios, rendered with the same palette, type, and numbers as the page.
- Light/dark/system theme toggle and shareable links.
- Every slider's readout doubles as an exact-value input, so you can type a figure instead of dragging to it.
- Plain-language math notes for the independent Bernoulli model.

## Tech stack

- TypeScript 7
- TanStack Start + TanStack Router + Vite 8 + React 19
- Tailwind CSS v4, with semantic design tokens that flip between light and dark
- Self-hosted Archivo and IBM Plex Mono; no font packages, no webfont CDN
- Netlify Cache API for package lookup responses
- Netlify Vite plugin for deployment and full platform emulation in dev
- Sonda for bundle visualization
- Formatting with oxfmt + linting with oxlint
- `node:test` for the pure model modules; Playwright for behaviour and Axe accessibility checks, run against desktop and mobile
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
pnpm run test:e2e
pnpm run build
pnpm run build:analyze
pnpm run knip
```

`pnpm run test` runs unit tests, typecheck, format check, and lint.
`pnpm run test:e2e` runs the Playwright suite, behaviour and accessibility alike, under both a desktop and a mobile project.
`pnpm run build:analyze` writes Sonda HTML and JSON reports for the client JavaScript bundle to `.sonda/`.
CI runs the same analyze build and uploads the reports as the `sonda-bundle-analysis` artifact.

## The model

Each package has a daily compromise probability `p`. With `n` total modeled packages, including the project itself, over `d` days:

```text
P(breach) = 1 - (1 - p)^(n * d)
```

`p` splits into two parts, which is what makes the advice actionable:

```text
p = p_breach * p_impacted
```

`p_breach` is the chance a given package is compromised on a given day, and nothing you do changes it. `p_impacted` is the chance that compromise actually reaches you, and that one you can shrink: turn off install scripts, lock down CI, let releases age.

The model intentionally stays simple and assumes independent package-days. Real incidents can be correlated across packages, maintainers, and build systems, so this should be read as an exploratory estimate rather than a precise forecast.
