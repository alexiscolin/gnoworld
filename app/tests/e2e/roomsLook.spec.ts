import type { WebSocketRoute } from "@playwright/test";
import { expect, hydrated, test } from "./fixtures.ts";
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
});

// 4b's pre-merge (/code-review): a room opens on its newest line, and keeps the newest in view as lines come.
test("opens a room on its newest line, and keeps the newest in view as lines come", async ({ page }) => {
  const history = Array.from({ length: 60 }, (_, n) => {
    const time = new Date(Date.parse("2026-10-25T10:00:00.000Z") + n * 60_000).toISOString();
    return [`h${String(n)}`, time, `Line ${String(n)} of the room's history`] as const;
  });
  let ergo: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/ws$/, (route) => {
    ergo = route;
    scriptedErgo(route, GUEST, history);
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(page.getByText("Line 59 of the room's history")).toBeInViewport();
  ergo?.send(
    `@msgid=live;time=2026-10-25T12:00:00.000Z;account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :A live line`,
  );
  await expect(page.getByText("A live line")).toBeInViewport();
});
