/// <reference types="@tanstack/react-start" />
import { Resvg } from "@resvg/resvg-js";
import { createFileRoute } from "@tanstack/react-router";
import { ogCacheHeaders } from "../../lib/httpCache";
import { renderOgSvg } from "../../lib/ogImage";

export const Route = createFileRoute("/api/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const svg = renderOgSvg(new URL(request.url));
        const png = new Resvg(svg).render().asPng();

        return new Response(new Uint8Array(png), {
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(png.byteLength),
            ...ogCacheHeaders(),
          },
        });
      },
    },
  },
});
