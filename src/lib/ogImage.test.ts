/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildOgCurve,
  buildOgImageModel,
  estimateLineWidth,
  estimateSegmentWidth,
  fitVerdict,
  formatSvgNumber,
  getOgFieldBox,
  OG_CURVE,
  OG_FIELD_ASPECT,
  OG_LAYOUT,
  toneColor,
  truncateRef,
  wrapSegments,
  type OgSegment,
} from "./ogImage.ts";
import {
  formatDays,
  formatProb,
  getRiskScenario,
  MODELED_ROOT_PACKAGE_COUNT,
} from "./riskModel.ts";
import { FIELD_SIZE, getPackageFieldGeometry } from "./riskVisuals.ts";

const DARK = {
  paper: "#0e100a",
  ink: "#e9ebe0",
  inkFaint: "#e9ebe052",
  muted: "#969c8a",
  rule: "#e9ebe026",
  ruleStrong: "#e9ebe04d",
  levy: "#ea6c55",
  levyWash: "#ea6c5524",
  ochre: "#d9a244",
  moss: "#7eb08b",
  seriesA: "#a6cdf7",
  seriesAWash: "#a6cdf72e",
  seriesB: "#b18ee0",
};

function words(model: { verdict: { lines: OgSegment[][] } }): string[] {
  return model.verdict.lines.map((line) => line.map((segment) => segment.text).join(" "));
}

function sentence(model: { verdict: { lines: OgSegment[][] } }): string {
  return words(model).join(" ");
}

describe("OG text measurement", () => {
  test("measures runs from per-character advances, spaces included", () => {
    assert.equal(estimateSegmentWidth({ text: "abcd" }, 100), 250);
    assert.equal(estimateSegmentWidth({ text: "abcd", mono: true }, 100), 240);
    assert.equal(estimateSegmentWidth({ text: "a b" }, 100), 153);
  });

  test("measures a line as its runs plus one word gap between them", () => {
    assert.equal(estimateLineWidth([{ text: "abcd" }, { text: "abcd" }], 100), 528);
    assert.equal(estimateLineWidth([{ text: "abcd" }], 100), 250);
    assert.equal(estimateLineWidth([], 100), 0);
  });
});

describe("OG verdict layout", () => {
  test("breaks runs greedily and keeps their registers", () => {
    const lines = wrapSegments(
      [{ text: "abcd" }, { text: "abcd", accent: true }, { text: "abcd", mono: true }],
      550,
      100,
    );

    assert.deepEqual(lines, [
      [{ text: "abcd" }, { text: "abcd", accent: true }],
      [{ text: "abcd", mono: true }],
    ]);
  });

  test("never splits a run, even when it is wider than the column", () => {
    const lines = wrapSegments([{ text: "abcdefghij" }, { text: "abcd" }], 200, 100);

    assert.deepEqual(lines, [[{ text: "abcdefghij" }], [{ text: "abcd" }]]);
  });

  test("steps the size down until every line clears the margin", () => {
    // An unbreakable 44-character mono ref only fits at the bottom of the ramp.
    const verdict = fitVerdict([{ text: "x".repeat(44), mono: true }], OG_LAYOUT.contentWidth);

    assert.equal(verdict.fontSize, 36);
    assert.equal(verdict.lineHeight, 39);
    assert.equal(verdict.gap, 10);
    assert.ok(estimateLineWidth(verdict.lines[0], verdict.fontSize) <= OG_LAYOUT.contentWidth);
  });

  test("keeps the largest size that fits the line budget", () => {
    const short = fitVerdict([{ text: "Short verdict." }], OG_LAYOUT.contentWidth);

    assert.equal(short.fontSize, 46);
    assert.equal(short.lines.length, 1);
  });

  test("caps the verdict at its line budget", () => {
    const verdict = fitVerdict(
      Array.from({ length: 200 }, () => ({ text: "package" })),
      OG_LAYOUT.contentWidth,
    );

    assert.equal(verdict.lines.length, OG_LAYOUT.verdictMaxLines);
  });
});

