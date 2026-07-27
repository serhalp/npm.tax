import {
  buildLine,
  formatDays,
  formatProb,
  getRiskScenario,
  MODELED_ROOT_PACKAGE_COUNT,
} from "./riskModel.ts";
import { parseOgScenarioUrl, type OgVariant } from "./riskSearch.ts";
import {
  breachProbabilityTone,
  expectedBreachTimeTone,
  FIELD_SIZE,
  getPackageFieldGeometry,
  type RiskTone,
} from "./riskVisuals.ts";

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

/**
 * Absolute geometry for the 1200x630 card. Everything is positioned rather than
 * flowed: satori only implements flexbox, and a fixed canvas is easier to
 * reason about as coordinates than as nested boxes.
 */
export const OG_LAYOUT = {
  padX: 64,
  contentWidth: 1072,
  wordmarkTop: 38,
  wordmarkSize: 30,
  chipTop: 40,
  chipSize: 16,
  headRuleTop: 92,
  eyebrowTop: 108,
  eyebrowSize: 17,
  eyebrowRefSize: 20,
  /** The verdict grows upward from its baseline so the field below never moves. */
  verdictBottom: 284,
  verdictMaxLines: 3,
  sectionRuleTop: 296,
  legendTop: 306,
  legendLabelSize: 15,
  legendValueSize: 19,
  /** Hard stop for the legend strip, which sits alone above the field. */
  legendMaxWidth: 1072,
  legendGap: 24,
  fieldTop: 334,
  fieldMaxWidth: 1072,
  /** A guard, not a target: `OG_FIELD_ASPECT` keeps the strip well under it. */
  fieldMaxHeight: 48,
  /** Column header for the curve, level with the top of the ledger. */
  curveLabelTop: 388,
  curveLabelSize: 15,
  ledgerLeft: 744,
  ledgerTop: 388,
  ledgerWidth: 392,
  ledgerRowHeight: 49,
  ledgerLabelSize: 15,
  ledgerValueSize: 23,
  /** Applied to every uppercase condensed label, in px at that label's size. */
  labelTracking: 0.11,
} as const;

/**
 * The cumulative risk curve, in its own coordinate space: the box is placed at
 * `left`/`top` on the card and everything inside it — plot rect, axis labels,
 * end label — is positioned relative to that box.
 */
export const OG_CURVE = {
  left: 64,
  top: 412,
  width: 640,
  height: 172,
  /**
   * Left clears the axis labels. Right is the end-label gutter, wide enough for
   * the longest probability `formatProb` emits.
   */
  padLeft: 44,
  padRight: 104,
  padTop: 10,
  padBottom: 26,
  /** Enough segments that the knee reads as a curve, not a polyline. */
  steps: 72,
  strokeWidth: 2.75,
  axisLabelSize: 12,
  axisLabelBox: 16,
  axisLabelGap: 8,
  endLabelSize: 19,
  endLabelBox: 24,
  endLabelGap: 10,
} as const;

/**
 * Much wider than the page's field: on the card the marks are a full-width strip
 * of supporting texture under the verdict, so they are dealt into many more
 * columns and far fewer rows.
 */
export const OG_FIELD_ASPECT = 32;

const GENERIC_OG_DAILY_PROBABILITY = 2.5e-6;
const GENERIC_OG_TIME_PERIOD_DAYS = 365 * 2;
/** Long enough for any real package ref, short enough to never reach the margin. */
const MAX_REF_CHARS = 44;
const VERDICT_SIZES = [46, 41, 36, 32];
/**
 * Advance widths as a fraction of the font size, measured from rendered output:
 * IBM Plex Mono is exactly 0.6em, Archivo Expanded 700 averages a little under
 * that across mixed-case sentences. Wrapping only needs to be conservative.
 */
const CHAR_EM = { statement: 0.625, mono: 0.6 } as const;
const SPACE_EM = 0.28;

export interface OgColors {
  paper: string;
  ink: string;
  inkFaint: string;
  muted: string;
  rule: string;
  ruleStrong: string;
  levy: string;
  /** Categorical series colours: never red or green, so they imply nothing. */
  seriesA: string;
  seriesAWash: string;
  seriesB: string;
  /** Area fill under the risk curve. Heavier than the page's wash, which all but
   * disappears at the sizes this card is actually looked at. */
  levyWash: string;
  ochre: string;
  moss: string;
}

