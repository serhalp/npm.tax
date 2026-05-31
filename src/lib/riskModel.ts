export const DEFAULTS = {
  direct: 23,
  transitive: 848,
  probExp: -5.85,
  days: 365,
};

export const MODELED_ROOT_PACKAGE_COUNT = 1;

const TRAILING_ZERO_DECIMAL_RE = /\.?0+$/;

export interface RiskSearch {
  direct?: number;
  transitive?: number;
  probExp?: number;
  days?: number;
  pkg?: string;
  v?: string;
}

export interface RiskScenario {
  directDeps: number;
  transitiveDeps: number;
  dailyProbExp: number;
  timePeriodDays: number;
  dailyP: number;
  totalDeps: number;
  prob: number;
  probDirectOnly: number;
  hiddenRisk: number;
  expectedDaysToBreach: number;
  packageRef: string | null;
  hasPackageVersion: boolean;
  hasExplicitNumbers: boolean;
  isDefaultScenario: boolean;
}

function trimFixedPercent(percent: number, fractionDigits: number): string {
  return percent.toFixed(fractionDigits).replace(TRAILING_ZERO_DECIMAL_RE, "");
}

export function formatProb(p: number): string {
  if (p >= 0.9999) return ">99.99%";

  const percent = p * 100;
  if (percent >= 1) return `${trimFixedPercent(percent, 2)}%`;
  if (percent >= 0.1) return `${trimFixedPercent(percent, 3)}%`;
  if (percent >= 0.01) return `${trimFixedPercent(percent, 4)}%`;
  if (percent >= 0.001) return `${trimFixedPercent(percent, 5)}%`;
  if (percent >= 0.000001) return `${trimFixedPercent(percent, 6)}%`;
  return "<0.000001%";
}

function roundedValue(value: number, maxFractionDigits: number): number {
  const scale = 10 ** maxFractionDigits;
  return Math.round(value * scale) / scale;
}

function formatQuantity(value: number, maxFractionDigits: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

function formatDurationUnit(value: number, singular: string, plural = `${singular}s`): string {
  const maxFractionDigits = value < 10 ? 1 : 0;
  const rounded = roundedValue(value, maxFractionDigits);
  return `${formatQuantity(rounded, maxFractionDigits)} ${rounded === 1 ? singular : plural}`;
}

export function formatDays(d: number): string {
  if (!Number.isFinite(d)) return "never";
  if (d < 1) return formatDurationUnit(d * 24, "hour");
  if (d < 60) return formatDurationUnit(d, "day");
  if (d < 365) return formatDurationUnit(d / 30, "month");
  return formatDurationUnit(d / 365, "year");
}

export function formatTimeSliderValue(v: number): string {
  if (v < 60) return `${v}d`;
  if (v < 365) return `${formatQuantity(roundedValue(v / 30, 1), 1)}mo`;
  return `${formatQuantity(roundedValue(v / 365, 1), 1)}yr`;
}

export function formatPackageCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "package" : "packages"}`;
}

export function formatModeledPackageCount(count: number): string {
  return `${count.toLocaleString()} modeled ${count === 1 ? "package" : "packages"}`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function breachProb(totalDeps: number, dailyP: number, days: number): number {
  if (totalDeps <= 0 || dailyP <= 0 || days <= 0) return 0;
  if (dailyP >= 1) return 1;
  return -Math.expm1(totalDeps * days * Math.log1p(-dailyP));
}

export function expectedDaysToBreach(totalDeps: number, dailyP: number): number {
  if (totalDeps <= 0 || dailyP <= 0) return Infinity;
  if (dailyP >= 1) return 1;
  const dailyBreachProb = -Math.expm1(totalDeps * Math.log1p(-dailyP));
  if (dailyBreachProb === 0) return Infinity;
  return 1 / dailyBreachProb;
}

export function buildLine(
  totalDeps: number,
  dailyP: number,
  maxDays: number,
  steps: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = (maxDays * i) / steps;
    points.push({ x: d, y: breachProb(totalDeps, dailyP, d) });
  }
  return points;
}

export function getPackageRef(search: Pick<RiskSearch, "pkg" | "v">): string | null {
  if (!search.pkg) return null;
  return search.v ? `${search.pkg}@${search.v}` : search.pkg;
}

export function getRiskScenario(search: RiskSearch): RiskScenario {
  const directDeps = search.direct ?? DEFAULTS.direct;
  const transitiveDeps = search.transitive ?? DEFAULTS.transitive;
  const dailyProbExp = search.probExp ?? DEFAULTS.probExp;
  const timePeriodDays = search.days ?? DEFAULTS.days;
  const dailyP = Math.pow(10, dailyProbExp);
  const totalDeps = MODELED_ROOT_PACKAGE_COUNT + directDeps + transitiveDeps;
  const prob = breachProb(totalDeps, dailyP, timePeriodDays);
  const probDirectOnly = breachProb(
    MODELED_ROOT_PACKAGE_COUNT + directDeps,
    dailyP,
    timePeriodDays,
  );
  const packageRef = getPackageRef(search);

  return {
    directDeps,
    transitiveDeps,
    dailyProbExp,
    timePeriodDays,
    dailyP,
    totalDeps,
    prob,
    probDirectOnly,
    hiddenRisk: prob - probDirectOnly,
    expectedDaysToBreach: expectedDaysToBreach(totalDeps, dailyP),
    packageRef,
    hasPackageVersion: Boolean(search.pkg && search.v),
    hasExplicitNumbers:
      search.direct !== undefined ||
      search.transitive !== undefined ||
      search.probExp !== undefined ||
      search.days !== undefined,
    isDefaultScenario:
      !search.pkg &&
      search.direct === undefined &&
      search.transitive === undefined &&
      search.probExp === undefined &&
      search.days === undefined,
  };
}

export function getScenarioTitle(scenario: RiskScenario): string {
  if (scenario.hasPackageVersion && scenario.packageRef) {
    return `${scenario.packageRef}: ${formatProb(scenario.prob)} modeled compromise probability`;
  }
  if (scenario.packageRef) {
    return `${scenario.packageRef}: npm supply-chain risk model`;
  }
  if (scenario.hasExplicitNumbers) {
    return `npm risk scenario: ${formatProb(scenario.prob)} over ${formatDays(scenario.timePeriodDays)}`;
  }
  return "npm.tax: npm supply-chain risk explorer";
}

export function getScenarioDescription(scenario: RiskScenario): string {
  if (scenario.hasPackageVersion && scenario.packageRef) {
    return `${scenario.packageRef} has ${formatModeledPackageCount(scenario.totalDeps)}, including itself, and ${formatProb(scenario.prob)} breach probability over ${formatDays(scenario.timePeriodDays)}.`;
  }
  if (scenario.packageRef) {
    return `${scenario.packageRef} risk scenario with ${formatModeledPackageCount(scenario.totalDeps)}, including itself, and ${formatProb(scenario.prob)} breach probability over ${formatDays(scenario.timePeriodDays)}.`;
  }
  if (scenario.hasExplicitNumbers) {
    return `An npm dependency-risk scenario with ${formatModeledPackageCount(scenario.totalDeps)}, including the project itself, ${formatProb(scenario.prob)} breach probability, and a ${formatDays(scenario.timePeriodDays)} horizon.`;
  }
  return "Explore how your code, npm dependency count, breach probability, and time horizon combine into cumulative supply-chain risk.";
}
