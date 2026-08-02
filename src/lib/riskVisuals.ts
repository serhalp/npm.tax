export type RiskTone = "good" | "warning" | "danger";

/** viewBox width the package field is drawn into. Height follows from the rows. */
export const FIELD_SIZE = 900;

/**
 * Target width-to-height ratio for the field. It sits full-width under the
 * verdict, so it reads as a band of marks rather than a square block, and stays
 * shallow enough to leave the curve below it on screen. Only the page uses this
 * default; the OG card passes its own, wider ratio.
 */
export const FIELD_ASPECT = 4.8;

/**
 * Upper bound on drawn marks. Past this the field switches to a stated scale
 * (one mark stands for several packages) rather than emitting tens of
 * thousands of path segments on every slider tick.
 */
export const FIELD_MAX_MARKS = 4096;

/**
 * Floor on grid columns. Without it a handful of packages would each render as
 * an enormous block instead of reading as a small footprint.
 */
export const FIELD_MIN_COLS = 40;

export interface PackageFieldGeometry {
  /** Packages the field stands for, including the root package. */
  totalPackages: number;
  /** Marks actually drawn. Equals totalPackages until the cap kicks in. */
  totalMarks: number;
  /** Packages represented by a single mark. 1 unless the cap kicked in. */
  packagesPerMark: number;
  /** Marks per band. They always sum to `totalMarks`. */
  selfMarks: number;
  directMarks: number;
  transitiveMarks: number;
  cols: number;
  rows: number;
  pitch: number;
  cell: number;
  width: number;
  height: number;
  selfPath: string;
  directPath: string;
  transitivePath: string;
}

export function breachProbabilityTone(probability: number): RiskTone {
  if (probability >= 0.3) return "danger";
  if (probability >= 0.1) return "warning";
  return "good";
}

export function expectedBreachTimeTone(days: number): RiskTone {
  if (days < 18 * 30.44) return "danger";
  if (days <= 5 * 365.25) return "warning";
  return "good";
}

export function expandedSliderMax(value: number, baseMax: number, increment: number): number {
  if (value <= baseMax) return baseMax;
  return Math.ceil(value / increment) * increment;
}

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/** Emit one axis-aligned square subpath per mark, row-major from `start`. */
function marksPath(start: number, end: number, cols: number, pitch: number, cell: number): string {
  const segments: string[] = [];
  for (let i = start; i < end; i++) {
    const x = roundTo((i % cols) * pitch, 2);
    const y = roundTo(Math.floor(i / cols) * pitch, 2);
    segments.push(`M${x} ${y}h${cell}v${cell}h-${cell}z`);
  }
  return segments.join("");
}

/**
 * Lay every modeled package out as one mark on a grid, in three bands: the
 * project or package itself, its direct dependencies, then the transitive tree.
 * The point of the visual is proportion — the first two bands occupy a sliver
 * and the transitive tree fills the rest.
 *
 * `aspect` only sets how many columns the marks are dealt into, so a caller with
 * a much wider box than the page's — the OG card's full-width strip — can get
 * the same marks laid out flatter instead of scaled down.
 */
export function getPackageFieldGeometry(
  rootPackageCount: number,
  directDeps: number,
  transitiveDeps: number,
  aspect: number = FIELD_ASPECT,
): PackageFieldGeometry {
  const selfCount = Math.max(0, Math.round(rootPackageCount));
  const directCount = Math.max(0, Math.round(directDeps));
  const transitiveCount = Math.max(0, Math.round(transitiveDeps));
  const totalPackages = Math.max(1, selfCount + directCount + transitiveCount);

  const packagesPerMark = Math.max(1, Math.ceil(totalPackages / FIELD_MAX_MARKS));
  const totalMarks = Math.max(1, Math.ceil(totalPackages / packagesPerMark));

  // Every non-empty band claims at least one mark, so a single root package
  // stays visible against thousands of transitive ones. Bands are then trimmed
  // from the largest inward so they always sum to exactly `totalMarks`.
  const bands = [selfCount, directCount, transitiveCount].map((count) =>
    count === 0 ? 0 : Math.max(1, Math.round(count / packagesPerMark)),
  );
  let overflow = bands.reduce((sum, marks) => sum + marks, 0) - totalMarks;
  while (overflow > 0) {
    const largest = bands.indexOf(Math.max(...bands));
    if (bands[largest] <= 1) break;
    bands[largest] -= 1;
    overflow -= 1;
  }
  const [selfMarks, directMarks] = bands;
  const transitiveMarks = Math.max(0, totalMarks - selfMarks - directMarks);

  const cols = Math.max(FIELD_MIN_COLS, Math.ceil(Math.sqrt(totalMarks * Math.max(0.01, aspect))));
  const rows = Math.ceil(totalMarks / cols);
  const pitch = FIELD_SIZE / cols;
  const cell = roundTo(Math.max(pitch * 0.66, 0.4), 2);

  return {
    totalPackages,
    totalMarks,
    packagesPerMark,
    selfMarks,
    directMarks,
    transitiveMarks,
    cols,
    rows,
    pitch,
    cell,
    width: FIELD_SIZE,
    height: roundTo(rows * pitch, 2),
    selfPath: marksPath(0, selfMarks, cols, pitch, cell),
    directPath: marksPath(selfMarks, selfMarks + directMarks, cols, pitch, cell),
    transitivePath: marksPath(selfMarks + directMarks, totalMarks, cols, pitch, cell),
  };
}