/** One unbreakable run of the verdict sentence. */
export interface OgSegment {
  text: string;
  mono?: boolean;
  accent?: boolean;
}

export interface OgVerdict {
  fontSize: number;
  lineHeight: number;
  /** Word gap, rendered as a flex gap so runs can change font mid-line. */
  gap: number;
  lines: OgSegment[][];
}

export interface OgLedgerRow {
  label: string;
  value: string;
  color?: string;
}

export interface OgFieldView {
  width: number;
  height: number;
  viewBox: string;
  selfPath: string;
  directPath: string;
  transitivePath: string;
  selfValue: string;
  directValue: string;
  transitiveValue: string;
}

export interface OgCurveView {
  /** Plot rect inside the curve box: the 0-100% band over the whole horizon. */
  plot: { left: number; top: number; width: number; height: number };
  /** Hairlines at 0 / 50 / 100%, as one stroked path. */
  gridPath: string;
  areaPath: string;
  linePath: string;
  yLabels: string[];
  xLabels: string[];
  endLabel: string;
  /** Top of the end-label box, relative to the curve box. */
  endLabelTop: number;
}

export interface OgImageModel {
  variant: OgVariant;
  colors: OgColors;
  accent: string;
  eyebrow: string;
  eyebrowRef: string | undefined;
  severity: { label: string; color: string } | undefined;
  verdict: OgVerdict;
  fieldLabel: string | undefined;
  field: OgFieldView;
  curve: OgCurveView;
  ledger: OgLedgerRow[];
}

const TONE_LABEL: Record<RiskTone, string> = {
  good: "Low",
  warning: "Medium",
  danger: "High",
};

function ogColors(isDark: boolean): OgColors {
  if (isDark) {
    return {
      paper: "#0e100a",
      ink: "#e9ebe0",
      inkFaint: "#e9ebe052",
      muted: "#969c8a",
      rule: "#e9ebe026",
      ruleStrong: "#e9ebe04d",
      levy: "#ea6c55",
      levyWash: "#ea6c5524",
      seriesA: "#a6cdf7",
      seriesAWash: "#a6cdf72e",
      seriesB: "#b18ee0",
      ochre: "#d9a244",
      moss: "#7eb08b",
    };
  }

  return {
    paper: "#eceee8",
    ink: "#14170e",
    inkFaint: "#14170e57",
    muted: "#565c4c",
    rule: "#14170e1f",
    ruleStrong: "#14170e45",
    levy: "#a03222",
    levyWash: "#a0322226",
    seriesA: "#123f68",
    seriesAWash: "#123f6822",
    seriesB: "#7a4cb0",
    ochre: "#7e5a0a",
    moss: "#2f5638",
  };
}

export function toneColor(tone: RiskTone, colors: OgColors): string {
  if (tone === "danger") return colors.levy;
  if (tone === "warning") return colors.ochre;
  return colors.moss;
}

/** Package refs come from the URL, so their length is not bounded by anything. */
export function truncateRef(ref: string, maxChars = MAX_REF_CHARS): string {
  if (ref.length <= maxChars) return ref;
  return `${ref.slice(0, maxChars - 1)}…`;
}

export function estimateSegmentWidth(segment: OgSegment, fontSize: number): number {
  const spaces = segment.text.length - segment.text.replaceAll(" ", "").length;
  const glyphs = segment.text.length - spaces;
  const charEm = segment.mono ? CHAR_EM.mono : CHAR_EM.statement;
  return (glyphs * charEm + spaces * SPACE_EM) * fontSize;
}

export function estimateLineWidth(line: OgSegment[], fontSize: number): number {
  const gaps = Math.max(0, line.length - 1) * SPACE_EM * fontSize;
  return line.reduce((total, segment) => total + estimateSegmentWidth(segment, fontSize), gaps);
}

/**
 * Greedy line breaking over pre-tokenized runs. Satori can wrap text itself,
 * but only within a single text node, and the verdict changes font and colour
 * mid-sentence, so the breaks have to be decided here.
 */
