// Every story as Alexis approved it (docs/DESIGN-SYSTEM.md, "Testing the CSS", "Pictures"): each
// story at three widths, under reduced motion so nothing moves, compared to the pixel. Each platform
// keeps its own pictures, since text renders differently on each.
import { expect, open, stories, tagged, test } from "./storybook.ts";

for (const width of [1280, 768, 320]) {
  test(`every story looks as approved at ${String(width)} px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 800 });
    // A story that draws nothing on purpose, or sits in the top layer, is pictured as the whole
    // screen: an empty one keeps an approved picture, blank, which one drawing by mistake fails.
    const whole = new Set([...(await tagged(page, "empty")), ...(await tagged(page, "viewport"))]);
    for (const id of await stories(page)) {
      await open(page, id);
      const name = width === 1280 ? `${id}.png` : `${id}-${String(width)}.png`;
      const shot = whole.has(id) ? page : page.locator("#storybook-root");
      await expect.soft(shot).toHaveScreenshot(name, { animations: "disabled" });
    }
  });
}
