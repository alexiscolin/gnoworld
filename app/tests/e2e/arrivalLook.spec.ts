import AxeBuilder from "@axe-core/playwright";
import { adena } from "./adena.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// How the arrival banners look (slice 9h, frames 90 to 97), on a phone and a computer. No journey reaches first words (the
// journeys' moderation has no key), so the page is handed the answers a server would give; the pictures are approved on the
// Mac Studio (decision 4238523f), never here.
const SIZES = [
  ["phone", 390, 844],
  ["computer", 1280, 900],
] as const;
const CHARTER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

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
  await page.route("**/api/signals?world=bubble", (route) =>
    route.fulfill({ json: { world: "bubble", charted: { account: CHARTER, at }, words: null } }),
  );
  await page.route("**/api/signals/chart", (route) => route.fulfill({ json: { world: "bubble", first: true } }));
  await page.goto("/w/bubble");
  await hydrated(page);
  await page.getByRole("button", { name: "Log in with Adena" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

test.describe("the arrival banners, as they look", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  for (const [size, width, height] of SIZES) {
    test(`both banners and the plate's first, on a ${size}'s screen`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await arriveWith(page, ["chart", "words"]);
      const chart = page.getByRole("article", { name: "First to chart · Bubble" });
      const words = page.getByRole("article", { name: "First words in Bubble" });
      await expect(chart).toBeVisible();
      await expect(words).toBeVisible();
      await expect(page.getByText("First charted by @g1jg8m…vsqf5")).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      ).toBe(0);
      await expect(chart).toHaveScreenshot(`arrival-chart-${size}.png`);
      await expect(words).toHaveScreenshot(`arrival-words-${size}.png`);
    });
  }
});
