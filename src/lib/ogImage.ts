import {
  buildLine,
  formatDays,
  formatModeledPackageCount,
  formatProb,
  getRiskScenario,
  MODELED_ROOT_PACKAGE_COUNT,
} from "./riskModel.ts";
import { parseOgScenarioUrl, type OgVariant } from "./riskSearch.ts";

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

const WHITESPACE_RE = /\s+/;
const TRAILING_ZERO_RE = /\.?0+$/;
export const OG_CHART = {
  x: 86,
  y: 334,
  width: 520,
  height: 104,
};
const LOCAL_CHART = {
  x: 0,
  y: 0,
  width: OG_CHART.width,
  height: OG_CHART.height,
};
const OG_CHART_STEPS = 32;
const GENERIC_OG_DAILY_PROBABILITY = 2.5e-6;
const GENERIC_OG_TIME_PERIOD_DAYS = 365 * 2;

export interface OgChartBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OgColors {
  bg: string;
  panel: string;
  panelStroke: string;
  brand: string;
  eyebrow: string;
  title: string;
  body: string;
  metricLabel: string;
  metricValue: string;
  line: string;
}

export interface OgImageModel {
  variant: OgVariant;
  colors: OgColors;
  badge: string | undefined;
  title: string;
  titleLines: string[];
  bodyLines: string[];
  breachProbability: string;
  expectedTime: string;
  modeledPackages: string;
  chartPath: string;
  chartEnd: { x: number; y: number };
}

export function textLines(value: string, maxChars: number): string[] {
  const words = value.split(WHITESPACE_RE);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatSvgNumber(value: number): string {
  return value.toFixed(2).replace(TRAILING_ZERO_RE, "");
}

function mapOgChartPoint(
  point: { x: number; y: number },
  maxDays: number,
  maxProbability: number,
  bounds: OgChartBounds,
): { x: number; y: number } {
  const safeMaxDays = Math.max(1, maxDays);
  const safeMaxProbability = Math.max(Number.EPSILON, maxProbability);
  return {
    x: bounds.x + (clamp(point.x, 0, safeMaxDays) / safeMaxDays) * bounds.width,
    y: bounds.y + (1 - clamp(point.y, 0, safeMaxProbability) / safeMaxProbability) * bounds.height,
  };
}

export function buildOgChartPath(
  points: { x: number; y: number }[],
  maxDays: number,
  maxProbability: number,
  bounds: OgChartBounds = OG_CHART,
): string {
  return points
    .map((point, index) => {
      const { x, y } = mapOgChartPoint(point, maxDays, maxProbability, bounds);
      const command = index === 0 ? "M" : "L";
      return `${command}${formatSvgNumber(x)},${formatSvgNumber(y)}`;
    })
    .join(" ");
}

function ogColors(variant: OgVariant, isDark: boolean): OgColors {
  if (isDark) {
    return {
      bg: "#020617",
      panel: variant === "package" ? "#042f2e" : variant === "scenario" ? "#2f1118" : "#0f172a",
      panelStroke:
        variant === "package" ? "#0f766e" : variant === "scenario" ? "#9f1239" : "#334155",
      brand: "#f8fafc",
      eyebrow: "#cbd5e1",
      title: "#f8fafc",
      body: "#cbd5e1",
      metricLabel: "#cbd5e1",
      metricValue: "#f8fafc",
      line: "#475569",
    };
  }

  return {
    bg: "#eef2f7",
    panel: variant === "package" ? "#f0fdfa" : variant === "scenario" ? "#fff1f2" : "#f8fafc",
    panelStroke: variant === "package" ? "#99f6e4" : variant === "scenario" ? "#fecdd3" : "#cbd5e1",
    brand: "#0f172a",
    eyebrow: "#334155",
    title: "#111827",
    body: "#334155",
    metricLabel: "#475569",
    metricValue: "#0f172a",
    line: "#cbd5e1",
  };
}

export function buildOgImageModel(url: URL): OgImageModel {
  const { search, theme, variant } = parseOgScenarioUrl(url);
  const scenario = getRiskScenario(search);
  const displayScenario =
    variant === "generic"
      ? getRiskScenario({
          ...search,
          probExp: Math.log10(GENERIC_OG_DAILY_PROBABILITY),
          days: GENERIC_OG_TIME_PERIOD_DAYS,
        })
      : scenario;
  const isPackage = variant === "package" && scenario.packageRef;
  const title = isPackage
    ? `${scenario.packageRef}: ${formatProb(scenario.prob)} modeled compromise probability`
    : variant === "scenario"
      ? `${formatProb(scenario.prob)} modeled chance over ${formatDays(scenario.timePeriodDays)}`
      : "npm supply-chain risk, with receipts.";
  const body =
    variant === "scenario"
      ? `${formatModeledPackageCount(scenario.totalDeps)} over ${formatDays(scenario.timePeriodDays)}, including the project itself, ${scenario.transitiveDeps.toLocaleString()} transitive dependencies, ${formatDays(scenario.expectedDaysToBreach)} expected time.`
      : "Explore how your code, dependency count, breach probability, and time horizon combine into cumulative npm supply-chain risk.";
  const bodyLines = isPackage
    ? [
        `${formatModeledPackageCount(scenario.totalDeps)} over ${formatDays(scenario.timePeriodDays)}`,
        `${MODELED_ROOT_PACKAGE_COUNT.toLocaleString()} self + ${scenario.directDeps.toLocaleString()} direct + ${scenario.transitiveDeps.toLocaleString()} transitive`,
      ]
    : textLines(body, 48);
  const chartMaxProbability = Math.min(
    1,
    Math.max(displayScenario.prob, displayScenario.probDirectOnly) * 1.12,
  );
  const riskLine = buildLine(
    displayScenario.totalDeps,
    displayScenario.dailyP,
    displayScenario.timePeriodDays,
    OG_CHART_STEPS,
  );

  return {
    variant,
    colors: ogColors(variant, theme === "dark"),
    badge:
      variant === "generic" ? undefined : variant === "package" ? "Package report" : "Scenario",
    title,
    titleLines: textLines(title, 28),
    bodyLines,
    breachProbability: formatProb(displayScenario.prob),
    expectedTime: formatDays(displayScenario.expectedDaysToBreach),
    modeledPackages: displayScenario.totalDeps.toLocaleString(),
    chartPath: buildOgChartPath(
      riskLine,
      displayScenario.timePeriodDays,
      chartMaxProbability,
      LOCAL_CHART,
    ),
    chartEnd: mapOgChartPoint(
      riskLine.at(-1) ?? { x: 0, y: 0 },
      displayScenario.timePeriodDays,
      chartMaxProbability,
      LOCAL_CHART,
    ),
  };
}
