import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "./fixtures.ts";
import { box, near, style, tokenColour } from "./geometry.ts";
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

  test("says the registry line above the face, the face above the field", async ({ page }) => {
    await opened(page, [1728, 1080]);
    const line = await box(page, "dialog[open] p:has(code)");
    const face = await box(page, "dialog[open] svg");
    const field = await box(page, "dialog[open] [data-part='box']");
    expect(line.y + line.height, "the line is above the face").toBeLessThanOrEqual(face.y);
    expect(face.y + face.height, "the face is above the field").toBeLessThanOrEqual(field.y);
  });

  // F5970: the registry line is 13 px with a 1.5 leading (frame 10), the notes below it 12 px.
  test("sets the registry line in 13 px over 19.5 px", async ({ page }) => {
    await opened(page, [1728, 1080]);
    expect(await style(page, "dialog[open] p:has(code)", "font-size")).toBe("13px");
    expect(await style(page, "dialog[open] p:has(code)", "line-height")).toBe("19.5px");
  });

  // F5981: the frames draw the registry's path in the text colour with no fill, not as a chip.
  test("draws the registry's path in the text colour, on no fill", async ({ page }) => {
    await opened(page, [1728, 1080]);
    expect(await style(page, "dialog[open] code", "background-color")).toBe("rgba(0, 0, 0, 0)");
    expect(await style(page, "dialog[open] code", "color")).toBe(await style(page, "dialog[open] h2", "color"));
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

  // F5967 (answer 9k-3): frame 10's field is 46 px from edge to edge (rows 566 to 611), a 44 px control and its two edges.
  test("draws the field's box 46 px tall, the control's 44 and its edges", async ({ page }) => {
    await opened(page, [1728, 1080]);
    expect((await box(page, "dialog[open] [data-part='box']")).height).toBe(46);
  });

  // F5967: frame 14's Register fill and frame 10's Later border run from row 654 to 697, 44 px.
  test("draws Register and Later 44 px tall", async ({ page }) => {
    await opened(page, [1728, 1080]);
    for (const name of ["Register · 0 GNOT", "Later"])
      expect((await dialog(page).getByRole("button", { name }).boundingBox())?.height, name).toBe(44);
  });

  // F5969: frame 10's title has capitals 19 px tall, Geist 300 at 26 px.
  test("sets the title in 26 px", async ({ page }) => {
    await opened(page, [1728, 1080]);
    expect(await style(page, "dialog[open] h2", "font-size")).toBe("26px");
  });

  // F5968: frame 10's resting edge is (70, 73, 82) over the dialog's (11, 15, 24), about a fifth of the text: the strong line.
  test("draws the resting field's edge in the strong line", async ({ page }) => {
    await opened(page, [1728, 1080]);
    await page.mouse.move(0, 0);
    expect(await style(page, "dialog[open] [data-part='box']", "border-top-color")).toBe(
      await tokenColour(page, "--color-line-strong"),
    );
  });

  // F5980: frame 10's placeholder is dimmer than the prefix beside it (luma 128 against 174).
  test("draws the placeholder in the faint grey, the prefix in the muted one", async ({ page }) => {
    await opened(page, [1728, 1080]);
    const placeholder = await page
      .locator("dialog[open] [data-part='box'] input")
      .evaluate((input) => getComputedStyle(input, "::placeholder").color);
    expect(placeholder).toBe(await tokenColour(page, "--color-text-faint"));
    expect(placeholder, "not the prefix's grey").not.toBe(await tokenColour(page, "--color-text-muted"));
    expect(await style(page, "dialog[open] [data-part='box'] >> text=nym-", "color")).toBe(
      await tokenColour(page, "--color-text-muted"),
    );
  });

  // F5963: the focus ring is the frame's, so it encloses the prefix; the bare input inside draws none.
  test("rings the whole box when its input has the focus, not the input alone", async ({ page }) => {
    await opened(page, [1728, 1080]);
    await expect(dialog(page).getByRole("textbox", { name: "Name" })).toBeFocused();
    expect(await style(page, "dialog[open] [data-part='box']", "outline-style")).toBe("solid");
    expect(await style(page, "dialog[open] [data-part='box'] input", "outline-style")).toBe("none");
  });

  test("sets the field's label in mono caps at 11 px", async ({ page }) => {
    await opened(page, [1728, 1080]);
    expect(await style(page, LABEL, "text-transform")).toBe("uppercase");
    expect(await style(page, LABEL, "font-family")).toMatch(/mono/i);
    expect(await style(page, LABEL, "font-size")).toBe("11px");
  });

  test("sets the field's label in the muted colour", async ({ page }) => {
    await opened(page, [1728, 1080]);
    expect(await style(page, LABEL, "color")).toBe(await tokenColour(page, "--color-text-muted"));
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
