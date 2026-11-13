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
