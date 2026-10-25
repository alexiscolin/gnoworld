import AxeBuilder from "@axe-core/playwright";
import type { WebSocketRoute } from "@playwright/test";
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

  for (const [screen, width] of [
    ["computer", 1280],
    ["phone", 390],
  ] as const) {
    test(`on a ${screen}'s screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.routeWebSocket(/\/ws$/, (ergo) => {
        scriptedErgo(ergo, GUEST);
      });
      await page.goto("/w/bubble?room=games");
      await hydrated(page);
      await expect(page.getByText("Who is up for a round of")).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Who's here" })).toContainText("2 here");
      await expect(page).toHaveScreenshot(`rooms-${screen}.png`);
    });
  }

  // The test wallet is drawn at each server's start: the header, which names it, is masked.
  test("with the composer, a line being written, on a computer's screen (a phone reads only: plan §2)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await logIn(page, "composer-look");
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      scriptedErgo(ergo, ACCOUNT);
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(page.getByRole("complementary", { name: "Who's here" })).toContainText("2 here");
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
      scriptedErgo(ergo, ACCOUNT, [
        ["m1", "2026-10-25T10:00:00.000Z", `Who is up for a round of **gnogolf**? @${MEMBER} is in.`],
        ["m2", "2026-10-25T10:01:00.000Z", `@${address} are you in too?`],
        ["m3", "2026-10-25T10:02:00.000Z", `Write \`@${address}\` to call them.`],
      ]);
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    const lines = page.getByRole("list", { name: "Messages" }).getByRole("listitem");
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText(`@${MEMBER.slice(0, 6)}…${MEMBER.slice(-5)} is in.`);
    await expect(lines.filter({ hasText: "Mentions you" })).toHaveCount(1);
    await expect(lines.nth(1)).toContainText("Mentions you");
    const mine = lines.nth(1).getByTitle(address);
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
    expect(await lines.nth(1).getByText("Mentions you").evaluate(color)).toBe(amber);
    expect(await lines.nth(0).getByTitle(MEMBER).last().evaluate(color)).not.toBe(amber);
    await expect(lines.nth(1)).toHaveCSS("border-inline-start-color", amber);
    expect((await new AxeBuilder({ page }).include("ol").analyze()).violations).toEqual([]);
    // For the picture, the drawn address reads the same each run (its own text was checked above), so the amber
    // mention shows in it; the header, which names the wallet, masked.
    await mine.evaluate((element) => {
      element.textContent = "@g1aaaa…aaaaa";
    });
    await lines
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
    scriptedErgo(route, GUEST, history);
  });
  await page.goto("/w/bubble?room=games");
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
    scriptedErgo(ergo, GUEST, [["q1", "2026-10-25T10:00:00.000Z", "> what was said before"]]);
  });
  await page.goto("/w/bubble?room=games");
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
// mention of it shows whole, through the store and the page; a member's shortened.
test("shows a mention of an account not in the room whole, a member's shortened", async ({ page }) => {
  const ground = "g1jg8m2vtwlmmyz8swgu76ug4tklwnays8yvsqf5";
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, GUEST, [["g1", "2026-10-25T10:00:00.000Z", `ask @${ground} or @${MEMBER}`]]);
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  const mentions = page.getByRole("list", { name: "Messages" }).locator("[data-mention]");
  await expect(mentions).toHaveText([`@${ground}`, `@${MEMBER.slice(0, 6)}…${MEMBER.slice(-5)}`]);
  await expect(mentions.first()).toHaveAttribute("title", ground);
});
