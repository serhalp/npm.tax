/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  breachProbabilityTone,
  expectedBreachTimeTone,
  expandedSliderMax,
  getDependencyIcebergGeometry,
  toSvgPoints,
} from "./riskVisuals.ts";

function assertAlmostEqual(actual: number, expected: number, epsilon = 1e-12): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

describe("risk tones", () => {
  test("classifies breach probability at the configured boundaries", () => {
    assert.equal(breachProbabilityTone(0), "good");
    assert.equal(breachProbabilityTone(0.099999), "good");
    assert.equal(breachProbabilityTone(0.1), "warning");
    assert.equal(breachProbabilityTone(0.299999), "warning");
    assert.equal(breachProbabilityTone(0.3), "danger");
  });

  test("classifies expected breach time at the configured boundaries", () => {
    const eighteenMonths = 18 * 30.44;
    const fiveYears = 5 * 365.25;

    assert.equal(expectedBreachTimeTone(eighteenMonths - 0.001), "danger");
    assert.equal(expectedBreachTimeTone(eighteenMonths), "warning");
    assert.equal(expectedBreachTimeTone(fiveYears), "warning");
    assert.equal(expectedBreachTimeTone(fiveYears + 0.001), "good");
    assert.equal(expectedBreachTimeTone(Infinity), "good");
  });
});

describe("slider ranges", () => {
  test("keeps the base max until the value exceeds it", () => {
    assert.equal(expandedSliderMax(0, 200, 50), 200);
    assert.equal(expandedSliderMax(200, 200, 50), 200);
  });

  test("expands to the next increment above the current value", () => {
    assert.equal(expandedSliderMax(201, 200, 50), 250);
    assert.equal(expandedSliderMax(250, 200, 50), 250);
    assert.equal(expandedSliderMax(251, 200, 50), 300);
  });
});

describe("dependency iceberg geometry", () => {
  test("uses a minimum visible direct segment when there are no external deps", () => {
    const geometry = getDependencyIcebergGeometry(0, 0);

    assert.equal(geometry.totalExternalDeps, 0);
    assert.equal(geometry.directShare, 0);
    assert.equal(geometry.splitY, 32);
    assertAlmostEqual(geometry.splitHalfWidth, 79.15789473684211);
  });

  test("uses the minimum split for all-transitive scenarios", () => {
    const geometry = getDependencyIcebergGeometry(0, 500);

    assert.equal(geometry.totalExternalDeps, 500);
    assert.equal(geometry.directShare, 0);
    assert.equal(geometry.splitY, 32);
  });

  test("treats negative dependency inputs as zero", () => {
    const geometry = getDependencyIcebergGeometry(-10, 20);

    assert.equal(geometry.totalExternalDeps, 20);
    assert.equal(geometry.directShare, 0);
    assert.equal(geometry.splitY, 32);
  });

  test("caps the direct segment for all-direct scenarios", () => {
    const geometry = getDependencyIcebergGeometry(500, 0);

    assert.equal(geometry.totalExternalDeps, 500);
    assert.equal(geometry.directShare, 1);
    assert.equal(geometry.splitY, 84);
    assertAlmostEqual(geometry.splitHalfWidth, 47);
  });

  test("scales mixed dependency ratios by square root of direct share", () => {
    const geometry = getDependencyIcebergGeometry(25, 75);

    assert.equal(geometry.totalExternalDeps, 100);
    assert.equal(geometry.directShare, 0.25);
    assert.equal(geometry.splitY, 84);
    assert.deepEqual(geometry.directPoints[0], [26, 8]);
    assert.deepEqual(geometry.directPoints[1], [214, 8]);
    assert.deepEqual(geometry.transitivePoints.at(-1), [120, 160]);
  });

  test("formats point arrays for SVG polygon attributes", () => {
    assert.equal(
      toSvgPoints([
        [1, 2],
        [3.5, 4],
      ]),
      "1,2 3.5,4",
    );
  });
});
