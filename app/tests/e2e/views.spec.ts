import { expect, hydrated, test } from "./fixtures.ts";

// A phone is the full chat alone (D13711): the home has no views pill and no View in space, at 390 and at 320 px, where the pill's names once
// broke. What a computer's pill holds is the shell's and rail's own journeys'.
for (const width of [390, 320])
  test(`draws no views pill and no View in space on a phone ${String(width)} px wide, and no sideways scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Views" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Views of space" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View in space" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
