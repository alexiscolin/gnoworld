import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { inGames, lineOf, roomsNav, whoIsHere, word } from "./chat.ts";
import { logIn } from "./irc.ts";
import { MEMBER, scriptedErgo } from "./scripted.ts";
import type { WebSocketRoute } from "@playwright/test";

// The composer (slice 4's 4c) on the real server and Ergo: an account writes in #games, its line shown once Ergo
// echoes it, its Markdown as marks; a guest is told to log in. Each test logs in a wallet of its own (?as=).

const field = (page: Page) => page.getByRole("textbox", { name: "Message #games" });
const send = (page: Page) => page.getByRole("button", { name: "Send" });
// The drafts the page's device holds, by key, sorted.
const draftKeys = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("gnoworld:draft:"))
      .sort(),
  );

test.describe("the composer", () => {
  test("sends a line with Enter, shown once Ergo echoes it, its Markdown as marks and its link https", async ({
    page,
  }) => {
    const address = await inGames(page);
    const text = word("hello");
    await field(page).fill(`${text} **bold** [docs](https://gno.land/docs)`);
    await field(page).press("Enter");
    await expect(lineOf(page, text)).toHaveCount(1);
    await expect(lineOf(page, text).getByTitle(address)).toBeVisible();
    await expect(lineOf(page, text).locator("strong")).toHaveText("bold");
    const docs = lineOf(page, text).getByRole("link", { name: "docs" });
    await expect(docs).toHaveAttribute("href", "https://gno.land/docs");
    await expect(docs).toHaveAttribute("rel", "noopener noreferrer");
    await expect(field(page)).toHaveValue("");
  });

  test("sends an action with /me, and a slash of text with //", async ({ page }) => {
    await inGames(page);
    const action = word("waves");
    await field(page).fill(`/me ${action}`);
    await send(page).click();
    await expect(lineOf(page, action)).toContainText(`* `);
    await expect(lineOf(page, action)).not.toContainText("ACTION");
    const slash = word("shrug");
    await field(page).fill(`//${slash}`);
    await field(page).press("Enter");
    await expect(lineOf(page, slash)).toContainText(new RegExp(`(^|[^/])/${slash}`));
    await expect(lineOf(page, slash)).not.toContainText(`//${slash}`);
  });

  test("applies each format of the bar to the selection, as its name says", async ({ page }) => {
    await inGames(page);
    for (const [name, result] of [
      ["Bold", "make this **word**"],
      ["Italic", "make this *word*"],
      ["Strikethrough", "make this ~~word~~"],
      ["Code", "make this `word`"],
      ["Link", "make this [word](https://)"],
      ["Quote", "> make this word"],
      ["Bulleted list", "- make this word"],
      ["Numbered list", "1. make this word"],
    ] as const) {
      await field(page).fill("make this word");
      await field(page).evaluate((box: HTMLInputElement) => {
        box.setSelectionRange(10, 14);
      });
      await page.getByRole("group", { name: "Format" }).getByRole("button", { name, exact: true }).click();
      await expect(field(page)).toHaveValue(result);
    }
  });

  test("wraps the selection in a mark from the format bar, the selection kept", async ({ page }) => {
    await inGames(page);
    await field(page).fill("make this bold");
    await field(page).evaluate((box: HTMLInputElement) => {
      box.setSelectionRange(10, 14);
    });
    await page.getByRole("group", { name: "Format" }).getByRole("button", { name: "Bold" }).click();
    await expect(field(page)).toHaveValue("make this **bold**");
    await page.keyboard.type("strong");
    await expect(field(page)).toHaveValue("make this **strong**");
  });

  test("sends a line of the whole budget, shown once Ergo relays it", async ({ page }) => {
    await inGames(page);
    const tag = word("max");
    const text = `${"a".repeat(419 - tag.length - 1)} ${tag}`;
    await field(page).fill(text);
    await expect(field(page)).toHaveAccessibleDescription("0 bytes left.");
    await field(page).press("Enter");
    await expect(lineOf(page, tag)).toHaveCount(1);
    await expect(field(page)).toHaveValue("");
  });

  // A person's completion is the unit tests': who is in #games besides the test's account changes from run to run.
  test("completes a command and a room with Tab, from the field alone and at the draft's end", async ({ page }) => {
    await inGames(page);
    await field(page).fill("/");
    await expect(field(page)).toHaveAccessibleDescription("Tab completes /me.");
    await field(page).press("Tab");
    await expect(field(page)).toHaveValue("/me ");
    await expect(field(page)).toBeFocused();
    expect(await field(page).evaluate((box: HTMLInputElement) => [box.selectionStart, box.selectionEnd])).toEqual([
      4, 4,
    ]);
    // Nothing to complete: Tab moves on (past Send, off for an empty action).
    await field(page).press("Tab");
    await expect(field(page)).not.toBeFocused();
    await expect(field(page)).toHaveValue("/me ");
    await field(page).fill("see #ne");
    await expect(field(page)).toHaveAccessibleDescription("Tab completes #news.");
    // The caret elsewhere than the end: Tab moves on, the draft as it was; and Tab on Send completes nothing.
    await field(page).press("Home");
    await field(page).press("Tab");
    await expect(send(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(field(page)).toHaveValue("see #ne");
    // Shift+Tab leaves for the format bar; Tab from its last button comes back to the field, completing nothing.
    await field(page).press("End");
    await field(page).press("Shift+Tab");
    await expect(
      page.getByRole("group", { name: "Format" }).getByRole("button", { name: "Numbered list" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue("see #ne");
    // Come back by Tab, the box's text is selected: the caret at its end again, Tab completes.
    await field(page).press("End");
    await field(page).press("Tab");
    await expect(field(page)).toHaveValue("see #news ");
    await expect(field(page)).not.toHaveAccessibleDescription(/Tab completes/);
  });

  // A key pressed before the page has drawn the room the last one went to starts from that room, not the one drawn.
  test("goes two rooms down with Alt+Down pressed twice at once", async ({ page }) => {
    await inGames(page);
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByRole("heading", { level: 2, name: "#news", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/w\/bubble\?room=news$/);
  });

  test("goes from room to room with Alt+Down and Alt+Up alone, across sections, the ends stopping it", async ({
    page,
  }) => {
    await inGames(page);
    const heading = (name: string) => page.getByRole("heading", { level: 2, name, exact: true });
    await field(page).press("ArrowDown");
    for (const keys of [
      "ArrowDown",
      "Shift+Alt+ArrowDown",
      "Control+Alt+ArrowDown",
      "Meta+Alt+ArrowDown",
      "Alt+ArrowUp",
    ]) {
      await page.keyboard.press(keys);
    }
    await expect(page).toHaveURL(/\/w\/bubble\?room=games$/);
    await expect(heading("#games")).toBeVisible();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(heading("#bubble")).toBeVisible();
    await expect(page).toHaveURL(/\/w\/bubble$/);
    await page.keyboard.press("Alt+ArrowDown");
    await expect(heading("#news")).toBeVisible();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page).toHaveURL(/\/w\/bubble\?room=news$/);
    await page.keyboard.press("Alt+ArrowUp");
    await expect(heading("#bubble")).toBeVisible();
    await page.keyboard.press("Alt+ArrowUp");
    await expect(heading("#games")).toBeVisible();
    await page.getByRole("link", { name: "gno.world" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page).toHaveURL(/\/$/);
  });

  // 4d: drafts kept on the device (ADR-0002's "Saved messages and drafts: Device"; F787).
  test("keeps each room's draft on the device, typed, formatted or completed, through changes of room and a reload, until sent", async ({
    page,
  }) => {
    const address = await inGames(page);
    const games = word("games");
    const bubble = word("bubble");
    await field(page).fill(`${games} bold`);
    await field(page).evaluate((box: HTMLInputElement) => {
      box.setSelectionRange(box.value.length - 4, box.value.length);
    });
    await page.getByRole("group", { name: "Format" }).getByRole("button", { name: "Bold" }).click();
    await page.keyboard.press("Alt+ArrowDown");
    const bubbleField = page.getByRole("textbox", { name: "Message #bubble" });
    await expect(bubbleField).toHaveValue("");
    await bubbleField.fill("/m");
    await bubbleField.press("Tab");
    // What Tab completed is kept as it is, before any more is typed.
    await page.keyboard.press("Alt+ArrowUp");
    await expect(field(page)).toHaveValue(`${games} **bold**`);
    await page.keyboard.press("Alt+ArrowDown");
    await expect(bubbleField).toHaveValue("/me ");
    await bubbleField.press("End");
    await bubbleField.pressSequentially(bubble);
    await expect(bubbleField).toHaveValue(`/me ${bubble}`);
    await roomsNav(page).getByRole("link", { name: "#games" }).click();
    await expect(field(page)).toHaveValue(`${games} **bold**`);
    await page.reload();
    await hydrated(page);
    await expect(field(page)).toHaveValue(`${games} **bold**`);
    await roomsNav(page).getByRole("link", { name: "#bubble" }).click();
    await expect(bubbleField).toHaveValue(`/me ${bubble}`);
    await page.keyboard.press("Alt+ArrowUp");
    await field(page).press("Enter");
    await expect(lineOf(page, games)).toHaveCount(1);
    await expect.poll(() => draftKeys(page)).toEqual([`gnoworld:draft:${address}:#bubble`]);
    await page.reload();
    await hydrated(page);
    await expect(field(page)).toHaveValue("");
    await roomsNav(page).getByRole("link", { name: "#bubble" }).click();
    await expect(bubbleField).toHaveValue(`/me ${bubble}`);
  });

  // A shared device: each account finds its own drafts, the next account none of them, a guest nothing.
  test("shows an account's drafts to it alone: not to the next account, nor to a guest", async ({ page }) => {
    const alice = word("alice");
    const kept = [`gnoworld:draft:${await logIn(page, alice)}:#bubble/games`];
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    const draft = word("draft");
    await field(page).fill(draft);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByText("Log in to write in this room.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Message/ })).toHaveCount(0);
    expect(await draftKeys(page)).toEqual(kept);
    await logIn(page, word("bob"));
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(field(page)).toHaveValue("");
    expect(await draftKeys(page)).toEqual(kept);
    await page.getByRole("button", { name: "Log out" }).click();
    await logIn(page, alice);
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(field(page)).toHaveValue(draft);
  });

  test("says why a line cannot go, and sends nothing", async ({ page }) => {
    await inGames(page);
    await field(page).fill("/nick bob");
    await expect(field(page)).toHaveAccessibleDescription("/nick is not a command. /me sends an action.");
    await expect(send(page)).toBeDisabled();
    // An account's line holds 442 bytes: Ergo relays it under its 40-character nick, user and cloak (68 bytes).
    await field(page).fill("a".repeat(420));
    await expect(field(page)).toHaveAccessibleDescription("Too long by 1 byte.");
    await expect(send(page)).toBeDisabled();
    await field(page).press("Enter");
    await expect(lineOf(page, "a".repeat(420))).toHaveCount(0);
  });

  test("shows a hostile line it sends as text: no markup, no script run", async ({ page }) => {
    await inGames(page);
    const text = `<script>window.__xss=1</script> <img src=x onerror="window.__xss=1"> [x](javascript:window.__xss=1) ${word("hostile")}`;
    await field(page).fill(text);
    await field(page).press("Enter");
    await expect(lineOf(page, text)).toHaveCount(1);
    await expect(lineOf(page, text).locator("a, script, img")).toHaveCount(0);
    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  });

  // 4c's security review (F786): a right-to-left override before a bare link would draw its address backwards,
  // evil.example's reading as another's; the link isolates itself, left to right.
  test("draws a link's address left to right, an override before it notwithstanding", async ({ page }) => {
    await inGames(page);
    const tag = word("bidi");
    await field(page).fill(`\u202E ${tag} https://evil.example/moc.elgoog//:sptth`);
    await field(page).press("Enter");
    const address = lineOf(page, tag).getByRole("link");
    await expect(address).toHaveAttribute("href", "https://evil.example/moc.elgoog//:sptth");
    const [first, last] = await address.evaluate((link) => {
      const text = link.firstChild;
      const at = (offset: number) => {
        const range = document.createRange();
        range.setStart(text ?? link, offset);
        range.setEnd(text ?? link, offset + 1);
        return range.getBoundingClientRect().x;
      };
      return [at(0), at((text?.textContent ?? "").length - 1)];
    });
    expect(first).toBeLessThan(last);
  });

  test("tells a guest to log in to write, with no field, its page never asking the composer's code", async ({
    page,
  }) => {
    const scripts: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(request.url());
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(page.getByText("Log in to write in this room.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Message/ })).toHaveCount(0);
    expect(scripts.filter((url) => /\/ChatPanel-[\w-]+\.js$/.test(url))).toHaveLength(1);
    expect(scripts.filter((url) => /\/Composer-[\w-]+\.js$/.test(url))).toEqual([]);
  });

  test("has no accessibility violation with the composer, its preview holding a link, and its hint", async ({
    page,
  }) => {
    await inGames(page);
    await field(page).fill("**see** [docs](https://gno.land/docs)");
    await expect(page.getByRole("form", { name: "Write in #games" }).getByText("docs", { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).include("form").analyze()).violations).toEqual([]);
    await field(page).fill(`**${"a".repeat(376)}**`);
    await expect(field(page)).toHaveAccessibleDescription(/bytes left/);
    expect((await new AxeBuilder({ page }).include("form").analyze()).violations).toEqual([]);
  });

  // Ergo scripted (scripted.ts): its first socket answers, then closes; the next ones never answer.
  test("says a line was not sent while the chat is away, and keeps it", async ({ page }) => {
    const address = await logIn(page, word("as"));
    const sockets: { close: () => Promise<void> }[] = [];
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      if (sockets.length === 0) scriptedErgo(ergo, address);
      sockets.push(ergo);
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(whoIsHere(page)).toContainText("2 here");
    await sockets[0]?.close();
    await field(page).fill("are you there?");
    await field(page).press("Enter");
    await expect(field(page)).toHaveAccessibleDescription(
      "Not sent: the chat is not in this room yet. Try again in a moment.",
    );
    await expect(field(page)).toHaveValue("are you there?");
    await field(page).press("End");
    await field(page).press("!");
    await expect(field(page)).not.toHaveAccessibleDescription(/Not sent/);
    // A line not sent stays the room's draft, on the device.
    await page.reload();
    await hydrated(page);
    await expect(field(page)).toHaveValue("are you there?!");
  });

  // A draft is written as it changes, never as the room changes around it: lines arriving write nothing, so an idle
  // tab never puts its old draft over another tab's newer one.
  test("writes a draft as it is typed, and not again as lines arrive", async ({ page }) => {
    const address = await logIn(page, word("as"));
    let ergo: WebSocketRoute | undefined;
    await page.routeWebSocket(/\/ws$/, (socket) => {
      scriptedErgo(socket, address);
      ergo = socket;
    });
    // The page's storage, each write of a draft counted on the document.
    await page.addInitScript(() => {
      const device = window.localStorage;
      let writes = 0;
      const wrote = () => {
        writes += 1;
        document.documentElement.dataset["draftWrites"] = String(writes);
      };
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: () => ({
          getItem: (key: string) => device.getItem(key),
          setItem: (key: string, value: string) => {
            wrote();
            device.setItem(key, value);
          },
          removeItem: (key: string) => {
            wrote();
            device.removeItem(key);
          },
        }),
      });
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(whoIsHere(page)).toContainText("2 here");
    await field(page).fill("half a thought");
    const writes = page.locator("html");
    await expect(writes).toHaveAttribute("data-draft-writes", /^\d+$/);
    const before = Number(await writes.getAttribute("data-draft-writes"));
    for (const [id, text] of [
      ["n1", "one"],
      ["n2", "two"],
    ] as const) {
      ergo?.send(
        `@msgid=${id};time=2026-10-25T10:05:00.000Z;account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :${text}`,
      );
      await expect(lineOf(page, text)).toHaveCount(1);
    }
    // A key typed after them: what they wrote, if anything, is written by then.
    await field(page).press("End");
    await field(page).press("!");
    await expect(writes).toHaveAttribute("data-draft-writes", String(before + 1));
  });

  // A device whose storage is blocked: the composer writes and sends all the same, keeping no draft and saying nothing.
  test("writes and sends with the device's storage blocked, keeping no draft", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: () => {
          throw new DOMException("The storage is blocked.", "SecurityError");
        },
      });
    });
    await inGames(page);
    const line = word("blocked");
    await field(page).fill(line);
    await expect(field(page)).not.toHaveAccessibleDescription(/\S/);
    await field(page).press("Enter");
    await expect(lineOf(page, line)).toHaveCount(1);
    await expect(field(page)).toHaveValue("");
    await field(page).fill("kept nowhere");
    await page.reload();
    await hydrated(page);
    await expect(field(page)).toHaveValue("");
  });
});
