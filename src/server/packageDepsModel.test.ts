/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildPackageDepsResult,
  encodePackageNamePath,
  getPackageDepsCacheRequestUrl,
  hasUsableInstallSizeResponse,
  isPinnedPackageVersion,
  isValidPackageName,
  LATEST_PACKAGE_DEPS_TTL_SECONDS,
  normalizeDependencyCounts,
  packageDepsInternalCacheHeaders,
  PINNED_PACKAGE_DEPS_TTL_SECONDS,
} from "./packageDepsModel.ts";

describe("package name helpers", () => {
  test("accepts plain and scoped package names used by npm", () => {
    assert.equal(isValidPackageName("react"), true);
    assert.equal(isValidPackageName("@tanstack/react-start"), true);
    assert.equal(isValidPackageName("left-pad"), true);
    assert.equal(isValidPackageName("foo.bar_baz~qux"), true);
    assert.equal(isValidPackageName("React"), true);
  });

  test("rejects obvious junk package names", () => {
    assert.equal(isValidPackageName(""), false);
    assert.equal(isValidPackageName("@scope"), false);
    assert.equal(isValidPackageName("@scope/"), false);
    assert.equal(isValidPackageName("scope/pkg"), false);
    assert.equal(isValidPackageName("@scope/pkg/extra"), false);
    assert.equal(isValidPackageName("two words"), false);
    assert.equal(isValidPackageName("../escape"), false);
    assert.equal(isValidPackageName("name?query"), false);
  });

  test("encodes each package path segment without hiding scoped slashes", () => {
    assert.equal(encodePackageNamePath("react"), "react");
    assert.equal(encodePackageNamePath("@scope/name"), "%40scope/name");
    assert.equal(encodePackageNamePath("@scope/name with spaces"), "%40scope/name%20with%20spaces");
    assert.equal(encodePackageNamePath("plus+sign"), "plus%2Bsign");
  });

  test("treats only exact semver versions as pinned", () => {
    assert.equal(isPinnedPackageVersion("1.2.3"), true);
    assert.equal(isPinnedPackageVersion("1.2.3-beta.1"), true);
    assert.equal(isPinnedPackageVersion("v1.2.3"), true);
    assert.equal(isPinnedPackageVersion("5"), false);
    assert.equal(isPinnedPackageVersion("~5.0.0"), false);
    assert.equal(isPinnedPackageVersion("^5.0.0"), false);
    assert.equal(isPinnedPackageVersion("latest"), false);
    assert.equal(isPinnedPackageVersion(undefined), false);
  });
});

describe("cache helpers", () => {
  test("builds stable Cache API request URLs", () => {
    assert.equal(
      getPackageDepsCacheRequestUrl("@scope/name", "1.2.3"),
      "https://npm.tax/__cache/package-deps?name=%40scope%2Fname&version=1.2.3",
    );
    assert.equal(
      getPackageDepsCacheRequestUrl("astro"),
      "https://npm.tax/__cache/package-deps?name=astro&version=latest",
    );
  });

  test("builds cacheable response headers for Cache API entries", () => {
    assert.deepEqual(packageDepsInternalCacheHeaders(true), {
      "Cache-Control": `public, max-age=${PINNED_PACKAGE_DEPS_TTL_SECONDS}, immutable`,
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${PINNED_PACKAGE_DEPS_TTL_SECONDS}, immutable`,
      "Netlify-Cache-ID": "package-deps",
      "Netlify-Cache-Tag": "package-deps",
    });
    assert.deepEqual(packageDepsInternalCacheHeaders(false), {
      "Cache-Control": `public, max-age=${LATEST_PACKAGE_DEPS_TTL_SECONDS}`,
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${LATEST_PACKAGE_DEPS_TTL_SECONDS}`,
      "Netlify-Cache-ID": "package-deps",
      "Netlify-Cache-Tag": "package-deps",
    });
  });
});

describe("install-size response helpers", () => {
  test("recognizes the minimum usable npmx install-size response", () => {
    assert.equal(hasUsableInstallSizeResponse({ version: "1.0.0", dependencyCount: 3 }), true);
    assert.equal(hasUsableInstallSizeResponse(null), false);
    assert.equal(hasUsableInstallSizeResponse({ dependencyCount: 3 }), false);
    assert.equal(hasUsableInstallSizeResponse({ version: "1.0.0" }), false);
    assert.equal(
      hasUsableInstallSizeResponse({ version: "1.0.0", dependencyCount: Infinity }),
      false,
    );
    assert.equal(hasUsableInstallSizeResponse({ version: 1, dependencyCount: 3 }), false);
  });

  test("normalizes dependency counts and caps direct deps at total deps", () => {
    assert.deepEqual(normalizeDependencyCounts(10, 3), {
      totalDeps: 10,
      directDeps: 3,
      transitiveDeps: 7,
    });
    assert.deepEqual(normalizeDependencyCounts(10, 12), {
      totalDeps: 10,
      directDeps: 10,
      transitiveDeps: 0,
    });
  });

  test("normalizes invalid and negative dependency counts to zero", () => {
    assert.deepEqual(normalizeDependencyCounts(-1, 4), {
      totalDeps: 0,
      directDeps: 0,
      transitiveDeps: 0,
    });
    assert.deepEqual(normalizeDependencyCounts(10, -4), {
      totalDeps: 10,
      directDeps: 0,
      transitiveDeps: 10,
    });
    assert.deepEqual(normalizeDependencyCounts(Number.NaN, Number.POSITIVE_INFINITY), {
      totalDeps: 0,
      directDeps: 0,
      transitiveDeps: 0,
    });
  });

  test("builds a normalized package dependency result from npmx and manifest counts", () => {
    assert.deepEqual(
      buildPackageDepsResult({
        requestedName: "requested",
        requestedVersion: "1.0.0",
        sizeData: {
          package: "actual",
          version: "1.2.3",
          dependencyCount: 5,
          totalSize: 123_456,
        },
        directDependencyCount: 2,
      }),
      {
        package: "actual",
        version: "1.2.3",
        totalDeps: 5,
        directDeps: 2,
        transitiveDeps: 3,
        totalSizeBytes: 123_456,
      },
    );
  });

  test("falls back to request metadata while keeping numeric fields non-negative", () => {
    assert.deepEqual(
      buildPackageDepsResult({
        requestedName: "requested",
        sizeData: {
          dependencyCount: Number.NaN,
          totalSize: -1,
        },
        directDependencyCount: Number.NaN,
      }),
      {
        package: "requested",
        version: "latest",
        totalDeps: 0,
        directDeps: 0,
        transitiveDeps: 0,
        totalSizeBytes: 0,
      },
    );
  });
});
