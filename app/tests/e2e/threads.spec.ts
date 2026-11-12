import AxeBuilder from "@axe-core/playwright";
import type { WebSocketRoute } from "@playwright/test";
import { buttonsOf, lineOf, lines, roomsNav, whoIsHere, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { MEMBER, opened, scriptedErgo, type HistoryLine, type Scripted } from "./scripted.ts";
import { marks, sentBefore, tags } from "./scriptedRoom.ts";
import { asAccount, barOf, field, GUEST, OTHER, ROOM, T, tabsTo, tagged, tagmsg } from "./talk.ts";
import { chipOf, closeButton, inThread, panel, threadField, threadOf } from "./thread.ts";

// 4d's threads (docs/plans/chat-features.md, M3): a reply chain found in the room's own lines; a chip under its root, or
// a line's More menu, opens it beside the room; every reply from it is tagged +reply with the root's msgid (scripted.ts).
// A root, a line that is none, a reply to the root and a reply to that reply: the root has two replies.
const BASE: readonly HistoryLine[] = [
  ["m1", T(0), "the root line"],
  ["m2", T(1), "an unrelated line"],
];
const REPLIES = [
  tagged("m3", "first reply", { at: 2, tags: "+reply=m1", who: OTHER }),
  tagged("m4", "a reply to the reply", { at: 3, tags: "+reply=m3" }),
];
const WHOLE = [/the root line/, /first reply/, /a reply to the reply/];
// A reply quotes the line it answers: the root's words are in two lines of the room, so the root is the first.
const cancel = (page: Page) => page.getByRole("button", { name: "Cancel the reply" });
const guestWord = "Log in to write in this room.";

// An account of the test's own in #games with the four lines, Ergo echoing what the page says.
const open = (page: Page, over: Scripted = {}, shown = 4) =>
  asAccount(page, () => ({ history: BASE, replayed: REPLIES, ...over }), shown);

test.describe("threads", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("counts a root's replies on a chip under the root alone, a reply to a reply counted", async ({ page }) => {
    await open(page);
    await expect(chipOf(lines(page).first())).toHaveText(/^2 replies\b/);
    await expect(chipOf(lines(page))).toHaveCount(1);
  });

  test("opens a thread from its chip beside the room: its root, then its replies, Who's here giving its place", async ({
    page,
  }) => {
    await open(page);
    await chipOf(lines(page).first()).click();
    await expect(panel(page)).toBeVisible();
    await expect(inThread(page)).toHaveText(WHOLE);
    await expect(panel(page).getByRole("heading", { name: /Thread/ })).toContainText("the root line");
    await expect(panel(page)).toContainText("2 replies");
    await expect(whoIsHere(page)).toHaveCount(0);
    await expect(lines(page)).toHaveCount(4);
    await expect(threadField(page)).toBeFocused();
  });

  test("opens, from a reply's More menu, the thread it is in, and from a line with no reply a thread of its own", async ({
    page,
  }) => {
    await open(page);
    await threadOf(lineOf(page, "a reply to the reply"));
    await expect(inThread(page)).toHaveText(WHOLE);
    await expect(threadField(page)).toBeFocused();
    await closeButton(page).click();
    await expect(panel(page)).toHaveCount(0);
    await threadOf(lineOf(page, "an unrelated line"));
    await expect(inThread(page)).toHaveText([/an unrelated line/]);
    await expect(panel(page)).toContainText("No replies yet");
  });

  test("says a reply from the panel tagged with the root's msgid, whichever line opened it, and shows it at once", async ({
    page,
  }) => {
    const { said } = await open(page);
    await threadOf(lineOf(page, "a reply to the reply"));
    await threadField(page).fill("from the panel");
    await threadField(page).press("Enter");
    await expect(inThread(page)).toHaveText([...WHOLE, /from the panel/]);
    expect(said()).toEqual([`@+reply=m1 PRIVMSG ${ROOM} :from the panel`]);
    await expect(chipOf(lines(page).first())).toHaveText(/^3 replies\b/);
    await expect(lines(page)).toHaveCount(5);
    await expect(threadField(page)).toHaveText("");
    // After a send the focus stays in the field, for the next line (R14).
    await expect(threadField(page)).toBeFocused();
    // The room's own composer says its line plain: the panel's tag is the panel's.
    await field(page).fill("in the room");
    await field(page).press("Enter");
    await expect(lineOf(page, "in the room")).toBeVisible();
    expect(said().at(-1)).toBe(`PRIVMSG ${ROOM} :in the room`);
    await expect(inThread(page)).toHaveCount(4);
  });

  // R3: a Reply asked in the room is the room composer's alone: the panel's line goes to its root, and sends nothing
  // to the room's pending target, nor clears it.
  test("sends from the panel to the root, the room's pending Reply to its own line, neither taking the other's", async ({
    page,
  }) => {
    const { said } = await open(page);
    await lines(page).nth(1).hover();
    await barOf(page, 1).getByRole("button", { name: "Reply" }).click();
    await expect(page.getByRole("form", { name: "Write in #games" })).toContainText("Replying to");
    // The pointed line's bar stands over the line above it: the pointer goes to the root first, as a reader's does.
    await lines(page).first().hover();
    await chipOf(lines(page).first()).click();
    await threadField(page).fill("to the root");
    await threadField(page).press("Enter");
    await expect(inThread(page)).toHaveCount(4);
    expect(said()).toEqual([`@+reply=m1 PRIVMSG ${ROOM} :to the root`]);
    await expect(cancel(page)).toBeVisible();
    await field(page).fill("to the unrelated line");
    await field(page).press("Enter");
    await expect(lineOf(page, "to the unrelated line")).toBeVisible();
    expect(said().at(-1)).toBe(`@+reply=m2 PRIVMSG ${ROOM} :to the unrelated line`);
  });

  // R2: the room's unsent draft is the room's: the panel's field opens empty, and what it holds is kept on no device.
  test("keeps the room's draft apart from the panel's field, which opens empty and keeps no draft", async ({
    page,
  }) => {
    const { address } = await open(page);
    await field(page).fill("keep me");
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toHaveText("");
    await threadField(page).fill("panel words, unsent");
    await closeButton(page).click();
    await expect(field(page)).toHaveText("keep me");
    await chipOf(lines(page).first()).click();
    await threadField(page).fill("sent from the panel");
    await threadField(page).press("Enter");
    await expect(inThread(page)).toHaveCount(4);
    await closeButton(page).click();
    await expect(field(page)).toHaveText("keep me");
    const kept = () =>
      page.evaluate(() =>
        Object.entries(localStorage)
          .filter(([key]) => key.startsWith("gnoworld:draft:"))
          .map(([key, value]) => `${key}=${String(value)}`),
      );
    await expect.poll(kept).toEqual([expect.stringContaining(`gnoworld:draft:${address}:${ROOM}`)]);
    expect((await kept()).join()).toContain("keep me");
    await page.reload();
    await hydrated(page);
    await expect(field(page)).toHaveText("keep me");
  });

  // R4: a thread opened over another is a new panel: nothing typed for the first goes to the second.
  test("switches from one thread to another with the panel open: its own lines, an empty field, its own root's tag", async ({
    page,
  }) => {
    const { said } = await open(page);
    await chipOf(lines(page).first()).click();
    await threadField(page).fill("half a thought");
    await threadOf(lineOf(page, "an unrelated line"));
    await expect(inThread(page)).toHaveText([/an unrelated line/]);
    await expect(threadField(page)).toHaveText("");
    await expect(threadField(page)).toBeFocused();
    await threadField(page).fill("for the second");
    await threadField(page).press("Enter");
    await expect(inThread(page)).toHaveCount(2);
    expect(said()).toEqual([`@+reply=m2 PRIVMSG ${ROOM} :for the second`]);
  });

  // A live reply, a reply while the panel is shut, and a reaction that names the root: that one is no reply. It is
  // read before the next reply on the same socket, so the count after it says whether it was counted.
  test("takes a live reply into the chip and the open panel, never a reaction that names the root", async ({
    page,
  }) => {
    const { ergo } = await open(page);
    await chipOf(lines(page).first()).click();
    ergo().send(tagged("m5", "a live reply", { at: 5, tags: "+reply=m1", who: OTHER }));
    await expect(inThread(page)).toHaveText([...WHOLE, /a live reply/]);
    await closeButton(page).click();
    ergo().send(tagmsg("r1", "+draft/react=👍;+reply=m1", { at: 6, who: OTHER }));
    ergo().send(tagged("m6", "while shut", { at: 7, tags: "+reply=m3", who: OTHER }));
    await expect(chipOf(lines(page).first())).toHaveText(/^4 replies\b/);
    await expect(lines(page)).toHaveCount(6);
  });

  // R1: an author's edit of a reply is folded out of the room's list; the panel agrees with the chip.
  test("reads an author's edit of a reply as the reply's words, not as a reply, in the chip and the panel", async ({
    page,
  }) => {
    const { ergo } = await open(page);
    await chipOf(lines(page).first()).click();
    ergo().send(tagged("e1", "first reply, fixed", { at: 5, tags: "+gnoworld/edit=m3;+reply=m1", who: OTHER }));
    await expect(inThread(page)).toHaveText([/the root line/, /first reply, fixed/, /a reply to the reply/]);
    await expect(chipOf(lines(page).first())).toHaveText(/^2 replies\b/);
    await expect(panel(page)).toContainText("2 replies");
    await expect(lines(page)).toHaveCount(4);
  });

  // R8: the root hidden while the panel is open: its words leave the title and the first row, the replies stay, and the
  // composer keeps tagging the id of the line that was (a reply to an earlier message, as the window's own).
  test("takes a hidden root's words out of the open panel, its replies kept, the composer still on its msgid", async ({
    page,
  }) => {
    const { ergo, said } = await open(page);
    await chipOf(lines(page).first()).click();
    await expect(panel(page).getByRole("heading", { name: /Thread/ })).toContainText("the root line");
    ergo().send(`:${MEMBER}!u@h REDACT ${ROOM} m1`);
    await expect(lines(page)).toHaveCount(3);
    await expect(panel(page)).toContainText(/earlier message/i);
    await expect(panel(page)).not.toContainText("the root line");
    await expect(inThread(page)).toHaveText([/first reply/, /a reply to the reply/]);
    await threadField(page).fill("still here");
    await threadField(page).press("Enter");
    await expect(inThread(page)).toHaveCount(3);
    expect(said()).toEqual([`@+reply=m1 PRIVMSG ${ROOM} :still here`]);
  });

  // The stated limit (decisions, 2026-10-27): a deleted reply takes the replies it had out of the thread, they answer a
  // message that is gone; the lines stay in the room.
  test("takes the replies of a deleted middle reply out of the thread, the count falling with them", async ({
    page,
  }) => {
    const { ergo } = await open(page);
    await chipOf(lines(page).first()).click();
    ergo().send(`:${MEMBER}!u@h REDACT ${ROOM} m3`);
    await expect(inThread(page)).toHaveText([/the root line/]);
    await expect(panel(page)).toContainText("No replies yet");
    await expect(chipOf(lines(page).first())).toHaveCount(0);
    await expect(lineOf(page, "a reply to the reply")).toBeVisible();
  });

  test("closes with Escape, and with its button, the focus on the line that opened it, Who's here back", async ({
    page,
  }) => {
    await open(page);
    const root = lines(page).first();
    await chipOf(root).click();
    await expect(threadField(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(root).toBeFocused();
    await expect(whoIsHere(page)).toBeVisible();
    await chipOf(root).click();
    await closeButton(page).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(root).toBeFocused();
  });

  // R14: a thread opened from a reply's menu gives the focus back to that reply.
  test("gives the focus back to the reply whose menu opened the thread", async ({ page }) => {
    await open(page);
    await threadOf(lineOf(page, "a reply to the reply"));
    await closeButton(page).click();
    await expect(lineOf(page, "a reply to the reply")).toBeFocused();
  });

  // R14: no line to give the focus to: the room's own stop, never the page.
  test("gives the focus to a line of the room, never the page, when the line that opened the thread is gone", async ({
    page,
  }) => {
    const { ergo } = await open(page);
    await chipOf(lines(page).first()).click();
    // The panel is open, its field focused, when the line goes: a redaction while it opens is another case.
    await expect(threadField(page)).toBeFocused();
    ergo().send(`:${MEMBER}!u@h REDACT ${ROOM} m1`);
    await expect(lines(page)).toHaveCount(3);
    // The panel has taken the redaction in: its root is "an earlier message" now, and the field still holds the focus.
    await expect(panel(page).getByRole("heading", { name: /an earlier message/ })).toBeVisible();
    await expect(threadField(page)).toBeFocused();
    // The room's own stop is its newest line, before the panel goes and after.
    await expect(lines(page).last()).toHaveAttribute("tabindex", "0");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    // The focus moves a frame after the panel goes: the stop, not any line of the list (G4).
    await expect(lines(page).last()).toBeFocused();
  });

  // R14: Escape belongs to what has the focus: the room's composer keeps it, the panel stays.
  test("leaves the panel open when Escape is pressed in the room's own composer", async ({ page }) => {
    await open(page);
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toBeFocused();
    await field(page).focus();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeVisible();
  });

  test("closes the thread with a move to another room", async ({ page }) => {
    await open(page);
    await chipOf(lines(page).first()).click();
    await expect(panel(page)).toBeVisible();
    await roomsNav(page).getByRole("link", { name: "bubble", exact: true }).click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("reaches a thread by keyboard: the line's More menu, then its chip, the focus going into the panel", async ({
    page,
  }) => {
    await open(page);
    const root = lines(page).first();
    // A line the focus is not on keeps its chip out of the Tab order: one stop a line, however many threads.
    await expect(chipOf(root)).toHaveAttribute("tabindex", "-1");
    await root.focus();
    await expect(chipOf(root)).not.toHaveAttribute("tabindex", "-1");
    const more = root.getByRole("toolbar").getByRole("button", { name: "More actions", exact: true });
    expect(await tabsTo(page, more, 8)).toBeLessThanOrEqual(8);
    await page.keyboard.press("Enter");
    // The menu focuses its first item once placed: an arrow before that would start from nowhere.
    await expect(page.getByRole("menuitem", { name: "Copy text" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Open thread" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(threadField(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(root).toBeFocused();
    // The bar's reactions come first: the chip stands after them, a count the bar may change.
    expect(await tabsTo(page, chipOf(root), 14)).toBeLessThanOrEqual(14);
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
  });

  // The panel's rows are the thread's own lines: no bar of their own, no chip, whatever is pointed at or focused.
  test("gives the panel's rows no bar and no chip, pointed at or focused", async ({ page }) => {
    await open(page);
    await chipOf(lines(page).first()).click();
    await expect(inThread(page)).toHaveCount(3);
    for (const row of await inThread(page).all()) {
      await row.hover();
      await row.focus();
    }
    await expect(panel(page).getByRole("toolbar")).toHaveCount(0);
    await expect(chipOf(panel(page))).toHaveCount(0);
    await expect(buttonsOf(inThread(page))).toHaveCount(0);
  });

  // G2: the panel's rows are no stop of the room's list, so a link in one is a Tab stop of its own, after Close.
  test("keeps a link of the panel in the Tab order: one Tab from Close reaches it", async ({ page }) => {
    const text = "see [the docs](https://example.com/fine)";
    await open(page, { replayed: [tagged("m3", text, { at: 2, tags: "+reply=m1", who: OTHER })] }, 3);
    await chipOf(lines(page).first()).click();
    const link = panel(page).getByRole("link", { name: "the docs" });
    await expect(link).toBeVisible();
    await expect(link).not.toHaveAttribute("tabindex", /.*/);
    await closeButton(page).focus();
    expect(await tabsTo(page, link, 1)).toBe(1);
  });

  test("lets a guest read a thread: the chip, the panel, no field, the focus on Close", async ({ page }) => {
    await opened(page, GUEST, { history: BASE, replayed: REPLIES });
    await expect(lines(page)).toHaveCount(4);
    await chipOf(lines(page).first()).click();
    await expect(inThread(page)).toHaveText(WHOLE);
    await expect(panel(page)).toContainText(guestWord);
    await expect(panel(page).getByRole("textbox")).toHaveCount(0);
    await expect(closeButton(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(lines(page).first()).toBeFocused();
    // G6: a guest has no field, so a thread opened over another gives Close the focus again.
    await chipOf(lines(page).first()).click();
    await threadOf(lineOf(page, "an unrelated line"));
    await expect(inThread(page)).toHaveText([/an unrelated line/]);
    await expect(closeButton(page)).toBeFocused();
  });

  // R9: a guest's keyboard: the chip on the line the focus is on, and the More menu's item, which every line holds.
  test("lets a guest reach a thread by keyboard, by its chip and by a line's More menu", async ({ page }) => {
    await opened(page, GUEST, { history: BASE, replayed: REPLIES });
    await expect(lines(page)).toHaveCount(4);
    const root = lines(page).first();
    await root.focus();
    expect(await tabsTo(page, chipOf(root), 12)).toBeLessThanOrEqual(12);
    await page.keyboard.press("Enter");
    await expect(closeButton(page)).toBeFocused();
    await page.keyboard.press("Escape");
    const reply = lines(page).nth(2);
    await reply.focus();
    const more = reply.getByRole("toolbar").getByRole("button", { name: "More actions", exact: true });
    expect(await tabsTo(page, more, 12)).toBeLessThanOrEqual(12);
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(inThread(page)).toHaveText(WHOLE);
  });

  // The root left the window: its replies are one thread named by its msgid, no line carrying the chip.
  test("opens a thread whose root the window lacks as an earlier message, and answers it by its msgid", async ({
    page,
  }) => {
    const late = [
      tagged("m2", "late reply", { at: 1, tags: "+reply=old1" }),
      tagged("m3", "second late reply", { at: 2, tags: "+reply=old1", who: OTHER }),
    ];
    const { said } = await open(page, { history: [["m1", T(0), "an old line"]], replayed: late }, 3);
    await expect(chipOf(lines(page))).toHaveCount(0);
    await threadOf(lineOf(page, "late reply").first());
    await expect(panel(page)).toContainText(/earlier message/i);
    await expect(inThread(page)).toHaveText([/late reply/, /second late reply/]);
    await threadField(page).fill("still here");
    await threadField(page).press("Enter");
    await expect(inThread(page)).toHaveCount(3);
    expect(said()).toEqual([`@+reply=old1 PRIVMSG ${ROOM} :still here`]);
  });

  // The window's lines come back from Ergo as they are after a reconnect: a reply said while away is in the thread
  // once, the lines held before it not twice, and the panel never closes.
  test("keeps an open thread through a reconnect, a reply said meanwhile in it once", async ({ page }) => {
    const address = await logIn(page, word("thread"));
    const away = tagged("m5", "said while away", { at: 4, tags: "+reply=m1", who: OTHER });
    const sockets: WebSocketRoute[] = [];
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      sockets.push(ergo);
      scriptedErgo(ergo, address, {
        history: BASE,
        replayed: sockets.length === 1 ? REPLIES.slice(0, 1) : [...REPLIES, away],
      });
    });
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await chipOf(lines(page).first()).click();
    await expect(inThread(page)).toHaveCount(2);
    await sockets[0]?.close();
    await expect(inThread(page)).toHaveText([...WHOLE, /said while away/], { timeout: 15_000 });
    await expect(panel(page)).toBeVisible();
    expect(sockets).toHaveLength(2);
  });

  // The words of the root and of a reply are a sender's (R5): text nodes, never markup they build, and no script runs.
  test("shows a root's and a reply's markup, a script and unsafe links as text, and runs none", async ({ page }) => {
    const text = '<img src=x onerror="window.pwned=1"> <script>window.pwned=1</script> [x](javascript:window.pwned=1)';
    const links = "[d](data:text/html,<script>window.pwned=1</script>) [e](//evil.example/x) @g1notanaddress";
    const root = [["m1", T(0), text]] satisfies HistoryLine[];
    const replies = [
      tagged("m2", `${text} ${links}`, { at: 1, tags: "+reply=m1", who: OTHER }),
      tagged("m3", "an answer", { at: 2, tags: "+reply=m1" }),
    ];
    await asAccount(page, () => ({ history: root, replayed: replies }), 3);
    await chipOf(lines(page).first()).click();
    await expect(panel(page)).toBeVisible();
    await expect(inThread(page)).toHaveCount(3);
    await expect(
      panel(page).locator("img, script, iframe, a[href^='javascript'], a[href^='data'], a[href^='//']"),
    ).toHaveCount(0);
    await expect(panel(page).getByRole("heading", { name: /Thread/ })).toContainText("<img src=x");
    await expect(inThread(page).nth(1)).toContainText("<img src=x");
    expect(await page.evaluate(() => String(Reflect.get(window, "pwned")))).toBe("undefined");
  });

  // R6: the room's list waits on the moderation's verdict before a player; the panel draws none, so a link to an
  // accepted service in a thread reaches no third party, opened or not.
  test("reaches no embed host when a thread with links to accepted services opens", async ({ page }) => {
    const hosts = /youtube|vimeo|giphy/;
    const asked: string[] = [];
    page.on("request", (request) => {
      if (hosts.test(new URL(request.url()).hostname)) asked.push(request.url());
    });
    const link = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const replies = [tagged("m2", `watch ${link}`, { at: 1, tags: "+reply=m1", who: OTHER })];
    await asAccount(page, () => ({ history: [["m1", T(0), `look ${link}`]], replayed: replies }), 2);
    await chipOf(lines(page).first()).click();
    await expect(inThread(page)).toHaveCount(2);
    await expect(panel(page).locator("iframe, img, video, audio")).toHaveCount(0);
    await expect(panel(page)).not.toContainText(/moderation check|Play the/);
    await expect(inThread(page).first().getByRole("link", { name: link })).toBeVisible();
    expect(asked).toEqual([]);
  });

  // 4f's reading place is the room's (R15): opening a thread, scrolling its lines, moves no place.
  test("moves no reading place by opening and reading a thread", async ({ page }) => {
    const address = await logIn(page, word("thread"));
    const heard: string[] = [];
    await opened(page, address, { history: BASE, replayed: REPLIES, read: T(0), heard: (line) => heard.push(line) });
    await expect(lines(page)).toHaveCount(4);
    const before = marks(await sentBefore(page, heard));
    await chipOf(lines(page).first()).click();
    await expect(inThread(page)).toHaveCount(3);
    await inThread(page).last().scrollIntoViewIfNeeded();
    await panel(page).hover();
    // The barrier again: the field going back to done is told behind every line sent before it, on the same socket.
    await field(page).fill("");
    await expect.poll(() => tags(heard).length).toBe(2);
    expect(marks(heard)).toEqual(before);
  });

  // ADR-0001 §12: the panel's code is no part of the first screen: asked at the first thread opened, never before.
  test.describe("code", () => {
    test.use({ serviceWorkers: "block" });
    test("loads the panel's code when a thread is first opened, never before", async ({ page }) => {
      const asked: string[] = [];
      page.on("request", (request) => {
        if (/\/assets\/Thread(Panel|Body)-[\w-]+\.js$/.test(request.url())) asked.push(request.url());
      });
      await open(page);
      await expect(chipOf(lines(page).first())).toBeVisible();
      expect(asked).toEqual([]);
      await chipOf(lines(page).first()).click();
      await expect(panel(page)).toBeVisible();
      // The panel's own code, then the thread's body it draws: both asked at the first thread, none before.
      await expect.poll(() => asked.length).toBe(2);
    });
  });

  test("passes axe with a thread open, on a computer's screen", async ({ page }) => {
    await open(page);
    await chipOf(lines(page).first()).click();
    await expect(panel(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test.describe("on a phone's screen", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    // The room and its composer give the width to the thread, which Close gives back; no sideways scroll.
    test("gives the thread the whole width, the room back on close, passing axe", async ({ page }) => {
      await open(page);
      const form = page.getByRole("form", { name: "Write in #games" });
      // On a phone a line's bar stands in the flow under the line: pointed at first, so the chip is still when pressed.
      await lines(page).first().hover();
      await chipOf(lines(page).first()).click();
      await expect(panel(page)).toBeVisible();
      await expect(lines(page).first()).toBeHidden();
      await expect(form).toBeHidden();
      await expect(inThread(page).first()).toBeVisible();
      await expect(threadField(page)).toBeVisible();
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(wide).toBe(false);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await closeButton(page).click();
      await expect(lines(page).first()).toBeVisible();
      await expect(form).toBeVisible();
      await expect(lines(page).first()).toBeFocused();
    });
  });
});
