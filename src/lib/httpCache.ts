const packageDepsPinnedCacheHeaders = {
  "Cache-Control": "public, max-age=86400",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=31536000, immutable",
} as const;

const packageDepsLatestCacheHeaders = {
  "Cache-Control": "public, max-age=300",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600, stale-while-revalidate=86400",
} as const;

const ogImageCacheHeaders = {
  "Cache-Control": "public, max-age=31536000, must-revalidate",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=31536000, must-revalidate",
} as const;

export function packageDepsLookupCacheHeader(cacheHit: boolean): "lookup-hit" | "miss" {
  return cacheHit ? "lookup-hit" : "miss";
}

export function packageDepsCacheHeaders({
  pinned,
  cacheHit,
}: {
  pinned: boolean;
  cacheHit: boolean;
}): Record<string, string> {
  return {
    ...(pinned ? packageDepsPinnedCacheHeaders : packageDepsLatestCacheHeaders),
    "X-Cache": packageDepsLookupCacheHeader(cacheHit),
  };
}

export function ogCacheHeaders(): Record<string, string> {
  return { ...ogImageCacheHeaders };
}
