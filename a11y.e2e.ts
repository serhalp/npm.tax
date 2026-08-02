import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectNoAccessibilityViolations(page: Page) {
  await expect(page.getByRole("heading", { name: "Tune the model" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const violations = results.violations.map(({ description, helpUrl, id, impact, nodes }) => ({
    id,
    impact,
    description,
    helpUrl,
    nodes: nodes.map(({ failureSummary, target }) => ({
      target,
      failureSummary,
    })),
  }));

  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`home page has no detectable accessibility violations in ${theme} mode`, async ({
    page,
  }) => {
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem("theme", selectedTheme);
    }, theme);

    await page.goto("/");
    await expectNoAccessibilityViolations(page);
  });

  // Collapsed disclosures hide their contents from axe, and the summaries only
  // fail contrast while hovered, so neither is covered by the scan above.
  test(`expanded and hovered disclosures have no violations in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem("theme", selectedTheme);
    }, theme);

    await page.goto("/");
    // Toggling before hydration leaves `open` on the DOM for React to trip over.
    await page.waitForLoadState("networkidle");
    const summaries = page.locator("details > summary");
    expect(await summaries.count()).toBeGreaterThan(0);
    await summaries.evaluateAll((elements) => {
      for (const element of elements) (element as HTMLElement).click();
    });
    await summaries.last().hover();

    await expectNoAccessibilityViolations(page);
  });

  // The popover is closed until interacted with, so axe never sees its contents
  // on the default scan.
  test(`the defaults popover has no violations in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem("theme", selectedTheme);
    }, theme);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const trigger = page.getByRole("button", { name: "Why these defaults?" });
    await trigger.focus();
    await expect(page.locator("[popover]")).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });
}

test("home page controls expose accessible names", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("slider", { name: "Direct dependencies" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Transitive dependencies" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Time period" })).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Daily breach probability per package" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Package name" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Version" })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Exact daily breach probability per package" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /cumulative breach probability/i })).toBeVisible();
});
