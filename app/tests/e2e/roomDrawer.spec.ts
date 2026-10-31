import AxeBuilder from "@axe-core/playwright";
import { lineOf, lines, roomsNav, word } from "./chat.ts";
import type { Locator } from "@playwright/test";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import type { HistoryLine } from "./scripted.ts";
import { live, OTHER, room, T } from "./scriptedRoom.ts";
import { barOf } from "./talk.ts";
import { chipOf, panel, threadField } from "./thread.ts";

// Slice 5's 5b (U3, docs/plans/slice-5.md §1): from 900 px down the rooms sit behind the button "Rooms", which says its
// unread count in its name while closed; the drawer is the dialog "Rooms". A scripted Ergo, the account's lines first.
const GUTTER = 16;
const OTHER_SHORT = "g1f6dc…fsksl";
const BUBBLE: readonly HistoryLine[] = [["b1", T(10), "the main room's first line"]];
const dmFrom = (address: string) =>
  `@msgid=d1;time=${T(31)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${address} :hello there`;
// The strip over a composer (the reply's, the edit's): the box that holds the words and their Cancel.
const strip = (page: Page, words: string | RegExp) =>
  page.getByRole("form", { name: "Write in #games" }).getByText(words).locator("..");
// The conversation with OTHER, chosen in the drawer, which closes as it opens.
async function chooseDm(page: Page) {
  await control(page).click();
  await drawer(page).getByRole("link", { name: OTHER_SHORT, exact: true }).click();
  await expect(page.getByRole("heading", { name: `Direct message with ${OTHER_SHORT}` })).toBeVisible();
}
const control = (page: Page) => page.getByRole("button", { name: /^Rooms\b/ });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Rooms" });

// The account, in #games with its own line m1 and another's m2, which has one reply (m3), #bubble ready to open.
async function account(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  const address = await logIn(page, word("drawer"));
  const opened = await room(page, {
    me: address,
    read: T(1),
    echo: true,
    history: [
      ["m1", T(0), "my first words", address],
      ["m2", T(1), "their words"],
    ],
    others: { "#bubble": BUBBLE },
  });
  opened
    .ergo()
    .send(`@msgid=m3;time=${T(2)};account=${OTHER};+reply=m2 :${OTHER}!u@h PRIVMSG #bubble/games :an answer`);
  await expect(lines(page)).toHaveCount(3);
  return { address, ...opened };
}

// A box's left and right edges are inside the gutter, and it takes the width the gutter leaves, give or take the
// focus ring's margin a list keeps and a pixel.
async function takesWidth(box: Locator, width: number) {
  await expect(box).toBeVisible();
  const { left, right } = await box.evaluate((element) => {
    const { left, right } = element.getBoundingClientRect();
    return { left, right };
  });
  expect(left).toBeGreaterThanOrEqual(GUTTER - 1);
  expect(right).toBeLessThanOrEqual(width - GUTTER + 1);
  expect(right - left).toBeGreaterThanOrEqual(width - 2 * GUTTER - 8);
}

