import AxeBuilder from "@axe-core/playwright";
import { adena } from "./adena.ts";
import { calls, callWallet, connect, done, openRealm, writeChain } from "./callCard.ts";
import { expect, test, type Page } from "./fixtures.ts";

// 9e's journey: a write function of three fields opens its card in the realm view, under its row, and signs with the three texts
// in order; no violation at 390 and at 1280 px. The stand-in chain's list (callCard.ts) holds SetThree.
const card = (page: Page) => calls(page).getByRole("article");

for (const [name, width, height] of [
  ["a phone", 390, 844],
  ["a computer", 1280, 900],
] as const) {
  test(`a call of three fields opens in the realm view on ${name}, with no accessibility violation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await adena(page);
    await callWallet(page);
    await writeChain(page);
    await openRealm(page, () => connect(page));
    await calls(page).getByRole("button", { name: "Call SetThree" }).click();
    for (const label of ["a", "b", "c"]) await expect(card(page).getByRole("textbox", { name: label })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width < 600) return;
    for (const [label, text] of [
      ["a", "one"],
      ["b", "two"],
      ["c", "three"],
    ] as const)
      await card(page).getByRole("textbox", { name: label, exact: true }).fill(text);
    await card(page).getByRole("button", { name: "Sign in Adena" }).click();
    await expect(card(page)).toContainText("Signed · tx");
    expect(await done(page)).toBe(1);
    expect(await page.evaluate(() => JSON.stringify((Reflect.get(window, "__done") as unknown[])[0]))).toContain(
      '"args":["one","two","three"]',
    );
  });
}
