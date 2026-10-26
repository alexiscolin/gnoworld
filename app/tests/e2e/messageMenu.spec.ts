import AxeBuilder from "@axe-core/playwright";
import type { Locator, WebSocketRoute } from "@playwright/test";
import { inGames, lineOf, lines, roomsNav, whoIsHere, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { MEMBER, scriptedErgo, type HistoryLine, type Scripted } from "./scripted.ts";

// 4c's message menu (docs/decisions.md, 2026-10-26): a line's bar and its More menu, the Messages list one tab stop
// whose lines the arrows move among. A scripted Ergo (scripted.ts), as a guest or as the test's account; a real Ergo
// for the delete that reaches every reader.
const GUEST = "guest-zzzzzz";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const HISTORY: readonly HistoryLine[] = [
  ["m1", T(0), "the first line"],
  ["m2", T(1), "the second **line**"],
  ["m3", T(2), "the third line"],
];
// Sixty lines, more than the list shows at once.
const SIXTY = Array.from({ length: 60 }, (_, n): HistoryLine => [`h${String(n)}`, T(n % 60), `Line ${String(n)}`]);

// #games opened on a scripted Ergo, as `me`, with `history`; the socket, to say a live line on it.
async function room(
  page: Page,
  { me = GUEST, history = HISTORY, ...options }: Scripted & { me?: string } = {},
): Promise<() => WebSocketRoute> {
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    socket = ergo;
    scriptedErgo(ergo, me, { history, ...options });
  });
  await page.goto(`/w/bubble${options.room === "#bubble" ? "" : "?room=games"}`);
  await hydrated(page);
  await expect(lines(page)).toHaveCount(history.length);
  return () => {
    if (socket === undefined) throw new Error("the page opened no socket");
    return socket;
  };
}
const bars = (page: Page) => page.getByRole("toolbar", { name: "Message actions" });
const barOf = (page: Page, at: number) => lines(page).nth(at).getByRole("toolbar", { name: "Message actions" });
const moreOf = (page: Page, at: number) => barOf(page, at).getByRole("button", { name: "More" });
const focusedLines = (page: Page) => lines(page).and(page.locator(":focus"));
const stops = (page: Page) => lines(page).and(page.locator("[tabindex='0']"));
// The flash's words, in its pill: the pill sits in the top layer, its region holding no box of its own.
const flash = (page: Page, text: string) => page.getByRole("status").getByText(text, { exact: true });
// The pointer on the `at`th line, its More menu opened and `item` chosen.
async function choose(page: Page, at: number, item: string) {
  await lines(page).nth(at).hover();
  await moreOf(page, at).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test.describe("a line's actions", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("reach the newest line by Tab, the others by the arrows, round the ends, Home and End", async ({ page }) => {
    await room(page);
    await roomsNav(page).getByRole("link").last().focus();
    await page.keyboard.press("Tab");
    await expect(lines(page).nth(2)).toBeFocused();
    await expect(focusedLines(page)).toHaveCount(1);
    await expect(barOf(page, 2)).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await expect(lines(page).nth(1)).toBeFocused();
    await expect(barOf(page, 1)).toBeVisible();
    await expect(bars(page)).toHaveCount(1);
    await page.keyboard.press("Home");
    await expect(lines(page).nth(0)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(lines(page).nth(2)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(lines(page).nth(0)).toBeFocused();
    await page.keyboard.press("End");
    await expect(lines(page).nth(2)).toBeFocused();
  });

  test("keep the line last focused as the one tab stop; Tab enters its bar, then leaves the list; Shift+Tab comes back", async ({
    page,
  }) => {
    await room(page);
    await lines(page).nth(2).focus();
    await page.keyboard.press("ArrowUp");
    await expect(stops(page)).toHaveCount(1);
    await expect(lines(page).nth(1)).toHaveAttribute("tabindex", "0");
    await page.keyboard.press("Tab");
    await expect(moreOf(page, 1)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(focusedLines(page)).toHaveCount(0);
    await expect(page.locator("[role='toolbar']:focus-within")).toHaveCount(0);
    // Nothing after the list takes the focus for a guest: Shift+Tab comes back to the line, or to its bar.
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("ol > li")?.textContent)).toContain("the second");
  });

  // The red pass (M12): the keys of the bar and of its menu stay theirs.
  test("leave the arrows to the bar's button and to its open menu: the line keeps its place", async ({ page }) => {
    await room(page);
    await lines(page).nth(1).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowUp");
    await expect(moreOf(page, 1)).toBeFocused();
    await page.keyboard.press("Enter");
    const items = page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem");
    await expect(items.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
    await expect(lines(page).nth(1)).toHaveAttribute("tabindex", "0");
  });

  test("open the More menu from the keyboard: Copy text and Copy room link for a guest, Esc back to More", async ({
    page,
  }) => {
    await room(page);
    await lines(page).nth(1).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Message actions" });
    await expect(menu.getByRole("menuitem")).toHaveText(["Copy text", "Copy room link"]);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(moreOf(page, 1)).toBeFocused();
  });

  test("show a line's bar while the pointer is on it, and no other line's", async ({ page }) => {
    await room(page);
    await lineOf(page, "the first line").hover();
    await expect(bars(page)).toHaveCount(1);
    await expect(barOf(page, 0)).toBeVisible();
    await lineOf(page, "the third line").hover();
    await expect(bars(page)).toHaveCount(1);
    await expect(barOf(page, 2)).toBeVisible();
  });

  // A line that is a list holds list items of its own: the pointer on one is on its line (F814's class).
  test("show the bar of a line that is a list while the pointer is on its own items", async ({ page }) => {
    await room(page, {
      history: [
        ["l1", T(0), "1. bring a putter"],
        ["l2", T(1), "the second line"],
      ],
    });
    await lineOf(page, "bring a putter").locator("ol > li").first().hover();
    await expect(bars(page)).toHaveCount(1);
    await expect(barOf(page, 0)).toBeVisible();
  });

  // The red pass (M4): the pointer resting on one line, the keyboard on another; each has its bar.
  test("let the keyboard reach its line's bar while the pointer rests on another, and keep a bar whose menu is open", async ({
    page,
  }) => {
    await room(page);
    await lineOf(page, "the first line").hover();
    await lines(page).nth(2).focus();
    await expect(barOf(page, 0)).toBeVisible();
    await expect(barOf(page, 2)).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(moreOf(page, 2)).toBeFocused();
    await page.keyboard.press("Enter");
    await page.mouse.move(0, 0);
    await expect(page.getByRole("menu", { name: "Message actions" })).toBeVisible();
    await expect(barOf(page, 2)).toBeVisible();
  });

  test("copy a line's text as written, and the room's link, each said done", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await room(page);
    await choose(page, 1, "Copy text");
    await expect(flash(page, "Text copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("the second **line**");
    await choose(page, 1, "Copy room link");
    await expect(flash(page, "Link copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      new URL("/w/bubble?room=games", page.url()).href,
    );
  });

  // The red pass (M7): the link is the room shown, not the address asked, which may name no room.
  test("copy the link of the room shown, the main room's when the address named none", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      scriptedErgo(ergo, GUEST, { history: HISTORY, room: "#bubble" });
    });
    await page.goto("/w/bubble?room=nope&x=1#h");
    await hydrated(page);
    await choose(page, 0, "Copy room link");
    await expect(flash(page, "Link copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL("/w/bubble", page.url()).href);
  });

  // The red pass (M6): a page with no clipboard (a plain http origin, a browser that refuses) says so.
  test("say a copy failed when the page has no clipboard", async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(Navigator.prototype, "clipboard");
    });
    await room(page);
    await choose(page, 1, "Copy text");
    await expect(flash(page, "Could not copy.")).toBeVisible();
    await expect(flash(page, "Text copied.")).toHaveCount(0);
  });

  // The red pass (M11): a window that scrolls keeps the focused line and its bar in sight.
  test("keep the focused line and its bar inside a list that scrolls, and pass axe", async ({ page }) => {
    await room(page, { history: SIXTY });
    const list = page.getByRole("list", { name: "Messages" });
    await lines(page).last().focus();
    await page.keyboard.press("Home");
    await expect(lines(page).first()).toBeFocused();
    await expect(lines(page).first()).toBeInViewport();
    const inside = async (at: number) => {
      const [outer, bar] = [await list.boundingBox(), await barOf(page, at).boundingBox()];
      if (outer === null || bar === null) throw new Error("no box");
      return bar.y >= outer.y && bar.y + bar.height <= outer.y + outer.height;
    };
    expect(await inside(0)).toBe(true);
    await page.keyboard.press("End");
    await expect(lines(page).last()).toBeInViewport();
    expect(await inside(59)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("pass axe with a line's bar and its menu open", async ({ page }) => {
    await room(page);
    await lines(page).nth(1).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  // The red pass (M3): the tab stop never leaves the list while it holds a line.
  test("keep its tab stop on its line as a live line comes, and one stop after a room switch", async ({ page }) => {
    const ergo = await room(page);
    await lines(page).nth(1).focus();
    ergo().send(`@msgid=live;time=${T(30)};account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :A live line`);
    await expect(lines(page)).toHaveCount(4);
    await expect(lines(page).nth(1)).toBeFocused();
    await expect(stops(page)).toHaveCount(1);
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Alt+ArrowUp");
    await expect(lineOf(page, "the first line")).toBeVisible();
    await expect(stops(page)).toHaveCount(1);
  });

  // /code-review: the list stays where the reader left it as lines come, whichever line holds the focus.
  test("keep the list where the reader left it as a line comes while a line holds the focus", async ({ page }) => {
    const ergo = await room(page, { history: SIXTY });
    await lines(page).first().focus();
    await expect(lines(page).first()).toBeInViewport();
    await page.getByRole("list", { name: "Messages" }).evaluate((list) => {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event("scroll"));
    });
    ergo().send(`@msgid=live;time=${T(59)};account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :A live line`);
    await expect(lineOf(page, "A live line")).toBeInViewport();
    await expect(lines(page).first()).not.toBeInViewport();
  });

  // A bar rises above its line, as the prototype's: the focus coming to the newest or the oldest line scrolls nothing,
  // and the line under a resting pointer stays the one pointed at.
  test("scroll nothing as the focus comes to the newest line or the oldest: their bars stay inside the list", async ({
    page,
  }) => {
    await room(page);
    const overflow = () =>
      page
        .getByRole("list", { name: "Messages" })
        .evaluate((list) => [list.scrollTop, list.scrollHeight - list.clientHeight]);
    for (const at of [2, 0]) {
      await lines(page).nth(at).focus();
      await expect(barOf(page, at)).toBeVisible();
      expect(await overflow()).toEqual([0, 0]);
    }
  });

  // /code-review: a click outside the list ends a line's focus, and its bar goes with it.
  test("hide a line's bar once a click lands outside the list", async ({ page }) => {
    await room(page);
    await lines(page).nth(1).click();
    await expect(barOf(page, 1)).toBeVisible();
    await page.getByRole("heading", { name: "#games" }).click();
    await expect(bars(page).filter({ visible: true })).toHaveCount(0);
  });

  // /code-review: a copy is said though a refused delete was on show, and a room's flash stays in its room.
  test("say a copy after a refused delete, and leave a room's flash behind when the room changes", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await room(page);
    await choose(page, 1, "Copy text");
    await expect(flash(page, "Text copied.")).toBeVisible();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(flash(page, "Text copied.")).toHaveCount(0);
  });

  test("look as the prototype's bar on a computer's screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await room(page);
    await lineOf(page, "the second").hover();
    await expect(bars(page)).toBeVisible();
    await expect(page.getByRole("list", { name: "Messages" })).toHaveScreenshot("message-actions-computer.png");
  });
});

// Delete, on the account's own line alone: asked first, then Ergo's REDACT; the keyboard all the way.
test.describe("deleting a line", () => {
  // The test's account on a scripted Ergo, its own line among another's.
  async function mine(page: Page, options: Scripted = {}): Promise<{ address: string; sent: string[] }> {
    const address = await logIn(page, word("menu"));
    const sent: string[] = [];
    await room(page, {
      ...options,
      me: address,
      history: [
        ["o1", T(0), "another's line"],
        ["o2", T(1), "my own line", address],
        ["o3", T(2), "the newest line"],
      ],
      heard: (line) => sent.push(line),
    });
    return { address, sent };
  }
  const deleteFrom = async (page: Page, at: number) => {
    await lines(page).nth(at).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Copy text" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
    await page.keyboard.press("Enter");
    return page.getByRole("dialog", { name: "Delete this message?" });
  };
  // The second line's delete asked and refused, by the page or by Ergo: said, the line kept.
  const refused = async (page: Page) => {
    const dialog = await deleteFrom(page, 1);
    await dialog.getByRole("button", { name: "Delete" }).press("Enter");
    await expect(flash(page, "Could not delete the message.")).toBeVisible();
    await expect(lineOf(page, "my own line")).toHaveCount(1);
  };
  // The second line kept as its dialog closes: nothing sent, More holding the focus again.
  const kept = async (page: Page, dialog: Locator, sent: readonly string[]) => {
    await expect(dialog).toBeHidden();
    await expect(moreOf(page, 1)).toBeFocused();
    await expect(lineOf(page, "my own line")).toHaveCount(1);
    expect(sent.filter((line) => line.startsWith("REDACT "))).toEqual([]);
  };

  // The red pass (M2): another's line offers no Delete, through the page as wired.
  test("offers Delete on the account's own line, never on another's", async ({ page }) => {
    await mine(page);
    await lineOf(page, "another's line").hover();
    await moreOf(page, 0).click();
    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["Copy text", "Copy room link"]);
    await page.keyboard.press("Escape");
    await lineOf(page, "my own line").hover();
    await moreOf(page, 1).click();
    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["Copy text", "Copy room link", "Delete"]);
  });

  // The red pass (M8): Esc keeps the line and gives the focus back to More.
  test("keeps the line when the dialog is closed, the focus back on More", async ({ page }) => {
    const { sent } = await mine(page);
    const dialog = await deleteFrom(page, 1);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await kept(page, dialog, sent);
  });

  // The green pass (G1): the dialog's other ways to keep the line, each a path of its own.
  const KEEPS: [string, (dialog: Locator) => Promise<void>][] = [
    ["a click on Keep it", (dialog) => dialog.getByRole("button", { name: "Keep it" }).click()],
    ["Enter on Keep it", (dialog) => dialog.getByRole("button", { name: "Keep it" }).press("Enter")],
    ["a click on Close", (dialog) => dialog.getByRole("button", { name: "Close" }).click()],
  ];
  for (const [how, keep] of KEEPS) {
    test(`keeps the line on ${how}, sending nothing, the focus back on More`, async ({ page }) => {
      const { sent } = await mine(page);
      const dialog = await deleteFrom(page, 1);
      await keep(dialog);
      await kept(page, dialog, sent);
    });
  }

  test("sends Ergo's REDACT for that line alone once asked; the line goes, the focus on its neighbour", async ({
    page,
  }) => {
    const { sent } = await mine(page);
    const dialog = await deleteFrom(page, 1);
    await dialog.getByRole("button", { name: "Delete" }).press("Enter");
    await expect(lineOf(page, "my own line")).toHaveCount(0);
    expect(sent.filter((line) => line.startsWith("REDACT "))).toEqual(["REDACT #bubble/games o2"]);
    await expect(focusedLines(page)).toHaveCount(1);
    await expect(stops(page)).toHaveCount(1);
  });

  // /code-review: a delete that cannot go out (a msgid no command carries) is said, the line and the focus kept.
  test("says a delete that cannot go out, the line kept and the focus back on More", async ({ page }) => {
    const address = await logIn(page, word("menu"));
    const long = "x".repeat(70);
    await room(page, {
      me: address,
      history: [
        ["o1", T(0), "another's line"],
        [long, T(1), "my own line", address],
      ],
    });
    await refused(page);
    await expect(moreOf(page, 1)).toBeFocused();
  });

  // /code-review: a copy after Ergo's refusal is said, the refusal dismissed.
  test("says a copy made while Ergo's refusal is on show", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mine(page, { refuseRedact: true });
    await refused(page);
    await choose(page, 0, "Copy text");
    await expect(flash(page, "Text copied.")).toBeVisible();
  });

  test("says when Ergo refuses the delete, the line kept", async ({ page }) => {
    await mine(page, { refuseRedact: true });
    await refused(page);
  });
});

// The delete through a real Ergo: the line leaves the room and stays gone after a reload.
test("deletes the account's own line once asked, in Ergo too", async ({ page }) => {
  const address = await inGames(page);
  const text = word("gone");
  const field = page.getByRole("textbox", { name: "Message #games" });
  await field.fill(text);
  await field.press("Enter");
  await expect(lineOf(page, text)).toHaveCount(1);
  await lineOf(page, text).hover();
  await lineOf(page, text).getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this message?" });
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(lineOf(page, text)).toHaveCount(0);
  await page.reload();
  await hydrated(page);
  await expect(whoIsHere(page).getByTitle(address)).toBeVisible();
  await expect(lineOf(page, text)).toHaveCount(0);
});
