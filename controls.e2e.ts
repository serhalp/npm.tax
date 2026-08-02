import { expect, type Page, test } from "@playwright/test";

/**
 * Behaviour of the interactive controls, in a real browser.
 *
 * These live in Playwright rather than a component test because most of what
 * can break here needs layout: a popover in the top layer, a focus ring clipped
 * by a scrolling ancestor, a chart that swaps viewBoxes at a breakpoint. A DOM
 * shim would report all of it as passing.
 */

const field = (page: Page, name: string) => page.getByRole("textbox", { name });
const slider = (page: Page, name: string) => page.getByRole("slider", { name });

/** The controls only wire up after hydration, so a raw goto is not enough. */
async function open(page: Page, url = "/") {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tune the model" })).toBeVisible();
  await expect(slider(page, "Direct dependencies")).toBeEnabled();
  await page.waitForLoadState("networkidle");
}

/**
 * Type into a readout the way a person does. `fill()` on an already-focused
 * controlled input races React's own value updates and concatenates.
 */
async function typeInto(page: Page, name: string, text: string) {
  const target = field(page, name);
  await target.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
  return target;
}

test.describe("exact-value fields", () => {
  test("every control's readout is an editable field", async ({ page }) => {
    await open(page);

    await expect(field(page, "Exact direct dependencies")).toHaveValue("23");
    await expect(field(page, "Exact transitive dependencies")).toHaveValue("848");
    await expect(field(page, "Exact time period")).toHaveValue("1yr");
    await expect(field(page, "Exact daily breach probability per package")).toHaveValue(/e-/);
  });

  test("typing a value commits it to the URL and the verdict", async ({ page }) => {
    await open(page);

    await typeInto(page, "Exact direct dependencies", "100");
    await page.keyboard.press("Enter");

    await expect(field(page, "Exact direct dependencies")).toHaveValue("100");
    await expect(page).toHaveURL(/direct=100/);
    await expect(slider(page, "Direct dependencies")).toHaveValue("100");
  });

  test("a formatted readout is edited as its raw value", async ({ page }) => {
    await open(page);
    const time = field(page, "Exact time period");

    await time.click();
    await expect(time).toHaveValue("365");

    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("400");
    await page.keyboard.press("Enter");
    await expect(time).toHaveValue("1.1yr");
    await expect(page).toHaveURL(/days=400/);
  });

  test("blur commits and Escape discards", async ({ page }) => {
    await open(page);
    const direct = field(page, "Exact direct dependencies");

    await typeInto(page, "Exact direct dependencies", "77");
    await page.getByRole("heading", { name: "Tune the model" }).click();
    await expect(direct).toHaveValue("77");

    await typeInto(page, "Exact direct dependencies", "999");
    await page.keyboard.press("Escape");
    await expect(direct).toHaveValue("77");
    await expect(page).not.toHaveURL(/direct=999/);
  });

  test("grouped input is accepted and junk is rejected", async ({ page }) => {
    await open(page);
    const transitive = field(page, "Exact transitive dependencies");

    await typeInto(page, "Exact transitive dependencies", "1,250");
    await page.keyboard.press("Enter");
    await expect(transitive).toHaveValue("1250");

    await typeInto(page, "Exact transitive dependencies", "nonsense");
    await page.keyboard.press("Enter");
    await expect(transitive).toHaveValue("1250");
  });

  test("a typed value beyond the track grows the slider's range", async ({ page }) => {
    await open(page);
    const track = slider(page, "Transitive dependencies");
    await expect(track).toHaveAttribute("max", "5000");

    await typeInto(page, "Exact transitive dependencies", "9000");
    await page.keyboard.press("Enter");

    await expect(field(page, "Exact transitive dependencies")).toHaveValue("9000");
    await expect(track).toHaveAttribute("max", "9000");
  });

  test("time period clamps to its fixed range", async ({ page }) => {
    await open(page);

    await typeInto(page, "Exact time period", "99999");
    await page.keyboard.press("Enter");

    await expect(field(page, "Exact time period")).toHaveValue("3yr");
    await expect(page).toHaveURL(/days=1095/);
  });

  test("moving a slider updates its readout", async ({ page }) => {
    await open(page);
    const direct = field(page, "Exact direct dependencies");

    await slider(page, "Direct dependencies").focus();
    await page.keyboard.press("ArrowRight");

    await expect(direct).toHaveValue("24");
    await expect(page).toHaveURL(/direct=24/);
  });
});

