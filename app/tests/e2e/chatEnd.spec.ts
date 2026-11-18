import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { live, room, T } from "./scriptedRoom.ts";
import type { HistoryLine } from "./scripted.ts";

// A room opens at its newest line and stays there as that line's card comes late; a reader who scrolled up is left where they are.
const MARKETS = {
  source: "CoinGecko",
  updated: new Date().toISOString(),
  tokens: [{ symbol: "GNOT", usd: 0.43, change24h: -3 }],
};
const HISTORY: readonly HistoryLine[] = [
  ...Array.from({ length: 30 }, (_, i): HistoryLine => [`h${String(i)}`, T(i), `line number ${String(i)}`]),
  ["card", T(31), "💹 Market prices"],
];
const gap = (list: Locator) => list.evaluate((box) => Math.round(box.scrollHeight - box.scrollTop - box.clientHeight));

test("a room opens at its end and stays there as a late card comes in", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/markets.json", async (route) => {
    await held;
    await route.fulfill({ json: MARKETS, headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("**/api/markets/history", (route) => route.fulfill({ status: 404, json: { error: "not_ready" } }));
  const { ergo } = await room(page, { history: HISTORY });
  const list = page.getByRole("list", { name: "Messages" });
  await expect.poll(() => gap(list)).toBeLessThan(4);
  const before = await list.evaluate((box) => box.scrollHeight);
  release();
  await expect(page.locator('[data-market-card] [data-token="GNOT"]')).toBeVisible();
  expect(await list.evaluate((box) => box.scrollHeight)).toBeGreaterThan(before);
  await expect.poll(() => gap(list)).toBeLessThan(4);
  // Scrolled up, a line that comes moves nothing.
  // The scroll event comes with the next frame: wait for it before the line.
  await list.evaluate(async (box) => {
    box.scrollTop = 0;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  await expect.poll(() => list.evaluate((box) => box.scrollTop)).toBe(0);
  ergo().send(live("later", T(40), { text: "a later line" }));
  await expect(page.getByText("a later line")).toBeAttached();
  expect(await list.evaluate((box) => box.scrollTop)).toBe(0);
});

// WebKit anchors no scroll, and Chromium is asked not to here: a second card grows after the list moved to its end for the
// first and before that move's scroll event, which then finds the list off its end (Safari showed a room mid-history).
test("a room stays at its end when two cards grow a frame apart, with no scroll anchoring", async ({ page }) => {
  await room(page, { history: HISTORY.slice(0, 30) });
  const list = page.getByRole("list", { name: "Messages" });
  await expect.poll(() => gap(list)).toBeLessThan(4);
  const height = await list.evaluate(async (box) => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    const grow = (at: number) => {
      const line = box.children[at];
      if (line instanceof HTMLElement) line.style.setProperty("min-block-size", "200px");
    };
    box.style.setProperty("overflow-anchor", "none");
    grow(5);
    await frame();
    // After this frame's ResizeObserver, before the next frame's scroll event.
    await new Promise((done) => setTimeout(done, 0));
    grow(10);
    await frame();
    await frame();
    return box.scrollHeight;
  });
  expect(height).toBeGreaterThan(400);
  expect(await gap(list)).toBeLessThan(4);
});
