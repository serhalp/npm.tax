/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  breachProb,
  buildLine,
  DEFAULTS,
  expectedDaysToBreach,
  formatBytes,
  formatDays,
  formatModeledPackageCount,
  formatPackageCount,
  formatProb,
  formatProbFixed2,
  formatTimeSliderValue,
  getPackageRef,
  getRiskScenario,
  getScenarioDescription,
  getScenarioTitle,
  MODELED_ROOT_PACKAGE_COUNT,
  parseControlValue,
  parseProbabilityExponent,
} from "./riskModel.ts";

function assertAlmostEqual(actual: number, expected: number, epsilon = 1e-12): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

describe("probability math", () => {
  test("computes cumulative breach probability across package-days", () => {
    assertAlmostEqual(breachProb(2, 0.1, 3), 1 - 0.9 ** 6);
  });

  test("handles degenerate probability inputs", () => {
    assert.equal(breachProb(0, 0.1, 365), 0);
    assert.equal(breachProb(10, 0, 365), 0);
    assert.equal(breachProb(10, 0.1, 0), 0);
    assert.equal(breachProb(10, 1, 365), 1);
  });

  test("computes expected days from the daily aggregate breach probability", () => {
    const dailyAggregate = 1 - 0.9 ** 2;
    assertAlmostEqual(expectedDaysToBreach(2, 0.1), 1 / dailyAggregate);
  });

  test("handles degenerate expected-time inputs", () => {
    assert.equal(expectedDaysToBreach(0, 0.1), Infinity);
    assert.equal(expectedDaysToBreach(10, 0), Infinity);
    assert.equal(expectedDaysToBreach(10, 1), 1);
  });

  test("builds an inclusive chart line from day zero to the horizon", () => {
    const line = buildLine(2, 0.1, 10, 5);

    assert.equal(line.length, 6);
    assert.deepEqual(line[0], { x: 0, y: 0 });
    assert.equal(line.at(-1)?.x, 10);
    assertAlmostEqual(line.at(-1)?.y ?? NaN, breachProb(2, 0.1, 10));
    assert.ok(line.every((point, index) => index === 0 || point.y >= line[index - 1].y));
  });
});

describe("formatting helpers", () => {
  test("formats small probabilities without scientific notation", () => {
    assert.equal(formatProb(0.000515), "0.0515%");
    assert.equal(formatProb(0.00000042), "0.000042%");
    assert.equal(formatProb(0.00000000042), "<0.000001%");
  });

  test("formats larger probabilities with trimmed fixed decimals", () => {
    assert.equal(formatProb(0.1), "10%");
    assert.equal(formatProb(0.12345), "12.35%");
    assert.equal(formatProb(0.99999), ">99.99%");
  });

  test("formats durations with readable precision", () => {
    assert.equal(formatDays(0.5), "12 hours");
    assert.equal(formatDays(1), "1 day");
    assert.equal(formatDays(30), "30 days");
    assert.equal(formatDays(180), "6 months");
    assert.equal(formatDays(365), "1 year");
    assert.equal(formatDays(Infinity), "never");
  });

  test("formats slider durations compactly", () => {
    assert.equal(formatTimeSliderValue(30), "30d");
    assert.equal(formatTimeSliderValue(180), "6mo");
    assert.equal(formatTimeSliderValue(365), "1yr");
  });

  test("formats package counts and bytes", () => {
    assert.equal(formatPackageCount(1), "1 package");
    assert.equal(formatPackageCount(1234), "1,234 packages");
    assert.equal(formatModeledPackageCount(1), "1 modeled package");
    assert.equal(formatModeledPackageCount(1234), "1,234 modeled packages");
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(1536), "1.5 KB");
  });
});

