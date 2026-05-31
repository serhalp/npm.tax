export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeDocumentState {
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  className: "" | "dark";
  dataTheme: ResolvedTheme;
  colorScheme: ResolvedTheme;
  backgroundColor: string;
}

export const THEME_STORAGE_KEY = "theme";

export const THEME_BACKGROUNDS = {
  light: "#f1f5f9",
  dark: "#020617",
} as const satisfies Record<ResolvedTheme, string>;

export const THEME_BOOTSTRAP_STYLE = `
html {
  background: ${THEME_BACKGROUNDS.light};
  color-scheme: light;
}
html[data-theme="dark"] {
  background: ${THEME_BACKGROUNDS.dark};
  color-scheme: dark;
}
html[data-theme="light"] {
  background: ${THEME_BACKGROUNDS.light};
  color-scheme: light;
}
body {
  background: transparent;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme]) {
    background: ${THEME_BACKGROUNDS.dark};
    color-scheme: dark;
  }
}
`;

export function coerceTheme(value: unknown): Theme {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "dark") return "dark";
  if (theme === "system" && prefersDark) return "dark";
  return "light";
}

export function getThemeDocumentState(theme: Theme, prefersDark: boolean): ThemeDocumentState {
  const resolvedTheme = resolveTheme(theme, prefersDark);
  const isDark = resolvedTheme === "dark";

  return {
    resolvedTheme,
    isDark,
    className: isDark ? "dark" : "",
    dataTheme: resolvedTheme,
    colorScheme: resolvedTheme,
    backgroundColor: THEME_BACKGROUNDS[resolvedTheme],
  };
}
