import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import { THEME_BACKGROUNDS, THEME_BOOTSTRAP_STYLE, THEME_STORAGE_KEY } from "../lib/themeModel";
import "../styles.css";

// Applies the saved (or system-resolved) colour theme before the app renders.
// Mirrors themeModel.ts; kept inline and dependency-free so it runs before app
// markup and client JavaScript are available.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = theme === 'dark' || (theme === 'system' && prefersDark) ? 'dark' : 'light';
    var isDark = resolved === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document.documentElement.style.backgroundColor = isDark ? '${THEME_BACKGROUNDS.dark}' : '${THEME_BACKGROUNDS.light}';
  } catch (e) {}
})();
`;

const THEME_BOOTSTRAP_STYLE_HTML = { __html: THEME_BOOTSTRAP_STYLE };
const THEME_INIT_SCRIPT_HTML = { __html: THEME_INIT_SCRIPT };

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        title: "npm.tax: npm supply chain risk explorer",
      },
    ],
    links: [
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/archivo-variable-latin.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/plex-mono-600-latin.woff2",
        crossOrigin: "anonymous",
      },
      // The SVG follows the OS theme and is preferred where supported; the .ico
      // carries hand-tuned 16/32/48 rasters for everything else.
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/x-icon", sizes: "16x16 32x32 48x48", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={THEME_BOOTSTRAP_STYLE_HTML} />
        <script dangerouslySetInnerHTML={THEME_INIT_SCRIPT_HTML} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
