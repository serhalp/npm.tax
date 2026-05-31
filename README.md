# npm Supply Chain Risk Explorer

An interactive visualization tool that shows how software supply chain risk grows with the number of npm dependencies over time. Inspired by mortgage calculators and similar financial tools, it lets you adjust parameters and immediately see the impact on your cumulative breach probability.

## Features

- **Interactive sliders** for direct dependencies, transitive dependencies, time horizon, and per-package daily breach probability
- **Two SVG charts**: one comparing your full tree vs. direct-only vs. half-transitive, another comparing fixed dependency counts (50–2000)
- **Key stats** showing cumulative breach probability, expected time to first breach, and hidden transitive risk
- **Math explanation** section describing the independent Bernoulli trial model
- Zero additional charting dependencies — charts are rendered with inline SVG

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React meta-framework)
- [Tailwind CSS v4](https://tailwindcss.com/) for styling
- [Vite](https://vitejs.dev/) for bundling
- Deployed on [Netlify](https://www.netlify.com/)

## Local development

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:3000`.

## The math

Each package has a small daily probability *p* of being breached. With *n* total packages, the cumulative probability of at least one breach over *d* days is:

```
P(breach) = 1 − (1 − p)^(n × d)
```

The default probability (~1.4×10⁻⁶/day, ~0.05%/year per package) is a conservative estimate grounded in published npm supply chain incident data.
