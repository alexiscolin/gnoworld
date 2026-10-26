import { lineOf, word } from "./chat.ts";
import type { WebSocketRoute } from "@playwright/test";
import { expect, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { field, live, OTHER, room, ROOM, T, tags, typingOf, typist } from "./scriptedRoom.ts";

// 4f (docs/decisions.md, 2026-10-21): who is typing (IRCv3's +typing, ircv3.net/specs/client-tags/typing), shown under
// a room's lines and told by the account's composer, on a scripted Ergo.
test.describe("who is typing", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  // The room opened on the page's clock, paused: each step run by the test.
  async function paused(page: Page) {
    await page.clock.install({ time: new Date(T(30)) });
    const { ergo } = await room(page);
    await page.clock.pauseAt(new Date(Date.parse(T(30)) + 120_000));
    return ergo;
  }
  // Two typists 4 s apart: both shown, then the second alone once the first's 6 s are past.
  async function twoTypists(page: Page, ergo: () => WebSocketRoute) {
    ergo().send(typingOf("active"));
    await page.clock.runFor(4_000);
    ergo().send(typingOf("active", OTHER));
    await expect(page.getByText("g10gh7…3y5tv and g1f6dc…fsksl are typing…")).toBeVisible();
    await page.clock.runFor(2_500);
    await expect(page.getByText("g1f6dc…fsksl is typing…")).toBeVisible();
  }

  test("shows who is typing under the lines, and stops at their line", async ({ page }) => {
    const { ergo } = await room(page);
    ergo().send(typingOf("active"));
    await expect(page.getByText("g10gh7…3y5tv is typing…")).toBeVisible();
    ergo().send(live("live", T(31), { text: "done typing" }));
    await expect(lineOf(page, "done typing")).toBeVisible();
    await expect(typist(page)).toHaveCount(0);
  });

  // The red pass (R9, R14): the page's clock paused, each step run by the test.
  test("keeps a renewed typist 6 s from its last active, and the second of two alone once the first's are past", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const ergo = await paused(page);
    ergo().send(typingOf("active"));
    await expect(typist(page)).toBeVisible();
    await page.clock.runFor(4_000);
    ergo().send(typingOf("active"));
    await page.clock.runFor(4_000);
    await expect(typist(page)).toBeVisible();
    await page.clock.runFor(2_500);
    await expect(typist(page)).toHaveCount(0);
    await twoTypists(page, ergo);
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByRole("heading", { name: "#bubble", level: 2 })).toBeVisible();
    await page.clock.runFor(30_000);
    expect(errors).toEqual([]);
  });

  // The green pass (G2): the second typist's end is told too, the first's time past, the room left open.
  test("shows no one typing once the second of two typists' times is past as well", async ({ page }) => {
    await twoTypists(page, await paused(page));
    await page.clock.runFor(4_000);
    await expect(typist(page)).toHaveCount(0);
  });

  test("stops showing a typist at its done", async ({ page }) => {
    const { ergo } = await room(page);
    ergo().send(typingOf("active"));
    await expect(typist(page)).toBeVisible();
    ergo().send(typingOf("done"));
    await expect(typist(page)).toHaveCount(0);
  });
});

test.describe("telling the room the account is typing", () => {
  test("tells the room while the account writes, done once the field is cleared, nothing of a command", async ({
    page,
  }) => {
    const address = await logIn(page, word("typing"));
    const { sent } = await room(page, { me: address });
    await field(page).fill("hello");
    await expect.poll(() => tags(sent)).toEqual([`@+typing=active TAGMSG ${ROOM}`]);
    await field(page).fill("");
    await expect.poll(() => tags(sent)).toHaveLength(2);
    await field(page).fill("/me waves");
    await field(page).fill("again");
    await expect.poll(() => tags(sent)).toHaveLength(3);
    expect(tags(sent)).toEqual([
      `@+typing=active TAGMSG ${ROOM}`,
      `@+typing=done TAGMSG ${ROOM}`,
      `@+typing=active TAGMSG ${ROOM}`,
    ]);
  });

  // The red pass (R3): a draft the device kept is no typing; opening a room, or coming back to it, tells nothing.
  test("tells nothing as a room opens on a kept draft, or is come back to, and tells the next edit", async ({
    page,
  }) => {
    const address = await logIn(page, word("typing"));
    await page.evaluate((account) => {
      localStorage.setItem(`gnoworld:draft:${account}:#bubble/games`, "kept words");
      localStorage.setItem(`gnoworld:draft:${account}:#bubble`, "kept there too");
    }, address);
    const { sent } = await room(page, { me: address });
    await expect(field(page)).toHaveValue("kept words");
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByRole("textbox", { name: "Message #bubble" })).toHaveValue("kept there too");
    await page.keyboard.press("Alt+ArrowUp");
    await expect(field(page)).toHaveValue("kept words");
    // A done follows an active alone: none here says no active went as the rooms opened.
    await field(page).fill("");
    await field(page).fill("x");
    await expect.poll(() => tags(sent)).toHaveLength(1);
    expect(tags(sent)).toEqual([`@+typing=active TAGMSG ${ROOM}`]);
  });
});
