// What 4d's journeys share: #games' history, a TAGMSG and a tagged line as Ergo replays or relays them, a line's bar,
// the composer's field, and the test's account on a scripted Ergo that echoes it.
import { lines, word } from "./chat.ts";
import type { Locator } from "@playwright/test";
import { expect, type Page } from "./fixtures.ts";
import { another, logIn, type Launcher } from "./irc.ts";
import { MEMBER, opened, type HistoryLine, type Scripted } from "./scripted.ts";

export const OTHER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
export const GUEST = "guest-zzzzzz";
export const ROOM = "#bubble/games";
/** A time `minute` minutes into the history's hour. */
export const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
export const HISTORY: readonly HistoryLine[] = [
  ["m1", T(0), "the first line"],
  ["m2", T(1), "the second **line**"],
];

/** A TAGMSG `at` minutes in, from an account, or from a guest when none is named. */
export const tagmsg = (id: string, tags: string, { at, who }: { at: number; who?: string }) =>
  who === undefined
    ? `@msgid=${id};time=${T(at)};${tags} :guest-ab12cd!u@h TAGMSG ${ROOM}`
    : `@msgid=${id};time=${T(at)};account=${who};${tags} :${who}!u@h TAGMSG ${ROOM}`;
/** A line `at` minutes in with tags of its own: a reply or an edit; MEMBER's unless named. */
export const tagged = (
  id: string,
  text: string,
  { at, tags, who = MEMBER }: { at: number; tags: string; who?: string },
) => `@msgid=${id};time=${T(at)};account=${who};${tags} :${who}!u@h PRIVMSG ${ROOM} :${text}`;

export const barOf = (page: Page, at: number) =>
  lines(page).nth(at).getByRole("toolbar", { name: "Actions on this message" });
export const field = (page: Page) => page.getByRole("textbox", { name: "Message #games" });

/** The test's account on a scripted Ergo that echoes what the page says, its script made with the account's address,
 * the room showing `shown` lines; what the page says in a room, as it sends it, its typing (4f) left out. */
export async function asAccount(page: Page, script: (address: string) => Scripted = () => ({}), shown = 2) {
  const address = await logIn(page, word("talk"));
  const sent: string[] = [];
  const ergo = await opened(page, address, {
    history: HISTORY,
    echo: true,
    heard: (line) => sent.push(line),
    ...script(address),
  });
  await expect(lines(page)).toHaveCount(shown);
  return {
    address,
    ergo,
    said: () => sent.filter((line) => /^(@\S+ )?(PRIVMSG|TAGMSG) /.test(line) && !line.includes("+typing=")),
    typed: () => sent.filter((line) => line.includes("+typing=")),
  };
}

/** Two accounts in #games on the real Ergo, each seeing the other there: `page`'s, and another in a browser of its own. */
export async function twoInGames(page: Page, launcher: Launcher) {
  const bob = await another(launcher, word("bob"));
  const me = await logIn(page, word("as"));
  await bob.page.goto("/w/bubble?room=games&chat=full");
  await page.goto("/w/bubble?room=games&chat=full");
  for (const [each, who] of [
    [bob.page, me],
    [page, bob.address],
  ] as const)
    await expect(each.getByRole("region", { name: "Who's here" }).getByTitle(who)).toBeVisible();
  return bob;
}

/** The words of the list, a word at a time, that the box of a line's bar crosses. */
export const crossedByBar = (page: Page) =>
  page.getByRole("list", { name: "Messages" }).evaluate((list) => {
    const toolbar = list.querySelector("[role='toolbar']");
    const box = toolbar?.getBoundingClientRect() ?? new DOMRect();
    const over = (rect: DOMRect) =>
      rect.right > box.left && rect.left < box.right && rect.bottom > box.top && rect.top < box.bottom;
    const found: string[] = [];
    const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      // The time at the head's far end lies under the bar, as the video's does: it is not a word of the line.
      if (node.parentElement?.closest("time") != null) continue;
      if (toolbar?.contains(node) !== true && [...range.getClientRects()].some(over))
        found.push(node.textContent ?? "");
    }
    return found;
  });

/** The Tab presses from where the focus is to `target`, at most `most`: the test fails when it takes more. */
export async function tabsTo(page: Page, target: Locator, most: number): Promise<number> {
  for (let presses = 1; presses <= most; presses += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return presses;
  }
  throw new Error(`not reached in ${String(most)} Tab presses`);
}
