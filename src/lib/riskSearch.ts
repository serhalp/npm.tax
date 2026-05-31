import { getRiskScenario, type RiskScenario, type RiskSearch } from "./riskModel.ts";

export type OgVariant = "generic" | "scenario" | "package";
export type OgTheme = "dark" | "light";

export const OG_IMAGE_VERSION = "2";
export const DEFAULT_OG_THEME = "dark" satisfies OgTheme;

const PROB_EXP_MIN = -8;
const PROB_EXP_MAX = -3;
const DAYS_MIN = 1;
const DAYS_MAX = 1095;

function asNumberInRange(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

function asDependencyCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.max(0, Math.round(n));
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseRiskSearchRecord(search: Record<string, unknown>): RiskSearch {
  return {
    direct: asDependencyCount(search.direct),
    transitive: asDependencyCount(search.transitive),
    probExp: asNumberInRange(search.probExp, PROB_EXP_MIN, PROB_EXP_MAX),
    days: asNumberInRange(search.days, DAYS_MIN, DAYS_MAX),
    pkg: asString(search.pkg),
    v: asString(search.v),
  };
}

export function parseRiskSearchParams(params: URLSearchParams): RiskSearch {
  return parseRiskSearchRecord({
    direct: params.get("direct"),
    transitive: params.get("transitive"),
    probExp: params.get("probExp"),
    days: params.get("days"),
    pkg: params.get("pkg"),
    v: params.get("v"),
  });
}

export function parseOgTheme(value: unknown): OgTheme {
  return value === "light" ? "light" : DEFAULT_OG_THEME;
}

export function parseOgScenarioUrl(url: URL): {
  search: RiskSearch;
  theme: OgTheme;
  variant: OgVariant;
} {
  const search = parseRiskSearchParams(url.searchParams);
  return {
    search,
    theme: parseOgTheme(url.searchParams.get("theme")),
    variant: getOgVariant(getRiskScenario(search)),
  };
}

function getOgVariant(scenario: RiskScenario): OgVariant {
  if (scenario.isDefaultScenario) return "generic";
  return scenario.packageRef ? "package" : "scenario";
}

function buildScenarioParams(search: RiskSearch, scenario: RiskScenario): URLSearchParams {
  return new URLSearchParams({
    direct: String(scenario.directDeps),
    transitive: String(scenario.transitiveDeps),
    probExp: String(scenario.dailyProbExp),
    days: String(scenario.timePeriodDays),
    ...(search.pkg ? { pkg: search.pkg } : {}),
    ...(search.v ? { v: search.v } : {}),
  });
}

export function buildRiskScenarioUrls(
  search: RiskSearch,
  currentUrl: URL,
  options: { ogTheme?: OgTheme; ogVersion?: string } = {},
): { pageUrl: string; ogImageUrl: string; variant: OgVariant } {
  const ogVersion = options.ogVersion ?? OG_IMAGE_VERSION;
  const ogTheme = options.ogTheme ?? DEFAULT_OG_THEME;
  const scenario = getRiskScenario(search);
  const variant = getOgVariant(scenario);
  const scenarioParams = buildScenarioParams(search, scenario);
  const imageParams = scenario.isDefaultScenario
    ? new URLSearchParams()
    : new URLSearchParams(scenarioParams);
  const pageUrl = new URL("/", currentUrl);
  const ogImageUrl = new URL("/api/og", currentUrl);

  imageParams.set("ogv", ogVersion);
  imageParams.set("theme", ogTheme);
  pageUrl.search = scenario.isDefaultScenario ? "" : scenarioParams.toString();
  ogImageUrl.search = imageParams.toString();

  return {
    pageUrl: scenario.isDefaultScenario ? pageUrl.origin : pageUrl.toString(),
    ogImageUrl: ogImageUrl.toString(),
    variant,
  };
}
