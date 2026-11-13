import { lineOf, lines, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { phoneWith } from "./account.ts";
import { logIn } from "./irc.ts";
import type { HistoryLine } from "./scripted.ts";
import { marks, room, ROOM, T } from "./scriptedRoom.ts";
import { axeOf } from "./axe.ts";

// 4d's mark unread and saved messages (docs/plans/slice-4.md §7; ADR-0002: "Mark unread: 0, on the device", "Saved
// messages: Device"), on a scripted Ergo. Both are the device's: Ergo's MARKREAD only moves forward (irc/getters.go:552,
// v2.19.1), so a place asked to go back to is told to nobody, and no other device of the account sees a saved line.
const SIXTY = Array.from({ length: 60 }, (_, n): HistoryLine => [`h${String(n)}`, T(n), `Line ${String(n)}`]);
const barOf = (page: Page, at: number) => lines(page).nth(at).getByRole("toolbar", { name: "Actions on this message" });
const moreOf = (page: Page, at: number) => barOf(page, at).getByRole("button", { name: "More actions" });
async function choose(page: Page, at: number, item: string) {
  // The pointer on the line and More pressed, again if the list moved under it.
  await expect(async () => {
    await lines(page).nth(at).hover();
    await moreOf(page, at).click({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("menuitem", { name: item }).click();
}
// The menu opened from the keyboard on the `at`th line: the line, Tab through its bar (the quick reactions and Reply
// come before More, 4d), Enter on More.
async function openByKeys(page: Page, at: number) {
  await lines(page).nth(at).focus();
  const more = moreOf(page, at);
  for (let n = 0; n < 8 && !(await more.evaluate((button) => button === document.activeElement)); n += 1)
    await page.keyboard.press("Tab");
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  return page.getByRole("menu", { name: "Message actions" });
}
const news = (page: Page) => page.locator("[data-new]");
const toEnd = (page: Page) =>
  page.getByRole("list", { name: "Messages" }).evaluate((box) => {
    box.scrollTop = box.scrollHeight;
  });
const savedButton = (page: Page) => page.getByRole("button", { name: /^Saved/ });
const savedDialog = (page: Page) => page.getByRole("dialog", { name: "Saved messages" });

test.describe("mark unread", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("moves the New mark to the line, tells Ergo nothing backwards, and keeps it through a reload until read to the end", async ({
    page,
  }) => {
    // The room is the full chat (?chat=full), which covers the plate: the page's own height does not matter.
    await page.setViewportSize({ width: 1280, height: 720 });
    const address = await logIn(page, word("unread"));
    // Read to the newest line: no New, and Ergo's place already there, so nothing is told.
    const { sent } = await room(page, { me: address, history: SIXTY, read: T(59) });
    await expect(news(page)).toHaveCount(0);
    await choose(page, 10, "Mark unread");
    await expect(news(page)).toHaveCount(1);
    await expect(lines(page).nth(10)).toContainText(/^New from here /);
    // The device keeps it: the room opens on it, a screen's worth of lines above the end.
    await page.reload();
    await hydrated(page);
    await expect(lines(page).nth(10)).toContainText(/^New from here /);
    await expect(lines(page).nth(10)).toBeInViewport();
    await expect(lines(page).last()).not.toBeInViewport();
    // Read through to the end, it is read: the next open has none.
    await toEnd(page);
    await expect(lines(page).last()).toBeInViewport();
    await page.reload();
    await hydrated(page);
    await expect(lines(page)).toHaveCount(60);
    await expect(news(page)).toHaveCount(0);
    // Ergo was told no place before the one it held.
    expect(marks(sent).filter((mark) => mark < `MARKREAD ${ROOM} timestamp=${T(59)}`)).toEqual([]);
  });

  test("can be done from the keyboard: the line, Tab to its bar, Enter, the arrows to Mark unread", async ({
    page,
  }) => {
    const address = await logIn(page, word("unread"));
    await room(page, { me: address, read: T(2) });
    const menu = await openByKeys(page, 1);
    // The arrows reach Mark unread, whatever other items the menu holds (another merge's Edit among them).
    const unread = menu.getByRole("menuitem", { name: "Mark unread" });
    await expect(unread).toBeVisible();
    for (let n = 0; n < 12 && !(await unread.evaluate((item) => item === document.activeElement)); n += 1)
      await page.keyboard.press("ArrowDown");
    await expect(unread).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(lineOf(page, "the second line")).toContainText(/^New from here /);
    await expect(news(page)).toHaveCount(1);
  });

  test("is not on the reader's own line", async ({ page }) => {
    const address = await logIn(page, word("unread"));
    await room(page, {
      me: address,
      history: [
        ["m1", T(0), "from another"],
        ["m2", T(1), "from me", address],
      ],
    });
    // Another's line has it; the reader's own has Delete instead.
    await lines(page).nth(0).hover();
    await moreOf(page, 0).click();
    await expect(page.getByRole("menuitem", { name: "Mark unread" })).toBeVisible();
    await page.keyboard.press("Escape");
    await lines(page).nth(1).hover();
    await moreOf(page, 1).click();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Mark unread" })).toHaveCount(0);
  });
});

test.describe("saved messages", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("saves a line with a mark in a word, lists it, opens its room, removes it", async ({ page }) => {
    const address = await logIn(page, word("saved"));
    await room(page, { me: address });
    await expect(savedButton(page)).toBeVisible();
    await choose(page, 1, "Save message");
    await expect(lines(page).nth(1)).toContainText(/^\S+( you)?( new here)? ?Saved /);
    await expect(lines(page).filter({ hasText: /^\S+( you)?( new here)? ?Saved / })).toHaveCount(1);
    await lines(page).nth(1).hover();
    await moreOf(page, 1).click();
    await expect(page.getByRole("menuitem", { name: "Remove from saved" })).toBeVisible();
    await page.keyboard.press("Escape");
    await savedButton(page).click();
    const dialog = savedDialog(page);
    await expect(dialog).toContainText("the second line");
    await expect(dialog).toContainText("Saved on this device only.");
    await expect(dialog.getByRole("link", { name: "Open in room" })).toHaveAttribute(
      "href",
      "/w/bubble?room=games&chat=full",
    );
    await dialog.getByRole("button", { name: /^Remove .* saved message$/ }).click();
    await expect(dialog).toContainText("Nothing saved yet.");
    await page.keyboard.press("Escape");
    await expect(lines(page).filter({ hasText: /^\S+( you)?( new here)? ?Saved / })).toHaveCount(0);
  });

  test("keeps a saved line on the device through a reload, and for its own account alone", async ({ page }) => {
    const address = await logIn(page, word("saved"));
    await room(page, { me: address });
    await choose(page, 2, "Save message");
    await expect(lines(page).nth(2)).toContainText(/^\S+( you)?( new here)? ?Saved /);
    await page.reload();
    await hydrated(page);
    await expect(lines(page).nth(2)).toContainText(/^\S+( you)?( new here)? ?Saved /);
    const keys = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("gnoworld:saved:")),
    );
    expect(keys).toEqual([`gnoworld:saved:${address}`]);
  });

  test("keeps what the device holds through a reconnect", async ({ page }) => {
    const address = await logIn(page, word("saved"));
    const { sockets } = await room(page, { me: address });
    await choose(page, 0, "Save message");
    await sockets[0]?.close();
    await expect.poll(() => sockets.length, { timeout: 15_000 }).toBeGreaterThan(1);
    await expect(lines(page).nth(0)).toContainText(/^\S+( you)?( new here)? ?Saved /);
    await expect(savedButton(page)).toBeVisible();
  });

  test("is offered to an account alone: a guest has neither the items nor the list", async ({ page }) => {
    await room(page);
    await expect(savedButton(page)).toHaveCount(0);
    await lines(page).nth(1).hover();
    await moreOf(page, 1).click();
    // Neither Save message nor Mark unread: a guest has no device to keep them on.
    await expect(page.getByRole("menuitem", { name: "Copy text" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /^(Save message|Mark unread)$/ })).toHaveCount(0);
  });

  test("passes axe with a saved line and the list open", async ({ page }) => {
    const address = await logIn(page, word("saved"));
    await room(page, { me: address });
    await choose(page, 1, "Save message");
    await savedButton(page).click();
    await expect(savedDialog(page)).toBeVisible();
    expect((await axeOf(page).analyze()).violations).toEqual([]);
  });
});

// The bar is the line's focus: a tap on a line focuses it, as a click does, so a phone reaches Save the way a computer does.
// A phone cannot log in (its pointer is coarse), but an account logged in writes there as on a computer: the account is logged in on a computer's browser, its session
// handed to a phone's, in a browser of its own.
test.describe("on a phone", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("a tap on a line, then More, then Save message saves it", async ({ page, playwright, launchOptions }) => {
    const address = await logIn(page, word("saved"));
    const { phone, close } = await phoneWith(page, { playwright, launchOptions });
    await room(phone, { me: address });
    await lines(phone).nth(1).tap();
    await moreOf(phone, 1).tap();
    await phone.getByRole("menuitem", { name: "Save message" }).tap();
    await expect(lines(phone).nth(1)).toContainText(/^\S+( you)?( new here)? ?Saved /);
    await close();
  });
});
