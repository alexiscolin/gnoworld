import { inGames, word } from "./chat.ts";
import { expect, hydrated, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";

// A control that does nothing yet says so: every one named "coming soon" is aria-disabled, stays focusable, shows "Coming soon" on its
// focus, and a click on it opens and changes nothing. Walked on each surface that draws one.
const COMPUTER = { width: 1728, height: 1000 };

test.describe("the controls that are coming", () => {
  test("the chat header's Events and Video call are aria-disabled, say Coming soon on focus, and do nothing", async ({
    page,
  }) => {
    await page.setViewportSize(COMPUTER);
    await inGames(page);
    const header = page.locator('[data-region="header"]');
    // Where the header's width does not hold them they stand in its More menu, as menu items that say the same.
    const more = header.getByRole("button", { name: "More", exact: true });
    if ((await more.count()) > 0) await more.click();
    const url = page.url();
    for (const name of ["Events", "Video call"]) {
      const control = page
        .getByRole("button", { name: `${name}, coming soon` })
        .or(page.getByRole("menuitem", { name: `${name}, coming soon` }));
      await expect(control).toBeVisible();
      await expect(control).toHaveAttribute("aria-disabled", "true");
      await control.click({ force: true });
    }
    expect(page.url()).toBe(url);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the + menu's Image and Play are aria-disabled menu items, and choosing one opens nothing", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await inGames(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Add to the conversation" });
    await expect(menu).toBeVisible();
    for (const name of ["Image", "Play"]) {
      const item = menu.getByRole("menuitem", { name: `${name}, coming soon` });
      await expect(item).toHaveAttribute("aria-disabled", "true");
      await expect(item).toContainText("Soon");
    }
    // A working item of the same menu is not greyed.
    await expect(menu.getByRole("menuitem", { name: "Poll" })).not.toHaveAttribute("aria-disabled", "true");
    const url = page.url();
    await menu.getByRole("menuitem", { name: "Image, coming soon" }).click({ force: true });
    expect(page.url()).toBe(url);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the rooms rail's Media is aria-disabled, and a click on it keeps the room", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await inGames(page);
    const media = page.getByRole("navigation", { name: "Rooms" }).getByRole("button", { name: "Media, coming soon" });
    await expect(media).toHaveAttribute("aria-disabled", "true");
    const url = page.url();
    await media.click({ force: true });
    expect(page.url()).toBe(url);
    await expect(page.getByRole("textbox", { name: "Message #games" })).toBeVisible();
  });

  test("the bell's chain lines are aria-disabled, below the lines the reader has", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await page.goto("/earth");
    await hydrated(page);
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const panel = page.getByRole("dialog", { name: "Notifications" }).or(page.getByLabel("Notifications").last());
    const chain = panel.getByRole("button", { name: "New realms and proposals, from the chain, coming soon" });
    await expect(chain).toHaveAttribute("aria-disabled", "true");
    await chain.click({ force: true });
    await expect(chain).toBeVisible();
  });

  test("every greyed item of the account's menu is aria-disabled and says why in its name", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await logIn(page, word("menu"));
    await page.getByRole("button", { name: /Your account/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Whatever the menu greys, it says so in the name; none is greyed without it, and none says it and is live.
    for (const item of await menu.getByRole("menuitem").all()) {
      const name = (await item.getAttribute("aria-label")) ?? (await item.innerText());
      if (/coming soon|open a room/i.test(name)) await expect(item).toHaveAttribute("aria-disabled", "true");
      else await expect(item).not.toHaveAttribute("aria-disabled", "true");
    }
  });
});
