import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, scriptsAsked, test, type Page } from "./fixtures.ts";
import { logOutHere } from "./account.ts";
import { inGames, lineOf, whoIsHere, word } from "./chat.ts";
import { logIn } from "./irc.ts";
import { MEMBER, scriptedErgo } from "./scripted.ts";
import type { WebSocketRoute } from "@playwright/test";

// The composer (slice 4's 4c) on the real server and Ergo: an account writes in #games, its line shown once Ergo
// echoes it, its Markdown as marks; a guest is told to log in. Each test logs in a wallet of its own (?as=).

const field = (page: Page) => page.getByRole("textbox", { name: "Message #games" });
const send = (page: Page) => page.getByRole("button", { name: "Send" });
// The field is Lexical's, a contenteditable: its words are its text, a mark typed is drawn as its form (no `**` left to read), and a
// selection is the page's. Fill puts words in as one insertion, so a line with marks to turn into their form is typed (`typed`).
const typed = async (page: Page, words: string) => {
  await field(page).click();
  await field(page).pressSequentially(words);
};
// The characters from `from` to `to` of the field's text, selected as a hand would, across its nodes.
const select = (page: Page, from: number, to: number) =>
  field(page).evaluate(
    (box, [start = 0, end = 0]: number[]) => {
      // The text node holding a character offset, and the offset in it: the first whose span takes it in.
      const at = (offset: number): [Node, number] | undefined => {
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        let seen = 0;
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const size = node.textContent?.length ?? 0;
          if (offset >= seen && offset <= seen + size) return [node, offset - seen];
          seen += size;
        }
        return undefined;
      };
      const range = document.createRange();
      const first = at(start);
      const last = at(end);
      if (first !== undefined) range.setStart(...first);
      if (last !== undefined) range.setEnd(...last);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    [from, to],
  );
// The drafts the page's device holds, by key, sorted.
const draftKeys = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("gnoworld:draft:"))
      .sort(),
  );

// The account menu stands in the full chat's header, over the info column (ChatHeader.tsx).
const logOut = logOutHere;

