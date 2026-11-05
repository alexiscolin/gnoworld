import { lines, word } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { MEMBER, opened } from "./scripted.ts";

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
    await opened(page, address, {
      history: [
        ["m1", "2026-10-25T10:00:00.000Z", "the first line"],
        ["m2", "2026-10-25T10:01:00.000Z", "the second line"],
      ],
    });
    const list = page.getByRole("list", { name: "Messages" });
    const form = page.getByRole("form", { name: "Write in #games" });
    await expect(list).toHaveAttribute("aria-busy", "true");
    await expect(form.getByRole("textbox", { name: "Message #games" })).toBeVisible();
    await expect(lines(page)).toHaveCount(0);
    // Nothing waits for the lines: Tab from the last control before them (the rooms' column ends with Saved) skips the
    // list's place for the quick actions (5q), then the composer.
    await page.getByRole("button", { name: "Saved" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Who's here" })).toBeFocused();
    // The quick actions are a row of five since 5a1e8335 (frame 104): the keys pass the rest of it, then the composer.
    for (let presses = 0; presses < 6 && (await form.locator(":focus").count()) === 0; presses += 1)
      await page.keyboard.press("Tab");
    await expect(form.locator(":focus")).toHaveCount(1);
    release();
    await expect(lines(page)).toHaveCount(2);
    await expect(list).not.toHaveAttribute("aria-busy");
    await expect(form.locator(":focus"), "the code's arrival moves no focus").toHaveCount(1);
    await lines(page).nth(1).focus();
    await page.keyboard.press("Tab");
    const bar = lines(page).nth(1).getByRole("toolbar", { name: "Actions on this message" });
    // An account's bar leads with its quick reactions (4d), in the view's code: none missing once it is in.
    await expect(bar.getByRole("button").first()).toBeFocused();
    await expect(bar.getByRole("button", { name: "React with 👍" })).toBeFocused();
  });

  // The green pass (G5): a room with no line asks no code for its lines, its list not busy; a line that comes asks it.
  test("asks no lines code for a room with no line, its list not busy, then asks it as a line comes", async ({
    page,
  }) => {
    const asked: string[] = [];
    page.on("request", (request) => {
      if (CODE.test(request.url())) asked.push(request.url());
    });
    const address = await logIn(page, word("later"));
    const ergo = await opened(page, address, { history: [] });
    await expect(page.getByText("No messages yet.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Messages" })).not.toHaveAttribute("aria-busy");
    expect(asked).toEqual([]);
    ergo().send(
      `@msgid=l1;time=2026-10-25T10:05:00.000Z;account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :a line`,
    );
    await expect(lines(page)).toHaveCount(1);
    expect(asked).toHaveLength(1);
  });
});
