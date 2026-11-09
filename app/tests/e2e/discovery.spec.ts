import { expect, hydrated, test, type Page } from "./fixtures.ts";

// Slice 8's discovery on the device (docs/plans/slice-8.md §1 and §6), walked in the built site: a stamp survives a reload; every setting
// takes effect with no reload and survives one, the safety notices showing with every setting; the menu by keyboard; the device's views by
// address and the browser's back; a phone's menu; "Go explore" to today's stop with its pill. Pictures wait for Alexis's ping-pong.
const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1728, height: 1000 };

const held = (page: Page, field: string) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as unknown, `gnoworld:device:${field}`);
const root = (page: Page, mark: string) =>
  page.evaluate((name) => document.documentElement.dataset[name] ?? null, mark);
const motionFast = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--motion-fast").trim());

async function settings(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("a stamp", () => {
  test("is kept at a world's first visit, said once, and survives a reload", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.getByText("Stamped · Bubble")).toBeVisible();
    await expect
      .poll(() => held(page, "stamps"))
      .toEqual({ "onyx:bubble": expect.stringMatching(/^\d{4}-\d\d-\d\d$/) });
    const day = await held(page, "stamps");
    await page.reload();
    await hydrated(page);
    expect(await held(page, "stamps")).toEqual(day);
    // A second visit stamps nothing and says nothing of a stamp.
    await expect(page.getByText("Stamped · Bubble")).toHaveCount(0);
  });
});

test.describe("the settings", () => {
  test("take effect with no reload, survive one, and leave every safety notice showing", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await page.goto("/");
    await hydrated(page);
    const testnet = page.getByText("Testnet", { exact: true }).first();
    await expect(testnet).toBeVisible();
    const before = await motionFast(page);
    expect(before).not.toBe("0s");
    const dialog = await settings(page);
    await dialog.getByRole("radio", { name: /^Low/ }).check();
    await expect.poll(() => root(page, "quality")).toBe("low");
    await dialog.getByRole("checkbox", { name: /^Reduce animations/ }).check();
    await expect.poll(() => root(page, "motion")).toBe("reduce");
    await expect.poll(() => motionFast(page)).toBe("0s");
    await dialog.getByRole("checkbox", { name: /^Space in 3D on a phone/ }).check();
    await expect.poll(() => root(page, "phone3d")).toBe("on");
    await expect(testnet).toBeVisible();
    expect(await held(page, "settings")).toEqual({ quality: "low", calm: true, phone3d: true });
    await page.reload();
    await hydrated(page);
    await expect.poll(() => root(page, "quality")).toBe("low");
    await expect.poll(() => root(page, "motion")).toBe("reduce");
    await expect.poll(() => root(page, "phone3d")).toBe("on");
    await expect(page.getByText("Testnet", { exact: true }).first()).toBeVisible();
    // The page came back at its address, #settings: the dialog opens over it. Back to the defaults: the marks go, the device forgets the key.
    const again = page.getByRole("dialog", { name: "Settings" });
    await expect(again).toBeVisible();
    await again.getByRole("radio", { name: /^Auto/ }).check();
    await again.getByRole("checkbox", { name: /^Reduce animations/ }).uncheck();
    await again.getByRole("checkbox", { name: /^Space in 3D on a phone/ }).uncheck();
    await expect.poll(() => root(page, "quality")).toBeNull();
    await expect.poll(() => root(page, "motion")).toBeNull();
    await expect.poll(() => motionFast(page)).toBe(before);
    expect(await held(page, "settings")).toBeNull();
  });
});

test.describe("the menu", () => {
  test("opens at the first press of a key, its first act focused, and Esc gives the focus back to its trigger", async ({
    page,
  }) => {
    await page.setViewportSize(COMPUTER);
    await page.goto("/");
    await hydrated(page);
    const trigger = page.getByRole("button", { name: "Menu" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Your device" });
    await expect(menu).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Passport" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
    // Again by the keyboard, to the settings, which close with Esc and the browser's back alike.
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Settings" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await expect(page).toHaveURL(/#settings$/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
    await expect(page).not.toHaveURL(/#settings$/);
  });

  test("opens the device's views by their address, and the browser's back closes them", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await page.goto("/");
    await hydrated(page);
    await page.goto("/#passport");
    await expect(page.getByRole("dialog", { name: "Passport" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "Passport" })).toBeHidden();
    await expect(page).not.toHaveURL(/#passport$/);
    const dialog = await settings(page);
    await page.goBack();
    await expect(dialog).toBeHidden();
    // Closed by the back, it is not opened again by a forward step that the close replaced.
    await expect(page).not.toHaveURL(/#settings$/);
  });

  test("works on a phone: the menu, the passport and the settings", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await hydrated(page);
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Passport" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Passport" }).click();
    const passport = page.getByRole("dialog", { name: "Passport" });
    await expect(passport).toBeVisible();
    const box = await passport.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(PHONE.width);
    await page.keyboard.press("Escape");
    const dialog = await settings(page);
    await expect(dialog.getByRole("checkbox", { name: /^Space in 3D on a phone/ })).toBeVisible();
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the system's word stills the page's motion with no setting", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await page.goto("/");
    await hydrated(page);
    await expect.poll(() => motionFast(page)).toBe("0s");
    expect(await root(page, "motion")).toBeNull();
  });
});

test.describe("Go explore", () => {
  test("goes to today's next stop when no world holds a crowd, says so, and keeps the progress through a reload", async ({
    page,
  }) => {
    await page.setViewportSize(COMPUTER);
    await page.route("**/api/presence", (route) => route.fulfill({ json: { worlds: [] } }));
    await page.goto("/");
    await hydrated(page);
    await page.getByRole("link", { name: "Go explore" }).click();
    await expect(page.getByText(/^0 of 3 · next stop: /)).toBeVisible();
    await expect(page).not.toHaveURL(/\/$/);
    // The stop's arrival counts it, in the same pill.
    await expect(page.getByText("Today's expedition · 1 of 3")).toBeVisible();
    await page.goto("/");
    await page.reload();
    await hydrated(page);
    await page.getByRole("link", { name: "Go explore" }).click();
    await expect(page.getByText(/^1 of 3 · next stop: /)).toBeVisible();
  });
});

test.describe("Follow", () => {
  test("is kept on the device and through a reload", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await page.goto("/w/bubble");
    await hydrated(page);
    await page.getByRole("button", { name: "Follow", exact: true }).click();
    await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
    expect(await held(page, "follows")).toEqual({ worlds: ["onyx:bubble"], people: [] });
    await page.reload();
    await hydrated(page);
    await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  });
});