export function wrapSegments(
  segments: OgSegment[],
  maxWidth: number,
  fontSize: number,
): OgSegment[][] {
  const gap = SPACE_EM * fontSize;
  const lines: OgSegment[][] = [];
  let current: OgSegment[] = [];
  let currentWidth = 0;

  for (const segment of segments) {
    const width = estimateSegmentWidth(segment, fontSize);
    if (current.length > 0 && currentWidth + gap + width > maxWidth) {
      lines.push(current);
      current = [segment];
      currentWidth = width;
    } else {
      current.push(segment);
      currentWidth += current.length > 1 ? gap + width : width;
    }
  }

  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Step the verdict down through the size ramp until it fits its line budget and
 * no line runs past the margin. A single run wider than the column — a long
 * scoped package ref — cannot be broken, so only a smaller size fixes it.
 */
export function fitVerdict(
  segments: OgSegment[],
  maxWidth: number,
  maxLines: number = OG_LAYOUT.verdictMaxLines,
): OgVerdict {
  let lines: OgSegment[][] = [];
  let fontSize = VERDICT_SIZES.at(-1) ?? 36;

  for (const size of VERDICT_SIZES) {
    fontSize = size;
    lines = wrapSegments(segments, maxWidth, size);
    const fits =
      lines.length <= maxLines && lines.every((line) => estimateLineWidth(line, size) <= maxWidth);
    if (fits) break;
  }

  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.07),
    gap: Math.round(SPACE_EM * fontSize),
    lines: lines.slice(0, maxLines),
  };
}

function words(text: string): OgSegment[] {
  return text.split(" ").map((word) => ({ text: word }));
}

function verdictSegments(
  variant: OgVariant,
  ref: string | null,
  probability: string,
  horizon: string,
): OgSegment[] {
  if (variant === "generic") {
    return words("Model the supply-chain risk hiding in an npm dependency tree.");
  }

  const opening: OgSegment[] =
    ref === null
      ? words("This scenario has a")
      : [{ text: truncateRef(ref), mono: true }, ...words("has a")];

  return [
    ...opening,
    { text: probability, accent: true },
    ...words("modeled chance of at least one package compromise in"),
    // Kept whole so the horizon never breaks across lines.
    { text: `${horizon}.` },
  ];
}

/** Scale the package field to the widest band that still clears the card. */
export function getOgFieldBox(
  geometryHeight: number,
  maxWidth: number = OG_LAYOUT.fieldMaxWidth,
  maxHeight: number = OG_LAYOUT.fieldMaxHeight,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / FIELD_SIZE, maxHeight / Math.max(1, geometryHeight));
  return {
    width: Math.round(FIELD_SIZE * scale),
    height: Math.round(geometryHeight * scale),
  };
}

/** Two decimals is well past what a 1200px canvas can resolve. */
export function formatSvgNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The cumulative risk curve, on a fixed 0-100% y-axis. The axis is deliberately
 * not fitted to the data: scenarios stay comparable card to card, and a tiny
 * probability is supposed to look tiny.
 */
