import { useState, useMemo, useCallback, useEffect, useRef, useId } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import type { PackageDepsResult } from "../server/packageDeps";
import { BlueskyIcon, CheckIcon, LinkIcon, MoonIcon, SunIcon, SystemIcon } from "./icons";
import {
  buildLine,
  formatBytes,
  formatDays,
  formatModeledPackageCount,
  formatPackageCount,
  formatProb,
  formatTimeSliderValue,
  getRiskScenario,
  MODELED_ROOT_PACKAGE_COUNT,
  type RiskSearch,
} from "../lib/riskModel";
import {
  coerceTheme,
  getThemeDocumentState,
  THEME_STORAGE_KEY,
  type Theme,
} from "../lib/themeModel";
import {
  breachProbabilityTone,
  expectedBreachTimeTone,
  expandedSliderMax,
  getDependencyIcebergGeometry,
  toSvgPoints,
  type RiskTone,
} from "../lib/riskVisuals";

/** Fetch a package's dependency footprint from the cached API route. */
async function fetchPackageDeps(name: string, version?: string): Promise<PackageDepsResult> {
  const qs = new URLSearchParams({ name });
  if (version) qs.set("version", version);
  const res = await fetch(`/api/package-deps?${qs.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    let message = `Lookup failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Ignore and use the status-based message.
    }
    throw new Error(message);
  }
  return (await res.json()) as PackageDepsResult;
}

const CHART_W = 700;
const CHART_H = 350;
const PAD = { top: 20, right: 30, bottom: 50, left: 60 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

const RISK_TONES = {
  good: {
    panel: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/25",
    heading: "text-emerald-950 dark:text-emerald-50",
    body: "text-emerald-900/85 dark:text-emerald-100/80",
    rule: "border-emerald-200/80 dark:border-emerald-900/60",
  },
  warning: {
    panel: "border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/25",
    heading: "text-amber-950 dark:text-amber-50",
    body: "text-amber-900/85 dark:text-amber-100/80",
    rule: "border-amber-200/80 dark:border-amber-900/60",
  },
  danger: {
    panel: "border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/25",
    heading: "text-red-950 dark:text-red-50",
    body: "text-red-900/85 dark:text-red-100/80",
    rule: "border-red-200/80 dark:border-red-900/60",
  },
} as const satisfies Record<RiskTone, Record<string, string>>;

interface ChartLine {
  label: string;
  color: string;
  data: { x: number; y: number }[];
  dashed?: boolean;
}

function SVGChart({
  lines,
  maxDays,
  ariaLabel,
}: {
  lines: ChartLine[];
  maxDays: number;
  ariaLabel: string;
}) {
  const titleId = useId();
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
  const xTicks = useMemo(() => {
    const count = 5;
    const arr: number[] = [];
    for (let i = 0; i <= count; i++) arr.push(Math.round((maxDays * i) / count));
    return arr;
  }, [maxDays]);

  const toX = (d: number) => PAD.left + (d / maxDays) * INNER_W;
  const toY = (p: number) => PAD.top + (1 - p) * INNER_H;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full h-auto"
      aria-labelledby={titleId}
      focusable="false"
    >
      <title id={titleId}>{ariaLabel}</title>
      <rect
        x={PAD.left}
        y={PAD.top}
        width={INNER_W}
        height={INNER_H}
        className="fill-slate-50 stroke-slate-200 dark:fill-slate-900 dark:stroke-slate-700"
      />
      {yTicks.map((t) => (
        <g key={`y-${t}`}>
          <line
            x1={PAD.left}
            y1={toY(t)}
            x2={PAD.left + INNER_W}
            y2={toY(t)}
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeDasharray="4 4"
          />
          <text
            x={PAD.left - 8}
            y={toY(t) + 5}
            textAnchor="end"
            className="fill-slate-600 dark:fill-slate-300 font-mono"
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
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeDasharray="4 4"
          />
          <text
            x={toX(t)}
            y={PAD.top + INNER_H + 20}
            textAnchor="middle"
            className="fill-slate-600 dark:fill-slate-300 font-mono"
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
            const cmd = i === 0 ? "M" : "L";
            return `${cmd}${toX(pt.x).toFixed(2)},${toY(pt.y).toFixed(2)}`;
          })
          .join(" ");
        return (
          <path
            key={line.label}
            d={pathD}
            fill="none"
            stroke={line.color}
            strokeWidth={line.dashed ? 1.5 : 2.5}
            strokeDasharray={line.dashed ? "6 4" : undefined}
          />
        );
      })}
    </svg>
  );
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
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(event.target.value));
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-2">
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
        aria-label={label}
        aria-valuetext={format ? format(value) : String(value)}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="h-11 w-full cursor-pointer accent-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:accent-slate-100 dark:focus-visible:outline-slate-100 rounded-sm sm:h-7"
      />
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

