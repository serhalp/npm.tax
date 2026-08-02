import { useState, useMemo, useCallback, useEffect, useRef, useId } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import type { PackageDepsResult } from "../server/packageDeps";
import { BlueskyIcon, CheckIcon, LinkIcon, MoonIcon, SunIcon, SystemIcon } from "./icons";
import {
  buildLine,
  formatBytes,
  formatDays,
  formatPackageCount,
  formatProb,
  formatProbFixed2,
  formatTimeSliderValue,
  getRiskScenario,
  MODELED_ROOT_PACKAGE_COUNT,
  parseControlValue,
  parseProbabilityExponent,
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
  getPackageFieldGeometry,
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

/** Minimum vertical gap between the direct labels at the line ends. */
const LABEL_MIN_GAP = 29;

interface ChartLayout {
  w: number;
  h: number;
  pad: { top: number; right: number; bottom: number; left: number };
  endLabels: boolean;
}

/**
 * Two viewBoxes rather than one responsive chart: SVG text scales with the
 * viewBox, so a single wide chart squeezed into a phone renders its labels at
 * four or five pixels. The narrow box keeps type legible at small widths.
 */
const CHART_WIDE: ChartLayout = {
  w: 720,
  h: 268,
  pad: { top: 18, right: 104, bottom: 34, left: 44 },
  endLabels: true,
};

const CHART_NARROW: ChartLayout = {
  w: 360,
  h: 220,
  pad: { top: 12, right: 14, bottom: 28, left: 34 },
  endLabels: false,
};

interface ToneStyles {
  label: string;
  text: React.CSSProperties;
  chip: React.CSSProperties;
  swatch: React.CSSProperties;
}

/** Style objects live at module scope so they stay referentially stable. */
function makeTone(label: string, color: string): ToneStyles {
  return {
    label,
    text: { color },
    chip: { color, borderColor: color },
    swatch: { backgroundColor: color },
  };
}

/**
 * Severity is never carried by colour alone: each tone also names itself in the
 * assessment chip.
 */
const RISK_TONES = {
  good: makeTone("Low", "var(--moss)"),
  warning: makeTone("Medium", "var(--ochre)"),
  danger: makeTone("High", "var(--levy)"),
} as const satisfies Record<RiskTone, ToneStyles>;

const INK_TEXT: React.CSSProperties = { color: "var(--ink)" };

/**
 * Each series is identified by hue, dash pattern and weight together. Three
 * hues that all clear AA on a light ground sit close in greyscale, so colour
 * alone is never the only cue. No red or green: those belong to the severity
 * ramp and must not leak into categorical encoding.
 */
const SERIES = {
  all: { stroke: "var(--series-a)", width: 2.5 },
  half: { stroke: "var(--series-c)", dash: "8 5", width: 2 },
  direct: { stroke: "var(--series-b)", dash: "2 4", width: 2 },
} as const;
const CURVE_STYLE = { "--curve-length": 1400 } as React.CSSProperties;
const END_LABEL_STYLE: React.CSSProperties = { fontStretch: "68%" };

const EYEBROW = "eyebrow text-muted";

/**
 * The hover fade lives on the title, not the whole summary. Fading the summary
 * blends its 12px muted hint toward the paper, which drops it to 3.1:1; `ink`
 * still clears AA at 70% in both themes.
 */
const SUMMARY =
  "group/summary flex cursor-pointer list-none items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden";
const SUMMARY_TITLE = "transition-opacity group-hover/summary:opacity-70";
const FIELD_INPUT =
  "h-11 w-full border border-rule-strong bg-surface px-3 font-mono text-base text-ink placeholder:text-muted focus:border-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink md:text-sm sm:h-10";

interface ChartLine {
  key: string;
  /** Short form for the in-chart end label, which has a fixed gutter. */
  label: string;
  /** Long form, with counts, for the key shown under the narrow chart. */
  detail: string;
  value: string;
  data: { x: number; y: number }[];
  primary?: boolean;
  /** Series identity: colour and dash carry it redundantly. */
  stroke: string;
  dash?: string;
  width: number;
}

/**
 * Cumulative probability over the horizon. Lines are labelled where they end
 * rather than in a legend, so the eye never has to round-trip to a key.
 */
function RiskCurve({
  lines,
  maxDays,
  ariaLabel,
  layout,
  className,
}: {
  lines: ChartLine[];
  maxDays: number;
  ariaLabel: string;
  layout: ChartLayout;
  className?: string;
}) {
  const titleId = useId();
  const { w: CHART_W, h: CHART_H, pad: PAD } = layout;
  const INNER_W = CHART_W - PAD.left - PAD.right;
  const INNER_H = CHART_H - PAD.top - PAD.bottom;

  const toX = useCallback(
    (d: number) => PAD.left + (d / maxDays) * INNER_W,
    [maxDays, PAD.left, INNER_W],
  );
  const toY = useCallback((p: number) => PAD.top + (1 - p) * INNER_H, [PAD.top, INNER_H]);

  const xTicks = useMemo(() => [0, Math.round(maxDays / 2), maxDays], [maxDays]);

  const rendered = useMemo(() => {
    const paths = lines.map((line) => ({
      ...line,
      d: line.data
        .map((pt, i) => `${i === 0 ? "M" : "L"}${toX(pt.x).toFixed(2)},${toY(pt.y).toFixed(2)}`)
        .join(" "),
      // Rounded because `breachProb` can land on marginally different doubles
      // under Node and the browser, which would trip a hydration mismatch on
      // an unrounded coordinate attribute.
      endY: Math.round(toY(line.data.at(-1)?.y ?? 0) * 100) / 100,
    }));

    // Push overlapping end labels apart, working up from the lowest line.
    // Sorting an index array keeps `paths` in render order, so the primary
    // curve still paints last.
    const order = paths.map((_, index) => index);
    order.sort((a, b) => paths[b].endY - paths[a].endY);
    let previous = Infinity;
    for (const index of order) {
      const item = paths[index];
      item.endY = Math.min(item.endY, previous - LABEL_MIN_GAP);
      previous = item.endY;
    }

    // When every line saturates they all pile up at the top, so the stack can
    // be pushed clean out of the plot. Slide it back down as a unit.
    const topLimit = PAD.top + 8;
    const highest = Math.min(...paths.map((item) => item.endY));
    if (highest < topLimit) {
      const shift = topLimit - highest;
      for (const item of paths) item.endY += shift;
    }
    return paths;
  }, [lines, toX, toY, PAD.top]);

  const axisFill = "var(--muted)";

  const primary = rendered.find((line) => line.primary);
  const areaD = primary
    ? `${primary.d} L${toX(maxDays).toFixed(2)},${toY(0).toFixed(2)} L${toX(0).toFixed(2)},${toY(0).toFixed(2)} Z`
    : "";

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className={`h-auto w-full overflow-visible ${className ?? ""}`}
      aria-labelledby={titleId}
      focusable="false"
    >
      <title id={titleId}>{ariaLabel}</title>

      {[0, 0.5, 1].map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={PAD.left}
            y1={toY(tick)}
            x2={PAD.left + INNER_W}
            y2={toY(tick)}
            stroke="var(--rule)"
            strokeWidth="1"
          />
          <text
            x={PAD.left - 8}
            y={toY(tick) + 4}
            textAnchor="end"
            fill={axisFill}
            fontSize="11"
            fontFamily="var(--font-mono)"
          >
            {tick * 100}%
          </text>
        </g>
      ))}

      {xTicks.map((tick, i) => (
        <text
          key={`x-${tick}`}
          x={toX(tick)}
          y={PAD.top + INNER_H + 20}
          textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
          fill={axisFill}
          fontSize="11"
          fontFamily="var(--font-mono)"
        >
          {tick}d
        </text>
      ))}

      {areaD && <path d={areaD} fill="var(--series-a-wash)" />}

      {rendered.map((line) => (
        <path
          key={line.key}
          className={line.primary ? "curve-draw" : undefined}
          d={line.d}
          fill="none"
          stroke={line.stroke}
          strokeWidth={line.width}
          strokeDasharray={line.dash}
          strokeLinecap="round"
          style={line.primary ? CURVE_STYLE : undefined}
        />
      ))}

      {layout.endLabels &&
        rendered.map((line) => (
          <g key={`label-${line.key}`}>
            <text
              x={PAD.left + INNER_W + 10}
              y={line.endY - 1}
              fill={line.stroke}
              fontSize="14"
              fontFamily="var(--font-mono)"
              fontWeight={line.primary ? 600 : 400}
            >
              {line.value}
            </text>
            <text
              x={PAD.left + INNER_W + 10}
              y={line.endY + 12}
              fill={axisFill}
              fontSize="9.5"
              fontWeight="600"
              letterSpacing="0.09em"
              style={END_LABEL_STYLE}
            >
              {line.label.toUpperCase()}
            </text>
          </g>
        ))}
    </svg>
  );
}

