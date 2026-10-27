import AxeBuilder from "@axe-core/playwright";
import { lineOf, roomsNav, word } from "./chat.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { field, hiddenTab, HISTORY, live, OTHER, room, tab, T } from "./scriptedRoom.ts";
import { MEMBER, type HistoryLine } from "./scripted.ts";

// 4f-n (docs/decisions.md, 2026-10-26: "Notifications wait for a merge of their own"; docs/plans/slice-4.md §1): what the
// account is told, on a scripted Ergo: a badge on each room's row and conversation's, the count in the tab's title, a
// list of what was addressed to it, a mode for each room. #games is in view; #bubble and #news are followed.
const BASE = "Bubble · gno.world";
const MAIN: readonly HistoryLine[] = [["b1", T(10), "the main room's first line"]];
const NEWS = "#bubble/news";
const SHORT = "g10gh7…3y5tv";
const OTHER_SHORT = "g1f6dc…fsksl";

// The row of a room, or of a conversation, in the navigation, by the name of its link.
const rowOf = (page: Page, name: string) =>
  roomsNav(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
const mentioned = (address: string, text = "look") => `${text} @${address}`;

// An account in #games, read to its end (Ergo's place at T(2)), the main room's history ready for when it is opened.
async function account(page: Page, extra: { read?: string } = {}) {
  const address = await logIn(page, word("notice"));
  const opened = await room(page, { me: address, read: T(2), others: { "#bubble": MAIN }, ...extra });
  return { address, ...opened };
}

test.describe("notifications", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("shows a mention in a room not in view on its row, in the tab's title and in the list; opening the room clears them", async ({
    page,
  }) => {
    const { address, ergo } = await account(page);
    await expect(page).toHaveTitle(BASE);
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(address) }));
    await expect(rowOf(page, "#bubble")).toContainText("1 unread");
    await expect(rowOf(page, "#games")).not.toContainText("unread");
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    const nav = roomsNav(page);
    await expect(nav.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(nav.getByRole("link", { name: `${SHORT} mentioned you #bubble` })).toBeVisible();
    await rowOf(page, "#bubble").getByRole("link", { name: "#bubble", exact: true }).click();
    await expect(page.getByRole("heading", { name: "#bubble", level: 2 })).toBeVisible();
    await expect(lineOf(page, "look")).toBeVisible();
    await expect(page).toHaveTitle(BASE);
    await expect(nav.getByRole("heading", { name: "Notifications" })).toHaveCount(0);
    await expect(rowOf(page, "#bubble")).not.toContainText("unread");
  });

  test("keeps a mention in the room in view unseen while the tab is hidden, and sees it as the tab shows", async ({
    page,
  }) => {
    await hiddenTab(page, true);
    const { address, ergo } = await account(page);
    ergo().send(live("n1", T(31), { text: mentioned(address) }));
    await expect(rowOf(page, "#games")).toContainText("1 unread");
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    await tab(page, "show");
    await expect(page).toHaveTitle(BASE);
    await expect(rowOf(page, "#games")).not.toContainText("unread");
  });

  // R12: a barrier line after the one under test is read first, so a notice added a frame late would have shown.
  test("counts nothing for a line in the room in view as it arrives, the tab shown and the reader at the end", async ({
    page,
  }) => {
    const { address, ergo } = await account(page);
    ergo().send(live("n1", T(31), { text: mentioned(address) }));
    ergo().send(live("n2", T(32), { text: "a barrier" }));
    await expect(lineOf(page, "a barrier")).toBeVisible();
    await expect(page).toHaveTitle(BASE);
    await expect(rowOf(page, "#games")).not.toContainText("unread");
    await expect(roomsNav(page).getByRole("status")).toHaveText("");
  });

  test("tells a screen reader nothing for a mention in a room set to Nothing, or in the room in view", async ({
    page,
  }) => {
    const { address, ergo } = await account(page);
    const modes = page.getByRole("group", { name: "Notifications for #games" });
    await modes.getByRole("button", { name: "Nothing" }).click();
    ergo().send(live("n1", T(31), { text: mentioned(address, "muted") }));
    ergo().send(live("n2", T(32), { room: "#bubble", text: "a barrier" }));
    await expect(page).toHaveTitle(BASE);
    await expect(roomsNav(page).getByRole("status")).toHaveText("");
  });

  const modes = (page: Page, name: string) => page.getByRole("group", { name: `Notifications for ${name}` });
  const pressed = (page: Page, room: string, mode: string) => modes(page, room).getByRole("button", { name: mode });
  // Opens a room and waits for it to be the one in view: a line sent before would arrive in the room in view.
  async function open(page: Page, room: string) {
    await rowOf(page, room).getByRole("link", { name: room, exact: true }).click();
    await expect(page.getByRole("heading", { name: room, level: 2 })).toBeVisible();
  }

  test("counts only the mentions by default: a plain line says nothing, a mention after it does", async ({ page }) => {
    const { address, ergo } = await account(page);
    ergo().send(live("p1", T(31), { room: "#bubble", text: "just talking" }));
    ergo().send(live("p2", T(32), { room: NEWS, text: mentioned(address) }));
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    await expect(rowOf(page, "#bubble")).not.toContainText("unread");
    await expect(rowOf(page, "#news")).toContainText("1 unread");
    await open(page, "#bubble");
    await expect(pressed(page, "#bubble", "Mentions")).toHaveAttribute("aria-pressed", "true");
  });

  test("counts every plain line of a room set to All messages, and again only the mentions once Mentions is pressed", async ({
    page,
  }) => {
    const { ergo } = await account(page);
    await open(page, "#bubble");
    await pressed(page, "#bubble", "All messages").click();
    await expect(pressed(page, "#bubble", "All messages")).toHaveAttribute("aria-pressed", "true");
    await expect(pressed(page, "#bubble", "Mentions")).toHaveAttribute("aria-pressed", "false");
    await open(page, "#games");
    ergo().send(live("p3", T(33), { room: "#bubble", text: "more talk" }));
    await expect(rowOf(page, "#bubble")).toContainText("1 unread");
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    await open(page, "#bubble");
    await pressed(page, "#bubble", "Mentions").click();
    await open(page, "#games");
    ergo().send(live("p4", T(34), { room: "#bubble", text: "still talking" }));
    ergo().send(live("p5", T(35), { room: NEWS, text: "a barrier, in a room still on Mentions" }));
    await expect(page).toHaveTitle(BASE);
    await expect(rowOf(page, "#bubble")).not.toContainText("unread");
  });

  test("counts nothing in a room set to Nothing, a mention included, and the others as before", async ({ page }) => {
    const { address, ergo } = await account(page);
    await pressed(page, "#games", "Nothing").click();
    await expect(pressed(page, "#games", "Nothing")).toHaveAttribute("aria-pressed", "true");
    await open(page, "#bubble");
    ergo().send(live("p4", T(34), { room: "#bubble/games", text: mentioned(address, "muted") }));
    ergo().send(live("p5", T(35), { room: NEWS, text: mentioned(address, "again") }));
    await expect(rowOf(page, "#news")).toContainText("1 unread");
    await expect(rowOf(page, "#games")).not.toContainText("unread");
    await expect(page).toHaveTitle(`(1) ${BASE}`);
  });

  test("keeps a room's mode on the device, which a reload reads again", async ({ page }) => {
    await account(page);
    await page.getByRole("button", { name: "Nothing" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Nothing" })).toHaveAttribute("aria-pressed", "true");
  });

  test("counts a direct message on its conversation's row and in the title, and opening it clears them", async ({
    page,
  }) => {
    const { address, ergo } = await account(page);
    ergo().send(`@msgid=d1;time=${T(31)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${address} :hello there`);
    const row = rowOf(page, `${OTHER_SHORT} Not encrypted`);
    await expect(row).toContainText("1 unread");
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    await expect(
      roomsNav(page).getByRole("link", { name: `${OTHER_SHORT} wrote to you Direct message` }),
    ).toBeVisible();
    await row.getByRole("link").click();
    await expect(page.getByRole("heading", { name: `Direct message with ${OTHER_SHORT}` })).toBeVisible();
    await expect(page).toHaveTitle(BASE);
    await expect(row).not.toContainText("unread");
  });

  test("counts nothing for a direct message arriving in the conversation in view", async ({ page }) => {
    const { address, ergo } = await account(page);
    await page.goto(`/w/bubble?dm=${OTHER}`);
    await expect(page.getByRole("heading", { name: `Direct message with ${OTHER_SHORT}` })).toBeVisible();
    ergo().send(`@msgid=d1;time=${T(31)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${address} :hello there`);
    ergo().send(`@msgid=d2;time=${T(32)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${address} :a barrier`);
    await expect(page.getByText("a barrier")).toBeVisible();
    await expect(page).toHaveTitle(BASE);
    await expect(rowOf(page, `${OTHER_SHORT} Not encrypted`)).not.toContainText("unread");
  });

  test("sees a direct message once Ergo's reading place of its partner passes it, a read on another device", async ({
    page,
  }) => {
    const { address, ergo } = await account(page);
    ergo().send(`@msgid=d1;time=${T(31)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${address} :hello there`);
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    ergo().send(`:ergo MARKREAD ${OTHER} timestamp=${T(31)}`);
    await expect(page).toHaveTitle(BASE);
    await expect(rowOf(page, `${OTHER_SHORT} Not encrypted`)).not.toContainText("unread");
  });

  // 4d's replies: a reply to a line of the account's is a notice, said by who and what.
  test("counts a reply to the account's line as a notice, and sees it as the tab shows", async ({ page }) => {
    await hiddenTab(page, true);
    const address = await logIn(page, word("reply"));
    const opened = await room(page, {
      me: address,
      read: T(2),
      history: [...HISTORY, ["a1", T(3), "I propose", address]],
    });
    opened
      .ergo()
      .send(`@msgid=r1;time=${T(31)};account=${MEMBER};+reply=a1 :${MEMBER}!u@h PRIVMSG #bubble/games :agreed`);
    await expect(rowOf(page, "#games")).toContainText("1 unread");
    await expect(roomsNav(page).getByRole("link", { name: `${SHORT} replied to you #games` })).toBeVisible();
    await tab(page, "show");
    await expect(page).toHaveTitle(BASE);
  });

  test("makes no notice of an edit of a line that mentioned the account", async ({ page }) => {
    const { address, ergo } = await account(page);
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(address) }));
    ergo().send(
      `@msgid=e1;time=${T(32)};account=${MEMBER};+gnoworld/edit=n1 :${MEMBER}!u@h PRIVMSG #bubble :${mentioned(address, "fixed")}`,
    );
    ergo().send(live("n2", T(33), { room: "#bubble", text: "a barrier" }));
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    await expect(rowOf(page, "#bubble")).toContainText("1 unread");
  });

  test("counts a mention of the whole room in an announcement room, and not in an open one", async ({ page }) => {
    const { ergo } = await account(page);
    ergo().send(live("g1", T(31), { room: "#bubble", text: "@room hello all" }));
    ergo().send(live("g2", T(32), { room: NEWS, text: "@room the release is out" }));
    await expect(rowOf(page, "#news")).toContainText("1 unread");
    await expect(rowOf(page, "#bubble")).not.toContainText("unread");
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    await expect(roomsNav(page).getByRole("link", { name: `${SHORT} mentioned the room #news` })).toBeVisible();
  });

  test("sees a mention once Ergo's reading place passes it, as when the room was read on another device", async ({
    page,
  }) => {
    const { address, ergo } = await account(page);
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(address) }));
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    ergo().send(`:ergo MARKREAD #bubble timestamp=${T(31)}`);
    await expect(page).toHaveTitle(BASE);
    await expect(rowOf(page, "#bubble")).not.toContainText("unread");
  });

  test("takes a mention away when its line is deleted or hidden", async ({ page }) => {
    const { address, ergo } = await account(page);
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(address) }));
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    ergo().send(`:gnoworld!u@h REDACT #bubble n1`);
    await expect(page).toHaveTitle(BASE);
    await expect(roomsNav(page).getByRole("heading", { name: "Notifications" })).toHaveCount(0);
  });

  test("clears what it lists, for the page, on a button", async ({ page }) => {
    const { address, ergo } = await account(page);
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(address) }));
    ergo().send(live("n2", T(32), { room: NEWS, text: mentioned(address) }));
    await expect(page).toHaveTitle(`(2) ${BASE}`);
    await roomsNav(page).getByRole("button", { name: "Clear" }).click();
    await expect(page).toHaveTitle(BASE);
    await expect(rowOf(page, "#bubble")).not.toContainText("unread");
    await expect(rowOf(page, "#news")).not.toContainText("unread");
  });

  // No Notification API, no sound, no focus taken: what arrives is read, never forced (decisions row of 4f-n).
  test("tells a screen reader what came in a polite status, for a room not in view, and moves no focus", async ({
    page,
  }) => {
    const { address, ergo } = await account(page);
    await field(page).focus();
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(address) }));
    await expect(roomsNav(page).getByRole("status")).toHaveText(`${SHORT} mentioned you in #bubble`);
    await expect(field(page)).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  // R19: the button goes as the list empties, and so does the link followed from it: focus must land on a stable element,
  // the rooms' navigation, not on the page's body.
  test("keeps the keyboard's place in the navigation as Clear empties the list", async ({ page }) => {
    const { address, ergo } = await account(page);
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(address) }));
    await roomsNav(page).getByRole("button", { name: "Clear" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveTitle(BASE);
    await expect(roomsNav(page)).toBeFocused();
  });

  test("keeps the keyboard's place in the navigation as a notice's link is followed", async ({ page }) => {
    const { address, ergo } = await account(page);
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(address) }));
    await roomsNav(page)
      .getByRole("link", { name: `${SHORT} mentioned you #bubble` })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "#bubble", level: 2 })).toBeVisible();
    await expect(roomsNav(page)).toBeFocused();
  });

  // N1: what arrives is read, never forced: no browser notification, no sound.
  test("asks for no browser notification and plays no sound", async ({ page }) => {
    await page.addInitScript(() => {
      const calls: string[] = [];
      Reflect.set(window, "forcedCalls", calls);
      for (const name of ["Notification", "Audio", "AudioContext", "webkitAudioContext"]) {
        const forced = Object.assign(
          function () {
            calls.push(`new ${name}`);
          },
          {
            requestPermission: () => {
              calls.push(`${name}.requestPermission`);
              return Promise.resolve("denied");
            },
          },
        );
        Reflect.set(window, name, forced);
      }
    });
    const { address, ergo } = await account(page);
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(address) }));
    await expect(page).toHaveTitle(`(1) ${BASE}`);
    expect(await page.evaluate(() => JSON.stringify(Reflect.get(window, "forcedCalls")))).toBe("[]");
  });

  test("tells a guest nothing: no list, no mode to choose, no count, whatever a line names", async ({ page }) => {
    const { ergo } = await room(page, { others: { "#bubble": MAIN } });
    ergo().send(live("n1", T(31), { room: "#bubble", text: mentioned(MEMBER) }));
    ergo().send(live("n2", T(32), { text: "a barrier" }));
    await expect(lineOf(page, "a barrier")).toBeVisible();
    await expect(page).toHaveTitle(BASE);
    await expect(roomsNav(page).getByRole("heading", { name: "Notifications" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: /^Notifications for/ })).toHaveCount(0);
    await expect(page.getByText("unread")).toHaveCount(0);
  });
});
