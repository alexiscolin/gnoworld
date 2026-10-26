import AxeBuilder from "@axe-core/playwright";
import { lineOf, lines } from "./chat.ts";
import type { WebSocketRoute } from "@playwright/test";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { MEMBER, scriptedErgo, type HistoryLine } from "./scripted.ts";
import { SITE } from "./sites.ts";

// 4g (docs/decisions.md, 2026-10-26; slice 4's plan §1, §3): a link's player loads on a click, once "checked"; no
// third party is reached before. The verdicts' stream answered here, each (re)connection reading `verdicts()`; every
// request to another host recorded and answered here, so the test reaches no one. #games on a scripted Ergo.
const GUEST = "guest-zzzzzz";
const HISTORY: readonly HistoryLine[] = [
  ["v1", "2026-10-25T10:00:00.000Z", "watch https://youtu.be/dQw4w9WgXcQ"],
  ["v2", "2026-10-25T10:01:00.000Z", "and https://imgur.com/gallery/abcdefg"],
];
const PLAYER = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
const event = (msgid: string, state: "checked" | "hidden") =>
  `id: 1\nevent: verdict\ndata: ${JSON.stringify({ msgid, room: "#bubble/games", state })}\n\n`;

interface Room {
  away: string[];
  asked: string[];
  /** A line said in #games now, as Ergo sends it live; at `time` if given. */
  say: (id: string, text: string, time?: string) => void;
}

async function room(page: Page, verdicts: () => string): Promise<Room> {
  const away: string[] = [];
  const asked: string[] = [];
  const site = new URL(SITE).host;
  // When the stream began following, as the server tells after its replay (F890): the test's start, on its own clock.
  const since = `event: since\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`;
  await page.route(
    (url) => url.host !== site && url.hostname !== "flush.invalid",
    (route) => {
      away.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>player</title>" });
    },
  );
  await page.route("**/api/stream?**", (route) => {
    asked.push(route.request().url());
    // A short retry, so the page asks again soon and reads the verdicts given since.
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
      body: `retry: 100\n\n${verdicts()}${since}`,
    });
  });
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    socket = ergo;
    scriptedErgo(ergo, GUEST, HISTORY);
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(lines(page)).toHaveCount(2);
  const say = (id: string, text: string, time = new Date().toISOString()) => {
    socket?.send(`@msgid=${id};time=${time};account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :${text}`);
  };
  return { away, asked, say };
}
// A line said once the stream follows the room has its verdict from it, the server asked of none (F884); one dated
// before, said after it, marks when a request for the first would have gone.
async function asksNothingSaidSince(page: Page) {
  const asked: string[] = [];
  await page.route("**/api/verdicts?**", (route) => {
    asked.push(route.request().url());
    return route.fulfill({ json: { room: "#bubble/games", verdicts: [] } });
  });
  const { say } = await room(page, () => "");
  await expect.poll(() => asked).toHaveLength(1);
  say("v3", "now https://vimeo.com/76979871");
  await expect(lineOf(page, "now")).toContainText("Waiting for the moderation check");
  say("v4", "then https://giphy.com/gifs/4548k01F5Ej28", "2026-10-25T10:02:00.000Z");
  await expect.poll(() => asked).toHaveLength(2);
  expect(asked[1]).toBe(`${SITE}/api/verdicts?room=%23bubble%2Fgames&ids=v4`);
}
const play = (page: Page) => lineOf(page, "watch").getByRole("button", { name: "Play the YouTube video" });

