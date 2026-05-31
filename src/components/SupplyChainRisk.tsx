import { useState, useMemo, useCallback, useEffect, useRef, useId } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { PackageDepsResult } from '../server/packageDeps'
import type { RiskSearch } from '../routes/index'

// Defaults for any piece of state absent from the URL. Keeping these here lets
// a pristine URL stay clean while the UI still renders meaningful values.
const DEFAULTS = {
  direct: 20,
  transitive: 800,
  probExp: -5.85,
  days: 365,
}

/** Fetch a package's dependency footprint from the cached API route. */
async function fetchPackageDeps(
  name: string,
  version?: string,
): Promise<PackageDepsResult> {
  const qs = new URLSearchParams({ name })
  if (version) qs.set('version', version)
  const res = await fetch(`/api/package-deps?${qs.toString()}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    let message = `Lookup failed (${res.status}).`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      // Ignore — use the status-based message.
    }
    throw new Error(message)
  }
  return (await res.json()) as PackageDepsResult
}

const CHART_W = 700
const CHART_H = 350
const PAD = { top: 20, right: 30, bottom: 50, left: 60 }
const INNER_W = CHART_W - PAD.left - PAD.right
const INNER_H = CHART_H - PAD.top - PAD.bottom

function formatProb(p: number): string {
  if (p >= 0.9999) return '>99.99%'
  if (p >= 0.01) return (p * 100).toFixed(2) + '%'
  if (p >= 0.001) return (p * 100).toFixed(3) + '%'
  return (p * 100).toExponential(2) + '%'
}

function formatDays(d: number): string {
  if (d < 1) return `${(d * 24).toFixed(1)} hours`
  if (d < 60) return `${d.toFixed(1)} days`
  if (d < 730) return `${(d / 30.44).toFixed(1)} months`
  return `${(d / 365.25).toFixed(1)} years`
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function breachProb(totalDeps: number, dailyP: number, days: number): number {
  if (totalDeps === 0 || dailyP === 0 || days === 0) return 0
  const safePerDay = Math.pow(1 - dailyP, totalDeps)
  return 1 - Math.pow(safePerDay, days)
}

function expectedDaysToBreach(totalDeps: number, dailyP: number): number {
  if (totalDeps === 0 || dailyP === 0) return Infinity
  const dailyBreachProb = 1 - Math.pow(1 - dailyP, totalDeps)
  if (dailyBreachProb === 0) return Infinity
  return 1 / dailyBreachProb
}

interface ChartLine {
  label: string
  color: string
  data: { x: number; y: number }[]
  dashed?: boolean
}

function buildLine(
  totalDeps: number,
  dailyP: number,
  maxDays: number,
  steps: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const d = (maxDays * i) / steps
    points.push({ x: d, y: breachProb(totalDeps, dailyP, d) })
  }
  return points
}

function SVGChart({
  lines,
  maxDays,
  isDark,
  ariaLabel,
}: {
  lines: ChartLine[]
  maxDays: number
  isDark: boolean
  ariaLabel: string
}) {
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0]
  const xTicks = useMemo(() => {
    const count = 5
    const arr: number[] = []
    for (let i = 0; i <= count; i++) arr.push(Math.round((maxDays * i) / count))
    return arr
  }, [maxDays])

  const toX = (d: number) => PAD.left + (d / maxDays) * INNER_W
  const toY = (p: number) => PAD.top + (1 - p) * INNER_H

  // Plot surface and gridline colors are set via attributes (not Tailwind), so
  // they are resolved here from the active theme.
  const plotFill = isDark ? '#0f172a' : '#f8fafc'
  const gridStroke = isDark ? '#334155' : '#e2e8f0'

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full h-auto"
      role="img"
      aria-label={ariaLabel}
    >
      <rect
        x={PAD.left}
        y={PAD.top}
        width={INNER_W}
        height={INNER_H}
        fill={plotFill}
        stroke={gridStroke}
      />
      {yTicks.map((t) => (
        <g key={`y-${t}`}>
          <line
            x1={PAD.left}
            y1={toY(t)}
            x2={PAD.left + INNER_W}
            y2={toY(t)}
            stroke={gridStroke}
            strokeDasharray="4 4"
          />
          <text
            x={PAD.left - 8}
            y={toY(t) + 5}
            textAnchor="end"
            className="fill-slate-600 dark:fill-slate-350 font-mono"
            fontSize="13"
          >
            {(t * 100).toFixed(0)}%
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x-${t}`}>
          <line
            x1={toX(t)}
            y1={PAD.top}
            x2={toX(t)}
            y2={PAD.top + INNER_H}
            stroke={gridStroke}
            strokeDasharray="4 4"
          />
          <text
            x={toX(t)}
            y={PAD.top + INNER_H + 20}
            textAnchor="middle"
            className="fill-slate-600 dark:fill-slate-350 font-mono"
            fontSize="13"
          >
            {t}d
          </text>
        </g>
      ))}
      <text
        x={PAD.left + INNER_W / 2}
        y={CHART_H - 4}
        textAnchor="middle"
        className="fill-slate-700 dark:fill-slate-200"
        fontSize="14"
        fontWeight="600"
      >
        Days
      </text>
      <text
        x={14}
        y={PAD.top + INNER_H / 2}
        textAnchor="middle"
        className="fill-slate-700 dark:fill-slate-200"
        fontSize="14"
        fontWeight="600"
        transform={`rotate(-90, 14, ${PAD.top + INNER_H / 2})`}
      >
        Breach Probability
      </text>

      {lines.map((line) => {
        const pathD = line.data
          .map((pt, i) => {
            const cmd = i === 0 ? 'M' : 'L'
            return `${cmd}${toX(pt.x).toFixed(2)},${toY(pt.y).toFixed(2)}`
          })
          .join(' ')
        return (
          <path
            key={line.label}
            d={pathD}
            fill="none"
            stroke={line.color}
            strokeWidth={line.dashed ? 1.5 : 2.5}
            strokeDasharray={line.dashed ? '6 4' : undefined}
          />
        )
      })}
    </svg>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
        <span className="text-sm font-mono text-slate-900 dark:text-slate-100 font-semibold">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-500 rounded-sm"
      />
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className={`rounded-xl border-2 p-4 ${color}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70 mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-60">{sub}</div>}
    </div>
  )
}

type Theme = 'light' | 'dark' | 'system'

/** Resolve a theme to a concrete appearance and apply it to the document root. */
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', isDark)
}

/**
 * Color-mode state. Defaults to following the operating system and remembers any
 * explicit choice in local storage. The inline script in __root.tsx applies the
 * stored value before render to avoid a flash; this hook keeps React state — and
 * the resolved `isDark` used by the SVG charts — in sync afterwards.
 */
function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    let initial: Theme = 'system'
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'light' || stored === 'dark' || stored === 'system')
        initial = stored
    } catch {
      // Ignore storage access errors (e.g. privacy mode).
    }
    setThemeState(initial)
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
    setIsDark(document.documentElement.classList.contains('dark'))
    try {
      localStorage.setItem('theme', next)
    } catch {
      // Ignore — selection simply won't persist.
    }
  }, [])

  // While following the system, react to OS preference changes live.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      applyTheme('system')
      setIsDark(mq.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return { theme, setTheme, isDark }
}

function SunIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SystemIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/** Compact, icon-only light / dark / system selector for the top-right corner. */
function ThemeToggle({
  theme,
  setTheme,
}: {
  theme: Theme
  setTheme: (t: Theme) => void
}) {
  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <SunIcon /> },
    { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
    { value: 'system', label: 'System', icon: <SystemIcon /> },
  ]
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-300 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {options.map((opt) => {
        const active = theme === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            title={opt.label}
            aria-label={`${opt.label} theme`}
            aria-pressed={active}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
              active
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {opt.icon}
          </button>
        )
      })}
    </div>
  )
}

export default function SupplyChainRisk() {
  const lookupPkgNameId = useId()
  const lookupPkgVersionId = useId()
  const dailyProbInputId = useId()
  const exactProbInputId = useId()

  const { theme, setTheme, isDark } = useTheme()
  const search = useSearch({ from: '/' })
  const navigate = useNavigate({ from: '/' })

  // Effective values: URL params when present, defaults otherwise.
  const directDeps = search.direct ?? DEFAULTS.direct
  const transitiveDeps = search.transitive ?? DEFAULTS.transitive
  const dailyProbExp = search.probExp ?? DEFAULTS.probExp
  const timePeriodDays = search.days ?? DEFAULTS.days

  // Merge a patch into the URL search params. `replace` avoids flooding the
  // history stack while dragging sliders.
  const updateSearch = useCallback(
    (patch: Partial<RiskSearch>, replace = true) => {
      navigate({
        search: (prev: RiskSearch) => ({ ...prev, ...patch }),
        replace,
      })
    },
    [navigate],
  )

  // Editing the dependency counts dissociates the model from any looked-up
  // package, so clear pkg/version when those sliders move.
  const setDirectDeps = useCallback(
    (v: number) => updateSearch({ direct: v, pkg: undefined, v: undefined }),
    [updateSearch],
  )
  const setTransitiveDeps = useCallback(
    (v: number) =>
      updateSearch({ transitive: v, pkg: undefined, v: undefined }),
    [updateSearch],
  )
  const setDailyProbExp = useCallback(
    (v: number) => updateSearch({ probExp: v }),
    [updateSearch],
  )
  const setTimePeriodDays = useCallback(
    (v: number) => updateSearch({ days: v }),
    [updateSearch],
  )

  // Local form state for the lookup inputs, seeded from the URL.
  const [pkgName, setPkgName] = useState(search.pkg ?? '')
  const [pkgVersion, setPkgVersion] = useState(search.v ?? '')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupResult, setLookupResult] = useState<PackageDepsResult | null>(
    null,
  )
  // Bumped on every submit so re-looking up the same package is treated as a
  // fresh request: without this, resubmitting an already-resolved package
  // clears the counts but never re-runs the effect to re-adopt them.
  const [lookupSeq, setLookupSeq] = useState(0)

  // Commit the typed package to the URL and clear the counts so the lookup
  // effect adopts the freshly resolved values. Uses a push (not replace) so the
  // lookup is its own shareable history entry.
  const handleLookup = useCallback(() => {
    const name = pkgName.trim()
    if (!name || lookupLoading) return
    setLookupSeq((n) => n + 1)
    navigate({
      search: (prev: RiskSearch) => ({
        ...prev,
        pkg: name,
        v: pkgVersion.trim() || undefined,
        direct: undefined,
        transitive: undefined,
      }),
    })
  }, [pkgName, pkgVersion, lookupLoading, navigate])

  // Resolve the package named in the URL. Runs only as a client effect, so it
  // never blocks initial render even when the URL arrives with a package. When
  // the counts are absent (a fresh lookup or a bare ?pkg= link) the resolved
  // values are adopted into the URL; when they are already present (a fully
  // shared link) the existing numbers are preserved.
  const countsAbsent = search.direct === undefined && search.transitive === undefined
  const lastFetched = useRef<string | null>(null)
  useEffect(() => {
    const name = search.pkg
    if (!name) {
      setLookupResult(null)
      setLookupError(null)
      lastFetched.current = null
      return
    }
    const key = `${name}@${search.v ?? ''}#${lookupSeq}`
    if (lastFetched.current === key) return
    lastFetched.current = key

    let cancelled = false
    setLookupLoading(true)
    setLookupError(null)
    fetchPackageDeps(name, search.v)
      .then((result) => {
        if (cancelled) return
        setLookupResult(result)
        if (countsAbsent) {
          updateSearch({
            direct: result.directDeps,
            transitive: result.transitiveDeps,
          })
        }
      })
      .catch((e) => {
        if (cancelled) return
        setLookupResult(null)
        lastFetched.current = null
        setLookupError(e instanceof Error ? e.message : 'Lookup failed.')
      })
      .finally(() => {
        if (!cancelled) setLookupLoading(false)
      })
    return () => {
      cancelled = true
    }
    // countsAbsent is intentionally read but excluded: re-running when it flips
    // after adopting counts would cause a redundant fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.pkg, search.v, lookupSeq, updateSearch])

  const dailyP = Math.pow(10, dailyProbExp)
  const totalDeps = directDeps + transitiveDeps

  // Keep the lookup inputs in step with the URL (e.g. on back/forward or when a
  // shared link is opened).
  useEffect(() => {
    setPkgName(search.pkg ?? '')
    setPkgVersion(search.v ?? '')
  }, [search.pkg, search.v])

  const handleProbInput = useCallback(
    (raw: string) => {
      const v = parseFloat(raw)
      if (!isNaN(v) && v > 0 && v < 1) {
        setDailyProbExp(Math.log10(v))
      }
    },
    [setDailyProbExp],
  )

  // Share the current view. Every control is reflected in the URL, so the
  // address bar alone reproduces the exact state.
  const [copied, setCopied] = useState(false)
  const handleCopyLink = useCallback(() => {
    if (typeof window === 'undefined') return
    const url = window.location.href
    const done = () => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(done)
    } else {
      done()
    }
  }, [])

  const prob = breachProb(totalDeps, dailyP, timePeriodDays)
  const probDirectOnly = breachProb(directDeps, dailyP, timePeriodDays)
  const ettb = expectedDaysToBreach(totalDeps, dailyP)

  const hiddenRisk = prob - probDirectOnly

  const lines: ChartLine[] = useMemo(() => {
    const steps = 100
    return [
      {
        label: `All ${totalDeps} deps`,
        color: '#dc2626',
        data: buildLine(totalDeps, dailyP, timePeriodDays, steps),
      },
      {
        label: `Direct only (${directDeps})`,
        color: '#2563eb',
        data: buildLine(directDeps, dailyP, timePeriodDays, steps),
        dashed: true,
      },
      {
        label: `Half transitive (${directDeps + Math.round(transitiveDeps / 2)})`,
        color: '#16a34a',
        data: buildLine(
          directDeps + Math.round(transitiveDeps / 2),
          dailyP,
          timePeriodDays,
          steps,
        ),
        dashed: true,
      },
    ]
  }, [totalDeps, directDeps, transitiveDeps, dailyP, timePeriodDays])

  const compLines: ChartLine[] = useMemo(() => {
    const steps = 100
    const depCounts = [50, 200, 500, 1000, 2000]
    const colors = ['#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed']
    return depCounts.map((n, i) => ({
      label: `${n} deps`,
      color: colors[i],
      data: buildLine(n, dailyP, timePeriodDays, steps),
      dashed: n < totalDeps,
    }))
  }, [dailyP, timePeriodDays, totalDeps])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-end items-center gap-2 mb-4 sm:mb-6">
        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none shadow-sm h-9"
        >
          {copied ? (
            <>
              <CheckIcon />
              <span>Link copied</span>
            </>
          ) : (
            <>
              <LinkIcon />
              <span>Copy shareable link</span>
            </>
          )}
        </button>
        <ThemeToggle theme={theme} setTheme={setTheme} />
      </div>
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          npm Supply Chain Risk Explorer
        </h1>
        <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
          Every dependency in your tree is a link in your supply chain that can
          be compromised. Adjust the sliders to see how dependency count, breach
          probability, and time horizon affect your cumulative risk.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Breach probability"
          value={formatProb(prob)}
          sub={`over ${formatDays(timePeriodDays)}`}
          color="border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        />
        <StatCard
          label="Expected time to breach"
          value={formatDays(ettb)}
          sub={`with ${totalDeps.toLocaleString()} total packages`}
          color="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
        />
        <StatCard
          label="Hidden transitive risk"
          value={formatProb(hiddenRisk)}
          sub={`risk from ${transitiveDeps.toLocaleString()} transitive deps`}
          color="border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 mb-8">
        <div className="space-y-5">
          <div className="space-y-3 p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Look up a real package
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Pull the actual dependency count for an npm package and load it
              into the model below.
            </p>
            <div className="flex flex-col gap-2">
              <label htmlFor={lookupPkgNameId} className="sr-only">
                Package name
              </label>
              <input
                id={lookupPkgNameId}
                type="text"
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLookup()
                }}
                placeholder="Package name (e.g. express)"
                className="w-full text-base md:text-sm font-mono border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <label htmlFor={lookupPkgVersionId} className="sr-only">
                Version (optional)
              </label>
              <input
                id={lookupPkgVersionId}
                type="text"
                value={pkgVersion}
                onChange={(e) => setPkgVersion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLookup()
                }}
                placeholder="Version (optional, e.g. 4.18.2)"
                className="w-full text-base md:text-sm font-mono border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleLookup}
                disabled={lookupLoading || !pkgName.trim()}
                className="w-full text-sm font-medium rounded bg-blue-600 text-white px-3 py-2.5 md:py-1.5 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              >
                {lookupLoading ? 'Looking up…' : 'Fetch dependency count'}
              </button>
            </div>
            <div aria-live="polite" role="status" className="mt-2 min-h-[1.5rem]">
              {lookupError && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">Error: {lookupError}</p>
              )}
              {!lookupError && lookupLoading && search.pkg && !lookupResult && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Loading {search.pkg}
                  {search.v ? `@${search.v}` : ''}…
                </p>
              )}
              {lookupResult && (
                <div className="text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-700 pt-2 space-y-0.5">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {lookupResult.package}@{lookupResult.version}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {lookupResult.totalDeps.toLocaleString()}
                    </span>{' '}
                    total dependencies ({lookupResult.directDeps} direct +{' '}
                    {lookupResult.transitiveDeps.toLocaleString()} transitive)
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Install size {formatBytes(lookupResult.totalSizeBytes)} · via{' '}
                    <a
                      href={`https://npmx.dev/package/${lookupResult.package}/v/${lookupResult.version}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-slate-700 dark:hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded-sm"
                    >
                      npmx.dev
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5 p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Parameters
            </h2>
          <Slider
            label="Direct dependencies"
            value={directDeps}
            min={1}
            max={200}
            step={1}
            onChange={(v) => setDirectDeps(v)}
          />
          <Slider
            label="Transitive dependencies"
            value={transitiveDeps}
            min={0}
            max={5000}
            step={10}
            onChange={(v) => setTransitiveDeps(v)}
          />
          <Slider
            label="Time period"
            value={timePeriodDays}
            min={1}
            max={1095}
            step={1}
            onChange={(v) => setTimePeriodDays(v)}
            format={(v) =>
              v < 60
                ? `${v}d`
                : v < 730
                  ? `${(v / 30.44).toFixed(1)}mo`
                  : `${(v / 365.25).toFixed(1)}yr`
            }
          />

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-baseline">
              <label htmlFor={dailyProbInputId} className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Daily breach prob / package
              </label>
              <span className="text-sm font-mono text-slate-900 dark:text-slate-100 font-semibold">
                {dailyP.toExponential(2)}
              </span>
            </div>
            <input
              id={dailyProbInputId}
              type="range"
              min={-8}
              max={-3}
              step={0.05}
              value={dailyProbExp}
              onChange={(e) => setDailyProbExp(Number(e.target.value))}
              className="w-full accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-500 rounded-sm"
            />
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>1e-8 (~0.00037%/yr)</span>
              <span>1e-3 (~30.6%/yr)</span>
            </div>
            <div className="mt-1">
              <label htmlFor={exactProbInputId} className="text-xs text-slate-600 dark:text-slate-400">
                Or enter exact value:
              </label>
              <input
                id={exactProbInputId}
                type="text"
                placeholder="e.g. 0.000014"
                className="mt-1 w-full text-base md:text-xs font-mono border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onBlur={(e) => handleProbInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    handleProbInput((e.target as HTMLInputElement).value)
                }}
              />
            </div>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3">
            <p className="font-medium mb-1 text-slate-700 dark:text-slate-300">About the default</p>
            <p>
              The default ~1.4e-6/day corresponds to roughly 0.05% annual
              probability per package — a conservative estimate based on
              published supply-chain incident rates across npm.
            </p>
          </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">
              Cumulative breach probability over time
            </h3>
            <SVGChart
              lines={lines}
              maxDays={timePeriodDays}
              isDark={isDark}
              ariaLabel="Line chart showing cumulative breach probability over time for all packages, direct packages, and half transitive packages"
            />
            <div className="flex flex-wrap gap-4 mt-3 text-xs">
              {lines.map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div
                    className="w-4 h-0.5 rounded"
                    style={{
                      backgroundColor: l.color,
                      borderStyle: l.dashed ? 'dashed' : 'solid',
                    }}
                  />
                  <span className="text-slate-600 dark:text-slate-400">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">
              Risk by dependency count (comparison)
            </h3>
            <SVGChart
              lines={compLines}
              maxDays={timePeriodDays}
              isDark={isDark}
              ariaLabel="Line comparison chart showing breach probability curves over time for various total dependency counts: 50, 200, 500, 1000, and 2000 packages"
            />
            <div className="flex flex-wrap gap-4 mt-3 text-xs">
              {compLines.map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div
                    className="w-4 h-0.5 rounded"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="text-slate-600 dark:text-slate-400">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-8">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3">
          How the math works
        </h2>
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
          <p>
            Each package has a small daily probability <em>p</em> of being
            breached. With <em>n</em> total packages in your dependency tree,
            the probability that <strong>none</strong> are breached on a given
            day is <code>(1 − p)^n</code>.
          </p>
          <p>
            Over <em>d</em> days, the probability of remaining breach-free is{' '}
            <code>
              (1 − p)^(n × d)
            </code>
            . The cumulative breach probability is therefore:
          </p>
          <p className="font-mono text-center text-slate-800 dark:text-slate-200">
            P(breach) = 1 − (1 − p)<sup>n × d</sup>
          </p>
          <p>
            This model treats each package-day as an independent Bernoulli
            trial. In reality, breaches are correlated (e.g., a single
            maintainer compromise can affect many packages), so this model is a
            lower bound on actual risk.
          </p>
        </div>
      </div>

      <footer className="text-center text-xs text-slate-500 dark:text-slate-400 pb-8">
        Model assumes independent breach events per package-day. Real-world risk
        may be higher due to correlated attacks and shared maintainers.
      </footer>
    </div>
  )
}