describe("OG package field box", () => {
  test("fills the band width when the field is short", () => {
    assert.deepEqual(getOgFieldBox(250, 640, 186), { width: 640, height: 178 });
  });

  test("clamps to the band height when the field is tall", () => {
    assert.deepEqual(getOgFieldBox(500, 640, 186), { width: 335, height: 186 });
  });

  test("survives a degenerate field height", () => {
    assert.deepEqual(getOgFieldBox(0, 640, 186), { width: 640, height: 0 });
  });

  test("fills the card's full width at the strip's own aspect", () => {
    const geometry = getPackageFieldGeometry(MODELED_ROOT_PACKAGE_COUNT, 167, 927, OG_FIELD_ASPECT);
    const box = getOgFieldBox(geometry.height);

    // Width-bound, so the strip reaches the right margin instead of stopping short.
    assert.equal(box.width, OG_LAYOUT.fieldMaxWidth);
    assert.ok(box.height < OG_LAYOUT.fieldMaxHeight);
  });
});

describe("OG risk curve", () => {
  const PLOT = {
    left: OG_CURVE.padLeft,
    top: OG_CURVE.padTop,
    width: OG_CURVE.width - OG_CURVE.padLeft - OG_CURVE.padRight,
    height: OG_CURVE.height - OG_CURVE.padTop - OG_CURVE.padBottom,
  };
  const right = PLOT.left + PLOT.width;
  const bottom = PLOT.top + PLOT.height;

  test("rounds coordinates to what the canvas can resolve", () => {
    assert.equal(formatSvgNumber(44), "44");
    assert.equal(formatSvgNumber(44.004), "44");
    assert.equal(formatSvgNumber(44.005), "44.01");
    assert.equal(formatSvgNumber(-0.001), "0");
  });

  test("maps the horizon and a fixed 0-100% axis onto the plot rect", () => {
    const curve = buildOgCurve(
      [
        { x: 0, y: 0 },
        { x: 5, y: 0.5 },
        { x: 10, y: 1 },
      ],
      10,
      "100%",
    );

    assert.deepEqual(curve.plot, PLOT);
    assert.equal(
      curve.linePath,
      `M${PLOT.left} ${bottom}L${PLOT.left + PLOT.width / 2} ${PLOT.top + PLOT.height / 2}L${right} ${PLOT.top}`,
    );
    assert.equal(curve.areaPath, `${curve.linePath}L${right} ${bottom}L${PLOT.left} ${bottom}Z`);
    assert.equal(
      curve.gridPath,
      `M${PLOT.left} ${PLOT.top}H${right}M${PLOT.left} ${PLOT.top + PLOT.height / 2}H${right}M${PLOT.left} ${bottom}H${right}`,
    );
    assert.deepEqual(curve.yLabels, ["100%", "50%", "0%"]);
    assert.deepEqual(curve.xLabels, ["0d", "5d", "10d"]);
    assert.equal(curve.endLabel, "100%");
  });

  test("never rescales the axis to the data", () => {
    const flat = buildOgCurve(
      [
        { x: 0, y: 0 },
        { x: 365, y: 0.0001 },
      ],
      365,
      "0.01%",
    );

    // A hundredth of a percent has to land on the floor, not fill the plot.
    assert.ok(flat.linePath.endsWith(`${bottom - 0.01}`));
    assert.deepEqual(flat.xLabels, ["0d", "183d", "365d"]);
  });

  test("keeps the end label inside the plot at both extremes", () => {
    const saturated = buildOgCurve([{ x: 1, y: 1 }], 1, ">99.99%");
    const floored = buildOgCurve([{ x: 1, y: 0 }], 1, "<0.000001%");

    assert.equal(saturated.endLabelTop, PLOT.top + 6 - OG_CURVE.endLabelBox / 2);
    assert.equal(floored.endLabelTop, bottom - 6 - OG_CURVE.endLabelBox / 2);
    assert.ok(saturated.endLabelTop >= 0);
    assert.ok(floored.endLabelTop + OG_CURVE.endLabelBox <= OG_CURVE.height);
  });

  test("survives degenerate input rather than emitting a broken path", () => {
    const empty = buildOgCurve([], 0, "0%");

    assert.equal(empty.linePath, "");
    assert.equal(empty.areaPath, "");
    assert.deepEqual(empty.xLabels, ["0d", "1d"]);
  });

  test("clamps probabilities outside 0-100% to the axis", () => {
    const curve = buildOgCurve(
      [
        { x: -10, y: -1 },
        { x: 20, y: 2 },
      ],
      10,
      "100%",
    );

    assert.equal(curve.linePath, `M${PLOT.left} ${bottom}L${right} ${PLOT.top}`);
  });
});

