// Every story at three widths, under reduced motion so nothing moves, compared to the pixel with another run's pictures, none
// kept in the repository (D13500; docs/DESIGN-SYSTEM.md, "Pictures"): PICTURES_BASE names a folder outside it, which a run on main
// with --update-snapshots=all fills and the same run on the branch compares with. Each platform takes its own, as text differs.
import { expect, open, stories, tagged, test } from "./storybook.ts";

declare const process: { env: Record<string, string | undefined> };

// PICTURES_OF=<id prefix> compares the stories of that prefix alone ("tokens--": the tokens story).
const only = process.env["PICTURES_OF"] ?? "";
const base = process.env["PICTURES_BASE"] ?? "";

for (const width of [1280, 768, 320]) {
  test(`every story looks as the other run's at ${String(width)} px`, async ({ page }) => {
    // With no folder named, a run would compare with nothing or write into the repository: it fails.
    expect(base, "PICTURES_BASE, the folder of the other run's pictures").not.toBe("");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 800 });
    // A story that draws nothing on purpose, or sits in the top layer, is pictured as the whole
    // screen: an empty one keeps a blank picture, which one drawing by mistake fails.
    const whole = new Set([...(await tagged(page, "empty")), ...(await tagged(page, "viewport"))]);
    const ids = await stories(page, only);
    // A prefix no story has would compare nothing and pass: it fails.
    expect(ids.length, `a story whose id starts with "${only}"`).toBeGreaterThan(0);
    for (const id of ids) {
      await open(page, id);
      const name = width === 1280 ? `${id}.png` : `${id}-${String(width)}.png`;
      const shot = whole.has(id) ? page : page.locator("#storybook-root");
      await expect.soft(shot).toHaveScreenshot(name, { animations: "disabled" });
    }
  });
}
