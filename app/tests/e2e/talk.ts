// What 4d's journeys share: #games' history, a TAGMSG as Ergo replays or relays it, a line's bar, and the test's
// account on a scripted Ergo that echoes it.
import { lines, word } from "./chat.ts";
import { expect, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { opened, type HistoryLine, type Scripted } from "./scripted.ts";

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
export const barOf = (page: Page, at: number) => lines(page).nth(at).getByRole("toolbar", { name: "Message actions" });

/** The test's account on a scripted Ergo that echoes what the page says, its script made with the account's address,
 * the room showing `shown` lines; what the page says in a room, as it sends it. */
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
  return { address, ergo, said: () => sent.filter((line) => /^(@\S+ )?(PRIVMSG|TAGMSG) /.test(line)) };
}
