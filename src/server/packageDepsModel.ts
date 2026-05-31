import { valid } from "semver";

// Result of looking up a real npm package's dependency footprint.
export interface PackageDepsResult {
  package: string;
  version: string;
  totalDeps: number;
  directDeps: number;
  transitiveDeps: number;
  totalSizeBytes: number;
}

// npmx returns the fully-resolved (flattened, transitive) install tree.
export interface InstallSizeResponse {
  package?: string;
  version?: string;
  selfSize?: number;
  totalSize?: number;
  dependencyCount?: number;
  dependencies?: unknown;
}

// Unpinned (dist-tag/range/no version) lookups are re-validated after this
// window. Pinned (name@exact-semver-version) lookups are immutable and never
// expire.
export const LATEST_PACKAGE_DEPS_TTL_SECONDS = 6 * 60 * 60;
export const PINNED_PACKAGE_DEPS_TTL_SECONDS = 365 * 24 * 60 * 60;

const PACKAGE_DEPS_CACHE_TAG = "package-deps";
const PACKAGE_DEPS_CACHE_KEY_ORIGIN = "https://npm.tax";
const VALID_PACKAGE_NAME_RE = /^(@[a-z0-9-._~]+\/)?[a-z0-9-._~]+$/i;

// Encode each path segment so scoped names like "@scope/name" survive the URL.
export function encodePackageNamePath(name: string): string {
  return name
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/** Allow scoped (@a/b), plain names, dots, and dashes; reject obvious junk. */
export function isValidPackageName(name: string): boolean {
  return VALID_PACKAGE_NAME_RE.test(name);
}

export function isPinnedPackageVersion(version: string | undefined): boolean {
  return typeof version === "string" && valid(version) !== null;
}

export function getPackageDepsCacheRequestUrl(name: string, version?: string): string {
  const url = new URL("/__cache/package-deps", PACKAGE_DEPS_CACHE_KEY_ORIGIN);
  url.searchParams.set("name", name);
  url.searchParams.set("version", version ?? "latest");
  return url.toString();
}

export function packageDepsInternalCacheHeaders(pinned: boolean): Record<string, string> {
  const ttl = pinned ? PINNED_PACKAGE_DEPS_TTL_SECONDS : LATEST_PACKAGE_DEPS_TTL_SECONDS;

  return {
    "Cache-Control": `public, max-age=${ttl}${pinned ? ", immutable" : ""}`,
    "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${ttl}${pinned ? ", immutable" : ""}`,
    "Netlify-Cache-ID": PACKAGE_DEPS_CACHE_TAG,
    "Netlify-Cache-Tag": PACKAGE_DEPS_CACHE_TAG,
  };
}

export function hasUsableInstallSizeResponse(
  value: unknown,
): value is InstallSizeResponse & { version: string; dependencyCount: number } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as InstallSizeResponse).version === "string" &&
    Number.isFinite((value as InstallSizeResponse).dependencyCount)
  );
}

export function normalizeDependencyCounts(
  dependencyCount: unknown,
  directDependencyCount: unknown,
): Pick<PackageDepsResult, "totalDeps" | "directDeps" | "transitiveDeps"> {
  const totalDeps = normalizeNonNegativeNumber(dependencyCount);
  const directDeps = Math.min(normalizeNonNegativeNumber(directDependencyCount), totalDeps);

  return {
    totalDeps,
    directDeps,
    transitiveDeps: Math.max(0, totalDeps - directDeps),
  };
}

export function buildPackageDepsResult({
  requestedName,
  requestedVersion,
  sizeData,
  directDependencyCount,
}: {
  requestedName: string;
  requestedVersion?: string;
  sizeData: InstallSizeResponse;
  directDependencyCount: unknown;
}): PackageDepsResult {
  const resolvedVersion =
    typeof sizeData.version === "string" ? sizeData.version : (requestedVersion ?? "latest");
  const counts = normalizeDependencyCounts(sizeData.dependencyCount, directDependencyCount);

  return {
    package: sizeData.package ?? requestedName,
    version: resolvedVersion,
    ...counts,
    totalSizeBytes: normalizeNonNegativeNumber(sizeData.totalSize),
  };
}

function normalizeNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
