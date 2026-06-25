/// <reference types="@tanstack/react-start" />

import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import { ogCacheHeaders } from "../../lib/httpCache";
import { OG_IMAGE_SIZE } from "../../lib/ogImage";
import { renderOgImage } from "../../lib/ogImageView";

function imageResponseHeaders(): Record<string, string> {
  const headers = ogCacheHeaders();
  return {
    "cache-control": headers["Cache-Control"] ?? "",
    "netlify-cdn-cache-control": headers["Netlify-CDN-Cache-Control"] ?? "",
  };
}

export const Route = createFileRoute("/api/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return new ImageResponse(renderOgImage(new URL(request.url)), {
          width: OG_IMAGE_SIZE.width,
          height: OG_IMAGE_SIZE.height,
          headers: imageResponseHeaders(),
        });
      },
    },
  },
});
