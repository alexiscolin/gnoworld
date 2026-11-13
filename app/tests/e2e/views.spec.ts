import { readFileSync } from "node:fs";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { running } from "./sceneStage.ts";

// Space's two views (7v; Alexis, 2026-11-03, the mock-ups he approved and the GUI board's option B) on a phone, on the gate's software GPU,
// from Onyx's recorded file.
const HOME = "/?test-gpu";
const RECORDED = readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8");
const SLOW = { timeout: 90_000 };

test.describe.configure({ timeout: 180_000 });

const views = (page: Page) => page.getByRole("group", { name: "Views of space" });

// F4691: on a phone the views bar broke its names under the two icons ("EART H", "COSMO S", "LIS T", in 283a3b45's approved picture). Each
// view's name stands on one line, at 390 and 320 px; the icons only once a scene runs, after View in space, in a pill of their own over the
// scene, off the bar and inside the screen.
const linesOfNames = (page: Page) =>
  page
    .getByRole("navigation", { name: "Views" })
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => {
        const range = document.createRange();
        range.selectNodeContents(link);
        return range.getClientRects().length;
      }),
    );
for (const width of [390, 320])
  test(`stands each view's name on one line on a phone ${String(width)} px wide, space's two views only once it shows, off the bar`, async ({
    page,
  }) => {
    await page.route("**/worlds.json", (route) =>
      route.fulfill({ status: 200, body: RECORDED, contentType: "application/json" }),
    );
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(HOME);
    await hydrated(page);
    expect(await linesOfNames(page)).toEqual([1, 1, 1]);
    await expect(views(page)).toHaveCount(0);
    await page.getByRole("button", { name: "View in space" }).click();
    await running(page);
    await expect(views(page)).toBeVisible(SLOW);
    expect(await linesOfNames(page)).toEqual([1, 1, 1]);
    const [bar, group] = await Promise.all([
      page.getByRole("navigation", { name: "Views" }).boundingBox(),
      views(page).boundingBox(),
    ]);
    if (bar === null || group === null) throw new Error("no bar or no views of space on the screen");
    expect(group.y + group.height).toBeLessThanOrEqual(bar.y);
    expect(group.x).toBeGreaterThanOrEqual(0);
    expect(group.x + group.width).toBeLessThanOrEqual(width);
  });
