export type RiskTone = "good" | "warning" | "danger";

export interface DependencyIcebergGeometry {
  totalExternalDeps: number;
  directShare: number;
  splitY: number;
  splitHalfWidth: number;
  directPoints: [number, number][];
  transitivePoints: [number, number][];
}

const ICEBERG_TOP_Y = 8;
const ICEBERG_BOTTOM_Y = 160;
const ICEBERG_CENTER_X = 120;
const ICEBERG_TOP_HALF_WIDTH = 94;
const ICEBERG_MIN_SPLIT_OFFSET = 24;
const ICEBERG_MAX_SPLIT_OFFSET = 76;

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

export function getDependencyIcebergGeometry(
  directDeps: number,
  transitiveDeps: number,
): DependencyIcebergGeometry {
  const normalizedDirectDeps = Math.max(0, directDeps);
  const normalizedTransitiveDeps = Math.max(0, transitiveDeps);
  const totalExternalDeps = normalizedDirectDeps + normalizedTransitiveDeps;
  const directShare = totalExternalDeps > 0 ? normalizedDirectDeps / totalExternalDeps : 0;
  const height = ICEBERG_BOTTOM_Y - ICEBERG_TOP_Y;
  const splitY =
    ICEBERG_TOP_Y +
    Math.max(
      ICEBERG_MIN_SPLIT_OFFSET,
      Math.min(ICEBERG_MAX_SPLIT_OFFSET, height * Math.sqrt(directShare)),
    );
  const splitHalfWidth = ICEBERG_TOP_HALF_WIDTH * (1 - (splitY - ICEBERG_TOP_Y) / height);

  return {
    totalExternalDeps,
    directShare,
    splitY,
    splitHalfWidth,
    directPoints: [
      [ICEBERG_CENTER_X - ICEBERG_TOP_HALF_WIDTH, ICEBERG_TOP_Y],
      [ICEBERG_CENTER_X + ICEBERG_TOP_HALF_WIDTH, ICEBERG_TOP_Y],
      [ICEBERG_CENTER_X + splitHalfWidth, splitY],
      [ICEBERG_CENTER_X - splitHalfWidth, splitY],
    ],
    transitivePoints: [
      [ICEBERG_CENTER_X - splitHalfWidth, splitY],
      [ICEBERG_CENTER_X + splitHalfWidth, splitY],
      [ICEBERG_CENTER_X, ICEBERG_BOTTOM_Y],
    ],
  };
}

export function toSvgPoints(points: [number, number][]): string {
  return points.map((point) => point.join(",")).join(" ");
}
