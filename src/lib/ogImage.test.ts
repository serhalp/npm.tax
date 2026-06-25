/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildOgChartPath, buildOgImageModel, textLines } from "./ogImage.ts";
import { buildLine, formatDays, formatProb, getRiskScenario } from "./riskModel.ts";

describe("OG image helpers", () => {
  test("wraps text by word and caps output at three lines", () => {
    assert.deepEqual(textLines("one two three four five six seven", 9), [
      "one two",
      "three",
      "four five",
    ]);
  });

  test("maps OG chart data points into SVG bounds", () => {
    assert.equal(
      buildOgChartPath(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0.5 },
          { x: 10, y: 1 },
        ],
        10,
        1,
        { x: 10, y: 20, width: 100, height: 50 },
      ),
      "M10,70 L60,45 L110,20",
    );
  });
});

describe("OG image model", () => {
  test("builds the generic scenario copy", () => {
    const model = buildOgImageModel(new URL("https://npm.tax/api/og?ogv=7"));
    const genericOgScenario = getRiskScenario({
      probExp: Math.log10(2.5e-6),
      days: 365 * 2,
    });

    assert.equal(model.variant, "generic");
    assert.equal(model.colors.bg, "#020617");
    assert.equal(model.colors.panel, "#0f172a");
    assert.equal(model.badge, undefined);
    assert.deepEqual(model.titleLines, ["npm supply-chain risk, with", "receipts."]);
    assert.deepEqual(model.bodyLines, [
      "Explore how your code, dependency count, breach",
      "probability, and time horizon combine into",
      "cumulative npm supply-chain risk.",
    ]);
    assert.equal(model.breachProbability, formatProb(genericOgScenario.prob));
    assert.equal(model.expectedTime, formatDays(genericOgScenario.expectedDaysToBreach));
  });

  test("builds the light theme when requested", () => {
    const model = buildOgImageModel(new URL("https://npm.tax/api/og?theme=light"));

    assert.equal(model.colors.bg, "#eef2f7");
    assert.equal(model.colors.panel, "#f8fafc");
  });

  test("builds the scenario copy", () => {
    const model = buildOgImageModel(
      new URL("https://npm.tax/api/og?direct=10&transitive=20&probExp=-6&days=180"),
    );

    assert.equal(model.variant, "scenario");
    assert.equal(model.badge, "Scenario");
    assert.deepEqual(model.titleLines, ["0.556% modeled chance over 6", "months"]);
    assert.deepEqual(model.bodyLines, [
      "31 modeled packages over 6 months, including the",
      "project itself, 20 transitive dependencies, 88",
      "years expected time.",
    ]);
  });

  test("builds the package scenario copy and key metrics", () => {
    const url = new URL(
      "https://npm.tax/api/og?direct=55&transitive=192&probExp=-5.85&days=365&pkg=astro&v=6.4.4",
    );
    const scenario = getRiskScenario({
      direct: 55,
      transitive: 192,
      probExp: -5.85,
      days: 365,
      pkg: "astro",
      v: "6.4.4",
    });
    const model = buildOgImageModel(url);

    assert.equal(model.variant, "package");
    assert.equal(model.badge, "Package report");
    assert.deepEqual(model.titleLines, ["astro@6.4.4: 12% modeled", "compromise probability"]);
    assert.deepEqual(model.bodyLines, [
      "248 modeled packages over 1 year",
      "1 self + 55 direct + 192 transitive",
    ]);
    assert.equal(model.breachProbability, formatProb(scenario.prob));
    assert.equal(model.expectedTime, formatDays(scenario.expectedDaysToBreach));
    assert.equal(model.modeledPackages, scenario.totalDeps.toLocaleString());
  });

  test("builds OG chart paths from the current scenario math", () => {
    const url = new URL(
      "https://npm.tax/api/og?direct=55&transitive=192&probExp=-5.85&days=365&pkg=astro&v=6.4.4",
    );
    const scenario = getRiskScenario({
      direct: 55,
      transitive: 192,
      probExp: -5.85,
      days: 365,
      pkg: "astro",
      v: "6.4.4",
    });
    const chartMaxProbability = Math.min(
      1,
      Math.max(scenario.prob, scenario.probDirectOnly) * 1.12,
    );
    const expectedRiskPath = buildOgChartPath(
      buildLine(scenario.totalDeps, scenario.dailyP, scenario.timePeriodDays, 32),
      scenario.timePeriodDays,
      chartMaxProbability,
      { x: 0, y: 0, width: 520, height: 104 },
    );
    const model = buildOgImageModel(url);
    const otherModel = buildOgImageModel(
      new URL("https://npm.tax/api/og?direct=10&transitive=20&probExp=-6&days=180"),
    );

    assert.equal(model.chartPath, expectedRiskPath);
    assert.match(model.chartPath, /^M0,/);
    assert.notEqual(model.chartPath, otherModel.chartPath);
  });

  test("uses a more dramatic default curve for the generic OG image only", () => {
    const genericOgScenario = getRiskScenario({
      probExp: Math.log10(2.5e-6),
      days: 365 * 2,
    });
    const defaultScenario = getRiskScenario({});
    const genericChartMaxProbability = Math.min(
      1,
      Math.max(genericOgScenario.prob, genericOgScenario.probDirectOnly) * 1.12,
    );
    const defaultChartMaxProbability = Math.min(
      1,
      Math.max(defaultScenario.prob, defaultScenario.probDirectOnly) * 1.12,
    );
    const expectedGenericPath = buildOgChartPath(
      buildLine(
        genericOgScenario.totalDeps,
        genericOgScenario.dailyP,
        genericOgScenario.timePeriodDays,
        32,
      ),
      genericOgScenario.timePeriodDays,
      genericChartMaxProbability,
      { x: 0, y: 0, width: 520, height: 104 },
    );
    const oldDefaultPath = buildOgChartPath(
      buildLine(
        defaultScenario.totalDeps,
        defaultScenario.dailyP,
        defaultScenario.timePeriodDays,
        32,
      ),
      defaultScenario.timePeriodDays,
      defaultChartMaxProbability,
      { x: 0, y: 0, width: 520, height: 104 },
    );
    const model = buildOgImageModel(new URL("https://npm.tax/api/og?ogv=7"));

    assert.equal(model.chartPath, expectedGenericPath);
    assert.notEqual(model.chartPath, oldDefaultPath);
  });

  test("keeps package input as text data for React to escape", () => {
    const model = buildOgImageModel(
      new URL(
        "https://npm.tax/api/og?direct=1&transitive=2&pkg=evil%26pkg%3D%3Cscript%3E%22&v=1.0.0%3Csvg%3E",
      ),
    );

    assert.match(model.title, /evil&pkg=<script>"@1\.0\.0<svg>/);
  });
});
