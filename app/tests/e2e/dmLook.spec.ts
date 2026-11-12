import AxeBuilder from "@axe-core/playwright";
import type { WebSocketRoute } from "@playwright/test";
import { lines, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { MEMBER, scriptedErgo } from "./scripted.ts";

// How a direct message looks (slice 4's 4e; its UX review, U20), on a computer's screen and a phone's: the page's
// socket answered by a scripted Ergo (scripted.ts), the conversation's lines sent by the test, the same each run.
// The nick Ergo gives the page's account, whatever the test wallet is; the header, which names the wallet, is masked.
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const SCREENS = [
  ["computer", 1280],
  ["phone", 390],
] as const;

// The page, an account's, at ?dm=<partner>, once Ergo welcomed it: the socket, for the test to speak as Ergo.
async function conversation(page: Page, width: number, partner: string): Promise<WebSocketRoute> {
  await page.setViewportSize({ width, height: 900 });
  // A wallet a test, as every journey logs in: the same one in parallel tests timed out logging in.
  await logIn(page, word("dm-look"));
  let opened: (ergo: WebSocketRoute) => void = () => undefined;
  const socket = new Promise<WebSocketRoute>((resolve) => {
    opened = resolve;
  });
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, ACCOUNT);
    opened(ergo);
  });
  await page.goto(`/w/bubble?dm=${partner}&chat=full`);
  await hydrated(page);
  const ergo = await socket;
  // Said once Ergo welcomed the page (RoomView's empty words wait on "connected"): no "Connecting" holds before it
  // starts too, and a line sent then, before the page knows its nick, is no DM of its own.
  await expect(page.getByText("No messages since this page opened.")).toBeVisible();
  return ergo;
}

// A direct message as Ergo relays it: `from`'s, to `to`, at 10:0`minute`.
const dm = (id: string, { from, to, minute, text }: { from: string; to: string; minute: number; text: string }) =>
  `@msgid=${id};time=2026-10-25T10:0${String(minute)}:00.000Z;account=${from} :${from}!u@h PRIVMSG ${to} :${text}`;
const axe = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations;

// A phone's chat header keeps two fixed rows (81bfec1c); a direct message's mark takes a third of its own, said at once, so the partner's
// name keeps the room it needs beside the close control (F4309: the mark on the name's row cut the name to its first letter).
test("names the partner whole in a phone's header, its mark on a row of its own", async ({ page }) => {
  await conversation(page, 390, MEMBER);
  const name = page.getByRole("heading", { name: /^Direct message with/ });
  await expect(name).toBeVisible();
  const { whole, below } = await name.evaluate((heading) => {
    const mark = [...(heading.closest("header")?.querySelectorAll("*") ?? [])].find(
      (each) =>
        each.children.length === 0 && each.textContent === "Not encrypted" && each.getBoundingClientRect().height > 0,
    );
    return {
      whole: [heading, ...heading.querySelectorAll("button")].every((each) => each.scrollWidth <= each.clientWidth),
      below: (mark?.getBoundingClientRect().top ?? -1) >= heading.getBoundingClientRect().bottom - 1,
    };
  });
  expect(whole, "the partner's name whole").toBe(true);
  expect(below, "the mark under the name").toBe(true);
});

test.describe("a direct message, as it looks", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  for (const [screen, width] of SCREENS) {
    test(`with its lines, on a ${screen}'s screen`, async ({ page }) => {
      const ergo = await conversation(page, width, MEMBER);
      ergo.send(dm("d1", { from: MEMBER, to: ACCOUNT, minute: 0, text: "Up for a round of **gnogolf** tonight?" }));
      ergo.send(dm("d2", { from: ACCOUNT, to: MEMBER, minute: 1, text: "Yes, at 9 pm." }));
      await expect(lines(page)).toHaveCount(2);
      await expect(page).toHaveScreenshot(`dm-${screen}.png`, { mask: [page.getByRole("banner")] });
    });

    // 4d's DM bar: a reaction's chip under the partner's line, and the bar on the reader's own, focused.
    test(`with a reaction and a line's bar, on a ${screen}'s screen`, async ({ page }) => {
      const ergo = await conversation(page, width, MEMBER);
      ergo.send(dm("d1", { from: MEMBER, to: ACCOUNT, minute: 0, text: "Up for a round of **gnogolf** tonight?" }));
      ergo.send(dm("d2", { from: ACCOUNT, to: MEMBER, minute: 1, text: "Yes, at 9 pm." }));
      ergo.send(
        `@msgid=r1;time=2026-10-25T10:02:00.000Z;account=${MEMBER};+draft/react=👍;+reply=d1 :${MEMBER}!u@h TAGMSG ${ACCOUNT}`,
      );
      await expect(lines(page)).toHaveCount(2);
      await expect(lines(page).nth(0).getByRole("button", { name: "👍, 1" })).toBeVisible();
      await lines(page).nth(1).focus();
      await expect(lines(page).nth(1).getByRole("toolbar", { name: "Actions on this message" })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await expect(page).toHaveScreenshot(`dm-bar-${screen}.png`, { mask: [page.getByRole("banner")] });
    });

    test(`empty since the page opened, with no accessibility violation, on a ${screen}'s screen`, async ({ page }) => {
      await conversation(page, width, MEMBER);
      await expect(page.getByText("No messages since this page opened.")).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  }
});
