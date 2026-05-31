import { getStore } from '@netlify/blobs'

// Result of looking up a real npm package's dependency footprint.
export interface PackageDepsResult {
  package: string
  version: string
  totalDeps: number
  directDeps: number
  transitiveDeps: number
  totalSizeBytes: number
}

// npmx returns the fully-resolved (flattened, transitive) install tree.
interface InstallSizeResponse {
  package: string
  version: string
  selfSize: number
  totalSize: number
  dependencyCount: number
  dependencies: { name: string; version: string; size: number }[]
}

// Envelope persisted in Netlify Blobs. `cachedAt` lets us revalidate
// unpinned ("latest") lookups, which are the only results that can change.
interface CachedEntry {
  result: PackageDepsResult
  cachedAt: number
}

const STORE_NAME = 'package-deps-cache'
// Unpinned ("latest") lookups are re-validated after this window. Pinned
// (name@version) lookups are immutable and never expire.
const LATEST_TTL_MS = 6 * 60 * 60 * 1000

/** Thrown when an upstream lookup fails; carries an HTTP status for the API route. */
export class PackageLookupError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'PackageLookupError'
    this.status = status
  }
}

// Encode each path segment so scoped names like "@scope/name" survive the URL.
function encodeName(name: string): string {
  return name
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

/** Allow scoped (@a/b), plain names, dots, dashes — reject obvious junk. */
export function isValidPackageName(name: string): boolean {
  return /^(@[a-z0-9-._~]+\/)?[a-z0-9-._~]+$/i.test(name)
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
async function fetchFromUpstream(
  name: string,
  version?: string,
): Promise<PackageDepsResult> {
  const base = 'https://npmx.dev/api/registry/install-size'
  const url = version
    ? `${base}/${encodeName(name)}/v/${encodeURIComponent(version)}`
    : `${base}/${encodeName(name)}`

  let res: Response
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } })
  } catch {
    throw new PackageLookupError(
      'Could not reach the npmx install-size service.',
    )
  }
  if (!res.ok) {
    const suffix = version ? `@${version}` : ''
    throw new PackageLookupError(
      `Could not look up "${name}${suffix}" (npmx returned ${res.status}).`,
      res.status === 404 ? 404 : 502,
    )
  }

  const sizeData = (await res.json()) as InstallSizeResponse
  const resolvedVersion = sizeData.version ?? version ?? 'latest'
  const totalDeps = Math.max(0, sizeData.dependencyCount ?? 0)

  // Best-effort: derive the direct dependency count from the registry
  // manifest. If this fails we still return a valid total.
  let directDeps = 0
  try {
    const manifestRes = await fetch(
      `https://registry.npmjs.org/${encodeName(name)}/${encodeURIComponent(
        resolvedVersion,
      )}`,
      { headers: { accept: 'application/json' } },
    )
    if (manifestRes.ok) {
      const manifest = (await manifestRes.json()) as {
        dependencies?: Record<string, string>
      }
      directDeps = manifest.dependencies
        ? Object.keys(manifest.dependencies).length
        : 0
    }
  } catch {
    // Ignore — the total count is the important figure.
  }

  if (directDeps > totalDeps) directDeps = totalDeps
  const transitiveDeps = Math.max(0, totalDeps - directDeps)

  return {
    package: sizeData.package ?? name,
    version: resolvedVersion,
    totalDeps,
    directDeps,
    transitiveDeps,
    totalSizeBytes: Math.max(0, sizeData.totalSize ?? 0),
  }
}

export interface LookupOutcome {
  result: PackageDepsResult
  /** True when an explicit version was requested — the result is immutable. */
  pinned: boolean
  /** True when the result was served from the durable blob cache. */
  cacheHit: boolean
}

/**
 * Look up a package's dependency footprint, backed by a durable Netlify Blobs
 * cache. Because results are immutable for a given name@version, a cache hit is
 * returned without ever touching the upstream services — making repeat lookups
 * instant. Unpinned ("latest") lookups are revalidated after a short window.
 */
export async function lookupPackageDeps(
  name: string,
  version?: string,
): Promise<LookupOutcome> {
  const pinned = Boolean(version)
  const key = `${name}@${version ?? 'latest'}`

  let store: ReturnType<typeof getStore> | null = null
  try {
    store = getStore(STORE_NAME)
  } catch {
    // Blobs not configured in this context — degrade to a direct lookup.
    store = null
  }

  if (store) {
    try {
      const cached = (await store.get(key, { type: 'json' })) as
        | CachedEntry
        | null
      if (cached) {
        const fresh = pinned || Date.now() - cached.cachedAt < LATEST_TTL_MS
        if (fresh) return { result: cached.result, pinned, cacheHit: true }
      }
    } catch {
      // Ignore cache read errors — fall through to a fresh lookup.
    }
  }

  const result = await fetchFromUpstream(name, version)

  if (store) {
    try {
      const entry: CachedEntry = { result, cachedAt: Date.now() }
      await store.setJSON(key, entry)
      // Also store under the resolved pinned version so a later pinned lookup
      // of the same version is an immediate, immutable cache hit.
      if (!pinned && result.version) {
        await store.setJSON(`${name}@${result.version}`, entry)
      }
    } catch {
      // Ignore cache write errors — the result is still returned.
    }
  }

  return { result, pinned, cacheHit: false }
}
