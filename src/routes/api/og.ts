/// <reference types="@tanstack/react-start" />
import { Buffer } from "node:buffer";

import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";
import { createFileRoute } from "@tanstack/react-router";
import { ogCacheHeaders } from "../../lib/httpCache";
import { renderOgSvg } from "../../lib/ogImage";
import notoSansBoldDataUrl from "../../server/fonts/noto-sans-bold.ttf?url&inline";
import notoSansRegularDataUrl from "../../server/fonts/noto-sans-regular.ttf?url&inline";

type ResvgRenderOptionsWithFontBuffers = ResvgRenderOptions & {
  font?: NonNullable<ResvgRenderOptions["font"]> & {
    fontBuffers?: Buffer[];
  };
};

function fontBufferFromDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

const FONT_BUFFERS = [
  fontBufferFromDataUrl(notoSansRegularDataUrl),
  fontBufferFromDataUrl(notoSansBoldDataUrl),
];

const RESVG_OPTIONS = {
  font: {
    fontBuffers: FONT_BUFFERS,
    loadSystemFonts: false,
    defaultFontFamily: "Noto Sans",
  },
} satisfies ResvgRenderOptionsWithFontBuffers;

export const Route = createFileRoute("/api/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const svg = renderOgSvg(new URL(request.url));
        const png = new Resvg(svg, RESVG_OPTIONS).render().asPng();

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