/** Chart key for the narrow layout, where end labels have nowhere to go. */
function CurveKey({ lines }: { lines: ChartLine[] }) {
  return (
    <dl className="mt-4 space-y-2 sm:hidden">
      {lines.map((line) => (
        <div
          key={line.key}
          className="flex items-baseline justify-between gap-3 border-t border-rule pt-2"
        >
          <dt className={`${EYEBROW} flex items-center gap-1.5`}>
            <svg
              viewBox="0 0 18 4"
              className="h-1 w-4 shrink-0"
              aria-hidden="true"
              focusable="false"
            >
              <line
                x1="1"
                y1="2"
                x2="17"
                y2="2"
                stroke={line.stroke}
                strokeWidth={line.width}
                strokeDasharray={line.dash}
                strokeLinecap="round"
              />
            </svg>
            {line.detail}
          </dt>
          <dd className="figure-num text-sm font-semibold" style={INK_TEXT}>
            {line.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One band of the package field: swatch, name, count. */
function FieldLegendItem({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className={`${EYEBROW} flex items-center gap-1.5`}>
        <span className={`inline-block h-2 w-2 shrink-0 ${swatch}`} aria-hidden="true" />
        {label}
      </dt>
      <dd className="figure-num text-lg font-semibold text-ink">{value.toLocaleString()}</dd>
    </div>
  );
}

/**
 * One mark per modeled package, in three bands: the package itself, its direct
 * dependencies, then the transitive tree. Proportion is the whole argument, so
 * it is drawn at true scale rather than diagrammed.
 */
function PackageField({
  directDeps,
  transitiveDeps,
}: {
  directDeps: number;
  transitiveDeps: number;
}) {
  const titleId = useId();
  const field = useMemo(
    () => getPackageFieldGeometry(MODELED_ROOT_PACKAGE_COUNT, directDeps, transitiveDeps),
    [directDeps, transitiveDeps],
  );
  const selfCount = MODELED_ROOT_PACKAGE_COUNT;

  return (
    <div>
      <h2 className={`${EYEBROW} mb-3`}>Every modeled package</h2>
      <svg
        viewBox={`0 0 ${field.width} ${field.height}`}
        className="field-wipe h-auto w-full"
        aria-labelledby={titleId}
        focusable="false"
      >
        <title id={titleId}>
          {`Visualization of ${field.totalPackages.toLocaleString()} marks, one per modeled package: ${selfCount.toLocaleString()} for the package itself, ${directDeps.toLocaleString()} direct dependencies, ${transitiveDeps.toLocaleString()} transitive dependencies.`}
        </title>
        <path d={field.transitivePath} fill="var(--ink-faint)" />
        <path d={field.directPath} fill="var(--series-b)" />
        <path d={field.selfPath} fill="var(--ink)" />
      </svg>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-rule pt-3">
        <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <FieldLegendItem swatch="bg-ink" label="Self" value={selfCount} />
          <FieldLegendItem swatch="bg-series-b" label="Direct deps" value={directDeps} />
          <FieldLegendItem swatch="bg-ink-faint" label="Transitive deps" value={transitiveDeps} />
        </dl>

        <p className="text-base leading-6 text-muted">
          {field.packagesPerMark > 1 && (
            <>One mark stands for {field.packagesPerMark.toLocaleString()} packages. </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * A control's readout, doubling as its exact-value field. Sliders step coarsely
 * and dragging to a specific figure is tedious, so every value is also typeable.
 *
 * Idle it mirrors `display`; focused it shows the raw `editValue`, since a
 * formatted string like "2yr" is not what you want to edit. A held draft is what
 * keeps the slider from overwriting keystrokes mid-drag.
 */
function ValueField({
  ariaLabel,
  display,
  editValue,
  onCommit,
}: {
  ariaLabel: string;
  display: string;
  editValue: string;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Blur is what commits, so Escape has to mark the draft dead before leaving.
  const discardRef = useRef(false);

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      setDraft(editValue);
      event.target.select();
    },
    [editValue],
  );

  const handleBlur = useCallback(() => {
    if (discardRef.current) discardRef.current = false;
    else if (draft !== null) onCommit(draft);
    setDraft(null);
  }, [draft, onCommit]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") discardRef.current = true;
    if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
  }, []);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
  }, []);

  return (
    <input
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      value={draft ?? display}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="figure-num w-[8ch] border-b border-dashed border-rule-strong bg-transparent py-0.5 text-right text-base font-semibold text-ink hover:border-ink focus:border-solid focus:border-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink"
    />
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
  inputMax,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  /** Ceiling for typed values. Omit where `max` grows to fit the value. */
  inputMax?: number;
}) {
  const id = useId();
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(event.target.value));
    },
    [onChange],
  );

  const handleCommit = useCallback(
    (raw: string) => {
      const parsed = parseControlValue(raw, { min, max: inputMax });
      if (parsed !== null) onChange(parsed);
    },
    [min, inputMax, onChange],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={EYEBROW}>
          {label}
        </label>
        <ValueField
          ariaLabel={`Exact ${label.toLowerCase()}`}
          display={format ? format(value) : String(value)}
          editValue={String(value)}
          onCommit={handleCommit}
        />
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
        className="h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink sm:h-7"
      />
      <div className="figure-num flex justify-between text-xs text-muted">
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
 * Colour-mode state. Defaults to following the operating system and remembers any
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

/** Compact, icon-only light / dark / system selector for the masthead. */
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
      className={`flex h-11 w-11 items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:h-8 sm:w-8 ${
        active ? "bg-ink text-paper" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <fieldset className="inline-flex items-center border border-rule-strong">
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

/** A ruled label/value row, the repeating unit of the assessment. */
function LineItem({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: React.CSSProperties;
}) {
  return (
    // Two `dd`s rather than a nested note: keeping the note a sibling lets the
    // label and value hold one line on narrow screens, with the note dropping
    // beneath instead of pushing the value onto its own row.
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-rule py-2.5">
      <dt className={EYEBROW}>{label}</dt>
      <dd
        className="figure-num ml-auto text-xl font-semibold whitespace-nowrap"
        style={tone ?? INK_TEXT}
      >
        {value}
      </dd>
      {note && <dd className="w-full text-right text-xs text-muted sm:ml-0 sm:w-auto">{note}</dd>}
    </div>
  );
}

const OUTBOUND =
  "underline decoration-rule-strong underline-offset-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Explains where the default counts come from, shown only until the reader
 * changes something — past that point they are no longer the defaults.
 *
 * Uses the native popover API rather than an absolutely-positioned div: the rail
 * scrolls, so anything positioned inside it gets clipped. The top layer escapes
 * that, and brings Escape and light-dismiss with it. Hover alone would strand
 * keyboard and touch users, so click and focus open it too.
 */
function DefaultsHint() {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const t = trigger.getBoundingClientRect();
    // Prefer below-left of the trigger, then nudge back inside the viewport.
    const width = popover.offsetWidth;
    const left = Math.max(8, Math.min(t.left, window.innerWidth - width - 8));
    popover.style.left = `${left}px`;
    popover.style.top = `${t.bottom + 6}px`;
  }, []);

  const open = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const popover = popoverRef.current;
    if (!popover || popover.matches(":popover-open")) return;
    popover.showPopover();
    place();
  }, [place]);

  // Delayed so the pointer can travel from the trigger into the popover to
  // reach the link inside it.
  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => popoverRef.current?.hidePopover(), 180);
  }, []);

  useEffect(() => () => void (closeTimer.current && clearTimeout(closeTimer.current)), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // Deliberately not `popoverTarget`: its native click-to-toggle fires
        // after the focus a tap also produces, so the two cancel out and touch
        // users see nothing. Opening explicitly is idempotent.
        aria-details={id}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={open}
        onBlur={scheduleClose}
        onClick={open}
        className="shrink-0 text-xs whitespace-nowrap text-muted underline decoration-dotted decoration-rule-strong underline-offset-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Why these defaults?
      </button>
      <div
        ref={popoverRef}
        id={id}
        popover="auto"
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        className="m-0 max-w-[min(22rem,calc(100vw-1rem))] border border-rule-strong bg-surface p-3 text-xs leading-5 text-muted shadow-lg"
      >
        Default dependency counts use Table 2 from{" "}
        <a
          href="https://www.cs.cmu.edu/afs/cs.cmu.edu/Web/People/ckaestne/pdf/fse25.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className={OUTBOUND}
        >
          <em>Pinning Is Futile</em>
        </a>
        : a median GitHub npm project has 23 direct and 848 transitive dependencies when development
        dependencies are included. The daily per-package probability was pulled entirely out of my
        hat.
      </div>
    </>
  );
}

/** The conventional "opens elsewhere" glyph. Decorative: the link text carries the meaning. */
function ExternalArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ml-[0.15em] inline-block h-[0.65em] w-[0.65em] shrink-0 align-baseline"
    >
      <path d="M3 7 7 3" />
      <path d="M3.6 3H7v3.4" />
    </svg>
  );
}

function Outbound({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${OUTBOUND} whitespace-nowrap`}
    >
      {children}
      <ExternalArrow />
    </a>
  );
}

/** Inline square matching a mark in the package field, dropped into prose. */
function Mark() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 inline-block h-[0.6em] w-[0.6em] translate-y-[0.05em] bg-ink-faint align-middle"
    />
  );
}

/** Plus-becomes-minus disclosure marker for a native details/summary accordion. */
function DisclosureMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted">
      <rect x="1" y="7" width="14" height="2" fill="currentColor" />
      <rect
        x="7"
        y="1"
        width="2"
        height="14"
        fill="currentColor"
        className="origin-center motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-90"
      />
    </svg>
  );
}

