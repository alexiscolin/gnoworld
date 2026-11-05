import { done, violations } from "./callCard.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { DOWN, logIn, NAME, phoneOf } from "./namesChain.ts";

// 9f's journeys: the account control's name from both chains, "Pick a name", the dialog of frames 9 to 15 (keyboard, axe on a phone,
// which only reads, and a computer) and Register through Adena's stand-in. The chains are stood in (namesChain.ts, NOT recorded).
const pick = (page: Page) => page.getByRole("button", { name: "Pick a name" });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Pick a name and a face" });

test.describe("the account's name", () => {
  test("shows mainnet's name first, with the chain and block it was read at", async ({ page }) => {
    await logIn(page, [1280, 900], { mainnet: "nym-mainname042", onyx: "nym-onyxname042" });
    const shown = page.getByRole("banner").locator("[data-account]");
    await expect(shown).toContainText("nym-mainname042");
    await expect(shown).toHaveAttribute("title", /gno\.land.*1,325,774/);
    await expect(pick(page)).toHaveCount(0);
  });

  test("shows Onyx's name when mainnet has none", async ({ page }) => {
    await logIn(page, [1280, 900], { onyx: "nym-onyxname042" });
    await expect(page.getByRole("banner").locator("[data-account]")).toContainText("nym-onyxname042");
  });

  test("shows the short address when neither chain gives a name", async ({ page }) => {
    await logIn(page, [1280, 900]);
    await expect(page.getByRole("banner").locator("[data-account]")).toContainText("…");
    await expect(page.getByRole("banner").locator("[data-account]")).not.toContainText("nym-");
    await expect(pick(page)).toBeVisible();
  });

  test("offers no name to pick when the universe's chain does not answer", async ({ page }) => {
    await logIn(page, [1280, 900], { mainnet: null, onyx: DOWN });
    await expect(page.getByRole("banner").locator("[data-account]")).toContainText("…");
    await expect(pick(page)).toHaveCount(0);
  });
});

test.describe("the name dialog", () => {
  test("opens from the account control with its field focused, closes on Escape and Later with the focus back on its opener, and registers nothing", async ({
    page,
  }) => {
    await logIn(page, [1280, 900]);
    await pick(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("r/sys/namereg");
    await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(pick(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await dialog(page).getByRole("button", { name: "Later" }).click();
    await expect(dialog(page)).toBeHidden();
    expect(await done(page)).toBe(0);
  });

  test("refuses a name outside the format or with a reserved prefix before Adena opens", async ({ page }) => {
    await logIn(page, [1280, 900]);
    await pick(page).click();
    const field = page.getByRole("textbox", { name: "Name" });
    for (const [typed, words] of [
      ["alex", /5 to 13 letters, then 3 digits/],
      ["gnomes042", /reserved prefix/],
    ] as const) {
      await field.fill(typed);
      await dialog(page).getByRole("button", { name: "Register · 0 GNOT" }).click();
      await expect(dialog(page)).toContainText(words);
      await expect(field).toHaveAttribute("aria-invalid", "true");
      expect(await violations(page)).toEqual([]);
    }
    expect(await done(page)).toBe(0);
  });

  test("registers on the universe's chain, is done only from the chain's answer, then shows the name read from the chain", async ({
    page,
  }) => {
    await logIn(page, [1280, 900]);
    await pick(page).click();
    await page.getByRole("textbox", { name: "Name" }).fill("alexis042");
    await dialog(page).getByRole("button", { name: "Register · 0 GNOT" }).click();
    await expect(dialog(page)).toContainText(/is registered/i);
    await expect(dialog(page)).toContainText("55,414");
    const sent = await page.evaluate(() => JSON.stringify((Reflect.get(window, "__done") as unknown[])[0]));
    expect(sent).toContain('"func":"Register"');
    expect(sent).toContain(`"args":["${NAME}"]`);
    expect(sent).toContain("gno.land/r/sys/namereg/v0");
    expect(sent).not.toContain("gnoland-1");
    expect(await violations(page)).toEqual([]);
    await dialog(page).getByRole("button", { name: "Later" }).click();
    await expect(page.getByRole("banner").locator("[data-account]")).toContainText(NAME);
    await expect(pick(page)).toHaveCount(0);
  });

  test("registers from the keyboard alone: Enter in the field asks, Tab reaches Register then Later", async ({
    page,
  }) => {
    await logIn(page, [1280, 900]);
    await pick(page).click();
    await page.keyboard.type("gnomes042");
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toContainText(/reserved prefix/);
    expect(await done(page)).toBe(0);
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("button", { name: "Register · 0 GNOT" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("button", { name: "Later" })).toBeFocused();
    const field = page.getByRole("textbox", { name: "Name" });
    await field.fill("alexis042");
    await field.press("Enter");
    await expect(dialog(page)).toContainText(/is registered/i);
  });

  test("waits for the signature with the dialog readable, and offers Register again after a declined one", async ({
    page,
  }) => {
    await logIn(page, [1280, 900], { wallet: { declines: true } });
    await pick(page).click();
    await page.getByRole("textbox", { name: "Name" }).fill("alexis042");
    await dialog(page).getByRole("button", { name: "Register · 0 GNOT" }).click();
    await expect(dialog(page)).toContainText(/declined in Adena/);
    await expect(dialog(page).getByRole("button", { name: "Register · 0 GNOT" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await dialog(page).getByRole("button", { name: "Register · 0 GNOT" }).click();
    await expect.poll(() => done(page)).toBe(2);
  });

  test("has no accessibility violation while Adena holds the signature", async ({ page }) => {
    await logIn(page, [1280, 900], { wallet: { hold: true } });
    await pick(page).click();
    await page.getByRole("textbox", { name: "Name" }).fill("alexis042");
    await dialog(page).getByRole("button", { name: "Register · 0 GNOT" }).click();
    await expect(dialog(page)).toContainText("Waiting for your signature in Adena…");
    expect(await violations(page)).toEqual([]);
  });

  test("has no accessibility violation open on a computer, which has no sentence for a phone", async ({ page }) => {
    await logIn(page, [1280, 900]);
    await pick(page).click();
    await expect(dialog(page)).toBeVisible();
    expect(await violations(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(dialog(page).getByRole("button", { name: "Register · 0 GNOT" })).toBeVisible();
    await expect(dialog(page).getByText("To sign, use a computer")).toBeHidden();
  });

  test("has no accessibility violation open on a phone, which only reads", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const { phone, browser } = await phoneOf(page, { playwright, launchOptions });
    await pick(phone).tap();
    await expect(dialog(phone)).toBeVisible();
    expect(await violations(phone)).toEqual([]);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(dialog(phone)).toContainText("To sign, use a computer");
    await expect(dialog(phone).getByRole("button", { name: "Register · 0 GNOT" })).toBeHidden();
    expect(await done(phone)).toBe(0);
    await browser.close();
  });
});
