import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Locator, WebSocketRoute } from "@playwright/test";
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

// #games opened on a scripted Ergo, as `me`, with `history`, out of reach while `down` says so (a new connection
// closed at once); the socket, to say a live line on it.
interface Opened extends Scripted {
  me?: string;
  down?: () => boolean;
}
async function room(
  page: Page,
  { me = GUEST, history = HISTORY, down, ...options }: Opened = {},
): Promise<() => WebSocketRoute> {
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/ws$/, async (ergo) => {
    if (down?.() === true) {
      await ergo.close();
      return;
    }
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
const bars = (page: Page) => page.getByRole("toolbar", { name: "Actions on this message" });
const barOf = (page: Page, at: number) => lines(page).nth(at).getByRole("toolbar", { name: "Actions on this message" });
const moreOf = (page: Page, at: number) => barOf(page, at).getByRole("button", { name: "More actions" });
const focusedLines = (page: Page) => lines(page).and(page.locator(":focus"));
const stops = (page: Page) => lines(page).and(page.locator("[tabindex='0']"));
// The focused element's ring: its style, at least 2 px wide, and whether it lies whole inside its list's box.
const ringOf = (page: Page) =>
  page.evaluate(() => {
    const line = document.activeElement;
    const list = line?.parentElement;
    if (!(line instanceof HTMLElement) || list == null) return null;
    const style = getComputedStyle(line);
    const reach = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    const [box, port] = [line.getBoundingClientRect(), list.getBoundingClientRect()];
    const inside =
      box.left - reach >= port.left &&
      box.right + reach <= port.right &&
      box.top - reach >= port.top &&
      box.bottom + reach <= port.bottom;
    return { style: style.outlineStyle, wide: parseFloat(style.outlineWidth) >= 2, inside };
  });
// Whether the `at`th line's bar lies whole inside the list's box.
async function barInside(page: Page, at: number) {
  const [outer, bar] = [
    await page.getByRole("list", { name: "Messages" }).boundingBox(),
    await barOf(page, at).boundingBox(),
  ];
  if (outer === null || bar === null) throw new Error("no box");
  return bar.y >= outer.y && bar.y + bar.height <= outer.y + outer.height;
}
// The list scrolled so its `at`th line's top is the list's top edge.
async function toTop(page: Page, at: number) {
  await page.getByRole("list", { name: "Messages" }).evaluate((box, line) => {
    const item = box.children[line];
    if (item instanceof HTMLElement)
      box.scrollTop += item.getBoundingClientRect().top - box.getBoundingClientRect().top;
  }, at);
}
// The flash's words, in its pill: the pill sits in the top layer, its region holding no box of its own.
const flash = (page: Page, text: string) => page.getByRole("status").getByText(text, { exact: true });
// #games open, its second line's text copied and said so.
async function copied(page: Page, context: BrowserContext) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await room(page);
  await choose(page, 1, "Copy text");
  await expect(flash(page, "Text copied.")).toBeVisible();
}
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

  // 4c's UX review (U1): a link in a line is no Tab stop of its own unless its line is the list's; the arrows move
  // from a link as from its line.
  test("keep the links of other lines out of the Tab order, and move by the arrows from a link", async ({ page }) => {
    await room(page, {
      history: [
        ["k1", T(0), "the rules at https://gno.land/r/demo"],
        ["k2", T(1), "a plain line"],
        ["k3", T(2), "and https://gno.land/r/other too"],
      ],
    });
    await roomsNav(page).getByRole("link").last().focus();
    await page.keyboard.press("Tab");
    await expect(lines(page).nth(2)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(lines(page).nth(2).getByRole("link")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(lines(page).nth(1)).toBeFocused();
    await expect(lines(page).nth(0).getByRole("link")).toHaveAttribute("tabindex", "-1");
    await page.keyboard.press("ArrowUp");
    await expect(lines(page).nth(0)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(lines(page).nth(0).getByRole("link")).toBeFocused();
    await expect(lines(page).nth(2).getByRole("link")).toHaveAttribute("tabindex", "-1");
  });

  // The green pass (G5): a move held with a modifier is the browser's or the page's (Alt+arrows switch rooms).
  test("leave a move held with a modifier where it is, its default the browser's, and take the plain ones", async ({
    page,
  }) => {
    await room(page, { history: SIXTY });
    await page.evaluate(() => {
      const seen: string[] = [];
      Object.assign(window, { seen });
      window.addEventListener("keydown", (event) => seen.push(`${event.key} ${String(event.defaultPrevented)}`));
    });
    await lines(page).nth(30).focus();
    for (const key of ["Shift+ArrowDown", "Control+End", "Meta+ArrowUp", "Alt+Home"]) {
      await page.keyboard.press(key);
      await expect(lines(page).nth(30)).toBeFocused();
    }
    await page.keyboard.press("ArrowDown");
    await expect(lines(page).nth(31)).toBeFocused();
    const seen = await page.evaluate(() => Reflect.get(window, "seen") as string[]);
    expect(seen.filter((pressed) => !/^(Shift|Control|Meta|Alt) /.test(pressed))).toEqual([
      "ArrowDown false",
      "End false",
      "ArrowUp false",
      "Home false",
      "ArrowDown true",
    ]);
  });

  // The green pass (G7): the line holding the tab stop deleted by its author, the newest takes it.
  test("keep one tab stop, the newest, when the chosen line is deleted by another", async ({ page }) => {
    const ergo = await room(page);
    await lines(page).nth(1).focus();
    ergo().send(`@msgid=r1;time=${T(30)};account=${MEMBER} :${MEMBER}!u@h REDACT #bubble/games m2`);
    await expect(lines(page)).toHaveCount(2);
    await expect(stops(page)).toHaveCount(1);
    await expect(lineOf(page, "the third line")).toHaveAttribute("tabindex", "0");
    await roomsNav(page).getByRole("link").last().focus();
    await page.keyboard.press("Tab");
    await expect(lineOf(page, "the third line")).toBeFocused();
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

  // The green pass (G2): Esc's hide hands the focus back to More while the list checks, a frame later, whether the
  // focus left it; two frames on, More holds it still, and its bar is there, the pointer away.
  test("keep More focused and its bar shown two frames after Esc closes its menu", async ({ page }) => {
    await room(page);
    await page.mouse.move(0, 0);
    await lines(page).nth(1).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: "Message actions" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              done();
            });
          });
        }),
    );
    expect(await moreOf(page, 1).evaluate((more) => more === document.activeElement)).toBe(true);
    await expect(barOf(page, 1)).toBeVisible();
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

  // The red pass (M4): the pointer resting on one line, the keyboard on another, which has its bar, alone (U11).
  test("let the keyboard reach its line's bar while the pointer rests on another, and keep a bar whose menu is open", async ({
    page,
  }) => {
    await room(page);
    await lineOf(page, "the first line").hover();
    await lines(page).nth(2).focus();
    await expect(barOf(page, 2)).toBeVisible();
    await expect(bars(page)).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(moreOf(page, 2)).toBeFocused();
    await page.keyboard.press("Enter");
    await page.mouse.move(0, 0);
    await expect(page.getByRole("menu", { name: "Message actions" })).toBeVisible();
    await expect(barOf(page, 2)).toBeVisible();
  });

  test("copy a line's text as written, and the room's link, each said done", async ({ page, context }) => {
    await copied(page, context);
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

  // The red pass (M6) and the green pass (G9): a page with no clipboard (a plain http origin) and a clipboard that
  // refuses the write (a permission denied) each say the copy failed.
  const NO_COPY: [string, () => void][] = [
    [
      "the page has no clipboard",
      () => {
        Reflect.deleteProperty(Navigator.prototype, "clipboard");
      },
    ],
    [
      "the clipboard refuses it",
      () => {
        Object.defineProperty(Navigator.prototype, "clipboard", {
          get: () => ({
            writeText: () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")),
          }),
        });
      },
    ],
  ];
  for (const [how, plant] of NO_COPY) {
    test(`say a copy failed when ${how}`, async ({ page }) => {
      await page.addInitScript(plant);
      await room(page);
      await choose(page, 1, "Copy text");
      // 4c's UX review (U8): what could not be copied, and why.
      await expect(flash(page, "Could not copy the text.")).toBeVisible();
      await expect(flash(page, "Your browser blocked the clipboard.")).toBeVisible();
      await expect(flash(page, "Text copied.")).toHaveCount(0);
      await choose(page, 1, "Copy room link");
      await expect(flash(page, "Could not copy the link.")).toBeVisible();
    });
  }

  // The red pass (M11): a window that scrolls keeps the focused line and its bar in sight.
  test("keep the focused line and its bar inside a list that scrolls, and pass axe", async ({ page }) => {
    await room(page, { history: SIXTY });
    await lines(page).last().focus();
    await page.keyboard.press("Home");
    await expect(lines(page).first()).toBeFocused();
    await expect(lines(page).first()).toBeInViewport();
    expect(await barInside(page, 0)).toBe(true);
    await page.keyboard.press("End");
    await expect(lines(page).last()).toBeInViewport();
    expect(await barInside(page, 59)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  // The green pass (G8): a line the arrows reach at the list's top edge, its bar rising past it; and the same
  // line focused again by Tab, after the focus left the list.
  test("bring a bar rising past the list's top edge into the list, as the arrows or Tab come to its line", async ({
    page,
  }) => {
    await room(page, { history: SIXTY });
    await toTop(page, 30);
    await lines(page).nth(31).focus();
    await toTop(page, 30);
    await page.keyboard.press("ArrowUp");
    await expect(lines(page).nth(30)).toBeFocused();
    expect(await barInside(page, 30)).toBe(true);
    await roomsNav(page).getByRole("link").last().focus();
    await expect(focusedLines(page)).toHaveCount(0);
    await toTop(page, 30);
    await page.keyboard.press("Tab");
    await expect(lines(page).nth(30)).toBeFocused();
    expect(await barInside(page, 30)).toBe(true);
  });

  // 4c's UX review (U10): under the pointer, a bar whose line sits at the list's top edge comes down inside the line
  // rather than rising past the edge, the list never scrolled under the pointer; elsewhere it rises astride its line.
  test("draw a pointed line's bar inside the list when its line sits at the top edge", async ({ page }) => {
    await room(page, { history: SIXTY });
    await toTop(page, 30);
    // Where the `at`th line's bar's top is, against its line's top.
    const rise = async (at: number) => {
      await lines(page).nth(at).hover();
      const [line, bar] = [await lines(page).nth(at).boundingBox(), await barOf(page, at).boundingBox()];
      if (line === null || bar === null) throw new Error("no box");
      return bar.y - line.y;
    };
    expect(await rise(30)).toBeGreaterThanOrEqual(0);
    expect(await barInside(page, 30)).toBe(true);
    expect(await rise(33)).toBeLessThan(0);
  });

  // 4c's UX review (U11): one bar at a time, the pointed line's while the pointer is on the lines, the focused line's
  // again once it leaves them; a bar holding the focus stays, so its menu is never pulled from under the keyboard.
  test("show the pointed line's bar alone, and the focused line's once the pointer leaves", async ({ page }) => {
    await room(page);
    await lines(page).nth(2).focus();
    await lines(page).nth(0).hover();
    await expect(bars(page)).toHaveCount(1);
    await expect(barOf(page, 0)).toBeVisible();
    await roomsNav(page).hover();
    await expect(bars(page)).toHaveCount(1);
    await expect(barOf(page, 2)).toBeVisible();
    // More holding the focus: its bar stays as the pointer comes to another line.
    await moreOf(page, 2).focus();
    await lines(page).nth(0).hover();
    await expect(bars(page)).toHaveCount(2);
    await expect(moreOf(page, 2)).toBeFocused();
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
    await expect(lines(page).nth(1)).toHaveAttribute("tabindex", "0");
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

  // The green pass (G17): the focused line's ring, drawn outside it, whole inside the list that scrolls and clips it.
  test("draw the focused line's ring whole inside the list, on the newest, a middle and the oldest line", async ({
    page,
  }) => {
    await room(page);
    await roomsNav(page).getByRole("link").last().focus();
    await page.keyboard.press("Tab");
    for (const [at, key] of [
      [2, undefined],
      [1, "ArrowUp"],
      [0, "ArrowUp"],
    ] as const) {
      if (key !== undefined) await page.keyboard.press(key);
      await expect(lines(page).nth(at)).toBeFocused();
      expect(await ringOf(page)).toEqual({ style: "solid", wide: true, inside: true });
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

  // /code-review: a room's flash stays in its room; gone at once, well before its own five seconds end it (G10).
  test("leave a room's flash behind when the room changes", async ({ page, context }) => {
    await copied(page, context);
    await page.keyboard.press("Alt+ArrowDown");
    await expect(flash(page, "Text copied.")).toHaveCount(0, { timeout: 1000 });
  });

  // 4c's UX review (U2): the line keeps room at its end for the bar, so the bar covers no word, of its line or of the
  // line above, at a computer's width and a phone's.
  for (const width of [1280, 390]) {
    test(`cover no word of a long line or of the line above with the bar, at ${String(width)} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const long = "the quick brown fox jumps over the lazy dog ".repeat(6).trim();
      await room(page, {
        history: [
          ["l1", T(0), long],
          ["l2", T(1), long],
        ],
      });
      await lines(page).nth(1).hover();
      const bar = await barOf(page, 1).boundingBox();
      if (bar === null) throw new Error("no bar");
      // Every word's box in the list, the bar's own left out.
      const words = await page.getByRole("list", { name: "Messages" }).evaluate((list) =>
        [...list.querySelectorAll(":scope > li")].flatMap((line) => {
          const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          const found: { x: number; y: number; width: number; height: number }[] = [];
          for (let text = walk.nextNode(); text !== null; text = walk.nextNode()) {
            if (text.parentElement?.closest("[role='toolbar']") != null) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            for (const { x, y, width: w, height } of range.getClientRects()) found.push({ x, y, width: w, height });
          }
          return found;
        }),
      );
      expect(words.length).toBeGreaterThan(4);
      const overlaps = words.filter(
        (word) =>
          word.x < bar.x + bar.width &&
          bar.x < word.x + word.width &&
          word.y < bar.y + bar.height &&
          bar.y < word.y + word.height,
      );
      expect(overlaps).toEqual([]);
    });
  }

  // 4c's UX review (U16): More's focus ring inside the bar's frame, which it would otherwise paint over.
  test("draw More's focus ring inside its bar", async ({ page }) => {
    await room(page);
    await lines(page).nth(2).focus();
    await page.keyboard.press("Tab");
    await expect(moreOf(page, 2)).toBeFocused();
    const inside = await barOf(page, 2).evaluate((bar) => {
      const more = bar.querySelector("button");
      if (more === null) return false;
      const style = getComputedStyle(more);
      const reach = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      const [ring, frame] = [more.getBoundingClientRect(), bar.getBoundingClientRect()];
      const edge = parseFloat(getComputedStyle(bar).borderTopWidth);
      return (
        ring.left - reach >= frame.left + edge &&
        ring.right + reach <= frame.right - edge &&
        ring.top - reach >= frame.top + edge &&
        ring.bottom + reach <= frame.bottom - edge
      );
    });
    expect(inside).toBe(true);
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
  async function mine(
    page: Page,
    options: Opened = {},
  ): Promise<{ address: string; sent: string[]; socket: () => WebSocketRoute }> {
    const address = await logIn(page, word("menu"));
    const sent: string[] = [];
    const socket = await room(page, {
      ...options,
      me: address,
      history: [
        ["o1", T(0), "another's line"],
        ["o2", T(1), "my own line", address],
        ["o3", T(2), "the newest line"],
      ],
      heard: (line) => sent.push(line),
    });
    return { address, sent, socket };
  }
  const deleteFrom = async (page: Page, at: number) => {
    await lines(page).nth(at).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Copy text" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
    await page.keyboard.press("Enter");
    return page.getByRole("dialog", { name: "Delete message?" });
  };
  // The second line's delete asked and refused, by the page or by Ergo: said with `why` (U8), the line kept.
  const refused = async (page: Page, why: string) => {
    const dialog = await deleteFrom(page, 1);
    await dialog.getByRole("button", { name: "Delete" }).press("Enter");
    await expect(flash(page, "Could not delete the message.")).toBeVisible();
    await expect(flash(page, why)).toBeVisible();
    await expect(lineOf(page, "my own line")).toHaveCount(1);
  };
  // The items of the `at`th line's menu, opened by the pointer on its words.
  const itemsOf = async (page: Page, at: number, text: string) => {
    await lineOf(page, text).hover();
    await moreOf(page, at).click();
    return page.getByRole("menu").getByRole("menuitem");
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
    await expect(await itemsOf(page, 0, "another's line")).toHaveText(["Copy text", "Copy room link"]);
    await page.keyboard.press("Escape");
    await expect(await itemsOf(page, 1, "my own line")).toHaveText(["Copy text", "Copy room link", "Delete"]);
    // The green pass (G11): the dialog closed until Delete is chosen.
    await expect(page.getByRole("dialog", { name: "Delete message?" })).toBeHidden();
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
    await expect(lineOf(page, "another's line")).toBeFocused();
    await expect(stops(page)).toHaveCount(1);
  });

  // The green pass (G6): the newest goes to the one before it, the oldest to the one after; the last line alone
  // gone, no line is left to take the focus, which falls to the page as when any focused element goes.
  test("hands the focus to the line before the one deleted, else the one after, each end in turn", async ({ page }) => {
    const address = await logIn(page, word("menu"));
    const own = (id: string, minute: number, text: string): HistoryLine => [id, T(minute), text, address];
    await room(page, {
      me: address,
      history: [own("a1", 0, "own one"), own("a2", 1, "own two"), own("a3", 2, "own three")],
    });
    for (const [at, gone, focused] of [
      [2, "own three", "own two"],
      [0, "own one", "own two"],
    ] as const) {
      const dialog = await deleteFrom(page, at);
      await dialog.getByRole("button", { name: "Delete" }).press("Enter");
      await expect(lineOf(page, gone)).toHaveCount(0);
      await expect(lineOf(page, focused)).toBeFocused();
    }
    const dialog = await deleteFrom(page, 0);
    await dialog.getByRole("button", { name: "Delete" }).press("Enter");
    await expect(lines(page)).toHaveCount(0);
    await expect(page.locator("body")).toBeFocused();
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
    await refused(page, "This message cannot be deleted.");
    await expect(moreOf(page, 1)).toBeFocused();
    await expect(page.getByRole("status").getByRole("button", { name: "Try again" })).toHaveCount(0);
  });

  // /code-review: a copy after Ergo's refusal is said, the refusal dismissed.
  test("says a copy made while Ergo's refusal is on show", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mine(page, { refuseRedact: true });
    await refused(page, "The chat refused it.");
    await choose(page, 0, "Copy text");
    await expect(flash(page, "Text copied.")).toBeVisible();
  });

  test("says when Ergo refuses the delete, the line kept", async ({ page }) => {
    await mine(page, { refuseRedact: true });
    await refused(page, "The chat refused it.");
    // 4c's UX review (U4): refused, the line offers its Delete again.
    await expect(await itemsOf(page, 1, "my own line")).toHaveText(["Copy text", "Copy room link", "Delete"]);
  });

  // 4c's UX review (U8): a delete the page cannot send while the chat is out of reach says so, and offers to try again
  // once it is back.
  test("says a delete the chat is out of reach for, and tries again once asked", async ({ page }) => {
    let down = false;
    const { sent, socket } = await mine(page, { down: () => down });
    down = true;
    await socket().close();
    await expect(page.getByText("The chat is out of reach. Trying again…")).toBeVisible();
    await refused(page, "The chat is out of reach.");
    expect(sent.filter((line) => line.startsWith("REDACT "))).toEqual([]);
    down = false;
    await expect(page.getByText("The chat is out of reach. Trying again…")).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole("status").getByRole("button", { name: "Try again" }).click();
    await expect(lineOf(page, "my own line")).toHaveCount(0);
    expect(sent.filter((line) => line.startsWith("REDACT "))).toEqual(["REDACT #bubble/games o2"]);
    await expect(flash(page, "Message deleted.")).toBeVisible();
  });

  // 4c's UX review (U4): a delete that worked is said, once Ergo's echo takes the line; until then the line offers no
  // second Delete.
  test("says the delete once Ergo takes the line, and offers no second one before", async ({ page }) => {
    const { address, sent, socket } = await mine(page, { holdRedact: true });
    const dialog = await deleteFrom(page, 1);
    await dialog.getByRole("button", { name: "Delete" }).press("Enter");
    expect(sent.filter((line) => line.startsWith("REDACT "))).toEqual(["REDACT #bubble/games o2"]);
    await expect(await itemsOf(page, 1, "my own line")).toHaveText(["Copy text", "Copy room link"]);
    await page.keyboard.press("Escape");
    await expect(flash(page, "Message deleted.")).toHaveCount(0);
    socket().send(`:${address}!u@h REDACT #bubble/games o2`);
    await expect(lineOf(page, "my own line")).toHaveCount(0);
    await expect(flash(page, "Message deleted.")).toBeVisible();
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
  await lineOf(page, text).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete message?" });
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(lineOf(page, text)).toHaveCount(0);
  await page.reload();
  await hydrated(page);
  await expect(whoIsHere(page).getByTitle(address)).toBeVisible();
  await expect(lineOf(page, text)).toHaveCount(0);
});