test.describe("a link's player", () => {
  test("reaches no third party before the verdict and the click, then plays YouTube's privacy-enhanced player", async ({
    page,
  }) => {
    let said = "";
    const { away, asked } = await room(page, () => said);
    await expect(lineOf(page, "watch")).toContainText("Waiting for the moderation check");
    await expect(lineOf(page, "watch").getByRole("button")).toBeDisabled();
    expect(asked[0]).toBe(`${SITE}/api/stream?rooms=%23bubble%2Fgames`);
    said = event("v1", "checked");
    await expect(play(page)).toBeEnabled();
    expect(away).toEqual([]);
    await play(page).click();
    const player = lineOf(page, "watch").locator("iframe");
    await expect(player).toHaveAttribute("src", PLAYER);
    await expect(player).toHaveAttribute("title", "YouTube video");
    await expect.poll(() => away).toEqual([PLAYER]);
  });

  test("shows none for a line the moderation hid, nor for a host it does not accept", async ({ page }) => {
    const { away } = await room(page, () => event("v1", "hidden"));
    await expect(lineOf(page, "watch")).not.toContainText("Waiting for the moderation check");
    await expect(lineOf(page, "watch").getByRole("button")).toHaveCount(0);
    await expect(lineOf(page, "imgur").getByRole("button")).toHaveCount(0);
    await expect(lineOf(page, "imgur").getByRole("link", { name: "https://imgur.com/gallery/abcdefg" })).toBeVisible();
    expect(away).toEqual([]);
  });

  // F871: a hide that comes once the player plays takes the player away, the third party's frame with it.
  test("takes a playing player away when the moderation hides its line later", async ({ page }) => {
    let said = event("v1", "checked");
    await room(page, () => said);
    await play(page).click();
    const player = lineOf(page, "watch").locator("iframe");
    await expect(player).toBeVisible();
    said = event("v1", "hidden");
    await expect(player).toHaveCount(0);
    await expect(lineOf(page, "watch").getByRole("button")).toHaveCount(0);
  });

  // Alexis, 2026-10-26: a line older than the stream's replay gets its verdict from GET /api/verdicts, asked for the
  // lines in view with a player and no verdict, and answered for a room the reader may read.
  test("asks the server the verdict of a line the stream never told, and plays it once checked", async ({ page }) => {
    const asked: string[] = [];
    await page.route("**/api/verdicts?**", (route) => {
      asked.push(route.request().url());
      return route.fulfill({ json: { room: "#bubble/games", verdicts: [{ msgid: "v1", state: "checked" }] } });
    });
    const { away } = await room(page, () => "");
    await expect(play(page)).toBeEnabled();
    expect(asked).toEqual([`${SITE}/api/verdicts?room=%23bubble%2Fgames&ids=v1`]);
    expect(away).toEqual([]);
  });

  // F884: asking the server too made every reader ask for every new link at once.
  test("asks the server nothing of a line said after the page began following the room", async ({ page }) => {
    await asksNothingSaidSince(page);
  });

  // ADR-0002 §8: Data saver (a 2G link) shows no embed; and a verdict serves a player alone, so none is asked (F879).
  test("shows none to a reader who saves data, and asks no verdict", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ saveData: true }) });
    });
    const told: string[] = [];
    await page.route("**/api/verdicts?**", (route) => {
      told.push(route.request().url());
      return route.fulfill({ json: { room: "#bubble/games", verdicts: [] } });
    });
    const { asked, say } = await room(page, () => event("v1", "checked"));
    await expect(lineOf(page, "watch").getByRole("link")).toBeVisible();
    await expect(lineOf(page, "watch").getByRole("button")).toHaveCount(0);
    // A line said after, by when the page would have asked of the first ones.
    say("v3", "then https://vimeo.com/76979871", "2026-10-25T10:02:00.000Z");
    await expect(lineOf(page, "then")).toBeVisible();
    expect(asked).toEqual([]);
    expect(told).toEqual([]);
  });

  test("passes axe with a player waiting and one playing, on a computer's and a phone's screen", async ({ page }) => {
    let said = "";
    await room(page, () => said);
    expect((await new AxeBuilder({ page }).include("ol").analyze()).violations).toEqual([]);
    said = event("v1", "checked");
    await play(page).click();
    await expect(lineOf(page, "watch").locator("iframe")).toBeVisible();
    // The frame's own document is the service's (here a stand-in): axe reads the page around it.
    expect((await new AxeBuilder({ page }).include("ol").exclude("iframe").analyze()).violations).toEqual([]);
    // F881: on a phone's screen too, the frame whole inside its line, at a video's 16/9.
    await page.setViewportSize({ width: 390, height: 800 });
    expect((await new AxeBuilder({ page }).include("ol").exclude("iframe").analyze()).violations).toEqual([]);
    const frame = await lineOf(page, "watch").locator("iframe").boundingBox();
    const line = await lineOf(page, "watch").boundingBox();
    if (frame === null || line === null) throw new Error("the frame or its line has no box");
    expect(frame.x).toBeGreaterThanOrEqual(line.x);
    expect(frame.x + frame.width).toBeLessThanOrEqual(line.x + line.width);
    expect(frame.y + frame.height).toBeLessThanOrEqual(line.y + line.height);
    expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1);
  });
});