test.describe("the composer", () => {
  test("sends a line with Enter, shown once Ergo echoes it, its Markdown as marks and its link https", async ({
    page,
  }) => {
    const address = await inGames(page);
    const text = word("hello");
    await typed(page, `${text} **bold** [docs](https://gno.land/docs)`);
    await field(page).press("Enter");
    await expect(lineOf(page, text)).toHaveCount(1);
    await expect(lineOf(page, text).getByTitle(address)).toBeVisible();
    await expect(lineOf(page, text).locator("strong")).toHaveText("bold");
    const docs = lineOf(page, text).getByRole("link", { name: "docs" });
    await expect(docs).toHaveAttribute("href", "https://gno.land/docs");
    await expect(docs).toHaveAttribute("rel", "noopener noreferrer");
    await expect(field(page)).toHaveText("");
  });

  // F2092: the server hides the 21st message of a minute and strikes the account; the page holds it back and says why.
  test("holds the 21st message of a minute back, its draft kept, and says why", async ({ page }) => {
    await inGames(page);
    const text = word("fast");
    for (let each = 0; each < 20; each += 1) {
      await field(page).fill(`${text} ${String(each)}`);
      await field(page).press("Enter");
      await expect(field(page)).toHaveText("");
    }
    await field(page).fill(`${text} 20`);
    await field(page).press("Enter");
    await expect(page.getByText(/Too fast: 20 messages a minute at most\. Try again in \d+ s\./).first()).toBeVisible();
    await expect(field(page)).toHaveText(`${text} 20`);
    await expect(lineOf(page, `${text} 20`)).toHaveCount(0);
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

  test("applies each format of the bar to the selection in place, as its name says", async ({ page }) => {
    await inGames(page);
    for (const [name, drawn] of [
      ["Bold", "strong"],
      ["Italic", "em"],
      ["Strikethrough", "[class*=strike]"],
      ["Code", "code"],
      ["Quote", "blockquote"],
      ["Bulleted list", "ul li"],
      ["Numbered list", "ol li"],
    ] as const) {
      await field(page).fill("make this word");
      await select(page, 10, 14);
      await page.getByRole("group", { name: "Format" }).getByRole("button", { name, exact: true }).click();
      // The mark is drawn as what it means and its characters are not in the field.
      await expect(field(page).locator(drawn)).toBeVisible();
      await expect(field(page)).toHaveText(/^make this word$/);
    }
  });

  test("makes the selection a link from the bar's popover, an https address alone", async ({ page }) => {
    await inGames(page);
    await field(page).fill("make this word");
    await select(page, 10, 14);
    await page.getByRole("group", { name: "Format" }).getByRole("button", { name: "Link" }).click();
    const address = page.getByRole("dialog", { name: "Link" }).getByLabel("Address");
    await address.fill("javascript:alert(1)");
    await address.press("Enter");
    await expect(page.getByText("An address that starts with https://", { exact: true })).toBeVisible();
    await address.fill("https://gno.land/docs");
    await address.press("Enter");
    await expect(field(page).getByRole("link", { name: "word" })).toHaveAttribute("href", "https://gno.land/docs");
    await expect(field(page)).toBeFocused();
  });

  // 8k (frame 73's U): the bar's underline goes to Ergo as `++word++`, comes back to the room and is drawn as <u>, its line
  // the muted grey a step under the words, apart from a link's, which is the words' own colour at the font's place.
  test("underlines a word with the bar's U, sent through Ergo and drawn apart from a link", async ({ page }) => {
    await inGames(page);
    const tag = word("under");
    const bar = page.getByRole("group", { name: "Format" });
    const before = `${tag} make this `;
    await field(page).fill(`${before}word, see gno`);
    await select(page, before.length, before.length + 4);
    await bar.getByRole("button", { name: "Underline", exact: true }).click();
    await expect(field(page).locator("[class*=underline]")).toHaveText("word");
    // An underlined link is still the link it is: the underline in the anchor, its address whole.
    const gno = `${before}word, see gno`.length;
    await select(page, gno - 3, gno);
    await bar.getByRole("button", { name: "Underline", exact: true }).click();
    await bar.getByRole("button", { name: "Link" }).click();
    const address = page.getByRole("dialog", { name: "Link" }).getByLabel("Address");
    await address.fill("https://gno.land");
    await address.press("Enter");
    await field(page).press("End");
    await field(page).pressSequentially(" [docs](https://gno.land/docs)");
    await field(page).press("Enter");
    const line = lineOf(page, tag);
    await expect(line).toHaveCount(1);
    await expect(line.locator("u").first()).toHaveText("word");
    await expect(line.locator("u").first().getByRole("link")).toHaveCount(0);
    await expect(line.getByRole("link", { name: "gno" })).toHaveAttribute("href", "https://gno.land");
    await expect(line.getByRole("link", { name: "gno" }).locator("u")).toHaveText("gno");
    await expect(line.getByRole("link", { name: "docs" })).toHaveAttribute("href", "https://gno.land/docs");
    const look = (selector: string) =>
      line.locator(selector).evaluate((element) => {
        const css = getComputedStyle(element);
        return {
          line: css.textDecorationLine,
          ink: css.textDecorationColor,
          words: css.color,
          offset: css.textUnderlineOffset,
        };
      });
    const [underlined, linked] = [await look("u >> nth=0"), await look('a[href="https://gno.land/docs"]')];
    expect([underlined.line, linked.line]).toEqual(["underline", "underline"]);
    expect(linked.ink).toBe(linked.words);
    expect(underlined.ink).not.toBe(underlined.words);
    expect(underlined.ink).not.toBe(linked.ink);
    expect(underlined.offset).not.toBe(linked.offset);
  });

  test("formats the selection from the format bar, the selection kept: what is typed over it is as bold", async ({
    page,
  }) => {
    await inGames(page);
    await field(page).fill("make this bold");
    await select(page, 10, 14);
    await page.getByRole("group", { name: "Format" }).getByRole("button", { name: "Bold" }).click();
    await expect(field(page).locator("strong")).toHaveText("bold");
    await page.keyboard.type("strong");
    await expect(field(page).locator("strong")).toHaveText("strong");
  });

  test("sends a line of the whole budget, shown once Ergo relays it", async ({ page }) => {
    await inGames(page);
    const tag = word("max");
    const text = `${"a".repeat(419 - tag.length - 1)} ${tag}`;
    await field(page).fill(text);
    await expect(field(page)).toHaveAccessibleDescription("0 bytes left.");
    await field(page).press("Enter");
    await expect(lineOf(page, tag)).toHaveCount(1);
    await expect(field(page)).toHaveText("");
  });

  // A person's completion is the unit tests': who is in #games besides the test's account changes from run to run.
  test("suggests a command and a room as they are typed, and Tab or Enter takes the picked one", async ({ page }) => {
    await inGames(page);
    await field(page).fill("/");
    const list = page.getByRole("listbox", { name: "Suggestions" });
    await expect(list.getByRole("option")).toHaveText([/\/me/, /\/poll/]);
    await field(page).press("Tab");
    await expect(field(page)).toHaveText("/me");
    await expect(field(page)).toBeFocused();
    await expect(list).toHaveCount(0);
    // Nothing to complete: Tab moves on (past Send, off for an empty action).
    await field(page).press("Tab");
    await expect(field(page)).not.toBeFocused();
    await field(page).fill("see #ne");
    await expect(list.getByRole("option")).toHaveText(["#news"]);
    await field(page).press("Escape");
    await expect(list).toHaveCount(0);
    await field(page).press("Backspace");
    await field(page).pressSequentially("e");
    await field(page).press("Enter");
    await expect(field(page)).toHaveText("see #news");
    // Shift+Tab leaves for the format bar; Tab from its last button comes back to the field.
    await field(page).press("Shift+Tab");
    await expect(
      page.getByRole("group", { name: "Format" }).getByRole("button", { name: "Numbered list" }),
    ).toBeFocused();
  });

  // A key pressed before the page has drawn the room the last one went to starts from that room, not the one drawn.
  test("goes two rooms down with Alt+Down pressed twice at once", async ({ page }) => {
    await inGames(page);
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByRole("heading", { level: 2, name: "#news", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/w\/bubble\?room=news&chat=full$/);
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
    await expect(page).toHaveURL(/\/w\/bubble\?room=games&chat=full$/);
    await expect(heading("#games")).toBeVisible();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(heading("#bubble")).toBeVisible();
    await expect(page).toHaveURL(/\/w\/bubble\?chat=full$/);
    await page.keyboard.press("Alt+ArrowDown");
    await expect(heading("#news")).toBeVisible();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page).toHaveURL(/\/w\/bubble\?room=news&chat=full$/);
    await page.keyboard.press("Alt+ArrowUp");
    await expect(heading("#bubble")).toBeVisible();
    await page.keyboard.press("Alt+ArrowUp");
    await expect(heading("#games")).toBeVisible();
  });

  // 4d: drafts kept on the device (ADR-0002's "Saved messages and drafts: Device"; F787).
  test("keeps each room's draft on the device, typed, formatted or completed, through changes of room and a reload, until sent", async ({
    page,
  }) => {
    const address = await inGames(page);
    const games = word("games");
    const bubble = word("bubble");
    await field(page).fill(`${games} bold`);
    await select(page, `${games} `.length, `${games} bold`.length);
    await page.getByRole("group", { name: "Format" }).getByRole("button", { name: "Bold" }).click();
    await page.keyboard.press("Alt+ArrowDown");
    const bubbleField = page.getByRole("textbox", { name: "Message #bubble" });
    await expect(bubbleField).toHaveText("");
    await bubbleField.fill("/m");
    await bubbleField.press("Tab");
    // What Tab completed is kept as it is, before any more is typed.
    await page.keyboard.press("Alt+ArrowUp");
    await expect(field(page)).toHaveText(`${games} bold`);
    await page.keyboard.press("Alt+ArrowDown");
    await expect(bubbleField).toHaveText("/me ");
    await bubbleField.press("End");
    await bubbleField.pressSequentially(bubble);
    await expect(bubbleField).toHaveText(`/me ${bubble}`);
    await page.keyboard.press("Alt+ArrowUp");
    await expect(field(page)).toHaveText(`${games} bold`);
    await page.reload();
    await hydrated(page);
    await expect(field(page)).toHaveText(`${games} bold`);
    await page.keyboard.press("Alt+ArrowDown");
    await expect(bubbleField).toHaveText(`/me ${bubble}`);
    await page.keyboard.press("Alt+ArrowUp");
    // Ergo having said the account is here, as inGames waits: a line sent before it goes nowhere, which the page's
    // few more requests (4d's pins) and a loaded machine made likely.
    await expect(whoIsHere(page).getByTitle(address)).toBeVisible();
    await field(page).press("Enter");
    await expect(lineOf(page, games)).toHaveCount(1);
    await expect.poll(() => draftKeys(page)).toEqual([`gnoworld:draft:${address}:#bubble`]);
    await page.reload();
    await hydrated(page);
    await expect(field(page)).toHaveText("");
    await page.keyboard.press("Alt+ArrowDown");
    await expect(bubbleField).toHaveText(`/me ${bubble}`);
  });

  // A shared device: each account finds its own drafts, the next account none of them, a guest nothing.
  test("shows an account's drafts to it alone: not to the next account, nor to a guest", async ({ page }) => {
    const alice = word("alice");
    const kept = [`gnoworld:draft:${await logIn(page, alice)}:#bubble/games`];
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    const draft = word("draft");
    await field(page).fill(draft);
    await logOut(page);
    // A guest writes one plain line (D430), in a textarea: the account's field is gone, and its draft with it.
    await expect(page.locator("textarea")).toHaveValue("");
    await expect(page.getByRole("textbox").and(page.locator("[contenteditable]"))).toHaveCount(0);
    expect(await draftKeys(page)).toEqual(kept);
    await logIn(page, word("bob"));
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(field(page)).toHaveText("");
    expect(await draftKeys(page)).toEqual(kept);
    await logOut(page);
    await logIn(page, alice);
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(field(page)).toHaveText(draft);
  });

  test("says why a line cannot go, and sends nothing", async ({ page }) => {
    await inGames(page);
    await field(page).fill("/nick bob");
    await expect(field(page)).toHaveAccessibleDescription("/nick is not a command. /me sends an action.");
    await expect(send(page)).toBeDisabled();
    await field(page).press("Enter");
    await expect(field(page)).toHaveAccessibleDescription("/nick is not a command. /me sends an action.");
    // An account's line holds 442 bytes: Ergo relays it under its 40-character nick, user and cloak (68 bytes).
    await field(page).fill("a".repeat(420));
    await expect(field(page)).toHaveAccessibleDescription("Too long by 1 byte.");
    await expect(send(page)).toBeDisabled();
    await field(page).press("Enter");
    await expect(lineOf(page, "a".repeat(420))).toHaveCount(0);
    // Enter sent nothing and says nothing more: the reason stays the cap's, not a "Not sent" of the link's (G9).
    await expect(field(page)).toHaveAccessibleDescription("Too long by 1 byte.");
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

  test("gives a guest a plain line to write, with no format bar, its page never asking the composer's code", async ({
    page,
  }) => {
    const scripts = scriptsAsked(page);
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(page.getByRole("textbox", { name: "Message #games" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Format" })).toHaveCount(0);
    expect(scripts.filter((url) => /\/ChatPanel-[\w-]+\.js$/.test(url))).toHaveLength(1);
    expect(scripts.filter((url) => /\/Composer-[\w-]+\.js$/.test(url))).toEqual([]);
  });

  test("has no accessibility violation with the composer, its field holding a link, and its hint", async ({ page }) => {
    await inGames(page);
    await typed(page, "**see** [docs](https://gno.land/docs)");
    await expect(field(page).getByRole("link", { name: "docs" })).toBeVisible();
    expect((await new AxeBuilder({ page }).include("form").analyze()).violations).toEqual([]);
    await field(page).fill("a".repeat(376));
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
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(whoIsHere(page)).toContainText("2 here");
    await sockets[0]?.close();
    await field(page).fill("are you there?");
    await field(page).press("Enter");
    await expect(field(page)).toHaveAccessibleDescription(
      "Not sent: the chat is not ready yet. Try again in a moment.",
    );
    await expect(field(page)).toHaveText("are you there?");
    await field(page).press("End");
    await field(page).press("!");
    await expect(field(page)).not.toHaveAccessibleDescription(/Not sent/);
    // A line not sent stays the room's draft, on the device.
    await page.reload();
    await hydrated(page);
    await expect(field(page)).toHaveText("are you there?!");
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
    await page.goto("/w/bubble?room=games&chat=full");
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
    await field(page).press("Enter");
    await expect(lineOf(page, line)).toHaveCount(1);
    await expect(field(page)).toHaveText("");
    await field(page).fill("kept nowhere");
    await page.reload();
    await hydrated(page);
    await expect(field(page)).toHaveText("");
  });
});
