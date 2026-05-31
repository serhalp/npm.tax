import { createFileRoute } from '@tanstack/react-router'
import SupplyChainRisk from '../components/SupplyChainRisk'

// Every piece of UI state lives in the URL so the current view is always
// shareable. All fields are optional; the component supplies defaults for any
// that are absent, which keeps a pristine URL clean.
export interface RiskSearch {
  direct?: number // direct dependency count
  transitive?: number // transitive dependency count
  probExp?: number // daily breach probability per package, as a log10 exponent
  days?: number // time horizon in days
  pkg?: string // last looked-up package name
  v?: string // looked-up package version
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): RiskSearch => ({
    direct: asNumber(search.direct),
    transitive: asNumber(search.transitive),
    probExp: asNumber(search.probExp),
    days: asNumber(search.days),
    pkg: asString(search.pkg),
    v: asString(search.v),
  }),
  component: Home,
})

function Home() {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8 px-4">
      <SupplyChainRisk />
    </div>
  )
}