test.describe("why these defaults", () => {
  const trigger = (page: Page) => page.getByRole("button", { name: "Why these defaults?" });
  const popover = (page: Page) => page.locator("[popover]");

  test("opens from the keyboard and closes on Escape", async ({ page }) => {
    await open(page);

    await expect(popover(page)).toBeHidden();
    await trigger(page).focus();
    await expect(popover(page)).toBeVisible();
    await expect(popover(page).getByRole("link", { name: /Pinning Is Futile/ })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(popover(page)).toBeHidden();
  });

  test("opens on hover and survives the pointer reaching its link", async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), "no hover on touch");
    await open(page);

    await trigger(page).hover();
    await expect(popover(page)).toBeVisible();

    // The close is deliberately delayed so the pointer can cross the gap.
    await popover(page)
      .getByRole("link", { name: /Pinning Is Futile/ })
      .hover();
    await expect(popover(page)).toBeVisible();

    await page.mouse.move(5, 5);
    await expect(popover(page)).toBeHidden();
  });

  test("opens on tap where there is no hover", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch-only");
    await open(page);

    await trigger(page).tap();
    await expect(popover(page)).toBeVisible();
  });

  test("escapes the scrolling rail instead of being clipped", async ({ page }) => {
    await open(page);
    await trigger(page).focus();

    const box = await popover(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  });

  test("disappears once any control is changed", async ({ page }) => {
    await open(page);
    await expect(trigger(page)).toBeVisible();

    await slider(page, "Direct dependencies").focus();
    await page.keyboard.press("ArrowRight");

    await expect(trigger(page)).toHaveCount(0);
  });

  test("stays hidden when arriving on an explicit scenario", async ({ page }) => {
    await open(page, "/?direct=23&transitive=848");
    await expect(trigger(page)).toHaveCount(0);
  });
});

async function expectDisclosureToggles(page: Page, name: RegExp) {
  const summary = page.locator("summary").filter({ hasText: name });
  const details = page.locator("details").filter({ has: summary });

  await expect(details).not.toHaveAttribute("open", /.*/);
  await summary.click();
  await expect(details).toHaveAttribute("open", /.*/);
  await summary.click();
  await expect(details).not.toHaveAttribute("open", /.*/);
}

test.describe("disclosures", () => {
  test("model notes and the extra actions both toggle", async ({ page }) => {
    await open(page);

    await expectDisclosureToggles(page, /Model notes/);
    await expectDisclosureToggles(page, /Two more actions/);
  });
});

test.describe("package lookup", () => {
  test("reports a package that does not exist", async ({ page }) => {
    await open(page);

    await field(page, "Package name").fill("this-package-should-not-exist-xyz");
    await page.getByRole("button", { name: /Fetch dependency count/ }).click();

    await expect(page.getByText(/^Error:/)).toBeVisible({ timeout: 20_000 });
  });

  test("adopts a real package's counts into the model", async ({ page }) => {
    await open(page);

    await field(page, "Package name").fill("semver");
    await page.getByRole("button", { name: /Fetch dependency count/ }).click();

    await expect(page.getByText(/total dependencies/)).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/pkg=semver/);
    // The lookup feeds the model, so the scenario is no longer the default one.
    await expect(page.getByRole("button", { name: "Why these defaults?" })).toHaveCount(0);
  });
});

test.describe("layout", () => {
  test("desktop keeps the rail beside the report", async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), "desktop-only layout");
    await open(page);

    const report = await page.locator("h1").boundingBox();
    const rail = await page.locator("aside").boundingBox();
    expect(rail!.x).toBeGreaterThan(report!.x + report!.width - 1);

    // The rail scrolls internally rather than stretching the page.
    await expect(page.locator("aside")).toHaveCSS("overflow-y", "auto");
  });

  test("mobile stacks the rail below the report and drops the wide chart", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "mobile-only layout");
    await open(page);

    const report = await page.locator("h1").boundingBox();
    const rail = await page.locator("aside").boundingBox();
    expect(rail!.y).toBeGreaterThan(report!.y);

    // Two viewBoxes exist so labels stay legible; only the narrow one renders.
    const shown = page.locator("svg[viewBox='0 0 360 220']");
    const hidden = page.locator("svg[viewBox='0 0 720 268']");
    await expect(shown).toBeVisible();
    await expect(hidden).toBeHidden();
  });

  test("the page never scrolls sideways", async ({ page }) => {
    await open(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
