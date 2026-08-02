/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  documentCacheHeaders,
  ogCacheHeaders,
  packageDepsCacheHeaders,
  packageDepsLookupCacheHeader,
} from "./httpCache.ts";

describe("HTTP cache headers", () => {
  test("uses immutable durable CDN headers for pinned package dependency lookups", () => {
    assert.deepEqual(packageDepsCacheHeaders({ pinned: true, cacheHit: true }), {
      "Cache-Control": "public, max-age=86400",
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=31536000, immutable",
      "X-Cache": "lookup-hit",
    });
  });

  test("uses short browser cache and revalidating CDN headers for latest lookups", () => {
    assert.deepEqual(packageDepsCacheHeaders({ pinned: false, cacheHit: false }), {
      "Cache-Control": "public, max-age=300",
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600, stale-while-revalidate=86400",
      "X-Cache": "miss",
    });
  });

  test("reports lookup cache hits and misses", () => {
    assert.equal(packageDepsLookupCacheHeader(true), "lookup-hit");
    assert.equal(packageDepsLookupCacheHeader(false), "miss");
  });

  test("lets the edge hold the document while the browser revalidates", () => {
    // The render is a pure function of the search params, so only a deploy can
    // change it; the browser must recheck so a deploy is picked up at once.
    assert.deepEqual(documentCacheHeaders(), {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=31536000",
    });
  });

  test("uses revalidating browser headers and durable CDN headers for generated OG images", () => {
    assert.deepEqual(ogCacheHeaders(), {
      "Cache-Control": "public, max-age=31536000, must-revalidate",
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=31536000, must-revalidate",
    });
  });
});
