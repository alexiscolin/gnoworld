import AxeBuilder from "@axe-core/playwright";
import { adena } from "./adena.ts";
import { accountPill, connectButton } from "./account.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// How the arrival banners look (slice 9h, frames 90 to 97), on a phone and a computer. No journey reaches first words (the
// journeys' moderation has no key), so the page is handed the answers a server would give; the pictures are approved on the
// Mac Studio (decision 4238523f), never here.
const SIZES = [
  ["phone", 390, 844],
  ["computer", 1728, 1080],
] as const;

async function arriveWith(page: Page, kinds: readonly ("chart" | "words")[]): Promise<void> {
  await adena(page, "signs", "arrival-look");
  const { address } = (await (await page.request.get("/__wallet?as=arrival-look")).json()) as { address: string };
  const at = new Date().toISOString();
  const frames = kinds.map(
    (kind) => `event: signal\ndata: ${JSON.stringify({ kind, world: "bubble", account: address, at })}\n\n`,
  );
  await page.route("**/api/stream?*", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `${frames.join("")}event: since\ndata: ${JSON.stringify({ time: at })}\n\n`,
    }),
  );
  await page.route("**/api/signals/chart", (route) => route.fulfill({ json: { world: "bubble", first: true } }));
  await page.goto("/w/bubble");
  await hydrated(page);
  await connectButton(page).click();
  await expect(accountPill(page)).toBeVisible();
}

test.describe("the arrival banners, as they look", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  for (const [size, width, height] of SIZES) {
    test(`both banners and the plate's first, on a ${size}'s screen`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await arriveWith(page, ["chart", "words"]);
      const banner = page.locator("[data-banner]");
      await expect(banner).toContainText("First to chart · Bubble");
      await expect(page.getByText(/^First charted by @g1/)).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      ).toBe(0);
      await expect(banner).toHaveScreenshot(`arrival-chart-${size}.png`);
      // One at a time: First words waits until First to chart is closed.
      await banner.getByRole("button", { name: "Close" }).click();
      await expect(banner).toContainText("First words in Bubble");
      await expect(banner).toHaveScreenshot(`arrival-words-${size}.png`);
    });
  }
});

// The review's F5627: from 1400 px the banner floats over the scene and the page makes no room for it, but another flash
// that stays (the update notice) still pushes the page down while a banner shows (F2165), and a narrower page makes room for
// the banner as for any flash.
test.describe("the banner beside the page", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  // Main's banner (frames 23, 93) lies over the scene and never pushes the page, at any width: no room is made for it.
  for (const width of [1728, 1280] as const)
    test(`makes no room for itself at ${String(width)} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1080 });
      await arriveWith(page, ["chart"]);
      await expect(page.locator("[data-banner]")).toContainText("First to chart · Bubble");
      expect(await page.evaluate(() => getComputedStyle(document.body).paddingBlockStart)).toBe("0px");
    });
});
