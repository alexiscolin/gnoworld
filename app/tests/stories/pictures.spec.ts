// Every story as Alexis approved it (docs/DESIGN-SYSTEM.md, "Testing the CSS", "Pictures"): each
// story at three widths, under reduced motion so nothing moves, compared to the pixel. Each platform
// keeps its own pictures, since text renders differently on each.
import { expect, open, stories, test } from "./storybook.ts";

// The stories that draw nothing on purpose, which a journey measures (an empty flash takes no room): any
// other story with no box has broken, and fails here.
const EMPTY = new Set(["flash--empty"]);

for (const width of [1280, 768, 320]) {
  test(`every story looks as approved at ${String(width)} px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 800 });
    for (const id of await stories(page)) {
      await open(page, id);
      const drawn = await page.locator("#storybook-root").evaluate((root) => root.getBoundingClientRect().height > 0);
      expect.soft(drawn, `${id} draws ${drawn ? "something" : "nothing"}`).toBe(!EMPTY.has(id));
      if (!drawn) continue;
      const name = width === 1280 ? `${id}.png` : `${id}-${String(width)}.png`;
      await expect.soft(page.locator("#storybook-root")).toHaveScreenshot(name, { animations: "disabled" });
    }
  });
}