describe("OG tones", () => {
  test("maps risk tones onto the palette", () => {
    assert.equal(toneColor("danger", DARK), DARK.levy);
    assert.equal(toneColor("warning", DARK), DARK.ochre);
    assert.equal(toneColor("good", DARK), DARK.moss);
  });

  test("keeps categorical series colours out of the severity ramp", () => {
    for (const variant of ["?pkg=gatsby&v=5.16.1&direct=167&transitive=927", ""]) {
      const { colors } = buildOgImageModel(new URL(`https://npm.tax/api/og${variant}`));
      const severity = [colors.levy, colors.ochre, colors.moss];
      for (const series of [colors.seriesA, colors.seriesB]) {
        assert.ok(
          !severity.includes(series),
          `series colour ${series} collides with the severity ramp, so it would imply good or bad`,
        );
      }
      // Red and green channels dominating would read as bad/good regardless of hue name.
      for (const series of [colors.seriesA, colors.seriesB]) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(series.slice(i, i + 2), 16));
        assert.ok(b >= r, `series colour ${series} is red-dominant`);
        assert.ok(b >= g, `series colour ${series} is green-dominant`);
      }
    }
  });
});

describe("OG package refs", () => {
  test("passes through refs that fit", () => {
    assert.equal(
      truncateRef("@testing-library/react-hooks@8.0.1"),
      "@testing-library/react-hooks@8.0.1",
    );
  });

  test("truncates refs longer than the cap", () => {
    assert.equal(truncateRef("abcdef", 4), "abc…");
  });
});

