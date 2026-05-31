/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  coerceTheme,
  getThemeDocumentState,
  resolveTheme,
  THEME_BACKGROUNDS,
  THEME_BOOTSTRAP_STYLE,
  THEME_STORAGE_KEY,
} from "./themeModel.ts";

describe("theme coercion", () => {
  test("accepts only supported stored theme values", () => {
    assert.equal(coerceTheme("light"), "light");
    assert.equal(coerceTheme("dark"), "dark");
    assert.equal(coerceTheme("system"), "system");
  });

  test("falls back to system for invalid stored theme values", () => {
    for (const value of [undefined, null, "", "auto", "Dark", 1, true]) {
      assert.equal(coerceTheme(value), "system");
    }
  });
});

describe("theme resolution", () => {
  test("resolves explicit light and dark themes independent of system preference", () => {
    assert.equal(resolveTheme("light", false), "light");
    assert.equal(resolveTheme("light", true), "light");
    assert.equal(resolveTheme("dark", false), "dark");
    assert.equal(resolveTheme("dark", true), "dark");
  });

  test("resolves system from the current dark-mode preference", () => {
    assert.equal(resolveTheme("system", false), "light");
    assert.equal(resolveTheme("system", true), "dark");
  });
});

describe("theme document state", () => {
  test("returns concrete HTML values for light mode", () => {
    assert.deepEqual(getThemeDocumentState("light", true), {
      resolvedTheme: "light",
      isDark: false,
      className: "",
      dataTheme: "light",
      colorScheme: "light",
      backgroundColor: THEME_BACKGROUNDS.light,
    });
  });

  test("returns concrete HTML values for dark mode", () => {
    assert.deepEqual(getThemeDocumentState("dark", false), {
      resolvedTheme: "dark",
      isDark: true,
      className: "dark",
      dataTheme: "dark",
      colorScheme: "dark",
      backgroundColor: THEME_BACKGROUNDS.dark,
    });
  });

  test("returns concrete HTML values for a dark system preference", () => {
    assert.deepEqual(getThemeDocumentState("system", true), {
      resolvedTheme: "dark",
      isDark: true,
      className: "dark",
      dataTheme: "dark",
      colorScheme: "dark",
      backgroundColor: THEME_BACKGROUNDS.dark,
    });
  });

  test("keeps bootstrap style values aligned with document state constants", () => {
    assert.equal(THEME_STORAGE_KEY, "theme");
    assert.match(THEME_BOOTSTRAP_STYLE, new RegExp(THEME_BACKGROUNDS.light));
    assert.match(THEME_BOOTSTRAP_STYLE, new RegExp(THEME_BACKGROUNDS.dark));
  });
});
