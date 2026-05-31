import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import { THEME_BACKGROUNDS, THEME_BOOTSTRAP_STYLE, THEME_STORAGE_KEY } from "../lib/themeModel";
import "../styles.css";

// Applies the saved (or system-resolved) color theme before the app renders.
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