test.describe("the rooms as a drawer, on a phone's screen", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("the rooms sit behind one control, and the conversation takes the width inside the gutter", async ({ page }) => {
    await account(page, 390);
    await expect(control(page)).toBeVisible();
    await expect(roomsNav(page)).toBeHidden();
    await expect(drawer(page)).toBeHidden();
    await takesWidth(page.getByRole("list", { name: "Messages" }), 390);
    await takesWidth(page.getByRole("form", { name: "Write in #games" }), 390);
  });

  // Regression guards: the strips and the panel already take the width today (the red set is the control alone). Each
  // measures the strip or the panel as a whole, not its words, which stand beside a button (Cancel, Send).
  test("regression guard: the reply's strip takes the whole width inside the gutter", async ({ page }) => {
    await account(page, 390);
    await expect(control(page)).toBeVisible();
    await lines(page).nth(1).hover();
    await barOf(page, 1).getByRole("button", { name: "Reply" }).click();
    await takesWidth(strip(page, /^Replying to/), 390);
  });

  test("regression guard: the edit's strip takes the whole width inside the gutter", async ({ page }) => {
    await account(page, 390);
    await expect(control(page)).toBeVisible();
    await lines(page).nth(0).hover();
    await barOf(page, 0).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await takesWidth(strip(page, "Editing a message"), 390);
  });

  test("regression guard: the thread's panel takes the whole width inside the gutter", async ({ page }) => {
    await account(page, 390);
    await expect(control(page)).toBeVisible();
    await lines(page).nth(1).hover();
    await chipOf(lines(page).nth(1)).click();
    await takesWidth(panel(page), 390);
    await takesWidth(threadField(page).locator("xpath=ancestor::form[1]"), 390);
  });

  test("the search chord with the drawer open leaves the drawer the screen: no second dialog opens", async ({
    page,
  }) => {
    await account(page, 390);
    await control(page).click();
    await expect(drawer(page)).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(drawer(page)).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Search" })).toBeHidden();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
  });

  test("opens the drawer, chooses a room: the room opens and the drawer closes", async ({ page }) => {
    await account(page, 390);
    await control(page).click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByRole("link", { name: "#bubble", exact: true })).toBeVisible();
    await drawer(page).getByRole("link", { name: "#bubble", exact: true }).click();
    await expect(page.getByRole("heading", { name: "#bubble", level: 2 })).toBeVisible();
    // The world's main room has no ?room= in its address.
    await expect(page).toHaveURL(/\/w\/bubble$/);
    await expect(drawer(page)).toBeHidden();
    await expect(lineOf(page, "the main room's first line")).toBeVisible();
  });

  test("chooses the room already in view: the drawer closes though the address does not change", async ({ page }) => {
    await account(page, 390);
    await control(page).click();
    await drawer(page).getByRole("link", { name: "#games", exact: true }).click();
    await expect(drawer(page)).toBeHidden();
    await expect(page).toHaveURL(/room=games/);
  });

  test("closes on Escape, and the focus goes back to the control", async ({ page }) => {
    await account(page, 390);
    await control(page).click();
    await expect(drawer(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    await expect(control(page)).toBeFocused();
    // The conversation is where it was.
    await expect(page).toHaveURL(/room=games/);
  });

  test("holds the focus while open: Tab never leaves the drawer", async ({ page }) => {
    await account(page, 390);
    await control(page).click();
    await expect(drawer(page)).toBeVisible();
    // A modal dialog makes the page behind it inert: past its last control the focus goes to the browser's own (the
    // body for the page), never to the conversation.
    for (let n = 0; n < 12; n += 1) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(
          () => document.activeElement === document.body || document.activeElement?.closest("dialog") != null,
        ),
      ).toBe(true);
    }
  });

  test("counts a direct message's arrival on the control", async ({ page }) => {
    const { address, ergo } = await account(page, 390);
    ergo().send(dmFrom(address));
    await expect(control(page)).toHaveAccessibleName("Rooms, 1 unread");
  });

  test("a direct message chosen in the drawer opens, and the drawer closes", async ({ page }) => {
    const { address, ergo } = await account(page, 390);
    ergo().send(dmFrom(address));
    await expect(control(page)).toContainText("1 unread");
    await chooseDm(page);
    await expect(drawer(page)).toBeHidden();
    await takesWidth(page.getByRole("form", { name: `Write to ${OTHER_SHORT}` }), 390);
  });

  test("a drawer opened over a direct message gives the focus back on Escape", async ({ page }) => {
    const { address, ergo } = await account(page, 390);
    ergo().send(dmFrom(address));
    await chooseDm(page);
    await control(page).click();
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    await expect(control(page)).toBeFocused();
  });

  test("sums the unread of every room and conversation on the control, and clears a room's as it opens", async ({
    page,
  }) => {
    const { address, ergo } = await account(page, 390);
    await expect(control(page)).not.toContainText("unread");
    ergo().send(live("n1", T(31), { room: "#bubble", text: `look @${address}` }));
    await expect(control(page)).toHaveAccessibleName("Rooms, 1 unread");
    ergo().send(live("n2", T(32), { room: "#bubble", text: `again @${address}` }));
    ergo().send(dmFrom(address));
    await expect(control(page)).toHaveAccessibleName("Rooms, 3 unread");
    await control(page).click();
    const bubble = page.getByRole("link", { name: "#bubble", exact: true });
    await expect(drawer(page).getByRole("listitem").filter({ has: bubble })).toContainText("2 unread");
    await bubble.click();
    // The room's two are read; the conversation's one is not.
    await expect(control(page)).toHaveAccessibleName("Rooms, 1 unread");
  });

  test("keeps the account's saved messages in the drawer, which its own dialog closes alone on Escape", async ({
    page,
  }) => {
    await account(page, 390);
    await control(page).click();
    await drawer(page).getByRole("button", { name: "Saved" }).click();
    const saved = page.getByRole("dialog", { name: "Saved messages" });
    await expect(saved).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(saved).toBeHidden();
    await expect(drawer(page)).toBeVisible();
  });

  test("shows a notice in the drawer: following it opens its room and closes the drawer", async ({ page }) => {
    const { address, ergo } = await account(page, 390);
    ergo().send(live("n1", T(31), { room: "#bubble", text: `look @${address}` }));
    await expect(control(page)).toHaveAccessibleName("Rooms, 1 unread");
    await control(page).click();
    await drawer(page)
      .getByRole("link", { name: /mentioned you/ })
      .click();
    await expect(page.getByRole("heading", { name: "#bubble", level: 2 })).toBeVisible();
    await expect(drawer(page)).toBeHidden();
  });

  // F2301: the status sat in the rail's list, which the closed drawer hides from a screen reader (display: none).
  test("tells a screen reader a notice came, with the drawer closed, and moves no focus", async ({ page }) => {
    const { address, ergo } = await account(page, 390);
    await page.getByRole("textbox", { name: "Message #games" }).focus();
    ergo().send(live("n1", T(31), { room: "#bubble", text: `look @${address}` }));
    // By role, which leaves out what display: none hides: the locator by markup would find it in the closed dialog.
    await expect(page.getByRole("status").filter({ hasText: "mentioned you in #bubble" })).toHaveCount(1);
    await expect(drawer(page)).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message #games" })).toBeFocused();
  });

  test("clears the notices from the drawer, which stays open with the focus in it", async ({ page }) => {
    const { address, ergo } = await account(page, 390);
    ergo().send(live("n1", T(31), { room: "#bubble", text: `look @${address}` }));
    await control(page).click();
    await drawer(page).getByRole("button", { name: "Clear" }).click();
    await expect(drawer(page).getByRole("link", { name: /mentioned you/ })).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);
  });

  test("a guest has the rooms behind the control too, and no direct messages", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await room(page);
    await expect(roomsNav(page)).toBeHidden();
    await control(page).click();
    await expect(drawer(page).getByRole("link", { name: "#bubble", exact: true })).toBeVisible();
    await expect(drawer(page).getByRole("heading", { name: "Direct messages" })).toHaveCount(0);
  });

  test("says the rooms could not load inside the drawer, over a direct message", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await logIn(page, word("drawer"));
    await page.route("**/api/rooms*", (route) => route.abort());
    await page.goto(`/w/bubble?dm=${OTHER}`);
    await hydrated(page);
    await control(page).click();
    await expect(drawer(page).getByRole("alert").filter({ hasText: "The rooms could not load." })).toBeVisible();
  });

  test("passes axe at 390 px, closed and open", async ({ page }) => {
    await account(page, 390);
    await expect(control(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await control(page).click();
    await expect(drawer(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test.describe("the rooms beside the conversation, on a computer's screen", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("stay as they were: no control, the list in view; axe passes", async ({ page }) => {
    await account(page, 1280);
    await expect(roomsNav(page)).toBeVisible();
    await expect(control(page)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const rightOf = (item: Locator) => item.evaluate((element) => element.getBoundingClientRect().right);
    expect(await rightOf(roomsNav(page))).toBeLessThan(await rightOf(page.getByRole("list", { name: "Messages" })));
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("a screen of 900 px puts the rooms behind the control, one just over 900 px keeps them in view", async ({
    page,
  }) => {
    await account(page, 901);
    await expect(roomsNav(page)).toBeVisible();
    await expect(control(page)).toHaveCount(0);
    await page.setViewportSize({ width: 900, height: 844 });
    await expect(roomsNav(page)).toBeHidden();
    await expect(control(page)).toBeVisible();
    await page.setViewportSize({ width: 899, height: 844 });
    await expect(control(page)).toBeVisible();
  });

  test("an open drawer is gone once the screen widens: the rooms are beside the conversation, no dialog is open", async ({
    page,
  }) => {
    await account(page, 390);
    await control(page).click();
    await expect(drawer(page)).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 844 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(roomsNav(page)).toBeVisible();
    await expect(control(page)).toHaveCount(0);
  });
});
