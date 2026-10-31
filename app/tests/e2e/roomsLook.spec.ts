import AxeBuilder from "@axe-core/playwright";
import type { WebSocketRoute } from "@playwright/test";
import { lineOf, lines } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { MEMBER, scriptedErgo } from "./scripted.ts";

// How a world's rooms look (slice 4's 4b, the composer 4c's), on a computer's screen and a phone's: the page's
// socket answered by a scripted Ergo (scripted.ts), so its lines, topic and people are the same each run.
// The nick Ergo's welcome gives a guest, whatever it drew: the page names itself by it.
const GUEST = "guest-zzzzzz";
// The nick it gives an account, whatever the test wallet is: the page names itself by it among who is here.
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

test.describe("a world's rooms, as they look", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  // #games as a guest sees it, at a width, once its first line shows.
  async function asGuest(page: Page, width: number) {
    await page.setViewportSize({ width, height: 900 });
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      scriptedErgo(ergo, GUEST);
    });
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(page.getByText("Who is up for a round of")).toBeVisible();
  }

  for (const [screen, width] of [
    ["computer", 1280],
    ["phone", 390],
  ] as const) {
    test(`on a ${screen}'s screen`, async ({ page }) => {
      await asGuest(page, width);
      // A phone has no info panel: its people open from the quick action, in a dialog.
      if (screen === "computer") await expect(page.getByRole("region", { name: "Who's here" })).toContainText("2 here");
      await expect(page).toHaveScreenshot(`rooms-${screen}.png`);
    });
  }

  // Slice 5's 5b: on a phone the rooms sit behind the Rooms control, in a drawer over the conversation.
  test("with the rooms' drawer open, on a phone's screen", async ({ page }) => {
    await asGuest(page, 390);
    await page.getByRole("button", { name: "Rooms" }).click();
    await expect(page.getByRole("dialog", { name: "Rooms" })).toBeVisible();
    await expect(page).toHaveScreenshot("rooms-drawer-phone.png");
  });

  // The test wallet is drawn at each server's start: the header, which names it, is masked.
  test("with the composer, a line being written, on a computer's screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await logIn(page, "composer-look");
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      scriptedErgo(ergo, ACCOUNT);
    });
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(lines(page)).toHaveCount(2);
    await expect(page.getByRole("region", { name: "Who's here" })).toContainText("2 here");
    await page.getByRole("textbox", { name: "Message #games" }).fill("I'm in: **tonight**, `9 pm` UTC");
    await expect(page).toHaveScreenshot("composer-computer.png", {
      mask: [page.getByRole("banner")],
    });
  });

  // 4d: a line that mentions the account, set apart by a word and amber (docs/DESIGN-SYSTEM.md, "about me"); another
  // account's mention shown plain, as its short address. The account's own address is drawn at the server's start.
  test("sets a line that mentions the account apart, its mention too, on a computer's screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const address = await logIn(page, "mention-look");
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      scriptedErgo(ergo, ACCOUNT, {
        history: [
          ["m1", "2026-10-25T10:00:00.000Z", `Who is up for a round of **gnogolf**? @${MEMBER} is in.`],
          ["m2", "2026-10-25T10:01:00.000Z", `@${address} are you in too?`],
          ["m3", "2026-10-25T10:02:00.000Z", `Write \`@${address}\` to call them.`],
        ],
      });
    });
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    const shown = lines(page);
    await expect(shown).toHaveCount(3);
    await expect(shown.nth(0)).toContainText(`@${MEMBER.slice(0, 6)}…${MEMBER.slice(-5)} is in.`);
    await expect(shown.filter({ hasText: "Mentions you" })).toHaveCount(1);
    await expect(shown.nth(1)).toContainText("Mentions you");
    const mine = shown.nth(1).getByTitle(address);
    await expect(mine).toHaveText(`@${address.slice(0, 6)}…${address.slice(-5)}`);
    // Amber, the design system's "about me": the reader's mention and the line's word; another's mention not.
    const amber = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-warm)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    const color = (element: HTMLElement) => getComputedStyle(element).color;
    expect(await mine.evaluate(color)).toBe(amber);
    expect(await shown.nth(1).getByText("Mentions you").evaluate(color)).toBe(amber);
    expect(await shown.nth(0).getByTitle(MEMBER).last().evaluate(color)).not.toBe(amber);
    await expect(shown.nth(1)).toHaveCSS("border-inline-start-color", amber);
    expect((await new AxeBuilder({ page }).include("ol").analyze()).violations).toEqual([]);
    // For the picture, the drawn address reads the same each run (its own text was checked above), so the amber
    // mention shows in it; the header, which names the wallet, masked.
    await mine.evaluate((element) => {
      element.textContent = "@g1aaaa…aaaaa";
    });
    await shown
      .nth(2)
      .locator("code")
      .evaluate((element) => {
        element.textContent = `@g1${"a".repeat(38)}`;
      });
    await expect(page).toHaveScreenshot("mention-computer.png", { mask: [page.getByRole("banner")] });
  });
});

