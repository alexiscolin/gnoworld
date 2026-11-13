import { expect, test, type Page } from "./fixtures.ts";
import { EARTH, onEarth } from "./earthStage.ts";

// The Earth's page, to the full chat and back twice, with motion on: each return leaves the plate's flight ended and the dock's chat drawn
// and usable (a flight begun by the framing while the full chat covered space is never waited on).
test.describe.configure({ timeout: 240_000 });
test.use({ viewport: { width: 1728, height: 1080 } });

const expand = (page: Page) => page.getByRole("button", { name: "Open the full chat" });
const shrink = (page: Page) => page.getByRole("button", { name: "Close the full chat" });

async function whole(page: Page) {
  await expect(page.locator("[data-globe]")).toHaveAttribute("data-flown", "landed", { timeout: 40_000 });
  const dock = page.locator("#chat [data-chat-layout]");
  await expect(dock).toBeVisible({ timeout: 15_000 });
  await expect(dock).toHaveCSS("opacity", "1");
  await expect(page.getByRole("group", { name: "Message box" })).toBeVisible();
}

for (const pause of [0, 1500]) {
  test(`the Earth's page after two trips to the full chat and back (pause ${String(pause)} ms)`, async ({ page }) => {
    await onEarth(page, { me: "guest-77", path: EARTH, motion: true, ticking: true });
    await whole(page);
    for (let trip = 0; trip < 2; trip++) {
      await expand(page).click();
      await expect(shrink(page)).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(pause);
      await shrink(page).click();
      await page.waitForTimeout(pause);
      await whole(page);
    }
  });
}