describe("OG image model", () => {
  test("builds the generic card", () => {
    const model = buildOgImageModel(new URL("https://npm.tax/api/og?ogv=7"));
    const genericScenario = getRiskScenario({
      probExp: Math.log10(2.5e-6),
      days: 365 * 2,
    });

    assert.equal(model.variant, "generic");
    assert.deepEqual(model.colors, DARK);
    assert.equal(model.eyebrow, "npm supply-chain risk / example project");
    assert.equal(model.eyebrowRef, undefined);
    // Nothing was asked about, so there is nothing to assess.
    assert.equal(model.severity, undefined);
    assert.equal(sentence(model), "Model the supply-chain risk hiding in an npm dependency tree.");
    assert.equal(model.fieldLabel, undefined);
    assert.deepEqual(
      model.ledger.map((row) => row.value),
      [
        genericScenario.totalDeps.toLocaleString(),
        genericScenario.dailyP.toExponential(2),
        formatDays(genericScenario.timePeriodDays),
        formatDays(genericScenario.expectedDaysToBreach),
      ],
    );
  });

  test("builds the light palette when requested", () => {
    const model = buildOgImageModel(new URL("https://npm.tax/api/og?theme=light"));

    assert.equal(model.colors.paper, "#eceee8");
    assert.equal(model.colors.ink, "#14170e");
    assert.equal(model.colors.inkFaint, "#14170e57");
    assert.equal(model.colors.levy, "#a03222");
    assert.equal(model.colors.levyWash, "#a0322226");
  });

  test("builds the scenario card", () => {
    const model = buildOgImageModel(
      new URL("https://npm.tax/api/og?direct=10&transitive=20&probExp=-6&days=180"),
    );

    assert.equal(model.variant, "scenario");
    assert.equal(model.eyebrow, "Scenario");
    assert.equal(model.eyebrowRef, undefined);
    // 0.556% is below the medium threshold, so the low tone reads in moss.
    assert.deepEqual(model.severity, { label: "Assessed Low", color: DARK.moss });
    assert.equal(model.accent, DARK.moss);
    assert.equal(
      sentence(model),
      "This scenario has a 0.556% modeled chance of at least one package compromise in 6 months.",
    );
    assert.deepEqual(
      model.ledger.map((row) => row.label),
      ["Modeled surface", "Daily breach / pkg", "Time period", "Time to breach"],
    );
    assert.equal(model.ledger[0].value, "31");
  });

  test("builds the package card, its field, and its ledger", () => {
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
    const geometry = getPackageFieldGeometry(MODELED_ROOT_PACKAGE_COUNT, 55, 192, OG_FIELD_ASPECT);
    const model = buildOgImageModel(url);

    assert.equal(model.variant, "package");
    assert.equal(model.eyebrow, "Package report for");
    assert.equal(model.eyebrowRef, "astro@6.4.4");
    // 12% sits between the thresholds, so the medium tone reads in ochre.
    assert.deepEqual(model.severity, { label: "Assessed Medium", color: DARK.ochre });
    assert.equal(
      sentence(model),
      `astro@6.4.4 has a ${formatProb(scenario.prob)} modeled chance of at least one package compromise in ${formatDays(scenario.timePeriodDays)}.`,
    );
    // The ref is set in mono and the probability carries the severity colour.
    assert.deepEqual(model.verdict.lines[0][0], { text: "astro@6.4.4", mono: true });
    assert.ok(
      model.verdict.lines.some((line) =>
        line.some(
          (segment) => segment.accent === true && segment.text === formatProb(scenario.prob),
        ),
      ),
    );
    assert.equal(model.field.viewBox, `0 0 ${FIELD_SIZE} ${geometry.height}`);
    assert.equal(model.field.selfPath, geometry.selfPath);
    assert.equal(model.field.directPath, geometry.directPath);
    assert.equal(model.field.transitivePath, geometry.transitivePath);
    assert.equal(model.field.selfValue, "1");
    assert.equal(model.field.directValue, "55");
    assert.equal(model.field.transitiveValue, "192");
    assert.ok(model.field.width <= OG_LAYOUT.fieldMaxWidth);
    assert.ok(model.field.height <= OG_LAYOUT.fieldMaxHeight);
    // The curve is the verdict's proof: it has to end on the same number.
    assert.equal(model.curve.endLabel, formatProb(scenario.prob));
    assert.equal(model.curve.xLabels.at(-1), `${scenario.timePeriodDays}d`);
    assert.ok(model.curve.linePath.startsWith(`M${OG_CURVE.padLeft} `));
    assert.deepEqual(
      model.ledger.map((row) => row.value),
      [
        scenario.totalDeps.toLocaleString(),
        scenario.dailyP.toExponential(2),
        formatDays(scenario.timePeriodDays),
        formatDays(scenario.expectedDaysToBreach),
      ],
    );
  });

  test("states the mark scale in the field label once marks stand for many packages", () => {
    const model = buildOgImageModel(
      new URL("https://npm.tax/api/og?direct=200&transitive=40000&probExp=-4&days=1095"),
    );

    assert.equal(model.fieldLabel, "1 mark = 10 packages");
    assert.equal(sentence(model).includes(">99.99%"), true);
  });

  test("keeps package input as text data for React to escape", () => {
    const model = buildOgImageModel(
      new URL(
        "https://npm.tax/api/og?direct=1&transitive=2&pkg=evil%26pkg%3D%3Cscript%3E%22&v=1.0.0%3Csvg%3E",
      ),
    );

    assert.equal(model.eyebrowRef, 'evil&pkg=<script>"@1.0.0<svg>');
    assert.deepEqual(model.verdict.lines[0][0], {
      text: 'evil&pkg=<script>"@1.0.0<svg>',
      mono: true,
    });
  });
});
