import {
  buildPackageDepsResult,
  encodePackageNamePath,
  getPackageDepsCacheRequestUrl,
  hasUsableInstallSizeResponse,
  packageDepsInternalCacheHeaders,
  isValidPackageName,
  isPinnedPackageVersion,
  type InstallSizeResponse,
  type PackageDepsResult,
} from "./packageDepsModel";

export { isValidPackageName };
export type { PackageDepsResult };

const CACHE_API_NAME = "package-deps";

/** Thrown when an upstream lookup fails; carries an HTTP status for the API route. */
export class PackageLookupError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "PackageLookupError";
    this.status = status;
  }
}

/**
 * Fetch a package's dependency footprint from the npmx install-size API.
 *
 * Runs server-side because that endpoint does not send CORS headers, so a
 * browser fetch would be blocked. The npmx response only exposes the total
 * (flattened, transitive) count, so we additionally read the package manifest
 * from the npm registry to split that total into direct vs. transitive — the
 * distinction the visualization is built around.
 */
async function fetchFromUpstream(name: string, version?: string): Promise<PackageDepsResult> {
  const base = "https://npmx.dev/api/registry/install-size";
  const url = version
    ? `${base}/${encodePackageNamePath(name)}/v/${encodeURIComponent(version)}`
    : `${base}/${encodePackageNamePath(name)}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    throw new PackageLookupError("Could not reach the npmx install-size service.");
  }
  if (!res.ok) {
    const suffix = version ? `@${version}` : "";
    throw new PackageLookupError(
      `Could not look up "${name}${suffix}" (npmx returned ${res.status}).`,
      res.status === 404 ? 404 : 502,
    );
  }

  const sizeData = (await res.json()) as InstallSizeResponse;
  if (!hasUsableInstallSizeResponse(sizeData)) {
    const suffix = version ? `@${version}` : "";
    throw new PackageLookupError(`Could not look up "${name}${suffix}".`, 404);
  }

  // Best-effort: derive the direct dependency count from the registry
  // manifest. If this fails we still return a valid total.
  let directDeps = 0;
  try {
    const manifestRes = await fetch(
      `https://registry.npmjs.org/${encodePackageNamePath(name)}/${encodeURIComponent(sizeData.version)}`,
      { headers: { accept: "application/json" } },
    );
    if (manifestRes.ok) {
      const manifest = (await manifestRes.json()) as {
        dependencies?: Record<string, string>;
      };
      directDeps = manifest.dependencies ? Object.keys(manifest.dependencies).length : 0;
    }
  } catch {
    // Ignore — the total count is the important figure.
  }

  return buildPackageDepsResult({
    requestedName: name,
    requestedVersion: version,
    sizeData,
    directDependencyCount: directDeps,
  });
}

async function getCacheApi(): Promise<Cache | null> {
  if (!globalThis.caches) {
    console.error("Package deps Cache API is unavailable; proceeding without cache.");
    return null;
  }

  try {
    return await globalThis.caches.open(CACHE_API_NAME);
  } catch (err) {
    console.error("Could not initialize package deps Cache API; proceeding without it.", err);
    return null;
  }
}

async function readFromCacheApi(
  cache: Cache | null,
  request: Request,
): Promise<PackageDepsResult | null> {
  if (!cache) return null;

  try {
    const cached = await cache.match(request);
    if (!cached) return null;
    return (await cached.json()) as PackageDepsResult;
  } catch (err) {
    console.error(
      "Could not read from package deps Cache API; proceeding with a fresh lookup.",
      err,
    );
    return null;
  }
}

async function writeToCacheApi(
  cache: Cache | null,
  name: string,
  version: string | undefined,
  result: PackageDepsResult,
): Promise<void> {
  if (!cache) return;

  const pinned = isPinnedPackageVersion(version);
  const request = new Request(getPackageDepsCacheRequestUrl(name, version));
  const response = Response.json(result, {
    headers: packageDepsInternalCacheHeaders(pinned),
  });

  try {
    await cache.put(request, response);
  } catch (err) {
    console.error("Could not write to package deps Cache API; future lookups may be slower.", err);
  }
}

export interface LookupOutcome {
  result: PackageDepsResult;
  /** True when an exact semver version was requested — the result is immutable. */
  pinned: boolean;
  /** True when the result was served from a server-side lookup cache. */
  cacheHit: boolean;
}

/**
 * Look up a package's dependency footprint, backed by Netlify's Cache API.
 * Because results are immutable for a given name@exact-version, a cache hit is
 * returned without ever touching the upstream services. Dist-tags, ranges, and
 * no-version lookups are revalidated after a short window.
 */
export async function lookupPackageDeps(name: string, version?: string): Promise<LookupOutcome> {
  const pinned = isPinnedPackageVersion(version);
  const cacheApi = await getCacheApi();
  const cacheRequest = new Request(getPackageDepsCacheRequestUrl(name, version));

  const cached = await readFromCacheApi(cacheApi, cacheRequest);
  if (cached) return { result: cached, pinned, cacheHit: true };

  const result = await fetchFromUpstream(name, version);

  await writeToCacheApi(cacheApi, name, version, result);
  // Also store under the resolved pinned version so a later pinned lookup
  // of the same version is an immediate, immutable cache hit.
  if (!pinned && result.version) {
    await writeToCacheApi(cacheApi, name, result.version, result);
  }

  return { result, pinned, cacheHit: false };
}
