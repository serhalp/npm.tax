/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildOgChartPath, escapeXml, renderOgSvg, renderTextLines, textLines } from "./ogImage.ts";
import { buildLine, formatDays, formatProb, getRiskScenario } from "./riskModel.ts";

function extractPath(svg: string, className: string): string {
  const match = svg.match(new RegExp(`<path d="([^"]+)" class="${className}"`));
  assert.ok(match);
  return match[1];
}

describe("OG image XML helpers", () => {
  test("escapes XML-sensitive characters", () => {
    assert.equal(
      escapeXml('scope & <package> > "version"'),
      "scope &amp; &lt;package&gt; &gt; &quot;version&quot;",
    );
  });

  test("wraps text by word and caps output at three lines", () => {
    assert.deepEqual(textLines("one two three four five six seven", 9), [
      "one two",
      "three",
      "four five",
    ]);
  });

  test("renders text lines with escaped content and custom classes", () => {
    assert.equal(
      renderTextLines(["one & two", '<three "four">'], 10, 20, 30, "body"),
      '<text x="10" y="20" class="body">one &amp; two</text><text x="10" y="50" class="body">&lt;three &quot;four&quot;&gt;</text>',
    );
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

describe("OG SVG rendering", () => {
  test("renders the generic scenario copy", () => {
    const svg = renderOgSvg(new URL("https://npm.tax/api/og?ogv=2"));
    const genericOgScenario = getRiskScenario({
      probExp: Math.log10(2.5e-6),
      days: 365 * 2,
    });

    assert.match(svg, /class="card generic-panel"/);
    assert.match(svg, /\.bg \{ fill: #020617; \}/);
    assert.doesNotMatch(svg, /class="eyebrow">npm\.tax<\/text>/);
    assert.match(svg, /npm supply-chain risk, with/);
    assert.match(svg, /cumulative npm supply-chain risk/);
    assert.match(svg, new RegExp(`>${formatProb(genericOgScenario.prob)}<`));
    assert.match(svg, new RegExp(`>${formatDays(genericOgScenario.expectedDaysToBreach)}<`));
  });

  test("renders the light theme when requested", () => {
    const svg = renderOgSvg(new URL("https://npm.tax/api/og?theme=light"));

    assert.match(svg, /\.bg \{ fill: #eef2f7; \}/);
    assert.match(svg, /class="card generic-panel"/);
  });

  test("renders the scenario copy", () => {
    const svg = renderOgSvg(
      new URL("https://npm.tax/api/og?direct=10&transitive=20&probExp=-6&days=180"),
    );

    assert.match(svg, /class="card risk-panel"/);
    assert.match(svg, /Scenario/);
    assert.match(svg, /modeled chance over 6 months/);
    assert.match(svg, /31 modeled packages/);
    assert.match(svg, /over 6 months/);
    assert.match(svg, /20 transitive dependencies/);
  });

  test("renders the package scenario copy and key metrics", () => {
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
    const svg = renderOgSvg(url);

    assert.match(svg, /class="card pkg-panel"/);
    assert.match(svg, /Package report/);
    assert.match(svg, /astro@6\.4\.4: 12% modeled/);
    assert.match(svg, /compromise probability/);
    assert.match(svg, /248 modeled packages/);
    assert.match(svg, /over 1 year/);
    assert.match(svg, /1 self/);
    assert.match(svg, /55 direct/);
    assert.match(svg, /192 transitive/);
    assert.match(svg, /Breach probability/);
    assert.match(svg, new RegExp(`>${formatProb(scenario.prob)}<`));
    assert.match(svg, /Expected time/);
    assert.match(svg, new RegExp(`>${formatDays(scenario.expectedDaysToBreach)}<`));
    assert.match(svg, /Modeled packages/);
    assert.match(svg, new RegExp(`>${scenario.totalDeps.toLocaleString()}<`));
  });

  test("renders OG chart paths from the current scenario math", () => {
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
    );
    const svg = renderOgSvg(url);
    const otherSvg = renderOgSvg(
      new URL("https://npm.tax/api/og?direct=10&transitive=20&probExp=-6&days=180"),
    );

    assert.equal(extractPath(svg, "spark-risk"), expectedRiskPath);
    assert.match(extractPath(svg, "spark-risk"), /^M86,/);
    assert.notEqual(extractPath(svg, "spark-risk"), extractPath(otherSvg, "spark-risk"));
    assert.doesNotMatch(svg, /class="spark-base"/);
    assert.match(svg, /class="spark-axis"/);
    assert.match(svg, /class="spark-end"/);
    assert.doesNotMatch(svg, /M86 542 C 250 528/);
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
    );
    const svg = renderOgSvg(new URL("https://npm.tax/api/og?ogv=2"));

    assert.equal(extractPath(svg, "spark-risk"), expectedGenericPath);
    assert.notEqual(extractPath(svg, "spark-risk"), oldDefaultPath);
  });

  test("escapes package input before it reaches SVG text or attributes", () => {
    const svg = renderOgSvg(
      new URL(
        "https://npm.tax/api/og?direct=1&transitive=2&pkg=evil%26pkg%3D%3Cscript%3E%22&v=1.0.0%3Csvg%3E",
      ),
    );

    assert.doesNotMatch(svg, /evil&pkg=<script>"/);
    assert.doesNotMatch(svg, /1\.0\.0<svg>/);
    assert.match(svg, /evil&amp;pkg=&lt;script&gt;&quot;@1\.0\.0&lt;svg&gt;/);
    assert.match(svg, /aria-label="evil&amp;pkg=&lt;script&gt;&quot;@1\.0\.0&lt;svg&gt;/);
  });
});
