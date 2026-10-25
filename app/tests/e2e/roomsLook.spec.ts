import type { WebSocketRoute } from "@playwright/test";
import { expect, hydrated, test } from "./fixtures.ts";

// How a world's rooms look (slice 4's 4b), on a computer's screen and a phone's: the page's socket answered by a
// scripted Ergo, so its lines, topic and people are the same each run; the rooms come from the real server.
const MEMBER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
// The nick Ergo's welcome gives the page, whatever it drew: the page names itself by it.
const ME = "guest-zzzzzz";
const LINES = [
  ["a1", "2026-10-25T10:00:00.000Z", "Welcome to the games room."],
  ["a2", "2026-10-25T10:01:00.000Z", "Who is up for a round of gnogolf?"],
] as const;

// Ergo's half of a guest's connection: the ACK, the welcome, each JOIN with its topic and names, the history.
function scriptedErgo(ergo: WebSocketRoute, history: readonly (readonly [string, string, string])[] = LINES): void {
  const say = (line: string) => {
    ergo.send(line);
  };
  ergo.onMessage((data) => {
    const line = String(data);
    if (line.startsWith("CAP REQ :")) say(`:ergo CAP * ACK :${line.slice("CAP REQ :".length)}`);
    else if (line.startsWith("USER ")) [`:ergo 001 ${ME} :Welcome`, `:ergo 376 ${ME} :End of MOTD`].forEach(say);
    else if (line.startsWith("JOIN ")) {
      for (const room of line.slice("JOIN ".length).split(",")) {
        say(`:${ME}!u@h JOIN ${room}`);
        if (room === "#bubble/games") say(`:ergo 332 ${ME} ${room} :Games played on chain, and their players.`);
        say(`:ergo 353 ${ME} = ${room} :@gnoworld ${MEMBER} ${ME}`);
        say(`:ergo 366 ${ME} ${room} :End of /NAMES list.`);
      }
    } else if (line.startsWith("CHATHISTORY LATEST #bubble/games ")) {
      say("BATCH +h1 chathistory #bubble/games");
      for (const [id, time, text] of history) {
        say(`@batch=h1;msgid=${id};time=${time};account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :${text}`);
      }
      say("BATCH -h1");
    }
  });
}

test.describe("a world's rooms, as they look", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  for (const [screen, width] of [
    ["computer", 1280],
    ["phone", 390],
  ] as const) {
    test(`on a ${screen}'s screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.routeWebSocket(/\/ws$/, (ergo) => {
        scriptedErgo(ergo);
      });
      await page.goto("/w/bubble?room=games");
      await hydrated(page);
      await expect(page.getByText("Who is up for a round of gnogolf?")).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Who's here" })).toContainText("2 here");
      await expect(page).toHaveScreenshot(`rooms-${screen}.png`);
    });
  }
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
    scriptedErgo(route, history);
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(page.getByText("Line 59 of the room's history")).toBeInViewport();
  ergo?.send(
    `@msgid=live;time=2026-10-25T12:00:00.000Z;account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :A live line`,
  );
  await expect(page.getByText("A live line")).toBeInViewport();
});
