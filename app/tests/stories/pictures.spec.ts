// Every story as Alexis approved it (docs/DESIGN-SYSTEM.md, "Testing the CSS", "Pictures"): each
// story at three widths, under reduced motion so nothing moves, compared to the pixel. Each platform
// keeps its own pictures, since text renders differently on each.
import { expect, open, stories, tagged, test } from "./storybook.ts";

declare const process: { env: Record<string, string | undefined> };

// PICTURES_OF=<id prefix> compares the stories of that prefix alone, by hand ("tokens--": the tokens story).
const only = process.env["PICTURES_OF"] ?? "";

for (const width of [1280, 768, 320]) {
  test(`every story looks as approved at ${String(width)} px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 800 });
    // A story that draws nothing on purpose, or sits in the top layer, is pictured as the whole
    // screen: an empty one keeps an approved picture, blank, which one drawing by mistake fails.
    const whole = new Set([...(await tagged(page, "empty")), ...(await tagged(page, "viewport"))]);
    const ids = await stories(page, only);
    // A prefix no story has would compare nothing and pass: it fails (F1190).
    expect(ids.length, `a story whose id starts with "${only}"`).toBeGreaterThan(0);
    for (const id of ids) {
      await open(page, id);
      const name = width === 1280 ? `${id}.png` : `${id}-${String(width)}.png`;
      const shot = whole.has(id) ? page : page.locator("#storybook-root");
      await expect.soft(shot).toHaveScreenshot(name, { animations: "disabled" });
    }
  });
}
