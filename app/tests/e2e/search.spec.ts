import AxeBuilder from "@axe-core/playwright";
import { inGames } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// Slice 5's 5n (docs/plans/slice-5.md §1): ⌘K, Ctrl+K and the header's control open a palette over the universe's places;
// typing sends no request (the places are in the page); arrows, Enter and Escape work, and the focus goes back to the opener.
const control = (page: Page) => page.getByRole("button", { name: /^Search/ });
const palette = (page: Page) => page.getByRole("dialog", { name: "Search" });
const field = (page: Page) => page.getByRole("combobox", { name: "Search places" });

async function ready(page: Page, path = "/earth") {
  await page.goto(path);
  await hydrated(page);
}

test.describe("⌘K", () => {
  test("the header's control opens the palette, its field focused, and Escape closes it, the focus back on the control", async ({
    page,
  }) => {
    await ready(page);
    await expect(palette(page)).toBeHidden();
    await control(page).click();
    await expect(palette(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
    await expect(control(page)).toBeFocused();
  });

  for (const chord of ["Meta+k", "Control+k"]) {
    test(`${chord} opens it from anywhere on the page`, async ({ page }) => {
      await ready(page);
      await page.keyboard.press(chord);
      await expect(palette(page)).toBeVisible();
      await expect(field(page)).toBeFocused();
    });
  }

  for (const key of ["k", "Control+Shift+k", "Alt+k", "Meta+Shift+k", "Control+j"]) {
    test(`${key} on the page does not open it`, async ({ page }) => {
      await ready(page);
      await page.keyboard.press(key);
      await expect(palette(page)).toBeHidden();
    });
  }

  test("a k typed in the chat's composer lands in it and opens nothing", async ({ page }) => {
    await inGames(page);
    const composer = page.getByRole("textbox", { name: "Message #games" });
    await composer.click();
    await page.keyboard.press("k");
    await expect(composer).toHaveValue("k");
    await expect(palette(page)).toBeHidden();
  });

  test("the chord while it is open leaves it open, once", async ({ page }) => {
    await ready(page);
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Control+k");
    await expect(palette(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(field(page)).toBeFocused();
  });

  test("Escape on a palette the chord opened puts the focus back where it was", async ({ page }) => {
    await ready(page);
    const home = page.getByRole("link", { name: "gnoworld" });
    await home.focus();
    await page.keyboard.press("Control+k");
    await expect(field(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
    await expect(home).toBeFocused();
  });

  test("choosing a place puts the focus back on the control, and a reopened palette starts empty", async ({ page }) => {
    await ready(page);
    await control(page).click();
    await field(page).fill("bubb");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/w\/bubble$/);
    await expect(control(page)).toBeFocused();
    await control(page).click();
    await expect(field(page)).toHaveValue("");
    await expect(page.getByRole("option", { name: /Bubble/ })).toBeVisible();
    await expect(page.locator("[aria-selected='true']")).toHaveCount(0);
    await field(page).fill("zzz");
    await page.keyboard.press("Escape");
    await control(page).click();
    await expect(field(page)).toHaveValue("");
  });

  test("the arrows and Enter with no place found go nowhere", async ({ page }) => {
    await ready(page);
    await control(page).click();
    await field(page).fill("zzz");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/earth$/);
    await expect(palette(page)).toBeVisible();
    await expect(field(page)).not.toHaveAttribute("aria-activedescendant", /.+/);
  });

  test("the no-place status shows with no result and goes with the first result", async ({ page }) => {
    await ready(page);
    await control(page).click();
    await expect(page.getByText(/no place/i)).toHaveCount(0);
    await field(page).fill("zzz");
    await expect(page.getByText(/no place/i)).toBeVisible();
    await field(page).fill("bubble");
    await expect(page.getByText(/no place/i)).toHaveCount(0);
  });

  test("types, goes down with the arrows, chooses with Enter and lands on the place's page", async ({ page }) => {
    await ready(page);
    await control(page).click();
    await field(page).fill("bubb");
    await expect(page.getByRole("group", { name: /^Worlds\b.*\b1$/ })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option", { name: /Bubble/ })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/w\/bubble$/);
    await expect(palette(page)).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("a click on an option goes to its page too", async ({ page }) => {
    await ready(page);
    await control(page).click();
    await page.getByRole("option", { name: /Bubble/ }).click();
    await expect(page).toHaveURL(/\/w\/bubble$/);
  });

  test("typing in it sends no request", async ({ page }) => {
    await ready(page);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("option").first()).toBeVisible();
    // The page's own settling (the worker, a poll) and the palette's first words (the label font, loaded when first drawn) are over
    // before the count starts.
    await page.waitForLoadState("networkidle");
    const sent: string[] = [];
    page.on("request", (request) => sent.push(request.url()));
    await field(page).pressSequentially("bubble", { delay: 20 });
    await expect(page.getByRole("option", { name: /Bubble/ })).toBeVisible();
    await field(page).fill("");
    await field(page).pressSequentially("zzz");
    await expect(page.getByText(/no place/i)).toBeVisible();
    expect(sent).toEqual([]);
  });

  for (const width of [390, 1280]) {
    test(`at ${String(width)} px the open palette passes axe with a result and with none, and keeps to the gutter`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await ready(page);
      await control(page).click();
      await field(page).fill("b");
      await expect(page.getByRole("option").first()).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      // The dialog's box and every box inside it keep 16 px from the viewport's sides (the shell's gutter).
      const outside = await palette(page).evaluate((dialog, gutter) => {
        const inner = [dialog, ...dialog.querySelectorAll("input, [role='option'], h2, button")];
        return inner
          .map((element) => element.getBoundingClientRect())
          .filter((box) => box.width > 0 && (box.left < gutter - 0.5 || box.right > innerWidth - gutter + 0.5)).length;
      }, 16);
      expect(outside).toBe(0);
      await field(page).fill("zzz");
      await expect(page.getByText(/no place/i)).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await field(page).fill("");
      await expect(page.getByRole("option").first()).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

  test.describe("by touch", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    test("the header's control is 44 px each way", async ({ page }) => {
      await ready(page);
      const box = await control(page).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    });
  });
});
