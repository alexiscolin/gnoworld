import AxeBuilder from "@axe-core/playwright";
import { lineOf, lines } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { scriptedErgo, type HistoryLine } from "./scripted.ts";
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

async function room(page: Page, verdicts: () => string): Promise<{ away: string[]; asked: string[] }> {
  const away: string[] = [];
  const asked: string[] = [];
  const site = new URL(SITE).host;
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
      body: `retry: 100\n\n${verdicts()}`,
    });
  });
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, GUEST, HISTORY);
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(lines(page)).toHaveCount(2);
  return { away, asked };
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

  // ADR-0002 §8: Data saver (a 2G link) shows no embed.
  test("shows none to a reader who saves data", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ saveData: true }) });
    });
    await room(page, () => event("v1", "checked"));
    await expect(lineOf(page, "watch").getByRole("link")).toBeVisible();
    await expect(lineOf(page, "watch").getByRole("button")).toHaveCount(0);
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
    await page.setViewportSize({ width: 390, height: 800 });
    const box = await lineOf(page, "watch").locator("iframe").boundingBox();
    expect(box !== null && box.width <= 390).toBe(true);
  });
});
