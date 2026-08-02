/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  breachProbabilityTone,
  expectedBreachTimeTone,
  expandedSliderMax,
  FIELD_ASPECT,
  FIELD_MAX_MARKS,
  FIELD_MIN_COLS,
  FIELD_SIZE,
  getPackageFieldGeometry,
} from "./riskVisuals.ts";

function countMarks(path: string): number {
  return path === "" ? 0 : path.split("M").length - 1;
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

describe("package field geometry", () => {
  test("draws one mark per package and splits root from transitive", () => {
    const field = getPackageFieldGeometry(1, 23, 848);

    assert.equal(field.totalPackages, 872);
    assert.equal(field.totalMarks, 872);
    assert.equal(field.packagesPerMark, 1);
    assert.equal(field.selfMarks, 1);
    assert.equal(field.directMarks, 23);
    assert.equal(field.transitiveMarks, 848);
    assert.equal(countMarks(field.selfPath), 1);
    assert.equal(countMarks(field.directPath), 23);
    assert.equal(countMarks(field.transitivePath), 848);
  });

  test("lays marks out as a band inside the fixed viewBox width", () => {
    const field = getPackageFieldGeometry(1, 23, 848);

    assert.equal(field.cols, 65);
    assert.equal(field.rows, 14);
    assert.equal(field.width, FIELD_SIZE);
    assert.ok(field.cols * field.rows >= field.totalMarks);
    assert.ok(field.cell < field.pitch, "marks must leave a gutter between them");
  });

  test("bands always sum to the drawn mark total", () => {
    for (const [direct, transitive] of [
      [0, 0],
      [23, 848],
      [167, 927],
      [200, 40_000],
      [40_000, 10],
      [5, 0],
      [0, 500],
    ]) {
      const field = getPackageFieldGeometry(1, direct, transitive);
      assert.equal(
        field.selfMarks + field.directMarks + field.transitiveMarks,
        field.totalMarks,
        `bands did not sum for ${direct} direct / ${transitive} transitive`,
      );
      assert.equal(
        countMarks(field.selfPath) +
          countMarks(field.directPath) +
          countMarks(field.transitivePath),
        field.totalMarks,
      );
    }
  });

  test("holds roughly the target aspect across realistic tree sizes", () => {
    for (const transitive of [848, 927, 5000, 40_000]) {
      const field = getPackageFieldGeometry(1, 23, transitive);
      const aspect = field.width / field.height;
      assert.ok(
        aspect > FIELD_ASPECT * 0.8 && aspect < FIELD_ASPECT * 1.25,
        `aspect ${aspect} strayed too far from ${FIELD_ASPECT} at ${transitive} transitive`,
      );
    }
  });

  test("keeps a lone root package visible with no dependencies", () => {
    const field = getPackageFieldGeometry(1, 0, 0);

    assert.equal(field.totalPackages, 1);
    assert.equal(field.selfMarks, 1);
    assert.equal(field.directMarks, 0);
    assert.equal(countMarks(field.selfPath), 1);
    assert.equal(field.directPath, "");
    assert.equal(field.transitivePath, "");
  });

  test("keeps marks small for tiny trees instead of drawing huge blocks", () => {
    const field = getPackageFieldGeometry(1, 2, 0);

    assert.equal(field.totalPackages, 3);
    assert.equal(field.cols, FIELD_MIN_COLS);
    assert.equal(field.rows, 1);
    assert.ok(field.cell <= FIELD_SIZE / FIELD_MIN_COLS);
  });

  test("treats negative dependency inputs as zero", () => {
    const field = getPackageFieldGeometry(1, -10, 20);

    assert.equal(field.totalPackages, 21);
    assert.equal(field.selfMarks, 1);
    assert.equal(field.directMarks, 0);
    assert.equal(countMarks(field.transitivePath), 20);
  });

  test("caps drawn marks and reports the scale it switched to", () => {
    const field = getPackageFieldGeometry(1, 200, 40_000);

    assert.equal(field.totalPackages, 40_201);
    assert.ok(field.totalMarks <= FIELD_MAX_MARKS);
    assert.equal(field.packagesPerMark, Math.ceil(40_201 / FIELD_MAX_MARKS));
    assert.equal(
      countMarks(field.selfPath) + countMarks(field.directPath) + countMarks(field.transitivePath),
      field.totalMarks,
    );
  });

  test("keeps every non-empty band visible when marks are scaled", () => {
    const field = getPackageFieldGeometry(1, 40_000, 10);

    assert.ok(field.packagesPerMark > 1, "expected the mark cap to kick in");
    assert.ok(field.selfMarks >= 1, "a single root package must still get a mark");
    assert.ok(field.transitiveMarks >= 1, "ten transitive packages must still get a mark");
    assert.ok(field.directMarks < field.totalMarks);
    assert.ok(countMarks(field.transitivePath) >= 1);
  });

  test("deals the same marks flatter when a caller asks for a wider aspect", () => {
    const page = getPackageFieldGeometry(1, 23, 848);
    const strip = getPackageFieldGeometry(1, 23, 848, 32);

    assert.equal(strip.totalMarks, page.totalMarks);
    assert.ok(strip.cols > page.cols);
    assert.ok(strip.rows < page.rows);
    assert.ok(strip.width / strip.height > page.width / page.height);
  });

  test("falls back to the column floor on a degenerate aspect", () => {
    const field = getPackageFieldGeometry(1, 23, 848, 0);

    assert.equal(field.cols, FIELD_MIN_COLS);
    assert.equal(
      countMarks(field.selfPath) + countMarks(field.directPath) + countMarks(field.transitivePath),
      field.totalMarks,
    );
  });
});
