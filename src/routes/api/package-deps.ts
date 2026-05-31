/// <reference types="@tanstack/react-start" />
import { createFileRoute } from '@tanstack/react-router'
import {
  isValidPackageName,
  lookupPackageDeps,
  PackageLookupError,
} from '../../server/packageDeps'

/**
 * GET /api/package-deps?name=<pkg>&version=<semver?>
 *
 * Returns a package's resolved dependency footprint as JSON. Responses are
 * cached two ways so repeat lookups are instant:
 *
 *  - Netlify Blobs (server side): avoids re-hitting the upstream npmx + npm
 *    registry services on a cache hit.
 *  - Netlify CDN (`Netlify-CDN-Cache-Control`): a pinned name@version is
 *    immutable, so it is cached durably at the edge and served without even
 *    invoking this function. Unpinned ("latest") lookups use a short,
 *    revalidating window.
 */
export const Route = createFileRoute('/api/package-deps')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const name = (url.searchParams.get('name') ?? '').trim()
        const version = (url.searchParams.get('version') ?? '').trim() || undefined

        if (!name) {
          return Response.json(
            { error: 'A package name is required.' },
            { status: 400 },
          )
        }
        if (!isValidPackageName(name)) {
          return Response.json(
            { error: `"${name}" is not a valid npm package name.` },
            { status: 400 },
          )
        }

        try {
          const { result, pinned, cacheHit } = await lookupPackageDeps(
            name,
            version,
          )

          const cdnCacheControl = pinned
            ? 'public, durable, s-maxage=31536000, immutable'
            : 'public, durable, s-maxage=3600, stale-while-revalidate=86400'

          return Response.json(result, {
            headers: {
              'Cache-Control': pinned
                ? 'public, max-age=86400'
                : 'public, max-age=300',
              'Netlify-CDN-Cache-Control': cdnCacheControl,
              'X-Cache': cacheHit ? 'blob-hit' : 'miss',
            },
          })
        } catch (e) {
          if (e instanceof PackageLookupError) {
            return Response.json({ error: e.message }, { status: e.status })
          }
          return Response.json({ error: 'Lookup failed.' }, { status: 500 })
        }
      },
    },
  },
})
