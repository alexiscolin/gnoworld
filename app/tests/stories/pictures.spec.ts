// Every story as Alexis approved it (docs/DESIGN-SYSTEM.md, "Testing the CSS", "Pictures"): each
// story at three widths, under reduced motion so nothing moves, compared to the pixel. Each platform
// keeps its own pictures, since text renders differently on each.
import { empties, expect, open, stories, test } from "./storybook.ts";

for (const width of [1280, 768, 320]) {
  test(`every story looks as approved at ${String(width)} px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 800 });
    const nothing = await empties(page);
    for (const id of await stories(page)) {
      // A story tagged empty draws nothing on purpose, which a journey measures: no picture.
      if (nothing.has(id)) continue;
      await open(page, id);
      const name = width === 1280 ? `${id}.png` : `${id}-${String(width)}.png`;
      await expect.soft(page.locator("#storybook-root")).toHaveScreenshot(name, { animations: "disabled" });
    }
  });
}
