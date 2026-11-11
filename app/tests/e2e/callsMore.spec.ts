import { adena } from "./adena.ts";
import { calls, callWallet, connect, done, openCall, openRealm, openRow, sound, writeChain } from "./callCard.ts";
import { expect, test, type Page } from "./fixtures.ts";

// 9e's journeys at 390 and 1280 px: a write of three fields opens its card under its row and signs its three texts; a page's
// form calls (callCard.ts holds the stand-in chain's list, SetThree and Upload, and the page).
const card = (page: Page) => calls(page).getByRole("article");
const sent = (page: Page) => page.evaluate(() => JSON.stringify((Reflect.get(window, "__done") as unknown[])[0]));

// The realm's page open at this size, logged in, and what every journey here asks of it: no dialog, no violation, no sideways scroll.
async function opened(page: Page, [width, height]: readonly [number, number]) {
  await page.setViewportSize({ width, height });
  await adena(page);
  await callWallet(page);
  await writeChain(page);
  await openRealm(page, () => connect(page));
}

for (const [name, size] of [
  ["a phone", [390, 844]],
  ["a computer", [1280, 900]],
] as const) {
  test(`a call of three fields opens in the realm view on ${name}, with no accessibility violation`, async ({
    page,
  }) => {
    await opened(page, size);
    await openCall(page, "SetThree");
    for (const label of ["a", "b", "c"]) await expect(card(page).getByRole("textbox", { name: label })).toBeVisible();
    await sound(page);
    if (size[0] < 600) return;
    for (const [label, text] of [
      ["a", "one"],
      ["b", "two"],
      ["c", "three"],
    ] as const)
      await card(page).getByRole("textbox", { name: label, exact: true }).fill(text);
    await card(page).getByRole("button", { name: "Sign in Adena" }).click();
    await expect(card(page)).toContainText("Signed · tx");
    expect(await done(page)).toBe(1);
    expect(await sent(page)).toContain('"args":["one","two","three"]');
  });

  // A page's <gno-form exec="SetProfile"> the chain confirms: its Call opens the card after the form's frame, prefilled, the hidden
  // field visible and editable; Sign sends what the fields show. A type no call carries stays a way to gnoweb with no Call.
  test(`a page's form calls from the realm view on ${name}, its hidden field in view, with no violation`, async ({
    page,
  }) => {
    await opened(page, size);
    const form = page.getByRole("figure");
    await openRow(page, "Upload");
    const upload = calls(page).getByRole("listitem").filter({ hasText: "Upload" });
    await expect(upload.getByRole("link", { name: /Open in gnoweb/ })).toBeVisible();
    await expect(upload.getByRole("button", { name: /^Call/ })).toHaveCount(0);
    await form.getByRole("button", { name: "Call SetProfile" }).click();
    const formCard = page.getByRole("article").first();
    await expect(formCard.getByRole("textbox", { name: "name", exact: true })).toHaveValue("bob");
    await expect(formCard.getByRole("textbox", { name: "times", exact: true })).toHaveValue("3");
    await expect(form).toContainText("hidden");
    // The card opens whole inside the page's window: the window grows, it does not scroll to hold it.
    const window = page.getByRole("region", { name: /^Rendered page of/ });
    expect(await window.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
    await sound(page);
    if (size[0] < 600) return;
    await formCard.getByRole("textbox", { name: "times", exact: true }).fill("4");
    await formCard.getByRole("button", { name: "Sign in Adena" }).click();
    await expect(formCard).toContainText("Signed · tx");
    expect(await sent(page)).toContain('"args":["bob","4"]');
  });
}
