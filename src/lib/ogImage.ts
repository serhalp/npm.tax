import {
  buildLine,
  formatDays,
  formatModeledPackageCount,
  formatProb,
  getRiskScenario,
  MODELED_ROOT_PACKAGE_COUNT,
} from "./riskModel.ts";
import { parseOgScenarioUrl } from "./riskSearch.ts";

const WIDTH = 1200;
const HEIGHT = 630;
const WHITESPACE_RE = /\s+/;
const TRAILING_ZERO_RE = /\.?0+$/;
const OG_CHART = {
  x: 86,
  y: 334,
  width: 520,
  height: 104,
};
const OG_CHART_STEPS = 32;
const GENERIC_OG_DAILY_PROBABILITY = 2.5e-6;
const GENERIC_OG_TIME_PERIOD_DAYS = 365 * 2;

interface OgChartBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

export function renderTextLines(
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  className = "title",
): string {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" class="${className}">${escapeXml(line)}</text>`,
    )
    .join("");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSvgNumber(value: number): string {
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

export function renderOgSvg(url: URL): string {
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
  const isScenario = variant === "scenario";
  const isDark = theme === "dark";
  const panelClass = isPackage ? "pkg-panel" : isScenario ? "risk-panel" : "generic-panel";
  const badge = isPackage ? "Package report" : "Scenario";
  const titleY = variant === "generic" ? 190 : 220;
  const bodyY = variant === "generic" ? 492 : 500;
  const colors = isDark
    ? {
        bg: "#020617",
        genericPanel: "#0f172a",
        genericStroke: "#334155",
        riskPanel: "#2f1118",
        riskStroke: "#9f1239",
        pkgPanel: "#042f2e",
        pkgStroke: "#0f766e",
        brand: "#f8fafc",
        eyebrow: "#cbd5e1",
        title: "#f8fafc",
        body: "#cbd5e1",
        metricLabel: "#cbd5e1",
        metricValue: "#f8fafc",
        line: "#475569",
      }
    : {
        bg: "#eef2f7",
        genericPanel: "#f8fafc",
        genericStroke: "#cbd5e1",
        riskPanel: "#fff1f2",
        riskStroke: "#fecdd3",
        pkgPanel: "#f0fdfa",
        pkgStroke: "#99f6e4",
        brand: "#0f172a",
        eyebrow: "#334155",
        title: "#111827",
        body: "#334155",
        metricLabel: "#475569",
        metricValue: "#0f172a",
        line: "#cbd5e1",
      };
  const title = isPackage
    ? `${scenario.packageRef}: ${formatProb(scenario.prob)} modeled compromise probability`
    : isScenario
      ? `${formatProb(scenario.prob)} modeled chance over ${formatDays(scenario.timePeriodDays)}`
      : "npm supply-chain risk, with receipts.";
  const body = isScenario
    ? `${formatModeledPackageCount(scenario.totalDeps)} over ${formatDays(scenario.timePeriodDays)}, including the project itself, ${scenario.transitiveDeps.toLocaleString()} transitive dependencies, ${formatDays(scenario.expectedDaysToBreach)} expected time.`
    : "Explore how your code, dependency count, breach probability, and time horizon combine into cumulative npm supply-chain risk.";
  const bodyLines = isPackage
    ? [
        `${formatModeledPackageCount(scenario.totalDeps)} over ${formatDays(scenario.timePeriodDays)}`,
        `${MODELED_ROOT_PACKAGE_COUNT.toLocaleString()} self + ${scenario.directDeps.toLocaleString()} direct + ${scenario.transitiveDeps.toLocaleString()} transitive`,
      ]
    : textLines(body, 48);
  const eyebrowMarkup =
    variant === "generic" ? "" : `<text x="86" y="160" class="eyebrow">${escapeXml(badge)}</text>`;
  const titleMarkup = renderTextLines(textLines(title, 28), 86, titleY, 58);
  const bodyMarkup = renderTextLines(bodyLines, 86, bodyY, 34, "body");
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
  const riskPath = buildOgChartPath(riskLine, displayScenario.timePeriodDays, chartMaxProbability);
  const riskEnd = mapOgChartPoint(
    riskLine.at(-1) ?? { x: 0, y: 0 },
    displayScenario.timePeriodDays,
    chartMaxProbability,
    OG_CHART,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(title)}">
  <style>
    .bg { fill: ${colors.bg}; }
    .card { rx: 28; }
    .generic-panel { fill: ${colors.genericPanel}; stroke: ${colors.genericStroke}; }
    .risk-panel { fill: ${colors.riskPanel}; stroke: ${colors.riskStroke}; }
    .pkg-panel { fill: ${colors.pkgPanel}; stroke: ${colors.pkgStroke}; }
    .brand { fill: ${colors.brand}; font-family: Menlo, Consolas, monospace; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .eyebrow { fill: ${colors.eyebrow}; font-family: Arial, Helvetica, sans-serif; font-size: 26px; font-weight: 700; }
    .title { fill: ${colors.title}; font-family: Arial, Helvetica, sans-serif; font-size: 50px; font-weight: 700; letter-spacing: -1.6px; }
    .body { fill: ${colors.body}; font-family: Arial, Helvetica, sans-serif; font-size: 28px; font-weight: 500; }
    .metric-label { fill: ${colors.metricLabel}; font-family: Arial, Helvetica, sans-serif; font-size: 22px; font-weight: 650; }
    .metric-value { fill: ${colors.metricValue}; font-family: Arial, Helvetica, sans-serif; font-size: 42px; font-weight: 700; letter-spacing: -0.8px; }
    .line { stroke: ${colors.line}; stroke-width: 2; }
    .spark-risk { stroke: #e11d48; stroke-width: 8; fill: none; stroke-linecap: butt; stroke-linejoin: round; }
    .spark-end { fill: #e11d48; }
    .spark-axis { stroke: ${colors.line}; stroke-width: 2; opacity: 0.72; }
  </style>
  <rect class="bg" width="${WIDTH}" height="${HEIGHT}" />
  <rect x="48" y="42" width="1104" height="546" class="card ${panelClass}" stroke-width="2" />
  <text x="86" y="102" class="brand">npm.tax</text>
  ${eyebrowMarkup}
  ${titleMarkup}
  ${bodyMarkup}
  <line x1="812" y1="132" x2="812" y2="510" class="line" />
  <text x="862" y="170" class="metric-label">Breach probability</text>
  <text x="862" y="222" class="metric-value">${escapeXml(formatProb(displayScenario.prob))}</text>
  <line x1="862" y1="258" x2="1088" y2="258" class="line" />
  <text x="862" y="304" class="metric-label">Expected time</text>
  <text x="862" y="356" class="metric-value">${escapeXml(formatDays(displayScenario.expectedDaysToBreach))}</text>
  <line x1="862" y1="392" x2="1088" y2="392" class="line" />
  <text x="862" y="438" class="metric-label">Modeled packages</text>
  <text x="862" y="490" class="metric-value">${displayScenario.totalDeps.toLocaleString()}</text>
  <line x1="${OG_CHART.x}" y1="${OG_CHART.y}" x2="${OG_CHART.x}" y2="${OG_CHART.y + OG_CHART.height}" class="spark-axis" />
  <line x1="${OG_CHART.x}" y1="${OG_CHART.y + OG_CHART.height}" x2="${OG_CHART.x + OG_CHART.width}" y2="${OG_CHART.y + OG_CHART.height}" class="spark-axis" />
  <path d="${riskPath}" class="spark-risk" />
  <circle cx="${formatSvgNumber(riskEnd.x)}" cy="${formatSvgNumber(riskEnd.y)}" r="4" class="spark-end" />
</svg>`;
}
