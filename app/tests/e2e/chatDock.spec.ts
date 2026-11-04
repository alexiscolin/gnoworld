import AxeBuilder from "@axe-core/playwright";
import { lines } from "./chat.ts";
import { open } from "./chatScreenOpen.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { pixelHash } from "./pixels.ts";

// 5q fix pass, review 1: a world's page is the video's (frames 20 to 35): the plate at the left, the chat a dock at the right
// inside the one outline, and expanded (frames 56 to 77) the same chat full bleed over the page. The state is in the address.
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const near = (value: number, wanted: number, slack = 2) => {
  expect(
    Math.abs(value - wanted),
    `${String(value)} is not ${String(wanted)} within ${String(slack)}`,
  ).toBeLessThanOrEqual(slack);
};
const at = async (page: Page, selector: string) => {
  const found = await page.locator(selector).boundingBox();
  if (found === null) throw new Error(`${selector} is not drawn`);
  return found;
};
const document_ = (page: Page) =>
  page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, inner: window.innerHeight }));
const expand = (page: Page) => page.getByRole("button", { name: "Expand the chat" });
const shrink = (page: Page) => page.getByRole("button", { name: "Shrink the chat" });

test.describe("a world's page: the dock and the full chat", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("docks the chat at the right at the video's measures, the plate at the left, the heading kept (frame 26)", async ({
    page,
  }) => {
    await logIn(page, "dock-look");
    await open(page, { width: 1728, as: ACCOUNT, height: 1080, full: false });
    const dock = await at(page, "[data-chat-layout]");
    // Frame 26: the dock's edge at x 1343 to 1344, from y 98 to y 1056, 360 px wide.
    near(dock.x, 1344);
    near(dock.y, 98);
    near(dock.width, 360);
    near(dock.y + dock.height, 1056);
    const plate = await page.getByRole("region", { name: "Bubble" }).boundingBox();
    if (plate === null) throw new Error("no plate");
    expect(plate.x + plate.width).toBeLessThanOrEqual(dock.x + 1);
    await expect(page.getByRole("heading", { level: 1, name: "Bubble" })).toBeVisible();
    await expect(page.locator('[data-region="worlds"]')).toBeHidden();
    await expect(page.locator('[data-region="rooms"]')).toHaveCount(0);
    await expect(page.locator('[data-region="info"]')).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Message box" })).toBeInViewport();
    const sizes = await document_(page);
    expect(sizes.scroll).toBe(sizes.inner);
    await expect(page).toHaveScreenshot("dock-1728.png", { mask: [page.getByRole("banner")] });
  });

  test("keeps the lines 300 px wide or more in the 320 px dock at 1366 px, beside the plate", async ({ page }) => {
    await open(page, { width: 1366, as: "guest-dockxx", height: 768, full: false });
    const dock = await at(page, "[data-chat-layout]");
    near(dock.width, 320);
    const line = await lines(page).first().boundingBox();
    if (line === null) throw new Error("no line");
    expect(line.width).toBeGreaterThanOrEqual(300);
    const plate = await page.getByRole("region", { name: "Bubble" }).boundingBox();
    if (plate === null) throw new Error("no plate");
    expect(plate.x + plate.width).toBeLessThanOrEqual(dock.x);
  });

  // The narrow header's name gives way inside its button, which must still draw a glyph's ink past its line box: frame 26's name whole.
  test("draws the dock's room name whole: its button cuts none of the letters' ink", async ({ page }) => {
    await open(page, { width: 1728, as: "guest-dockgl", height: 1080, full: false });
    const name = page.locator("[data-chat-layout] h2:has(> button[aria-haspopup='dialog'])");
    const box = await name.boundingBox();
    if (box === null) throw new Error("no room name");
    const clip = { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 };
    const drawn = await page.screenshot({ clip });
    await name.locator("button").evaluate((button) => {
      button.style.overflow = "visible";
    });
    const whole = await page.screenshot({ clip });
    expect(await pixelHash(page, drawn), "the button cuts the name's ink").toBe(await pixelHash(page, whole));
  });

  test("expands to the full chat at 0,0 over the page, its address keeping it, and shrinks back", async ({ page }) => {
    await logIn(page, "dock-expand");
    await open(page, { width: 1728, as: ACCOUNT, height: 1080, full: false });
    await expand(page).click();
    await expect(page).toHaveURL(/chat=full/);
    await expect(page.locator('[data-region="worlds"]')).toBeVisible();
    const root = await at(page, "[data-chat-layout]");
    near(root.x, 0, 0);
    near(root.y, 0, 0);
    expect(root.y + root.height).toBeLessThanOrEqual(1080);
    near(root.width, 1728, 1);
    await expect(page.locator('[data-region="worlds"]')).toBeVisible();
    await expect(page.locator('[data-region="info"]')).toBeVisible();
    await expect(page.getByRole("group", { name: "Message box" })).toBeInViewport();
    const sizes = await document_(page);
    expect(sizes.scroll).toBe(sizes.inner);
    await expect(page.getByRole("heading", { level: 1, name: "Bubble" })).toHaveCount(1);
    // A reload keeps it, and a room chosen keeps it.
    await page.reload();
    await expect(page.locator('[data-region="worlds"]')).toBeVisible();
    await expect(shrink(page)).toBeVisible();
    await page
      .getByRole("navigation", { name: /^Rooms/ })
      .getByRole("link", { name: "#bubble", exact: true })
      .click();
    await expect(page).toHaveURL(/chat=full/);
    await shrink(page).click();
    await expect(page).not.toHaveURL(/chat=full/);
    await expect(expand(page)).toBeVisible();
    near((await at(page, "[data-chat-layout]")).width, 360);
  });

  test("passes axe docked and expanded", async ({ page }) => {
    await logIn(page, "dock-axe");
    await open(page, { width: 1728, as: ACCOUNT, height: 1080, full: false });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expand(page).click();
    await expect(page.locator('[data-region="worlds"]')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("is the whole page under 1280 px, a phone's: the lines, no dock, no expand control, the composer in view", async ({
    page,
  }) => {
    await logIn(page, "dock-narrow");
    await open(page, { width: 1100, as: ACCOUNT, height: 800, full: false });
    await expect(expand(page)).toHaveCount(0);
    await expect(shrink(page)).toHaveCount(0);
    const root = await at(page, "[data-chat-layout]");
    near(root.x, 0, 0);
    near(root.width, 1100, 1);
    await expect(lines(page)).toHaveCount(2);
    await expect(page.getByRole("group", { name: "Message box" })).toBeInViewport();
    const sizes = await document_(page);
    expect(sizes.scroll).toBe(sizes.inner);
  });
});

// Review 2 (F1763): a chunk of the chat that cannot be fetched leaves its own place alone, never the page.
test.describe("a chunk of the chat that cannot be fetched", () => {
  // The worker would serve the chunk from its cache, which a route does not see.
  test.use({ serviceWorkers: "block" });

  test("leaves the Rooms control's place with a word on a phone, the page and its lines standing", async ({ page }) => {
    await page.route(/\/assets\/RoomsDrawer-[\w-]+\.js$/, (route) => route.abort());
    await open(page, { width: 390, as: "guest-chunkxx" });
    await expect(page.getByText("The rooms could not load.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("This world could not load")).toHaveCount(0);
    await expect(lines(page)).toHaveCount(2);
  });

  test("leaves the people's place with a word for a visitor, the page and its lines standing", async ({ page }) => {
    await page.route(/\/assets\/People-[\w-]+\.js$/, (route) => route.abort());
    await open(page, { width: 1280, as: "guest-chunkyy" });
    await expect(page.getByText("Who is here could not load.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("This world could not load")).toHaveCount(0);
    await expect(lines(page)).toHaveCount(2);
  });
});