/** One action item, bulleted with the same mark used in the field above. */
function LeverItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden="true"
        className="mt-[0.45em] h-[0.55em] w-[0.55em] shrink-0 bg-ink-faint"
      />
      <span>{children}</span>
    </li>
  );
}

/**
 * Colour per model input, tying each summary line to the column that reduces it
 * and to the variable in the formula. Decorative only: every use is labelled.
 */
const LEVER_COLOR = {
  n: "text-lever-n",
  p: "text-lever-p",
  d: "text-lever-d",
} as const;

/**
 * `p` splits into how often a package is compromised at all and how often that
 * compromise reaches you. Only the second half is a lever, so only it carries
 * the lever colour.
 */
function PBreach({ mono = false }: { mono?: boolean }) {
  const Tag = mono ? "span" : "em";
  return (
    <Tag className="whitespace-nowrap">
      p<sub>breach</sub>
    </Tag>
  );
}

function PImpacted({ mono = false }: { mono?: boolean }) {
  const Tag = mono ? "span" : "em";
  return (
    <Tag className={`whitespace-nowrap ${LEVER_COLOR.p}`}>
      p<sub>impacted</sub>
    </Tag>
  );
}

/** One lever of the model, colour-coded to the input it moves. */
function Lever({
  title,
  input,
  children,
  className,
}: {
  title: string;
  input: keyof typeof LEVER_COLOR;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className={`statement text-lg ${LEVER_COLOR[input]}`}>{title}</h3>
      <div className="mt-3 space-y-2.5 text-base leading-6 text-muted">{children}</div>
    </div>
  );
}

