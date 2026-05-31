# AGENTS.md

## Project overview

Single-page interactive supply chain risk visualization tool built with TanStack Start on Netlify.

## Architecture

- **Framework**: TanStack Start (React-based, file-system routing via `src/routes/`)
- **Styling**: Tailwind CSS v4 (imported via `@tailwindcss/vite` plugin)
- **Build**: Vite with Netlify adapter (`@netlify/vite-plugin-tanstack-start`)
- **Charting**: Custom SVG — no external chart library

## Key directories

```
src/
  components/
    SupplyChainRisk.tsx   # Main visualization component (all logic + charts)
  routes/
    __root.tsx             # HTML shell, head metadata
    index.tsx              # Home page, renders SupplyChainRisk
  styles.css               # Global Tailwind import + base styles
```

## Coding conventions

- TypeScript strict mode
- Tailwind utility classes for all styling (no CSS modules, no styled-components)
- SVG charts drawn inline using React — no chart library dependency
- All math functions are pure and colocated in the component file
- No server-side logic or API routes — this is a pure client-side calculator

## Key decisions

- **No chart library**: Charts are simple line graphs; SVG paths are trivial to compute. Avoiding a chart dependency is thematically appropriate for a tool about supply chain risk from dependencies.
- **Logarithmic probability slider**: Breach probabilities span many orders of magnitude, so the slider operates on log10 scale with an optional exact-value text input.
- **Conservative defaults**: Default daily breach probability ~1.4e-6 per package (~0.05%/year) is deliberately conservative; the UI explains this and lets users adjust freely.