// #games with 60 lines of history, scripted, opened on its newest; the socket, to say a live line on it.
async function sixtyLines(page: Page): Promise<() => WebSocketRoute> {
  const history = Array.from({ length: 60 }, (_, n) => {
    const time = new Date(Date.parse("2026-10-25T10:00:00.000Z") + n * 60_000).toISOString();
    return [`h${String(n)}`, time, `Line ${String(n)} of the room's history`] as const;
  });
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/ws$/, (route) => {
    socket = route;
    scriptedErgo(route, GUEST, { history });
  });
  // The video's header (96 px) and the plate above the room leave a 720-high screen too little for the newest line.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/w/bubble?room=games&chat=full");
  await hydrated(page);
  await expect(page.getByText("Line 59 of the room's history")).toBeInViewport();
  return () => {
    if (socket === undefined) throw new Error("the page opened no socket");
    return socket;
  };
}

// 4b's pre-merge (/code-review): a room opens on its newest line, and keeps the newest in view as lines come.
test("opens a room on its newest line, and keeps the newest in view as lines come", async ({ page }) => {
  const ergo = await sixtyLines(page);
  ergo().send(
    `@msgid=live;time=2026-10-25T12:00:00.000Z;account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :A live line`,
  );
  await expect(page.getByText("A live line")).toBeInViewport();
});

// 4c's green pass: a reader who scrolled up is left where they are as lines come (4b's useNewestInView).
test("leaves a reader who scrolled up where they are as a line comes", async ({ page }) => {
  const ergo = await sixtyLines(page);
  await page.getByRole("list", { name: "Messages" }).evaluate((list) => {
    list.scrollTop = 0;
    list.dispatchEvent(new Event("scroll"));
  });
  await expect(page.getByText("Line 0 of the room's history")).toBeInViewport();
  ergo().send(
    `@msgid=live;time=2026-10-25T12:00:00.000Z;account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :A live line`,
  );
  await expect(page.getByText("A live line")).toHaveCount(1);
  await expect(page.getByText("Line 0 of the room's history")).toBeInViewport();
  await expect(page.getByText("A live line")).not.toBeInViewport();
});

// /code-review (F783): a quote reads as one, set apart from the sender's own words.
test("sets a quoted line apart from the sender's own words", async ({ page }) => {
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, GUEST, { history: [["q1", "2026-10-25T10:00:00.000Z", "> what was said before"]] });
  });
  await page.goto("/w/bubble?room=games&chat=full");
  await hydrated(page);
  const quote = page.getByRole("list", { name: "Messages" }).locator("blockquote");
  await expect(quote).toHaveText("what was said before");
  const look = await quote.evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.borderInlineStartWidth, padding: style.paddingInlineStart };
  });
  expect(look.border).not.toBe("0px");
  expect(look.padding).not.toBe("0px");
});

// F812: an address of the right checksum ground to shorten as a member's does holds no key, so joins no room: a
// mention of it shows whole, through the store and the page, beside the member it copies, shortened. Ergo's
// scripted welcome names the page ACCOUNT, whose short form the ground address copies; NAMES lists it.
test("shows a mention of an account not in the room whole, beside the member it copies shortened", async ({ page }) => {
  const ground = "g1jg8m2vtwlmmyz8swgu76ug4tklwnays8yvsqf5";
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, ACCOUNT, {
      history: [["g1", "2026-10-25T10:00:00.000Z", `ask @${ground} or @${ACCOUNT} or @${MEMBER}`]],
    });
  });
  await page.goto("/w/bubble?room=games&chat=full");
  await hydrated(page);
  const mentions = page.getByRole("list", { name: "Messages" }).locator("[data-mention]");
  await expect(mentions).toHaveText([`@${ground}`, "@g1jg8m…vsqf5", `@${MEMBER.slice(0, 6)}…${MEMBER.slice(-5)}`]);
  await expect(mentions.first()).toHaveAttribute("title", ground);
  await expect(mentions.nth(1)).toHaveAttribute("title", ACCOUNT);
});

// F816: the browser's engine reads the mentions as the server counts them. Chromium 156's V8 (14.6) misreads a
// character class just before `$` for a letter past the BMP, which made 𐐀@<address> a mention here alone.
test("draws no mention after a letter past the BMP, in the browser's own engine", async ({ page }) => {
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, GUEST, { history: [["b1", "2026-10-25T10:00:00.000Z", `\u{10400}@${MEMBER} and @${MEMBER}`]] });
  });
  await page.goto("/w/bubble?room=games&chat=full");
  await hydrated(page);
  await expect(lineOf(page, "and @")).toContainText(`\u{10400}@${MEMBER} and`);
  await expect(lines(page).locator("[data-mention]")).toHaveCount(1);
});

// F814: a line that is a list holds list items of its own; a room's lines are the Messages list's own items.
test("counts a line that is a list as one line of the room", async ({ page }) => {
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, GUEST, {
      history: [
        ["l1", "2026-10-25T10:00:00.000Z", "- gnogolf at nine"],
        ["l2", "2026-10-25T10:01:00.000Z", "1. bring a putter"],
      ],
    });
  });
  await page.goto("/w/bubble?room=games&chat=full");
  await hydrated(page);
  await expect(lineOf(page, "gnogolf at nine").locator("ul > li")).toHaveCount(1);
  await expect(lineOf(page, "bring a putter").locator("ol > li")).toHaveCount(1);
  await expect(lines(page)).toHaveCount(2);
  await expect(lineOf(page, "gnogolf at nine")).toHaveCount(1);
  await expect(lineOf(page, "bring a putter")).toHaveCount(1);
});
