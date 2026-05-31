import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import Sonda from "sonda/vite";

const analyzeBundle = process.env.SONDA === "true";

const config = defineConfig({
  build: {
    sourcemap: analyzeBundle,
  },
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    exclude: ["@resvg/resvg-js"],
  },
  ssr: {
    external: ["@resvg/resvg-js"],
  },
  plugins: [
    tailwindcss(),
    netlify(),
    tanstackStart(),
    viteReact(),
    Sonda({
      enabled: analyzeBundle,
      format: ["html", "json"],
      include: [/^dist\/client\/assets\/.*\.js$/],
      filename: "bundle",
      outputDir: ".sonda",
      open: false,
      gzip: true,
      brotli: true,
    }),
  ],
});

export default config;