/** Resolve a theme to a concrete appearance and apply it to the document root. */
function applyTheme(theme: Theme): boolean {
  if (typeof document === "undefined") return false;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const state = getThemeDocumentState(theme, prefersDark);
  const root = document.documentElement;

  root.classList.toggle("dark", state.className === "dark");
  root.dataset.theme = state.dataTheme;
  root.style.colorScheme = state.colorScheme;
  root.style.backgroundColor = state.backgroundColor;

  return state.isDark;
}

/**
 * Color-mode state. Defaults to following the operating system and remembers any
 * explicit choice in local storage. The inline script in __root.tsx applies the
 * stored value before render to avoid a flash.
 */
function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    let initial: Theme = "system";
    try {
      initial = coerceTheme(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      // Ignore storage access errors (e.g. privacy mode).
    }
    setThemeState(initial);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore. Selection simply won't persist.
    }
  }, []);

  // While following the system, react to OS preference changes live.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}

/** Compact, icon-only light / dark / system selector for the top-right corner. */
function ThemeToggleButton({
  value,
  label,
  active,
  setTheme,
  children,
}: {
  value: Theme;
  label: string;
  active: boolean;
  setTheme: (t: Theme) => void;
  children: React.ReactNode;
}) {
  const handleClick = useCallback(() => {
    setTheme(value);
  }, [setTheme, value]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={`${label} theme`}
      aria-pressed={active}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none dark:focus-visible:ring-slate-100 sm:h-8 sm:w-8 ${
        active
          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <fieldset className="inline-flex items-center gap-0.5 rounded-full border border-slate-300 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <legend className="sr-only">Theme</legend>
      <ThemeToggleButton value="light" label="Light" active={theme === "light"} setTheme={setTheme}>
        <SunIcon />
      </ThemeToggleButton>
      <ThemeToggleButton value="dark" label="Dark" active={theme === "dark"} setTheme={setTheme}>
        <MoonIcon />
      </ThemeToggleButton>
      <ThemeToggleButton
        value="system"
        label="System"
        active={theme === "system"}
        setTheme={setTheme}
      >
        <SystemIcon />
      </ThemeToggleButton>
    </fieldset>
  );
}

function LegendSwatch({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return (
    <svg viewBox="0 0 16 8" className="h-2 w-4 shrink-0" aria-hidden="true" focusable="false">
      <line
        x1="1"
        y1="4"
        x2="15"
        y2="4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={dashed ? "4 3" : undefined}
      />
    </svg>
  );
}

function DependencyIceberg({
  directDeps,
  transitiveDeps,
  additionalRisk,
}: {
  directDeps: number;
  transitiveDeps: number;
  additionalRisk: number;
}) {
  const titleId = useId();
  const iceberg = getDependencyIcebergGeometry(directDeps, transitiveDeps);
  const directPoints = toSvgPoints(iceberg.directPoints);
  const transitivePoints = toSvgPoints(iceberg.transitivePoints);

  return (
    <div>
      <svg
        viewBox="0 0 240 172"
        aria-labelledby={titleId}
        className="mx-auto mt-2 h-auto w-full max-w-56"
      >
        <title id={titleId}>
          {`Dependency iceberg showing ${directDeps.toLocaleString()} direct dependencies above ${transitiveDeps.toLocaleString()} transitive dependencies.`}
        </title>
        <line
          x1="18"
          y1={iceberg.splitY}
          x2="222"
          y2={iceberg.splitY}
          className="stroke-slate-300 dark:stroke-slate-700"
          strokeWidth="2"
          strokeDasharray="7 7"
        />
        <polygon
          points={directPoints}
          className="fill-slate-600/80 stroke-slate-700 dark:fill-slate-300/85 dark:stroke-slate-200"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polygon
          points={transitivePoints}
          className="fill-teal-500/70 stroke-teal-700 dark:fill-teal-300/75 dark:stroke-teal-200"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
        <div className="rounded-md bg-white/55 px-2 py-1.5 dark:bg-slate-950/25">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-600 dark:bg-slate-300" />
            <span>Direct</span>
          </div>
          <p className="mt-0.5 font-semibold text-slate-950 dark:text-slate-100">
            {directDeps.toLocaleString()}
          </p>
        </div>
        <div className="rounded-md bg-white/55 px-2 py-1.5 dark:bg-slate-950/25">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-teal-500 dark:bg-teal-300" />
            <span>Transitive</span>
          </div>
          <p className="mt-0.5 font-semibold text-slate-950 dark:text-slate-100">
            {transitiveDeps.toLocaleString()}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">
        {iceberg.totalExternalDeps === 0
          ? "No external dependency iceberg in this scenario."
          : `${formatProb(additionalRisk)} additional modeled probability from the below-surface tree.`}
      </p>
    </div>
  );
}

export default function SupplyChainRisk() {
  const lookupPkgNameId = useId();
  const lookupPkgVersionId = useId();
  const dailyProbInputId = useId();
  const exactProbInputId = useId();

  const { theme, setTheme } = useTheme();
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });

  const scenario = getRiskScenario(search);
  const {
    directDeps,
    transitiveDeps,
    dailyProbExp,
    timePeriodDays,
    dailyP,
    totalDeps,
    prob,
    hiddenRisk,
    expectedDaysToBreach: ettb,
    packageRef,
  } = scenario;

  // Merge a patch into the URL search params. `replace` avoids flooding the
  // history stack while dragging sliders, and search-only calculator updates
  // should preserve the user's current scroll position.
  const updateSearch = useCallback(
    (patch: Partial<RiskSearch>, replace = true) => {
      navigate({
        search: (prev: RiskSearch) => ({ ...prev, ...patch }),
        replace,
        resetScroll: false,
      });
    },
    [navigate],
  );

  // Editing the dependency counts dissociates the model from any looked-up
  // package, so clear pkg/version when those sliders move.
  const setDirectDeps = useCallback(
    (v: number) => updateSearch({ direct: v, pkg: undefined, v: undefined }),
    [updateSearch],
  );
  const setTransitiveDeps = useCallback(
    (v: number) => updateSearch({ transitive: v, pkg: undefined, v: undefined }),
    [updateSearch],
  );
  const setDailyProbExp = useCallback((v: number) => updateSearch({ probExp: v }), [updateSearch]);
  const setTimePeriodDays = useCallback((v: number) => updateSearch({ days: v }), [updateSearch]);

  // Local form state for the lookup inputs, seeded from the URL.
  const [pkgName, setPkgName] = useState(search.pkg ?? "");
  const [pkgVersion, setPkgVersion] = useState(search.v ?? "");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<PackageDepsResult | null>(null);
  const [lookupTarget, setLookupTarget] = useState<string | null>(null);
  const lastFetched = useRef<string | null>(null);

  // Prove the typed package/version before changing the report. Failed lookups
  // stay in the lookup panel and do not mutate the shareable risk scenario.
  const handleLookup = useCallback(() => {
    const name = pkgName.trim();
    const version = pkgVersion.trim() || undefined;
    if (!name || lookupLoading) return;

    setLookupTarget(version ? `${name}@${version}` : name);
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    fetchPackageDeps(name, version)
      .then((result) => {
        setLookupResult(result);
        lastFetched.current = `${result.package}@${result.version}`;
        navigate({
          search: (prev: RiskSearch) => ({
            ...prev,
            pkg: result.package,
            v: result.version,
            direct: result.directDeps,
            transitive: result.transitiveDeps,
          }),
          resetScroll: false,
        });
      })
      .catch((e) => {
        setLookupResult(null);
        setLookupError(e instanceof Error ? e.message : "Lookup failed.");
      })
      .finally(() => {
        setLookupLoading(false);
        setLookupTarget(null);
      });
  }, [pkgName, pkgVersion, lookupLoading, navigate]);

  const handlePkgNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPkgName(event.target.value);
  }, []);

  const handlePkgVersionChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPkgVersion(event.target.value);
  }, []);

  const handleLookupInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") handleLookup();
    },
    [handleLookup],
  );

  // Resolve the package named in the URL. Runs only as a client effect, so it
  // never blocks initial render even when the URL arrives with a package. Fresh
  // and bare/range/dist-tag ?pkg= links adopt resolved counts and the resolved
  // exact version; fully shared links keep their existing numbers.
  const countsAbsent = search.direct === undefined && search.transitive === undefined;
  useEffect(() => {
    const name = search.pkg;
    if (!name) {
      setLookupResult(null);
      setLookupError(null);
      lastFetched.current = null;
      return;
    }
    const key = `${name}@${search.v ?? ""}`;
    if (lastFetched.current === key) return;
    lastFetched.current = key;

    let cancelled = false;
    setLookupLoading(true);
    setLookupError(null);
    fetchPackageDeps(name, search.v)
      .then((result) => {
        if (cancelled) return;
        setLookupResult(result);
        lastFetched.current = `${result.package}@${result.version}`;
        if (countsAbsent || !search.v) {
          updateSearch({
            ...(countsAbsent
              ? {
                  direct: result.directDeps,
                  transitive: result.transitiveDeps,
                }
              : {}),
            ...(search.v !== result.version ? { v: result.version } : {}),
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setLookupResult(null);
        lastFetched.current = null;
        setLookupError(e instanceof Error ? e.message : "Lookup failed.");
      })
      .finally(() => {
        if (!cancelled) setLookupLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // countsAbsent is intentionally read but excluded: re-running when it flips
    // after adopting counts would cause a redundant fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.pkg, search.v, updateSearch]);

  // Keep the lookup inputs in step with the URL (e.g. on back/forward or when a
  // shared link is opened).
  useEffect(() => {
    setPkgName(search.pkg ?? "");
    setPkgVersion(search.v ?? "");
  }, [search.pkg, search.v]);

  const handleProbInput = useCallback(
    (raw: string) => {
      const v = parseFloat(raw);
      if (!isNaN(v) && v > 0 && v < 1) {
        setDailyProbExp(Math.log10(v));
      }
    },
    [setDailyProbExp],
  );

  const handleDailyProbExpChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDailyProbExp(Number(event.target.value));
    },
    [setDailyProbExp],
  );

  const handleExactProbInputBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      handleProbInput(event.target.value);
    },
    [handleProbInput],
  );

  const handleExactProbInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") handleProbInput(event.currentTarget.value);
    },
    [handleProbInput],
  );

  // Share the current view. Every control is reflected in the URL, so the
  // address bar alone reproduces the exact state.
  const [copied, setCopied] = useState(false);
  const handleCopyLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const done = () => {
      setCopied(true);
      window.setTimeout(setCopied, 1500, false);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(done);
    } else {
      done();
    }
  }, []);

  const handleShareToBluesky = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const text = packageRef
      ? `${packageRef}: ${formatProb(prob)} modeled npm supply-chain breach probability over ${formatDays(timePeriodDays)}. ${url}`
      : `npm supply-chain risk scenario: ${formatProb(prob)} modeled breach probability over ${formatDays(timePeriodDays)}. ${url}`;
    window.open(
      `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [packageRef, prob, timePeriodDays]);

  const breachTone = breachProbabilityTone(prob);
  const expectedTone = expectedBreachTimeTone(ettb);
  const breachTheme = RISK_TONES[breachTone];
  const expectedTheme = RISK_TONES[expectedTone];
  const rootLabel = packageRef ? "the package itself" : "the project itself";
  const rootNoun = packageRef ? "Package" : "Project";
  const reportDetail = packageRef
    ? "Resolved package graph from npm metadata"
    : "Manual dependency assumptions";
  const directBaselineDeps = MODELED_ROOT_PACKAGE_COUNT + directDeps;
  const halfTransitiveDeps = directBaselineDeps + Math.round(transitiveDeps / 2);
  const directSliderMax = expandedSliderMax(directDeps, 200, 50);
  const transitiveSliderMax = expandedSliderMax(transitiveDeps, 5000, 500);

  const lines: ChartLine[] = useMemo(() => {
    const steps = 100;
    return [
      {
        label: `All ${formatPackageCount(totalDeps)}`,
        color: "#e11d48",
        data: buildLine(totalDeps, dailyP, timePeriodDays, steps),
      },
      {
        label: `${rootNoun} + direct (${directBaselineDeps})`,
        color: "#64748b",
        data: buildLine(directBaselineDeps, dailyP, timePeriodDays, steps),
        dashed: true,
      },
      {
        label: `Half transitive (${halfTransitiveDeps})`,
        color: "#0f766e",
        data: buildLine(halfTransitiveDeps, dailyP, timePeriodDays, steps),
        dashed: true,
      },
    ];
  }, [totalDeps, rootNoun, directBaselineDeps, halfTransitiveDeps, dailyP, timePeriodDays]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
            npm.tax
          </p>
          <p className="mt-1 max-w-xl text-md text-slate-600 dark:text-slate-400">
            Model the risk of a supply-chain compromise in an npm dependency tree, explore
            scenarios, and share a report to convince your boss that you're sitting ducks.
          </p>
        </div>
        <div className="shrink-0">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </div>

      <section className={`mb-6 rounded-xl border p-5 sm:p-6 ${breachTheme.panel}`}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
              {packageRef ? (
                <>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Package report for
                  </span>
                  <span className="max-w-full truncate font-mono font-semibold text-slate-950 dark:text-slate-100 sm:max-w-xs">
                    {packageRef}
                  </span>
                </>
              ) : (
                <span className="font-medium text-slate-700 dark:text-slate-300">Scenario</span>
              )}
              <span aria-hidden="true" className="hidden text-slate-400 sm:inline">
                /
              </span>
              <span className="hidden text-slate-600 dark:text-slate-400 sm:inline">
                {reportDetail}
              </span>
            </div>
            <h1
              className={`max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl ${breachTheme.heading}`}
            >
              {packageRef ? (
                <>
                  <span className="font-mono">{packageRef}</span> has a {formatProb(prob)} modeled
                  chance of at least one package compromise in {formatDays(timePeriodDays)}.
                </>
              ) : (
                <>
                  This scenario has a {formatProb(prob)} modeled chance of at least one package
                  compromise in {formatDays(timePeriodDays)}.
                </>
              )}
            </h1>
            <div className={`mt-5 border-y py-4 ${breachTheme.rule}`}>
              <dl>
                <dt className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Expected time to breach
                </dt>
                <dd
                  className={`mt-1 text-3xl font-semibold tracking-tight ${expectedTheme.heading}`}
                >
                  {formatDays(ettb)}
                </dd>
              </dl>
            </div>
            <p className={`mt-4 max-w-3xl text-base leading-7 ${breachTheme.body}`}>
              {packageRef ? (
                <>
                  For <strong>{packageRef}</strong>, this scenario uses{" "}
                </>
              ) : (
                <>This scenario uses </>
              )}
              {formatModeledPackageCount(totalDeps)} ({rootLabel} + {directDeps.toLocaleString()}{" "}
              direct + {transitiveDeps.toLocaleString()} transitive) and a{" "}
              <span className="font-mono">{dailyP.toExponential(2)}</span> daily per-package breach
              probability.
            </p>
            <p className={`mt-4 max-w-3xl text-base leading-7 ${breachTheme.body}`}>
              Adjust parameters below to see how they affect overall risk.
            </p>
            <div className="mt-5 grid max-w-md grid-cols-2 gap-2 sm:flex sm:max-w-none sm:flex-wrap">
              <button
                type="button"
                onClick={handleCopyLink}
                aria-label={copied ? "Report link copied" : "Copy report link"}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-current/20 bg-white/75 px-3.5 text-xs font-semibold text-inherit transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none dark:bg-slate-950/35 dark:hover:bg-slate-950/50 dark:focus-visible:ring-slate-100 sm:h-9"
              >
                {copied ? (
                  <>
                    <CheckIcon />
                    <span className="sm:hidden">Copied</span>
                    <span className="hidden sm:inline">Report link copied</span>
                  </>
                ) : (
                  <>
                    <LinkIcon />
                    <span className="sm:hidden">Copy link</span>
                    <span className="hidden sm:inline">Copy report link</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleShareToBluesky}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-slate-950 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white dark:focus-visible:ring-slate-100 dark:focus-visible:ring-offset-slate-950 sm:h-9"
              >
                <BlueskyIcon />
                <span className="whitespace-nowrap">Share to Bluesky</span>
              </button>
            </div>
          </div>

          <dl
            className={`grid gap-4 border-t pt-4 sm:grid-cols-2 lg:block lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6 ${breachTheme.rule}`}
          >
            <div>
              <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Dependency iceberg
              </dt>
              <dd className="mt-2">
                <DependencyIceberg
                  directDeps={directDeps}
                  transitiveDeps={transitiveDeps}
                  additionalRisk={hiddenRisk}
                />
              </dd>
            </div>
            <div
              className={`border-t pt-4 sm:border-t-0 sm:pt-0 lg:mt-5 lg:border-t lg:pt-5 ${breachTheme.rule}`}
            >
              <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Modeled surface
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">
                {totalDeps.toLocaleString()}
              </dd>
              <dd className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                includes {rootLabel}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] gap-5 xl:gap-6">
        <div className="space-y-5">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
              Look up a real package&apos;s risk
            </h2>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
              Pull dependency counts from npm and npmx, then use them as the starting point for the
              scenario.
            </p>
            <div className="flex flex-col gap-2">
              <label htmlFor={lookupPkgNameId} className="sr-only">
                Package name
              </label>
              <input
                id={lookupPkgNameId}
                aria-label="Package name"
                type="text"
                value={pkgName}
                onChange={handlePkgNameChange}
                onKeyDown={handleLookupInputKeyDown}
                placeholder="Package name (e.g. express)"
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-base text-slate-950 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 md:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-300 dark:focus:ring-slate-300/20 sm:h-10"
              />
              <label htmlFor={lookupPkgVersionId} className="sr-only">
                Version (optional)
              </label>
              <input
                id={lookupPkgVersionId}
                aria-label="Version"
                type="text"
                value={pkgVersion}
                onChange={handlePkgVersionChange}
                onKeyDown={handleLookupInputKeyDown}
                placeholder="Version (optional, e.g. 4.18.2)"
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-base text-slate-950 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 md:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-300 dark:focus:ring-slate-300/20 sm:h-10"
              />
              <button
                type="button"
                onClick={handleLookup}
                disabled={lookupLoading || !pkgName.trim()}
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white dark:disabled:bg-slate-800 dark:disabled:text-slate-500 dark:focus-visible:ring-slate-100 dark:focus-visible:ring-offset-slate-900 sm:h-10"
              >
                {lookupLoading ? "Looking up…" : "Fetch dependency count"}
              </button>
            </div>
            <output aria-live="polite" className="block mt-2 min-h-[1.5rem]">
              {lookupError && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                  Error: {lookupError}
                </p>
              )}
              {!lookupError && lookupLoading && (lookupTarget || search.pkg) && !lookupResult && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Loading {lookupTarget ?? `${search.pkg}${search.v ? `@${search.v}` : ""}`}…
                </p>
              )}
              {lookupResult && (
                <div className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {lookupResult.package}@{lookupResult.version}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {lookupResult.totalDeps.toLocaleString()}
                    </span>{" "}
                    total dependencies ({lookupResult.directDeps} direct +{" "}
                    {lookupResult.transitiveDeps.toLocaleString()} transitive)
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Install size {formatBytes(lookupResult.totalSizeBytes)} · via{" "}
                    <a
                      href={`https://npmx.dev/package/${encodeURIComponent(lookupResult.package)}/v/${encodeURIComponent(lookupResult.version)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm underline hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none dark:hover:text-slate-300 dark:focus-visible:ring-slate-100"
                    >
                      npmx.dev
                    </a>
                  </p>
                </div>
              )}
            </output>
          </section>

          <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
              Tune the model
            </h2>
            <Slider
              label="Direct dependencies"
              value={directDeps}
              min={0}
              max={directSliderMax}
              step={1}
              onChange={setDirectDeps}
            />
            <Slider
              label="Transitive dependencies"
              value={transitiveDeps}
              min={0}
              max={transitiveSliderMax}
              step={1}
              onChange={setTransitiveDeps}
            />
            <Slider
              label="Time period"
              value={timePeriodDays}
              min={1}
              max={1095}
              step={1}
              onChange={setTimePeriodDays}
              format={formatTimeSliderValue}
            />

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-baseline">
                <label
                  htmlFor={dailyProbInputId}
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Daily breach prob / package
                </label>
                <span className="text-sm font-mono text-slate-900 dark:text-slate-100 font-semibold">
                  {dailyP.toExponential(2)}
                </span>
              </div>
              <input
                id={dailyProbInputId}
                aria-label="Daily breach probability per package"
                aria-valuetext={dailyP.toExponential(2)}
                type="range"
                min={-8}
                max={-3}
                step={0.05}
                value={dailyProbExp}
                onChange={handleDailyProbExpChange}
                className="h-11 w-full cursor-pointer accent-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:accent-slate-100 dark:focus-visible:outline-slate-100 rounded-sm sm:h-7"
              />
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>1e-8 (~0.00037%/yr)</span>
                <span>1e-3 (~30.6%/yr)</span>
              </div>
              <div className="mt-1">
                <label
                  htmlFor={exactProbInputId}
                  className="text-xs text-slate-600 dark:text-slate-400"
                >
                  Or enter exact value:
                </label>
                <input
                  id={exactProbInputId}
                  aria-label="Exact daily breach probability per package"
                  type="text"
                  inputMode="decimal"
                  placeholder={`Current: ${dailyP.toExponential(2)}`}
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-base text-slate-950 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 md:text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-300 dark:focus:ring-slate-300/20 sm:h-9"
                  onBlur={handleExactProbInputBlur}
                  onKeyDown={handleExactProbInputKeyDown}
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <p className="font-medium mb-1 text-slate-700 dark:text-slate-300">
                About the default
              </p>
              <p>
                Default dependency counts use Table 2 from{" "}
                <a
                  href="https://www.cs.cmu.edu/afs/cs.cmu.edu/Web/People/ckaestne/pdf/fse25.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm underline hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none dark:hover:text-slate-300 dark:focus-visible:ring-slate-100"
                >
                  <em>Pinning Is Futile</em>
                </a>
                : a median GitHub npm project has 23 direct and 848 transitive dependencies when
                development dependencies are included. The daily per-package probability is still a
                scenario assumption.
              </p>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
                  Cumulative breach probability
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                  The full tree is the risk line. The dashed lines show how much direct dependencies
                  alone understate the surface area.
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {formatDays(timePeriodDays)} horizon
              </span>
            </div>
            <SVGChart
              lines={lines}
              maxDays={timePeriodDays}
              ariaLabel="Line chart showing cumulative breach probability over time for all modeled packages, project plus direct dependencies, and half of the transitive dependency tree"
            />
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              {lines.map((l) => (
                <div
                  key={l.label}
                  className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"
                >
                  <LegendSwatch color={l.color} dashed={l.dashed} />
                  <span>{l.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/70 sm:p-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
              <div>
                <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
                  Model notes
                </h2>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  <p>
                    Each package has a daily breach probability <em>p</em>. With <em>n</em> total
                    modeled packages, including {rootLabel}, the chance that none are breached on a
                    given day is <code>(1 - p)^n</code>.
                  </p>
                  <p>
                    Over <em>d</em> days, the chance of staying breach-free is{" "}
                    <code>(1 - p)^(n x d)</code>. The model treats package-days as independent, so
                    use it as directional evidence rather than a forecast.
                  </p>
                </div>
              </div>
              <div className="border-t border-slate-200 pt-4 dark:border-slate-800 md:border-t-0 md:border-l md:pt-0 md:pl-5">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Formula</p>
                <p className="mt-3 text-center font-mono text-sm font-semibold text-slate-950 dark:text-slate-100">
                  P(breach) = 1 - (1 - p)<sup>n x d</sup>
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
