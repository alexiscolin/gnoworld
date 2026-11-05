import { expect, test, type Page } from "./fixtures.ts";
import { logIn, phoneOf } from "./namesChain.ts";

// The name dialog as it looks (9f; frames 9 to 15), on a computer and on a phone, which only reads. The pictures are made and
// approved on the Mac Studio (decision 4238523f). The face is drawn from the test wallet's address, drawn anew at each server's
// start: it is masked, and its look is the Avatar's own pictures' and NameDialog.test.tsx's.
test.describe("the name dialog, as it looks", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });
  const dialog = (page: Page) => page.getByRole("dialog", { name: "Pick a name and a face" });
  const mask = (page: Page) => [dialog(page).getByRole("img")];

  test("on a computer: empty, a problem and the name registered", async ({ page }) => {
    await logIn(page, [1280, 900]);
    await page.getByRole("button", { name: "Pick a name" }).click();
    await expect(dialog(page)).toHaveScreenshot("name-dialog-computer-empty.png", { mask: mask(page) });
    const field = page.getByRole("textbox", { name: "Name" });
    await field.fill("gnomes042");
    await expect(dialog(page)).toContainText(/reserved prefix/);
    await expect(dialog(page)).toHaveScreenshot("name-dialog-computer-problem.png", { mask: mask(page) });
    await field.fill("alexis042");
    await dialog(page).getByRole("button", { name: "Register · 0 GNOT" }).click();
    await expect(dialog(page)).toContainText(/is registered/i);
    await expect(dialog(page)).toHaveScreenshot("name-dialog-computer-done.png", { mask: mask(page) });
  });

  test("on a computer: the wait for Adena's signature", async ({ page }) => {
    await logIn(page, [1280, 900], { wallet: { hold: true } });
    await page.getByRole("button", { name: "Pick a name" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("alexis042");
    await dialog(page).getByRole("button", { name: "Register · 0 GNOT" }).click();
    await expect(dialog(page)).toContainText("Waiting for your signature in Adena…");
    await expect(dialog(page)).toHaveScreenshot("name-dialog-computer-wait.png", { mask: mask(page) });
  });

  test("on a phone, which only reads", async ({ page, playwright, launchOptions }) => {
    const { phone, browser } = await phoneOf(page, { playwright, launchOptions });
    await phone.getByRole("button", { name: "Pick a name" }).tap();
    await expect(dialog(phone)).toHaveScreenshot("name-dialog-phone-empty.png", { mask: mask(phone) });
    await browser.close();
  });
});
