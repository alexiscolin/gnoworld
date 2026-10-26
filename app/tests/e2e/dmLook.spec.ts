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
// Another account, never written to.
const STRANGER = "g1l6m6l6carqlqqqqqqqqqqqqqqqqqqqqqnkkanc";
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
  await page.goto(`/w/bubble?dm=${partner}`);
  await hydrated(page);
  const ergo = await socket;
  await expect(page.getByRole("status").filter({ hasText: "Connecting" })).toHaveCount(0);
  return ergo;
}

// A direct message as Ergo relays it: `from`'s, to `to`, at 10:0`minute`.
const dm = (id: string, { from, to, minute, text }: { from: string; to: string; minute: number; text: string }) =>
  `@msgid=${id};time=2026-10-25T10:0${String(minute)}:00.000Z;account=${from} :${from}!u@h PRIVMSG ${to} :${text}`;
const axe = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations;

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

    test(`empty since the page opened, with no accessibility violation, on a ${screen}'s screen`, async ({ page }) => {
      await conversation(page, width, MEMBER);
      await expect(page.getByText("No messages since this page opened.")).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  }

  test("a stranger's, not kept while the account hears those it wrote to alone, with no violation", async ({
    page,
  }) => {
    const ergo = await conversation(page, 1280, STRANGER);
    const only = page.getByRole("button", { name: "Only people I wrote to" });
    await only.click();
    await expect(only).toHaveAttribute("aria-pressed", "true");
    // Its colours ease to the pressed ones (Chip.module.css): axe read one mid-way under a gate's load (2.84:1).
    await only.evaluate((chip) => Promise.all(chip.getAnimations().map((animation) => animation.finished)));
    ergo.send(dm("s1", { from: STRANGER, to: ACCOUNT, minute: 0, text: "Buy my token." }));
    await expect(page.getByText(/^Not kept: messages from accounts you never wrote to/)).toBeVisible();
    await expect(lines(page)).toHaveCount(0);
    expect(await axe(page)).toEqual([]);
    await expect(page).toHaveScreenshot("dm-not-kept-computer.png", { mask: [page.getByRole("banner")] });
  });
});
