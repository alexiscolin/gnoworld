import AxeBuilder from "@axe-core/playwright";
import type { WebSocketRoute } from "@playwright/test";
import { lineOf, lines, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { scriptedErgo, type HistoryLine, type Scripted } from "./scripted.ts";
import {
  field,
  hiddenTab,
  HISTORY,
  live,
  marks,
  room,
  ROOM,
  sentBefore,
  T,
  tab,
  typingOf,
  typist,
  visibilityListeners,
} from "./scriptedRoom.ts";

const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// The history with two lines said while the page was away.
const GAP: readonly HistoryLine[] = [...HISTORY, ["g1", T(5), "gap one"], ["g2", T(6), "gap two"]];

// #games opened as `address` on a scripted Ergo, each connection's script from `scripts` (its number, from 1, and
// the history it may hold back): the lines the page sent, its sockets, and the release of the held history.
async function heldHistory(
  page: Page,
  address: string,
  scripts: (connection: number, held: Promise<void>) => Scripted,
) {
  let release: () => void = () => undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const sent: string[] = [];
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    sockets.push(ergo);
    scriptedErgo(ergo, address, { heard: (line) => sent.push(line), ...scripts(sockets.length, held) });
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  return { sent, sockets, release };
}

// 4f (docs/decisions.md, 2026-10-21): the reading place Ergo keeps for the account (draft/read-marker): the first line
// past it marked New, and the room in view marked read, on a scripted Ergo. No test sleeps: what the page did not send
// is read before a later word of its own (sentBefore).
test.describe("the reading place", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  // The red pass (R1): Ergo answers the page's MARKREAD, and another session moves the place on; the mark stays.
  test("marks the first line past the reading place New, and keeps it there as the room is read", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const { sent, ergo } = await room(page, { me: address, read: T(0) });
    await expect(lineOf(page, "the second line")).toContainText(/^New /);
    await expect(page.locator("[data-new]")).toHaveCount(1);
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`]);
    ergo().send(`:ergo.test MARKREAD ${ROOM} timestamp=${T(5)}`);
    ergo().send(typingOf("active"));
    await expect(typist(page)).toBeVisible();
    await expect(lineOf(page, "the second line")).toContainText(/^New /);
    await expect(page.locator("[data-new]")).toHaveCount(1);
  });

  // The green pass (G1): a live line before the room's history page takes no mark; the first past the place does.
  test("marks the first history line past the place New though a live line came before the history", async ({
    page,
  }) => {
    const address = await logIn(page, word("read"));
    const { sent, sockets, release } = await heldHistory(page, address, (_, held) => ({
      history: HISTORY,
      read: T(0),
      historyAfter: held,
    }));
    await expect.poll(() => sent.some((line) => line.startsWith("CHATHISTORY "))).toBe(true);
    sockets.at(-1)?.send(live("live", T(5), { text: "a live line" }));
    await expect(lineOf(page, "a live line")).toBeVisible();
    // Read before the history came, the live line would mark the lines under it read unseen.
    expect(marks(await sentBefore(page, sent))).toEqual([]);
    release();
    await expect(lines(page)).toHaveCount(HISTORY.length + 1);
    await expect(lineOf(page, "the second line")).toContainText(/^New /);
    await expect(page.locator("[data-new]")).toHaveCount(1);
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(5)}`]);
  });

  // The code review (CR3): each connection's history waited on, not the first's alone.
  test("marks nothing read on a reconnect before that connection's history came", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const { sent, sockets, release } = await heldHistory(page, address, (connection, held) =>
      connection === 1 ? { history: HISTORY, read: T(0) } : { history: GAP, read: T(2), historyAfter: held },
    );
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`]);
    await sockets[0]?.close();
    const asked = () => sent.filter((line) => line.startsWith("CHATHISTORY ")).length;
    await expect.poll(asked, { timeout: 15_000 }).toBe(2);
    sockets.at(-1)?.send(live("live", T(9), { text: "a live line" }));
    await expect(lineOf(page, "a live line")).toBeVisible();
    // Read before this connection's history came, the live line would mark the gap under it read unseen.
    expect(marks(await sentBefore(page, sent))).toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`]);
    release();
    await expect(lineOf(page, "gap two")).toBeVisible();
    await expect.poll(() => marks(sent).at(-1)).toBe(`MARKREAD ${ROOM} timestamp=${T(9)}`);
  });

  // The code review (CR1): the room shown to the link before its lines read it, so a room come back to is read.
  test("marks a room come back to read to a line that came while it was away", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const { sent, ergo } = await room(page, { me: address, read: T(0) });
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`]);
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByRole("heading", { name: "#bubble", level: 2 })).toBeVisible();
    ergo().send(live("away", T(3), { text: "while away" }));
    await page.keyboard.press("Alt+ArrowUp");
    await expect(lineOf(page, "while away")).toBeVisible();
    await expect
      .poll(() => marks(sent))
      .toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`, `MARKREAD ${ROOM} timestamp=${T(3)}`]);
  });

  // The code review (CR2): a busy room read at its end tells Ergo its place a few times, not once a line.
  test("tells Ergo a busy room's place at most once each 2 s, its newest last", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const { sent, ergo } = await room(page, { me: address, read: T(0) });
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`]);
    for (let minute = 10; minute < 30; minute += 1) ergo().send(live(`b${String(minute)}`, T(minute)));
    await expect(lineOf(page, "b29")).toBeVisible();
    await expect.poll(() => marks(sent).at(-1)).toBe(`MARKREAD ${ROOM} timestamp=${T(29)}`);
    expect(marks(sent).length).toBeLessThanOrEqual(3);
  });

  test("marks no line New for a room read to its end", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const { ergo } = await room(page, { me: address, read: T(2) });
    ergo().send(typingOf("active"));
    await expect(typist(page)).toBeVisible();
    await expect(page.locator("[data-new]")).toHaveCount(0);
  });

  // The red pass (R1b): a line seen coming in a room read to its end is no news.
  test("marks a live line read as it comes while the reader is at the end, and not New", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const { sent, ergo } = await room(page, { me: address, read: T(2) });
    ergo().send(live("live", T(3), { text: "a live line" }));
    await expect(lineOf(page, "a live line")).toBeVisible();
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(3)}`]);
    await expect(page.locator("[data-new]")).toHaveCount(0);
  });

  // The red pass (R4): the room in view alone; another room's line moves no place.
  test("marks no other room read as its lines come", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const { sent, ergo } = await room(page, { me: address, read: T(2) });
    ergo().send(live("elsewhere", T(3), { room: "#bubble" }));
    ergo().send(live("here", T(4)));
    await expect(lineOf(page, "here")).toBeVisible();
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(4)}`]);
  });

  // The red pass (R22): the account's own line, echoed by Ergo, is read on its other devices too.
  test("marks the room read at the account's own line, as Ergo echoes it", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const { sent } = await room(page, { me: address, read: T(2), echo: T(5) });
    await field(page).fill("my own line");
    await field(page).press("Enter");
    await expect(lineOf(page, "my own line")).toBeVisible();
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(5)}`]);
  });

  test("marks nothing read while the reader is scrolled up, then the newest once back at the end", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const history = Array.from({ length: 60 }, (_, n): HistoryLine => [
      `h${String(n)}`,
      T(n % 60),
      `Line ${String(n)}`,
    ]);
    const { sent, ergo } = await room(page, { me: address, history, read: T(59) });
    const list = page.getByRole("list", { name: "Messages" });
    await list.evaluate((box) => {
      box.scrollTop = 0;
      box.dispatchEvent(new Event("scroll"));
    });
    ergo().send(live("late", "2026-10-25T11:00:00.000Z"));
    await expect(lineOf(page, "late")).toHaveCount(1);
    expect(marks(await sentBefore(page, sent))).toEqual([]);
    await list.evaluate((box) => {
      box.scrollTop = box.scrollHeight;
      box.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=2026-10-25T11:00:00.000Z`]);
  });

  // The UX review (U1, U7): a room with news opens on its first, and is read only as the reader reaches its end.
  test("opens a long backlog on its New line, and marks it read only once the reader scrolls to the end", async ({
    page,
  }) => {
    const address = await logIn(page, word("read"));
    const history = Array.from({ length: 60 }, (_, n): HistoryLine => [`h${String(n)}`, T(n), `Line ${String(n)}`]);
    const { sent } = await room(page, { me: address, history, read: T(10) });
    const fresh = page.locator("[data-new]");
    await expect(fresh).toContainText("Line 11");
    await expect(fresh).toBeInViewport();
    await expect(lineOf(page, "Line 59")).not.toBeInViewport();
    // A word for a screen reader, and the first new line the list's tab stop: the keyboard's way to it.
    await expect(fresh).toContainText("New from here");
    await expect(fresh).toHaveAttribute("tabindex", "0");
    expect(marks(await sentBefore(page, sent))).toEqual([]);
    await page.getByRole("list", { name: "Messages" }).evaluate((box) => {
      box.scrollTop = box.scrollHeight;
    });
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(59)}`]);
  });

  // The green pass (G3): each newest line's look at the tab lets the last one go.
  test("holds one look at the tab however many lines come", async ({ page }) => {
    await hiddenTab(page, false);
    const address = await logIn(page, word("read"));
    const { sent, ergo } = await room(page, { me: address, read: T(0) });
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`]);
    const held = await visibilityListeners(page);
    for (const minute of [5, 6, 7]) ergo().send(live(`l${String(minute)}`, T(minute)));
    await expect(lineOf(page, "l7")).toBeVisible();
    expect(await visibilityListeners(page)).toBe(held);
  });

  test("marks nothing read while the page is hidden, the newest once it shows", async ({ page }) => {
    await hiddenTab(page, true);
    const address = await logIn(page, word("read"));
    const { sent } = await room(page, { me: address, read: T(0) });
    expect(marks(await sentBefore(page, sent))).toEqual([]);
    await tab(page, "show");
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`]);
  });

  // The red pass (R11): hidden after the room opened, a line that comes is read once the tab shows again.
  test("marks a line that came while the tab was away read once it shows, and once", async ({ page }) => {
    await hiddenTab(page, false);
    const address = await logIn(page, word("read"));
    const { sent, ergo } = await room(page, { me: address, read: T(2) });
    await tab(page, "hide");
    ergo().send(live("away", T(3), { text: "while away" }));
    await expect(lineOf(page, "while away")).toHaveCount(1);
    expect(marks(await sentBefore(page, sent))).toEqual([]);
    await tab(page, "show");
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(3)}`]);
  });

  // The red pass (R10): a MARKREAD the link lost before Ergo answered goes again once the page is back in the room.
  test("marks the room read again after the link drops before Ergo's answer", async ({ page }) => {
    const address = await logIn(page, word("read"));
    const { sent, sockets } = await room(page, { me: address, read: T(0), quietMarks: true });
    await expect.poll(() => marks(sent)).toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`]);
    await sockets[0]?.close();
    await expect
      .poll(() => marks(sent), { timeout: 10_000 })
      .toEqual([`MARKREAD ${ROOM} timestamp=${T(2)}`, `MARKREAD ${ROOM} timestamp=${T(2)}`]);
    expect(sockets).toHaveLength(2);
  });

  test("marks nothing read for a guest, whose place Ergo keeps for no account", async ({ page }) => {
    const { sent } = await room(page, { read: T(0) });
    await page.keyboard.press("Alt+ArrowDown");
    await expect.poll(() => sent.some((line) => line.startsWith("CHATHISTORY LATEST #bubble "))).toBe(true);
    expect(marks(sent)).toEqual([]);
  });

  test("passes axe, and looks as the room with a New line and a typist on a computer's screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await logIn(page, word("read"));
    // The nick Ergo gives the account, whatever the test wallet drawn: who is here, beside the picture, stays as wide.
    const { ergo } = await room(page, { me: ACCOUNT, read: T(0) });
    ergo().send(typingOf("active"));
    await expect(typist(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page.getByRole("list", { name: "Messages" }).locator("..")).toHaveScreenshot(
      "typing-new-computer.png",
      {
        mask: [field(page)],
      },
    );
  });
});
