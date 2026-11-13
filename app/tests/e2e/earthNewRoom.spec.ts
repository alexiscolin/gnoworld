import { open } from "./chatScreenOpen.ts";
import { expect, hydrated, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";

// The Earth's New room button (D394) is in the rooms list of an account's chat, in the full chat's rail and in the dock's menu (slice 13).
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

test.describe("the Earth's New room button", () => {
  test("stands in the full chat's rail for an account", async ({ page }) => {
    await logIn(page, "earth-room");
    await open(page, { width: 1728, as: ACCOUNT, full: false });
    await page.goto("/earth?chat=full");
    await hydrated(page);
    await expect(page.getByRole("button", { name: "New room" })).toBeVisible({ timeout: 30_000 });
  });
});
