/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildRiskScenarioUrls,
  DEFAULT_OG_THEME,
  OG_IMAGE_VERSION,
  parseOgScenarioUrl,
  parseOgTheme,
  parseRiskSearchParams,
  parseRiskSearchRecord,
} from "./riskSearch.ts";

function searchParams(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("risk search parsing", () => {
  test("clamps numeric ranges and rounds dependency counts", () => {
    assert.deepEqual(
      parseRiskSearchRecord({
        direct: "12.6",
        transitive: "-7",
        probExp: "-99",
        days: "5000",
      }),
      {
        direct: 13,
        transitive: 0,
        probExp: -8,
        days: 1095,
        pkg: undefined,
        v: undefined,
      },
    );

    assert.deepEqual(
      parseRiskSearchRecord({
        probExp: "-1",
        days: "-10",
      }),
      {
        direct: undefined,
        transitive: undefined,
        probExp: -3,
        days: 1,
        pkg: undefined,
        v: undefined,
      },
    );
  });

  test("drops invalid and unsafe numeric values", () => {
    assert.deepEqual(
      parseRiskSearchRecord({
        direct: "nope",
        transitive: String(Number.MAX_SAFE_INTEGER + 2),
        probExp: "Infinity",
        days: "NaN",
      }),
      {
        direct: undefined,
        transitive: undefined,
        probExp: undefined,
        days: undefined,
        pkg: undefined,
        v: undefined,
      },
    );
  });

  test("trims package strings and ignores blank or non-string values", () => {
    assert.deepEqual(
      parseRiskSearchRecord({
        pkg: "  @scope/name  ",
        v: "  ",
      }),
      {
        direct: undefined,
        transitive: undefined,
        probExp: undefined,
        days: undefined,
        pkg: "@scope/name",
        v: undefined,
      },
    );

    assert.equal(parseRiskSearchRecord({ pkg: 123, v: ["1.0.0"] }).pkg, undefined);
    assert.equal(parseRiskSearchRecord({ pkg: 123, v: ["1.0.0"] }).v, undefined);
  });

  test("parses URLSearchParams the same way as route search records", () => {
    const params = new URLSearchParams({
      direct: "4.4",
      transitive: "10.5",
      probExp: "-6.2",
      days: "180",
      pkg: " astro ",
      v: " 6.4.4 ",
    });

    assert.deepEqual(
      parseRiskSearchParams(params),
      parseRiskSearchRecord({
        direct: "4.4",
        transitive: "10.5",
        probExp: "-6.2",
        days: "180",
        pkg: " astro ",
        v: " 6.4.4 ",
      }),
    );
  });

  test("treats empty query params as omitted values", () => {
    assert.deepEqual(parseRiskSearchParams(new URLSearchParams("direct=&pkg=%20")), {
      direct: undefined,
      transitive: undefined,
      probExp: undefined,
      days: undefined,
      pkg: undefined,
      v: undefined,
    });
  });
});

describe("OG scenario parsing", () => {
  test("accepts only known OG themes and defaults to dark", () => {
    assert.equal(parseOgTheme("dark"), "dark");
    assert.equal(parseOgTheme("light"), "light");
    assert.equal(parseOgTheme("anything-else"), DEFAULT_OG_THEME);
    assert.equal(parseOgTheme(undefined), DEFAULT_OG_THEME);
  });

  test("infers package variant and theme from an OG request URL", () => {
    const scenario = parseOgScenarioUrl(
      new URL("https://npm.tax/api/og?theme=light&pkg=astro&v=6.4.4&direct=55"),
    );

    assert.equal(scenario.variant, "package");
    assert.equal(scenario.theme, "light");
    assert.deepEqual(scenario.search, {
      direct: 55,
      transitive: undefined,
      probExp: undefined,
      days: undefined,
      pkg: "astro",
      v: "6.4.4",
    });
  });

  test("infers scenario and generic variants from OG request URLs", () => {
    assert.equal(
      parseOgScenarioUrl(new URL("https://npm.tax/api/og?direct=10&transitive=20")).variant,
      "scenario",
    );
    assert.equal(parseOgScenarioUrl(new URL("https://npm.tax/api/og")).variant, "generic");
    assert.equal(parseOgScenarioUrl(new URL("https://npm.tax/api/og")).theme, DEFAULT_OG_THEME);
  });
});

describe("scenario URL builders", () => {
  const currentUrl = new URL("https://example.test/current?stale=1");

  test("builds default page and OG image URLs", () => {
    const urls = buildRiskScenarioUrls({}, currentUrl);
    const imageParams = searchParams(urls.ogImageUrl);

    assert.equal(urls.variant, "generic");
    assert.equal(urls.pageUrl, "https://example.test");
    assert.equal(new URL(urls.ogImageUrl).pathname, "/api/og");
    assert.equal(imageParams.has("direct"), false);
    assert.equal(imageParams.has("transitive"), false);
    assert.equal(imageParams.has("probExp"), false);
    assert.equal(imageParams.has("days"), false);
    assert.equal(imageParams.get("ogv"), OG_IMAGE_VERSION);
    assert.equal(imageParams.get("theme"), DEFAULT_OG_THEME);
    assert.equal(imageParams.has("variant"), false);
  });

  test("builds scenario URLs without OG-only params on the page URL", () => {
    const urls = buildRiskScenarioUrls(
      { direct: 10, transitive: 20, probExp: -6, days: 180 },
      currentUrl,
    );
    const pageParams = searchParams(urls.pageUrl);
    const imageParams = searchParams(urls.ogImageUrl);

    assert.equal(urls.variant, "scenario");
    assert.equal(pageParams.get("direct"), "10");
    assert.equal(pageParams.get("transitive"), "20");
    assert.equal(pageParams.get("probExp"), "-6");
    assert.equal(pageParams.get("days"), "180");
    assert.equal(pageParams.has("ogv"), false);
    assert.equal(pageParams.has("theme"), false);
    assert.equal(pageParams.has("variant"), false);
    assert.equal(imageParams.has("variant"), false);
    assert.equal(imageParams.get("theme"), DEFAULT_OG_THEME);
    assert.equal(imageParams.get("ogv"), OG_IMAGE_VERSION);
  });

  test("builds package scenario URLs with package identity and resolved numbers", () => {
    const urls = buildRiskScenarioUrls(
      { direct: 55, transitive: 192, probExp: -5.85, days: 365, pkg: "astro", v: "6.4.4" },
      currentUrl,
    );
    const pageParams = searchParams(urls.pageUrl);
    const imageParams = searchParams(urls.ogImageUrl);

    assert.equal(urls.variant, "package");
    assert.equal(pageParams.get("pkg"), "astro");
    assert.equal(pageParams.get("v"), "6.4.4");
    assert.equal(pageParams.get("direct"), "55");
    assert.equal(pageParams.get("transitive"), "192");
    assert.equal(imageParams.get("pkg"), "astro");
    assert.equal(imageParams.get("v"), "6.4.4");
    assert.equal(imageParams.has("variant"), false);
    assert.equal(imageParams.get("theme"), DEFAULT_OG_THEME);
    assert.equal(imageParams.get("ogv"), OG_IMAGE_VERSION);
  });

  test("can build light-themed OG image URLs", () => {
    const urls = buildRiskScenarioUrls({ direct: 10 }, currentUrl, { ogTheme: "light" });
    const pageParams = searchParams(urls.pageUrl);
    const imageParams = searchParams(urls.ogImageUrl);

    assert.equal(pageParams.has("theme"), false);
    assert.equal(imageParams.get("theme"), "light");
  });
});
