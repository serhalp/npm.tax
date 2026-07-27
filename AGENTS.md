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
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite`. Semantic colour tokens (`paper`, `ink`, `muted`, `rule`, `levy`, `ochre`, `moss`) are declared as CSS custom properties in `src/styles.css` and exposed to Tailwind through `@theme inline`, so they flip with the theme and are readable from SVG presentation attributes.
- **Fonts**: self-hosted in `public/fonts/`, no font packages. Archivo (variable `wght`/`wdth`) carries the type hierarchy by width; IBM Plex Mono sets every figure.
- **Colour families**: two, and they must not mix. The severity ramp (`moss` / `ochre` / `levy`) says how bad a scenario is and is driven by `breachProbabilityTone` and `expectedBreachTimeTone`. The categorical series (`series-a` / `series-b` / `series-c`, plus `series-a-wash` for the area fill under the primary curve) identify chart lines and package-field bands, carry no good/bad meaning, and are therefore never red or green.
- **Package field**: `getPackageFieldGeometry` lays every modeled package out as one mark in three bands — self, direct deps, transitive deps — returning one SVG path per band. Past `FIELD_MAX_MARKS` a mark stands for several packages; even then every non-empty band claims at least one mark and the bands always sum to `totalMarks`. The `aspect` argument only changes how many columns the marks are dealt into, so the page (a block) and the OG card (a wide strip) share one geometry.
- **Build/deploy**: Vite with `@netlify/vite-plugin-tanstack-start`.
- **Charts**: Custom inline SVG; do not add a charting library for the current charts or visual analogies.
- **Bundle analysis**: Sonda via the Vite plugin, enabled only for `pnpm run build:analyze`; it emits client JavaScript reports under `.sonda/`.
- **Server route**: `src/routes/api/package-deps.ts` exposes a package lookup endpoint backed by `src/server/packageDeps.ts`, npmx, npm registry metadata, Netlify Cache API, and Netlify CDN caching.
- **Page layout**: organised by role, not by width. One grid splits the page into a report column (verdict, ledger, package field, curve) and a control rail (lookup, sliders, notes on the default). The report therefore stays one contiguous rectangle you could screenshot, and the sliders sit beside the chart they change. The rail is sticky and scrolls internally when it outgrows the viewport. Methodology sits full-width below both.
- **OG image route**: `src/routes/api/og.ts` generates dynamic Open Graph images from URL-backed scenarios. `src/lib/ogImage.ts` holds the pure model (absolute layout geometry, text wrapping, curve path); `src/lib/ogImageView.tsx` is the view. It renders through satori, which implements only a subset of CSS — see the conventions below before editing it.

## Key directories

```text
src/
  components/
    SupplyChainRisk.tsx    # Main UI, calculator state, SVG charts
    icons.tsx              # Inline SVG icons
  routes/
    __root.tsx             # HTML shell, metadata, icons, pre-render theme script
    index.tsx              # Home route and URL search validation
    api/og.ts              # Dynamic Open Graph image route
    api/package-deps.ts    # Server route for package dependency lookup
  server/
    packageDeps.ts         # Upstream package lookup + Cache API
    ogFonts.ts             # TTF subsets inlined into the server bundle for satori
    fonts/                 # OG-only TTFs; satori cannot read the app's woff2
  lib/
    riskModel.ts           # Pure risk math, defaults, formatting, share copy
    riskVisuals.ts         # Pure severity tones + three-band package-field geometry
    ogImage.ts             # Pure OG card model: geometry, text wrapping, curve path
    ogImageView.tsx        # OG card view (satori)
    riskSearch.ts          # Search-param parsing + OG_IMAGE_VERSION
    httpCache.ts           # Cache-Control helpers for the API routes
    themeModel.ts          # Theme resolution + first-paint bootstrap CSS
  styles.css               # Tailwind import, design tokens, @font-face, base styles
public/
  fonts/                   # Self-hosted woff2 + their OFL license texts
  favicon.svg              # Theme-adaptive icon; favicon.ico holds 16/32/48 rasters
```

## Coding conventions

- TypeScript strict mode.
- Tailwind utility classes for styling; no CSS modules or styled-components.
- SVG charts and visual analogies drawn inline in React.
- Keep calculator math pure in `src/lib/riskModel.ts`.
- Keep all interactive calculator state shareable through URL search params.
- Severity colour (`moss` / `ochre` / `levy`) means good-to-bad and nothing else. Categorical
  encoding — chart series, package-field bands — uses the `series-*` tokens and must never be red
  or green, so a category is never mistaken for a verdict.
- Categorical distinctions must survive without colour. Chart series pair a `series-*` stroke with a
  distinct dash pattern and weight; the package field relies on a three-step luminance ramp
  (`ink` / `series-b` / `ink-faint`). Three hues that all clear AA on the light ground sit close in
  greyscale, so colour alone is never sufficient.
- Severity is always named in text beside its colour (the assessment chip reads `ASSESSED LOW` /
  `MEDIUM` / `HIGH`), per PRODUCT.md's rule against colour-only encoding.
- First-paint theme-sensitive visuals must be CSS-driven from the bootstrapped
  `html.dark` / `html[data-theme]` state. Do not derive initial SVG plot fills,
  grid strokes, or other visible theme colours from React state after hydration.
- Use runtime-appropriate relative import specifiers. Vite/TanStack-only app modules should use extensionless imports, such as `../lib/riskModel`.
- Keep explicit `.ts` extensions in TypeScript loaded directly by `node --test`: test files and the `src/lib` or `src/server` model modules they import.
- Do not hand-edit generated `src/routeTree.gen.ts`; it may use generated import specifiers that differ from hand-written source style. It also shows as modified while `pnpm run dev` runs, because the dev generator orders the API routes differently from `vite build`; that churn is noise, so revert it rather than committing it.
- The OG card renders through satori, not a browser. Flexbox only (no grid, no float), explicit `display: "flex"` on containers, literal hex instead of CSS custom properties, and registered font families only. A component that returns an array crashes the render with no error, and `undefined` in a style object does the same. `<svg>` has no `preserveAspectRatio`, so scale uniformly. Verify changes by fetching `/api/og` and looking at the PNG.
- Bump `OG_IMAGE_VERSION` in `src/lib/riskSearch.ts` whenever the OG card's appearance changes. It is the `ogv` cache-buster, and without it social platforms and the CDN keep serving the previous image.
- Fonts are vendored, not installed. Add nothing from npm for typography: the app's woff2 live in `public/fonts/`, the OG card's TTF subsets in `src/server/fonts/`, and both families' OFL texts ship alongside.

## Checks

- `pnpm run test`
- `pnpm run test:a11y`
- `pnpm run build`
- `pnpm run build:analyze`
- `pnpm run knip`