export function buildOgCurve(
  points: { x: number; y: number }[],
  maxDays: number,
  endLabel: string,
): OgCurveView {
  const plot = {
    left: OG_CURVE.padLeft,
    top: OG_CURVE.padTop,
    width: OG_CURVE.width - OG_CURVE.padLeft - OG_CURVE.padRight,
    height: OG_CURVE.height - OG_CURVE.padTop - OG_CURVE.padBottom,
  };
  const right = plot.left + plot.width;
  const bottom = plot.top + plot.height;
  const span = Math.max(1, maxDays);
  const toX = (day: number) => plot.left + Math.min(1, Math.max(0, day / span)) * plot.width;
  const toY = (probability: number) =>
    plot.top + (1 - Math.min(1, Math.max(0, probability))) * plot.height;

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${formatSvgNumber(toX(point.x))} ${formatSvgNumber(toY(point.y))}`,
    )
    .join("");
  const lastY = toY(points.at(-1)?.y ?? 0);
  // Keep the label inside the plot even when the curve pins to the ceiling.
  const anchorY = Math.min(bottom - 6, Math.max(plot.top + 6, lastY));

  return {
    plot,
    gridPath: [plot.top, plot.top + plot.height / 2, bottom]
      .map((y) => `M${plot.left} ${formatSvgNumber(y)}H${right}`)
      .join(""),
    areaPath:
      linePath === ""
        ? ""
        : `${linePath}L${formatSvgNumber(right)} ${formatSvgNumber(bottom)}L${formatSvgNumber(plot.left)} ${formatSvgNumber(bottom)}Z`,
    linePath,
    yLabels: ["100%", "50%", "0%"],
    // Deduped so a one-day horizon does not print its midpoint and its end twice.
    xLabels: Array.from(new Set([0, Math.round(span / 2), span]), (day) => `${day}d`),
    endLabel,
    endLabelTop: Math.round(anchorY - OG_CURVE.endLabelBox / 2),
  };
}

export function buildOgImageModel(url: URL): OgImageModel {
  const { search, theme, variant } = parseOgScenarioUrl(url);
  const scenario =
    variant === "generic"
      ? getRiskScenario({
          ...search,
          probExp: Math.log10(GENERIC_OG_DAILY_PROBABILITY),
          days: GENERIC_OG_TIME_PERIOD_DAYS,
        })
      : getRiskScenario(search);
  const colors = ogColors(theme === "dark");
  const breachTone = breachProbabilityTone(scenario.prob);
  const accent = toneColor(breachTone, colors);
  const geometry = getPackageFieldGeometry(
    MODELED_ROOT_PACKAGE_COUNT,
    scenario.directDeps,
    scenario.transitiveDeps,
    OG_FIELD_ASPECT,
  );
  const box = getOgFieldBox(geometry.height);

  return {
    variant,
    colors,
    accent,
    eyebrow:
      variant === "package"
        ? "Package report for"
        : variant === "scenario"
          ? "Scenario"
          : "npm supply-chain risk / example project",
    eyebrowRef:
      variant === "package" && scenario.packageRef ? truncateRef(scenario.packageRef) : undefined,
    // The generic card describes the tool, not a graph anyone asked about, so
    // there is nothing to assess.
    severity:
      variant === "generic"
        ? undefined
        : { label: `Assessed ${TONE_LABEL[breachTone]}`, color: accent },
    verdict: fitVerdict(
      verdictSegments(
        variant,
        variant === "package" ? scenario.packageRef : null,
        formatProb(scenario.prob),
        formatDays(scenario.timePeriodDays),
      ),
      OG_LAYOUT.contentWidth,
    ),
    // Once a mark stands for several packages, saying so *is* the field's
    // label: it is the only place the scale can be stated without crowding the
    // band into the ledger.
    fieldLabel:
      geometry.packagesPerMark > 1
        ? `1 mark = ${geometry.packagesPerMark.toLocaleString()} packages`
        : undefined,
    field: {
      width: box.width,
      height: box.height,
      viewBox: `0 0 ${FIELD_SIZE} ${geometry.height}`,
      selfPath: geometry.selfPath,
      directPath: geometry.directPath,
      transitivePath: geometry.transitivePath,
      selfValue: MODELED_ROOT_PACKAGE_COUNT.toLocaleString(),
      directValue: scenario.directDeps.toLocaleString(),
      transitiveValue: scenario.transitiveDeps.toLocaleString(),
    },
    curve: buildOgCurve(
      buildLine(scenario.totalDeps, scenario.dailyP, scenario.timePeriodDays, OG_CURVE.steps),
      scenario.timePeriodDays,
      formatProb(scenario.prob),
    ),
    ledger: [
      { label: "Modeled surface", value: scenario.totalDeps.toLocaleString() },
      { label: "Daily breach / pkg", value: scenario.dailyP.toExponential(2) },
      { label: "Time period", value: formatDays(scenario.timePeriodDays) },
      {
        // Shorter than the page's "expected time to breach": the ledger column
        // has to hold values as long as "273,973 years" without crowding.
        label: "Time to breach",
        value: formatDays(scenario.expectedDaysToBreach),
        color: toneColor(expectedBreachTimeTone(scenario.expectedDaysToBreach), colors),
      },
    ],
  };
}
