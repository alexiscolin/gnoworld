import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "./fixtures.ts";
import { box, near, style } from "./geometry.ts";
import { logIn } from "./namesChain.ts";

// 9k (answer 9f-1): the name dialog at the video's size (1728 by 1080) against frames 9 to 15, read off the frames' pixels: the
// dialog 489 px wide (619 to 1108), the kicker above the title, no Close button, the field's label in the mono caps muted style and
// `nym-` inside the field's box. A box is held to 2 px of the frame's (geometry.ts). One test a fact, so a first failure hides none.
const dialog = (page: Page) => page.getByRole("dialog", { name: "Pick a name and a face" });
const LABEL = "dialog[open] label[for]";

async function opened(page: Page, size: [number, number]) {
  await logIn(page, size);
  await page.getByRole("button", { name: "Pick a name" }).click();
  await expect(dialog(page)).toBeVisible();
}

test.describe("the name dialog against the frames", () => {
  test.use({ viewport: { width: 1728, height: 1080 } });

  test("is the frames' width", async ({ page }) => {
    await opened(page, [1728, 1080]);
    near((await box(page, "dialog[open]")).width, 489, "the dialog's width");
  });

  test("has its kicker above the title, inset as the frames' is", async ({ page }) => {
    await opened(page, [1728, 1080]);
    const frame = await box(page, "dialog[open]");
    const kicker = await box(page, "dialog[open] .label");
    const title = await box(page, "dialog[open] h2");
    expect(kicker.y + kicker.height, "the kicker sits above the title").toBeLessThanOrEqual(title.y);
    near(kicker.x - frame.x, 25, "the kicker's inset");
    // F5965: the frames' kicker caps sit 33 px under the border and 19 px above the title's caps; a box here is the line: 11 px
    // for the label (caps 1 px in), a title's caps 4 px below its line's top.
    near(kicker.y - frame.y, 33, "the kicker's top under the dialog's edge");
    near(title.y - (kicker.y + kicker.height), 13, "the gap from the kicker to the title");
    await expect(dialog(page).getByText("YOUR GNO.LAND NAME")).toBeVisible();
  });

  test("draws no Close button", async ({ page }) => {
    await opened(page, [1728, 1080]);
    await expect(dialog(page).getByRole("button", { name: "Close" })).toHaveCount(0);
  });

  test("draws the field's box 439 px wide with nym- inside it", async ({ page }) => {
    await opened(page, [1728, 1080]);
    const field = await box(page, "dialog[open] [data-part='box']");
    near(field.width, 439, "the field's box width");
    const prefix = await box(page, "dialog[open] [data-part='box'] >> text=nym-");
    expect(prefix.x).toBeGreaterThanOrEqual(field.x);
    expect(prefix.x + prefix.width).toBeLessThanOrEqual(field.x + field.width);
  });

  test("sets the field's label in mono caps at 11 px", async ({ page }) => {
    await opened(page, [1728, 1080]);
    expect(await style(page, LABEL, "text-transform")).toBe("uppercase");
    expect(await style(page, LABEL, "font-family")).toMatch(/mono/i);
    expect(await style(page, LABEL, "font-size")).toBe("11px");
  });

  test("sets the field's label in the muted colour", async ({ page }) => {
    await opened(page, [1728, 1080]);
    const muted = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--color-text-muted)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    expect(await style(page, LABEL, "color")).toBe(muted);
  });

  test("passes axe", async ({ page }) => {
    await opened(page, [1728, 1080]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test.describe("the name dialog on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps the field's box, nym- inside, within the screen with no sideways scroll", async ({ page }) => {
    await opened(page, [390, 844]);
    const frame = await box(page, "dialog[open]");
    const field = await box(page, "dialog[open] [data-part='box']");
    const prefix = await box(page, "dialog[open] [data-part='box'] >> text=nym-");
    expect(frame.x + frame.width).toBeLessThanOrEqual(390);
    expect(field.x).toBeGreaterThanOrEqual(frame.x);
    expect(field.x + field.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(prefix.x + prefix.width).toBeLessThanOrEqual(field.x + field.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
