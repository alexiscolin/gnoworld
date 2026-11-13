import { expect, hydrated, test, type Page } from "./fixtures.ts";

// The welcome card: shown at a first visit over space, never again once used; its two buttons lead to the Get started steps and the Earth's chat
// with the guest's box focused. WELCOME_SHOTS names a folder to write the captures to.
const SHOTS = process.env["WELCOME_SHOTS"];
const sizes = { computer: { width: 1280, height: 800 }, phone: { width: 390, height: 800 } };

const card = (page: Page) => page.getByRole("article", { name: "Every world here is a program on gno.land" });
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(1500);
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
async function first(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto("/earth");
  await hydrated(page);
  await expect(card(page)).toBeVisible({ timeout: 20_000 });
}

for (const [name, size] of Object.entries(sizes)) {
  test.describe(`the welcome card (${name})`, () => {
    test("shows once, and a close keeps it away from the next load", async ({ page }) => {
      await first(page, size);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await shot(page, `${name}-1-card`);
      await card(page).getByRole("button", { name: "Close" }).click();
      await expect(card(page)).toBeHidden();
      await page.reload();
      await hydrated(page);
      await page.waitForTimeout(3000);
      await expect(card(page)).toBeHidden();
    });

    test("Say hi opens the Earth's chat with the focus in the box", async ({ page }) => {
      await first(page, size);
      await card(page).getByRole("button", { name: "Say hi" }).click();
      await expect(page).toHaveURL(/chat=full/);
      await expect(page.getByRole("textbox").first()).toBeFocused({ timeout: 15_000 });
      await shot(page, `${name}-2-say-hi`);
    });

    test("Get started opens the steps", async ({ page }) => {
      await first(page, size);
      await card(page).getByRole("button", { name: "Get started" }).click();
      await expect(page.getByRole("dialog", { name: "Get started" })).toBeVisible();
      await shot(page, `${name}-3-get-started`);
    });
  });
}