export default function SupplyChainRisk() {
  const lookupPkgNameId = useId();
  const lookupPkgVersionId = useId();
  const dailyProbInputId = useId();

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

  // A version only ever belongs to the package it was entered for, so editing
  // the name drops it rather than letting `express@4.18.2` become
  // `lodash@4.18.2` on the next lookup.
  const handlePkgNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPkgName(event.target.value);
    setPkgVersion("");
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
      const exponent = parseProbabilityExponent(raw);
      if (exponent !== null) setDailyProbExp(exponent);
    },
    [setDailyProbExp],
  );

  const handleDailyProbExpChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDailyProbExp(Number(event.target.value));
    },
    [setDailyProbExp],
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

  const breachTone = RISK_TONES[breachProbabilityTone(prob)];
  const expectedTone = RISK_TONES[expectedBreachTimeTone(ettb)];
  const rootLabel = packageRef ? "the package itself" : "the project itself";
  const reportDetail = packageRef
    ? "Resolved package graph from npm metadata"
    : "Manual dependency assumptions";
  const directBaselineDeps = MODELED_ROOT_PACKAGE_COUNT + directDeps;
  const halfTransitiveDeps = directBaselineDeps + Math.round(transitiveDeps / 2);
  const directSliderMax = expandedSliderMax(directDeps, 200, 50);
  const transitiveSliderMax = expandedSliderMax(transitiveDeps, 5000, 500);

  const chartAriaLabel =
    "Line chart of cumulative breach probability over time for all modeled packages, half of the transitive tree, and the root package plus its direct dependencies";

  const lines: ChartLine[] = useMemo(() => {
    const steps = 100;
    const build = (deps: number) => buildLine(deps, dailyP, timePeriodDays, steps);
    const all = build(totalDeps);
    const direct = build(directBaselineDeps);
    const half = build(halfTransitiveDeps);
    const last = (d: { x: number; y: number }[]) => formatProbFixed2(d.at(-1)?.y ?? 0);

    return [
      {
        key: "all",
        label: "All packages",
        detail: `All ${formatPackageCount(totalDeps)}`,
        value: last(all),
        data: all,
        primary: true,
        ...SERIES.all,
      },
      {
        key: "half",
        label: "Half transitive",
        detail: `Half transitive (${halfTransitiveDeps.toLocaleString()})`,
        value: last(half),
        data: half,
        ...SERIES.half,
      },
      {
        key: "direct",
        label: "Self + direct",
        detail: `Self + direct (${directBaselineDeps.toLocaleString()})`,
        value: last(direct),
        data: direct,
        ...SERIES.direct,
      },
    ];
  }, [totalDeps, directBaselineDeps, halfTransitiveDeps, dailyP, timePeriodDays]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="border-b-2 border-ink pb-3">
        <div className="flex items-start justify-between gap-4">
          <Link
            to="/"
            className="font-mono text-3xl font-semibold tracking-tight text-ink transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink sm:text-4xl"
          >
            npm.tax
          </Link>
          <div className="shrink-0">
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>
        <p className="mt-1.5 max-w-xl text-base leading-6 text-muted">
          Model the risk of a supply-chain compromise in an npm dependency tree, explore scenarios,
          and share a report to convince your boss that you&apos;re sitting ducks.
        </p>
      </header>

      {/* Results left, instrument right: the report reads as one continuous
          column you could screenshot, and the controls stay beside the chart. */}
      <div className="grid gap-10 py-7 sm:py-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="min-w-0">
          {/* Report masthead: what this is and how it rates. */}
          <div className="mb-5 border-b border-rule pb-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <span className={EYEBROW}>{packageRef ? "Package report for" : "Scenario"}</span>
              {packageRef && (
                <span className="max-w-full truncate font-mono text-sm font-semibold text-ink">
                  {packageRef}
                </span>
              )}
              <span aria-hidden="true" className="hidden text-muted sm:inline">
                /
              </span>
              <span className="hidden text-sm text-muted sm:inline">{reportDetail}</span>
              <span
                className="eyebrow flex items-center gap-1.5 border px-2 py-1"
                style={breachTone.chip}
              >
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0"
                  style={breachTone.swatch}
                  aria-hidden="true"
                />
                Assessed {breachTone.label}
              </span>
            </div>
          </div>

          <h1 className="statement max-w-4xl text-[1.95rem] [font-stretch:100%] text-ink sm:text-5xl sm:[font-stretch:112%]">
            {packageRef ? (
              <>
                <span className="font-mono">{packageRef}</span> has a{" "}
                <span style={breachTone.text}>{formatProb(prob)}</span> modeled chance of at least
                one package compromise in {formatDays(timePeriodDays)}.
              </>
            ) : (
              <>
                This scenario has a <span style={breachTone.text}>{formatProb(prob)}</span> modeled
                chance of at least one package compromise in {formatDays(timePeriodDays)}.
              </>
            )}
          </h1>

          {/* Claim, then the numbers behind it, then the field as the proof. */}
          <dl className="mt-7 border-b border-rule">
            <LineItem label="Modeled surface" value={totalDeps.toLocaleString()} note="packages" />
            <LineItem
              label="Daily breach prob / package"
              value={dailyP.toExponential(2)}
              note="scenario assumption"
            />
            <LineItem label="Time period" value={formatDays(timePeriodDays)} />
            <LineItem
              label="Expected time to breach"
              value={formatDays(ettb)}
              tone={expectedTone.text}
            />
          </dl>

          <div className="mt-8">
            <PackageField directDeps={directDeps} transitiveDeps={transitiveDeps} />
          </div>

          <div className="mt-10 border-t border-rule pt-8">
            <section>
              <div className="flex flex-wrap items-baseline justify-start gap-x-4 gap-y-1">
                <h2 className="statement text-xl text-ink">Cumulative breach probability</h2>
                <span className={EYEBROW}>{formatDays(timePeriodDays)} horizon</span>
              </div>
              <div className="mt-6 pr-1">
                <RiskCurve
                  lines={lines}
                  maxDays={timePeriodDays}
                  layout={CHART_WIDE}
                  className="hidden sm:block"
                  ariaLabel={chartAriaLabel}
                />
                <RiskCurve
                  lines={lines}
                  maxDays={timePeriodDays}
                  layout={CHART_NARROW}
                  className="sm:hidden"
                  ariaLabel={chartAriaLabel}
                />
                <CurveKey lines={lines} />
              </div>
            </section>
          </div>
        </div>

        {/* `overflow-y-auto` also clips horizontally, and the rail's controls sit
            flush with its edges, so the padding keeps focus rings from being cut
            off. The negative margin keeps the content aligned. */}
        <aside className="space-y-9 lg:sticky lg:top-8 lg:-mx-2 lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:overflow-y-auto lg:px-2">
          {/* Sharing the report is the goal of the tool, so the actions sit at
              the top of the rail rather than buried in the report body. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              aria-label={copied ? "Report link copied" : "Copy report link"}
              className="eyebrow inline-flex h-11 items-center justify-center gap-2 border border-rule-strong px-3 text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:h-10"
            >
              {copied ? (
                <>
                  <CheckIcon />
                  Copied
                </>
              ) : (
                <>
                  <LinkIcon />
                  Copy link
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleShareToBluesky}
              aria-label="Share to Bluesky"
              className="eyebrow inline-flex h-11 items-center justify-center gap-2 bg-ink px-3 text-paper transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:h-10"
            >
              <BlueskyIcon />
              Share
            </button>
          </div>
          <section>
            <h2 className="statement text-xl text-ink">Look up a real package&apos;s risk</h2>
            <div className="mt-4 flex flex-col gap-2">
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
                placeholder="Package name (e.g. jest)"
                className={FIELD_INPUT}
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
                placeholder="Version (optional, e.g. 30.4.2)"
                className={FIELD_INPUT}
              />
              <button
                type="button"
                onClick={handleLookup}
                disabled={lookupLoading || !pkgName.trim()}
                className="eyebrow inline-flex h-11 w-full items-center justify-center bg-ink text-paper transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-rule-strong disabled:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:h-10"
              >
                {lookupLoading ? "Looking up…" : "Fetch dependency count"}
              </button>
            </div>
            <output aria-live="polite" className="mt-3 block min-h-[1.5rem]">
              {lookupError && <p className="text-xs font-medium text-levy">Error: {lookupError}</p>}
              {!lookupError && lookupLoading && (lookupTarget || search.pkg) && !lookupResult && (
                <p className="text-xs text-muted">
                  Loading {lookupTarget ?? `${search.pkg}${search.v ? `@${search.v}` : ""}`}…
                </p>
              )}
              {lookupResult && (
                <div className="space-y-1 border-t border-rule pt-3 text-xs leading-5 text-muted">
                  <p className="font-mono font-semibold text-ink">
                    {lookupResult.package}@{lookupResult.version}
                  </p>
                  <p>
                    <span className="figure-num font-semibold text-ink">
                      {lookupResult.totalDeps.toLocaleString()}
                    </span>{" "}
                    total dependencies ({lookupResult.directDeps} direct +{" "}
                    {lookupResult.transitiveDeps.toLocaleString()} transitive)
                  </p>
                  <p>
                    Install size {formatBytes(lookupResult.totalSizeBytes)} · via{" "}
                    <a
                      href={`https://npmx.dev/package/${encodeURIComponent(lookupResult.package)}/v/${encodeURIComponent(lookupResult.version)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-rule-strong underline-offset-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      npmx.dev
                    </a>
                  </p>
                </div>
              )}
            </output>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="statement text-xl text-ink">Tune the model</h2>
              {!scenario.hasExplicitNumbers && <DefaultsHint />}
            </div>
            <div className="mt-5 space-y-6">
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
                // Unlike the counts, this range is fixed, so typed days clamp.
                inputMax={1095}
              />

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={dailyProbInputId} className={EYEBROW}>
                    Daily breach prob / package
                  </label>
                  <ValueField
                    ariaLabel="Exact daily breach probability per package"
                    display={dailyP.toExponential(2)}
                    editValue={dailyP.toExponential(2)}
                    onCommit={handleProbInput}
                  />
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
                  className="h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink sm:h-7"
                />
                <div className="figure-num flex justify-between text-xs text-muted">
                  <span>1e-8 (~0.00037%/yr)</span>
                  <span>1e-3 (~30.6%/yr)</span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="border-t border-rule pt-8">
        <section>
          <details className="group">
            <summary className={SUMMARY}>
              <DisclosureMark />
              <span className="flex items-baseline gap-2">
                <h2 className={`statement text-xl text-ink ${SUMMARY_TITLE}`}>Model notes</h2>
                <span className="text-xs text-muted group-open:hidden">Click to expand</span>
                <span className="hidden text-xs text-muted group-open:inline">
                  Click to collapse
                </span>
              </span>
            </summary>
            <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_270px]">
              <div>
                <div className="max-w-3xl space-y-2.5 text-base leading-6 text-muted">
                  <p>
                    Each package has a daily breach probability <em>p</em>. With{" "}
                    <em className={LEVER_COLOR.n}>n</em> total modeled packages, including{" "}
                    {rootLabel}, the chance that none are breached on a given day is{" "}
                    <code>
                      (1 - p)^
                      <span className={LEVER_COLOR.n}>n</span>
                    </code>
                    .
                  </p>
                  <p>
                    Over <em className={LEVER_COLOR.d}>d</em> days, the chance of staying
                    breach-free is{" "}
                    <code>
                      (1 - p)^(
                      <span className={LEVER_COLOR.n}>n</span> x{" "}
                      <span className={LEVER_COLOR.d}>d</span>)
                    </code>
                    . The model treats package-days as independent events, a flawed but useful
                    simplification.
                  </p>
                  <p>
                    <em>p</em> is really two things multiplied: <PBreach />, the likelihood that a
                    package gets compromised, and <PImpacted />, the likelihood that a compromise
                    affects <strong>you</strong> directly. You can only control the latter.
                  </p>
                </div>
              </div>
              <div className="border-t border-rule pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
                <p className={EYEBROW}>Formula</p>
                <p className="figure-num mt-3 text-sm leading-6 font-semibold text-ink">
                  <span className="whitespace-nowrap">P(breach) =</span>{" "}
                  <span className="whitespace-nowrap">
                    1 - (1 - p)
                    <sup>
                      <span className={LEVER_COLOR.n}>n</span>&nbsp;x&nbsp;
                      <span className={LEVER_COLOR.d}>d</span>
                    </sup>
                  </span>
                </p>
                <p className="figure-num mt-2 text-sm leading-6 font-semibold text-ink">
                  p = <PBreach mono />
                  {" x "}
                  <PImpacted mono />
                </p>
              </div>
            </div>
          </details>
        </section>

        <section className="mt-10 border-t-2 border-ink pt-8">
          <h2 className="statement text-xl text-ink">What can I do about it?</h2>
          <p className="mt-2 max-w-3xl text-base leading-6 text-muted">
            You can&apos;t prevent breaches (decrease <PBreach />
            ). Focus on what you can control:
          </p>
          <ul className="mt-3 max-w-3xl list-none space-y-2 text-base leading-6 text-muted">
            <LeverItem>
              <span className={LEVER_COLOR.n}>Reduce the surface area</span> by removing
              dependencies (decrease <em className={LEVER_COLOR.n}>n</em>).
            </LeverItem>
            <LeverItem>
              <span className={LEVER_COLOR.p}>Reduce the blast radius</span> by defending against
              common breach patterns (decrease <PImpacted />
              ).
            </LeverItem>
            <LeverItem>
              <span className={LEVER_COLOR.d}>Reduce the time window</span> you stay exposed by
              acting sooner (decrease <em className={LEVER_COLOR.d}>d</em>).
            </LeverItem>
          </ul>

          <div className="mt-8 grid gap-8 lg:grid-cols-3 lg:gap-10">
            <Lever title="Fewer packages" input="n">
              <p>
                Every <Mark /> in the visualization is a package that can be compromised, and most
                of them are below the iceberg.
              </p>
              <ul className="list-none space-y-3">
                <LeverItem>
                  <strong className="text-ink">Remove what you don&apos;t use.</strong>{" "}
                  <Outbound href="https://knip.dev">knip</Outbound> finds and removes unused
                  dependencies (and more) adding dead weight and risk. Remove cruft now. Run knip in
                  CI to keep it that way.{" "}
                  <Outbound href="https://github.com/sponsors/webpro">Donate</Outbound> to sustain
                  it.
                </LeverItem>
                <LeverItem>
                  <strong className="text-ink">Slim what you do use.</strong> A dependency that
                  drags in a huge tree adds more risk than one that doesn&apos;t.{" "}
                  <Outbound href="https://e18e.dev">e18e</Outbound> works with maintainers to cut
                  down those trees and foster lean alternatives. Check out their docs, linter, CI
                  reports, CLI, MCP, and more. Upgrade regularly to benefit for free.{" "}
                  <Outbound href="https://opencollective.com/e18e">Donate</Outbound> to sustain the
                  work.
                </LeverItem>
              </ul>
            </Lever>

            <Lever
              title="Fewer open doors"
              input="p"
              className="border-t border-rule pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10"
            >
              <p>A compromised package only matters if it can actually reach you and do damage.</p>
              <ul className="list-none space-y-3">
                <LeverItem>
                  <strong className="text-ink">Turn off install scripts.</strong> Most recent npm
                  attacks fire during install, not at runtime. pnpm 10+, npm 12+, deno, and bun
                  block these by default; use one of these. With npm 11.16+ and yarn 2+ you can opt
                  in. Otherwise, prioritize upgrading your package manager.
                </LeverItem>
                <LeverItem>
                  <strong className="text-ink">Lock down GitHub Actions.</strong> There are too many
                  footguns to list here, and that's the point.{" "}
                  <Outbound href="https://zizmor.sh">zizmor</Outbound> performs static analysis of
                  your GitHub Actions workflows and bans insecure usage. Run it once and fix what it
                  flags. Add it to CI to keep it that way.{" "}
                  <Outbound href="https://github.com/sponsors/woodruffw">Donate</Outbound> to
                  sustain it.
                </LeverItem>
              </ul>
              <details className="group mt-3">
                <summary className={SUMMARY}>
                  <DisclosureMark />
                  <span className="flex items-baseline gap-2">
                    <span className={`font-semibold text-ink ${SUMMARY_TITLE}`}>
                      Two more actions
                    </span>
                    <span className="text-xs text-muted group-open:hidden">Click to expand</span>
                    <span className="hidden text-xs text-muted group-open:inline">
                      Click to collapse
                    </span>
                  </span>
                </summary>
                <ul className="mt-3 list-none space-y-3">
                  <LeverItem>
                    <strong className="text-ink">Let releases age.</strong> Malicious versions are
                    usually pulled within hours, so holding new releases back a short while is a
                    cheap way to reduce risk. pnpm 11+, yarn 4.12+, and deno 2.9+ do this by
                    default; use one of these. With pnpm 10.16+, npm 11.10+, and bun 1.3+ you can
                    opt in. Otherwise, prioritize upgrading your package manager. Renovate and
                    Dependabot can also be configured to delay updates.
                  </LeverItem>
                  <LeverItem>
                    <strong className="text-ink">Block flagged packages ASAP.</strong> Security
                    researchers like Socket and Snyk typically flag malicious releases within{" "}
                    <strong>5 minutes</strong>. Socket{" "}
                    <Outbound href="https://docs.socket.dev/docs/socket-firewall-free">
                      provides a free CLI
                    </Outbound>{" "}
                    that wraps your package manager and blocks flagged packages at install time. Use
                    it in CI and locally.
                  </LeverItem>
                </ul>
              </details>
            </Lever>

            <Lever
              title="Act sooner"
              input="d"
              className="border-t border-rule pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10"
            >
              <p>
                You decide how much time you spend at your current risk level. Every day adds
                cumulative risk.
              </p>
              <ul className="list-none space-y-3">
                <LeverItem>
                  <strong className="text-ink">Take these actions today.</strong> Everything in the
                  other two columns only starts paying off the day you do it. Putting them off
                  doesn&apos;t hold your risk steady; it keeps accruing for every day of{" "}
                  <em className={LEVER_COLOR.d}>d</em> you spend delaying.
                </LeverItem>
              </ul>
            </Lever>
          </div>
        </section>
      </div>
    </div>
  );
}