describe("risk scenarios", () => {
  test("uses the extracted defaults and includes the root project baseline", () => {
    const scenario = getRiskScenario({});

    assert.equal(scenario.directDeps, DEFAULTS.direct);
    assert.equal(scenario.transitiveDeps, DEFAULTS.transitive);
    assert.equal(
      scenario.totalDeps,
      MODELED_ROOT_PACKAGE_COUNT + DEFAULTS.direct + DEFAULTS.transitive,
    );
    assert.equal(scenario.packageRef, null);
    assert.equal(scenario.hasPackageVersion, false);
    assert.equal(scenario.hasExplicitNumbers, false);
    assert.equal(scenario.isDefaultScenario, true);
  });

  test("calculates direct-only and hidden transitive risk separately", () => {
    const scenario = getRiskScenario({ direct: 2, transitive: 3, probExp: -2, days: 10 });

    assert.equal(scenario.totalDeps, 6);
    assertAlmostEqual(scenario.probDirectOnly, breachProb(3, scenario.dailyP, 10));
    assertAlmostEqual(scenario.hiddenRisk, scenario.prob - scenario.probDirectOnly);
    assert.ok(scenario.hiddenRisk > 0);
  });

  test("builds package references from optional package versions", () => {
    assert.equal(getPackageRef({ pkg: "astro" }), "astro");
    assert.equal(getPackageRef({ pkg: "astro", v: "6.4.4" }), "astro@6.4.4");
    assert.equal(getPackageRef({}), null);
  });

  test("emits package-specific title and description copy", () => {
    const scenario = getRiskScenario({
      direct: 55,
      transitive: 192,
      probExp: -5.85,
      days: 365,
      pkg: "astro",
      v: "6.4.4",
    });

    assert.equal(getScenarioTitle(scenario), "astro@6.4.4: 12% modeled compromise probability");
    assert.match(
      getScenarioDescription(scenario),
      /^astro@6\.4\.4 has 248 modeled packages, including itself, and 12% breach probability over 1 year\.$/,
    );
  });

  test("marks number-only scenarios as explicit scenarios", () => {
    const scenario = getRiskScenario({ direct: 1, transitive: 1 });

    assert.equal(scenario.hasExplicitNumbers, true);
    assert.equal(scenario.isDefaultScenario, false);
    assert.match(getScenarioTitle(scenario), /^npm risk scenario:/);
    assert.match(getScenarioDescription(scenario), /^An npm dependency-risk scenario/);
  });
});

describe("parseControlValue", () => {
  test("parses plain integers", () => {
    assert.equal(parseControlValue("848", { min: 0 }), 848);
  });

  test("tolerates the grouping separators the readout itself renders", () => {
    assert.equal(parseControlValue("1,250", { min: 0 }), 1250);
    assert.equal(parseControlValue(" 1 250 ", { min: 0 }), 1250);
  });

  test("rounds fractional input to whole packages", () => {
    assert.equal(parseControlValue("12.4", { min: 0 }), 12);
    assert.equal(parseControlValue("12.6", { min: 0 }), 13);
  });

  test("clamps below min", () => {
    assert.equal(parseControlValue("-50", { min: 0 }), 0);
    assert.equal(parseControlValue("0", { min: 1 }), 1);
  });

  test("clamps to max only when one is given", () => {
    assert.equal(parseControlValue("99999", { min: 1, max: 1095 }), 1095);
    // Counts have no ceiling: the slider track grows to fit instead.
    assert.equal(parseControlValue("99999", { min: 0 }), 99999);
  });

  test("returns null for input that is not a number", () => {
    assert.equal(parseControlValue("nonsense", { min: 0 }), null);
    assert.equal(parseControlValue("12abc", { min: 0 }), null);
  });

  test("treats an empty field as no change rather than as min", () => {
    assert.equal(parseControlValue("", { min: 0 }), null);
    assert.equal(parseControlValue("   ", { min: 0 }), null);
  });
});

describe("parseProbabilityExponent", () => {
  test("converts a probability to its base-10 exponent", () => {
    assertAlmostEqual(parseProbabilityExponent("1e-6") ?? NaN, -6);
    assertAlmostEqual(parseProbabilityExponent("0.001") ?? NaN, -3);
  });

  test("round-trips through the exponent the slider carries", () => {
    const exponent = parseProbabilityExponent("2.5e-6");
    assert.notEqual(exponent, null);
    assert.equal((10 ** (exponent ?? 0)).toExponential(2), "2.50e-6");
  });

  test("rejects values outside an open (0, 1)", () => {
    assert.equal(parseProbabilityExponent("0"), null);
    assert.equal(parseProbabilityExponent("1"), null);
    assert.equal(parseProbabilityExponent("-1e-6"), null);
    assert.equal(parseProbabilityExponent("2"), null);
  });

  test("rejects unparseable and empty input", () => {
    assert.equal(parseProbabilityExponent("banana"), null);
    assert.equal(parseProbabilityExponent(""), null);
  });
});

describe("formatProbFixed2", () => {
  test("always keeps two decimal places so columns stay aligned", () => {
    assert.equal(formatProbFixed2(0.5), "50.00%");
    assert.equal(formatProbFixed2(0.3621), "36.21%");
    assert.equal(formatProbFixed2(0), "0.00%");
  });

  test("clamps the ends rather than rendering meaningless precision", () => {
    assert.equal(formatProbFixed2(0.99995), ">99.99%");
    assert.equal(formatProbFixed2(1), ">99.99%");
    assert.equal(formatProbFixed2(0.00000001), "<0.01%");
  });
});
