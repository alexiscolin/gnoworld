import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, hydrated, test } from "./fixtures.ts";

// Slice 5's 5p: on a phone the places are a list with a planet thumbnail each (ADR-0002 §10, "mobile is the same space").
// No world has a capture yet, so none shows a preview: the thumb is the drawn fallback of `ui`, never a picture from
// elsewhere, and no empty frame or broken picture stands in a preview's place. F336: nothing leaves the site, no referrer.
async function openList(page: Page) {
  await page.goto("/list");
  await hydrated(page);
  const rows = page.getByRole("list", { name: "Places" }).getByRole("listitem");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  return { rows, count };
}

test.describe("the places list on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("each place has its planet thumbnail beside its link, drawn, and no preview", async ({ page }) => {
    const { rows, count } = await openList(page);
    for (let each = 0; each < count; each++) {
      const row = rows.nth(each);
      await expect(row.getByRole("link")).toHaveCount(1);
      const pictures = row.locator("img");
      await expect(pictures).toHaveCount(1);
      await expect(pictures).toBeVisible();
      await expect(pictures).toHaveAttribute("alt", "");
      expect(await pictures.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      expect(await pictures.evaluate((img) => img.closest("[data-fallback]") !== null)).toBe(true);
    }
    await expect(page.locator("figure, picture, video, iframe, [data-preview]")).toHaveCount(0);
  });

  test("asks nobody else for a picture: every request stays on the site, and a picture sends no referrer", async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? "http://localhost").origin;
    const seen: string[] = [];
    const referred: string[] = [];
    const pending: Promise<void>[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith("data:") && new URL(url).origin !== origin) seen.push(url);
      if (request.resourceType() === "image" && !url.startsWith("data:"))
        pending.push(
          request.allHeaders().then((headers) => {
            if (headers["referer"] !== undefined) referred.push(url);
          }),
        );
    });
    await page.goto("/list");
    await hydrated(page);
    await page.waitForLoadState("networkidle");
    expect(seen).toEqual([]);
    await Promise.all(pending);
    expect(referred).toEqual([]);
    const policies = await page
      .locator("img")
      .evaluateAll((all) => all.map((img) => img.getAttribute("referrerpolicy")));
    expect(policies.length).toBeGreaterThan(0);
    expect(new Set(policies)).toEqual(new Set(["no-referrer"]));
  });

  test("has no accessibility violation (axe), no box past the width and a thumb a person can see", async ({ page }) => {
    await page.goto("/list");
    await hydrated(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const thumb = page.locator("ul[aria-label='Places'] img").first();
    await expect(thumb).toBeVisible();
    const box = await thumb.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
  });

  test("on a computer the thumb shows too, beside each place", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const { rows, count } = await openList(page);
    for (let each = 0; each < count; each++) await expect(rows.nth(each).locator("img")).toBeVisible();
  });

  test("looks as approved", async ({ page }) => {
    await page.goto("/list");
    await hydrated(page);
    await expect(page.getByRole("list", { name: "Places" })).toHaveScreenshot("list-thumbs-390.png");
  });
});
