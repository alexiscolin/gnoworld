// Every story as Alexis approved it (docs/DESIGN-SYSTEM.md, "Testing the CSS", "Pictures"): each
// story once, the page of every component at three widths, all under reduced motion so nothing
// moves. Each platform keeps its own pictures, since text renders differently on each.
import { expect, test } from "../e2e/fixtures.ts";
import { open, stories } from "./storybook.ts";

test("every story looks as approved", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const id of await stories(page)) {
    await open(page, id);
    await expect.soft(page.locator("#storybook-root")).toHaveScreenshot(`${id}.png`, { animations: "disabled" });
  }
});

for (const width of [320, 768, 1280]) {
  test(`the page of every component looks as approved at ${String(width)} px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 800 });
    await open(page, "overview--all");
    await expect(page).toHaveScreenshot(`overview-${String(width)}.png`, { animations: "disabled", fullPage: true });
  });
}
