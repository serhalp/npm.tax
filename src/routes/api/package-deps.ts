/// <reference types="@tanstack/react-start" />
import { createFileRoute } from "@tanstack/react-router";
import {
  isValidPackageName,
  lookupPackageDeps,
  PackageLookupError,
} from "../../server/packageDeps";
import { packageDepsCacheHeaders } from "../../lib/httpCache";

/**
 * GET /api/package-deps?name=<pkg>&version=<version-selector?>
 *
 * Returns a package's resolved dependency footprint as JSON. Responses are
 * cached two ways so repeat lookups are instant:
 *
 *  - Netlify Cache API (server side): avoids re-hitting the upstream npmx +
 *    npm registry services on a cache hit.
 *  - Netlify CDN (`Netlify-CDN-Cache-Control`): an exact name@version is
 *    immutable, so it is cached durably at the edge and served without even
 *    invoking this function. Dist-tag, range, and no-version lookups use a
 *    short revalidating window.
 */
export const Route = createFileRoute("/api/package-deps")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const name = (url.searchParams.get("name") ?? "").trim();
        const version = (url.searchParams.get("version") ?? "").trim() || undefined;

        if (!name) {
          return Response.json({ error: "A package name is required." }, { status: 400 });
        }
        if (!isValidPackageName(name)) {
          return Response.json(
            { error: `"${name}" is not a valid npm package name.` },
            { status: 400 },
          );
        }

        try {
          const { result, pinned, cacheHit } = await lookupPackageDeps(name, version);

          return Response.json(result, {
            headers: packageDepsCacheHeaders({ pinned, cacheHit }),
          });
        } catch (e) {
          if (e instanceof PackageLookupError) {
            return Response.json({ error: e.message }, { status: e.status });
          }
          return Response.json({ error: "Lookup failed." }, { status: 500 });
        }
      },
    },
  },
});
