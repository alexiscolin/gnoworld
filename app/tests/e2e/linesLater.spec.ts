import { lines, roomsNav, word } from "./chat.ts";
import { expect, hydrated, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { scriptedErgo } from "./scripted.ts";

// The lines view (the lines, what is under them, a line's bar) loads after the page is drawn, behind RoomView's one lazy
// boundary (docs/decisions.md, 2026-10-26). Its code held back here, as a slow network would.
const CODE = /\/assets\/Lines-[\w-]+\.js$/;

test.describe("the lines view, loaded after the page", () => {
  // The worker serves the build's scripts from its precache, past the page's routes.
  test.use({ serviceWorkers: "block" });

  test("holds the list's place while its code comes, a key pressed meanwhile acting on the page; then its lines and bar work", async ({
    page,
  }) => {
    let release = () => undefined;
    const arrived = new Promise<undefined>((resolve) => {
      release = () => {
        resolve(undefined);
      };
    });
    await page.route(CODE, async (route) => {
      await arrived;
      await route.continue();
    });
    const address = await logIn(page, word("later"));
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      scriptedErgo(ergo, address, {
        history: [
          ["m1", "2026-10-25T10:00:00.000Z", "the first line"],
          ["m2", "2026-10-25T10:01:00.000Z", "the second line"],
        ],
      });
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    const list = page.getByRole("list", { name: "Messages" });
    const form = page.getByRole("form", { name: "Write in #games" });
    await expect(list).toHaveAttribute("aria-busy", "true");
    await expect(form.getByRole("textbox", { name: "Message #games" })).toBeVisible();
    await expect(lines(page)).toHaveCount(0);
    // Nothing waits for the lines: Tab from the rooms' last link skips the list's place for the composer.
    await roomsNav(page).getByRole("link").last().focus();
    await page.keyboard.press("Tab");
    await expect(form.locator(":focus")).toHaveCount(1);
    release();
    await expect(lines(page)).toHaveCount(2);
    await expect(list).not.toHaveAttribute("aria-busy");
    await expect(form.locator(":focus"), "the code's arrival moves no focus").toHaveCount(1);
    await lines(page).nth(1).focus();
    await page.keyboard.press("Tab");
    const bar = lines(page).nth(1).getByRole("toolbar", { name: "Actions on this message" });
    await expect(bar.getByRole("button").first()).toBeFocused();
  });
});
