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
const PLAYER = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1";
const event = (msgid: string, state: "checked" | "hidden") =>
  `id: 1\nevent: verdict\ndata: ${JSON.stringify({ msgid, room: "#bubble/games", state })}\n\n`;

interface Room {
  away: string[];
  asked: string[];
  /** A line said in #games now, as Ergo sends it live; at `time` if given. */
  say: (id: string, text: string, time?: string) => void;
}

// #games opened, its stream answering `verdicts()`, or `status` when not 200.
async function room(page: Page, verdicts: () => string, status = 200): Promise<Room> {
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
    if (status !== 200) return route.fulfill({ status });
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
    await expect(lineOf(page, "watch").getByRole("status")).toHaveText("Waiting for the moderation check…");
    await expect(lineOf(page, "watch").getByRole("button")).toHaveCount(0);
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

  // F890: the page dated the stream's opening by its own clock; five minutes ahead, it asked of a line said since.
  test("asks the server nothing of a line said after the stream began, the page's clock five minutes ahead", async ({
    page,
  }) => {
    await page.clock.install({ time: Date.now() + 5 * 60_000 });
    await asksNothingSaidSince(page);
  });

  // U1, U10 (F895, F899): Play swapped the card for the frame, the focus fell to the page, and the frame of a line near
  // the list's end opened below the list's view.
  test("gives the player the focus and its whole frame in the list's view on Play", async ({ page }) => {
    let said = "";
    const { say } = await room(page, () => said);
    for (let n = 0; n < 12; n += 1) say(`f${String(n)}`, `line ${String(n)}`);
    said = event("v9", "checked");
    say("v9", "last https://youtu.be/dQw4w9WgXcQ");
    const button = lineOf(page, "last").getByRole("button", { name: "Play the YouTube video" });
    await expect(button).toBeEnabled();
    await button.press("Enter");
    const frame = lineOf(page, "last").locator("iframe");
    await expect(frame).toBeFocused();
    await expect(async () => {
      const [box, list] = [await frame.boundingBox(), await page.getByRole("list", { name: "Messages" }).boundingBox()];
      if (box === null || list === null) throw new Error("the frame or the list has no box");
      expect(box.y).toBeGreaterThanOrEqual(list.y);
      expect(box.y + box.height).toBeLessThanOrEqual(list.y + list.height + 1);
    }).toPass();
  });

  // U7 (F1053): an animation looped for good, a video played on, and nothing on the page stopped them.
  test("stops a player on its reader's word, the frame gone and the focus back on Play", async ({ page }) => {
    const { away } = await room(page, () => event("v1", "checked"));
    await play(page).click();
    await expect(lineOf(page, "watch").locator("iframe")).toBeVisible();
    await lineOf(page, "watch").getByRole("button", { name: "Close the player" }).click();
    await expect(lineOf(page, "watch").locator("iframe")).toHaveCount(0);
    await expect(play(page)).toBeFocused();
    expect(away).toEqual([PLAYER]);
  });

  // U5 (F896): a hide that took away the player holding the focus left it on the page, where the reader lost it.
  test("gives the focus back to the Messages list when a hide takes away the player holding it", async ({ page }) => {
    let said = event("v1", "checked");
    await room(page, () => said);
    await play(page).press("Enter");
    await expect(lineOf(page, "watch").locator("iframe")).toBeFocused();
    said = event("v1", "hidden");
    await expect(lineOf(page, "watch").locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Messages" })).toBeFocused();
  });

  // F888: the stream given up (a 429: a fifth tab, a shared address), a line said since waited for good.
  test("asks the server of a line said after the stream began once the browser gave the stream up", async ({
    page,
  }) => {
    const asked: string[] = [];
    await page.route("**/api/verdicts?**", (route) => {
      asked.push(route.request().url());
      const ids = new URL(route.request().url()).searchParams.get("ids")?.split(",") ?? [];
      return route.fulfill({
        json: { room: "#bubble/games", verdicts: ids.map((msgid) => ({ msgid, state: "checked" })) },
      });
    });
    const { say } = await room(page, () => "", 429);
    say("v3", "now https://vimeo.com/76979871");
    await expect(lineOf(page, "now").getByRole("button", { name: "Play the Vimeo video" })).toBeEnabled();
    expect(asked.some((url) => url.endsWith("ids=v3"))).toBe(true);
  });

  // F889: no verdict from the stream or the server, the card waited for good; now it says it could not check.
  test("says it could not check a link whose verdict never comes", async ({ page }) => {
    await page.clock.install();
    await page.route("**/api/verdicts?**", (route) => route.fulfill({ json: { room: "#bubble/games", verdicts: [] } }));
    await room(page, () => "");
    await expect(lineOf(page, "watch")).toContainText("Waiting for the moderation check");
    await page.clock.fastForward(15_000);
    await expect(lineOf(page, "watch")).toContainText("Couldn't check this link");
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

  // F893 (CR6): Data saver was read once by the asker, at every render by the lines: switched off after the page
  // opened, a new line offered a card that waited for good on a stream never opened.
  test("offers no player while the page runs once it opened saving data, whatever the browser says later", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Reflect.set(window, "saving", true);
      Object.defineProperty(Navigator.prototype, "connection", {
        configurable: true,
        get: () => ({ saveData: Reflect.get(window, "saving") === true }),
      });
    });
    const { say } = await room(page, () => event("v3", "checked"));
    await page.evaluate(() => Reflect.set(window, "saving", false));
    say("v3", "then https://vimeo.com/76979871");
    await expect(lineOf(page, "then").getByRole("link")).toBeVisible();
    await expect(lineOf(page, "then").getByRole("button")).toHaveCount(0);
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
