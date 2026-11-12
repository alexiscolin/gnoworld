import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// Slice 9g (frames 20 to 35 and 90 to 97): a line in the GovDAO room with its block and none before its event. The page is handed the stream's frames a server would send and waits on the stream's own response.
// Guests only: no journey but arrival.spec.ts may open /w/govdao logged in (D210).
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const SINCE = `event: since\ndata: ${JSON.stringify({ time: "2026-11-05T12:00:00.000Z" })}\n\n`;
const frame = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const CALL = {
  id: "h900030:0",
  kind: "call",
  universe: "onyx",
  world: "govdao",
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: ALICE,
  height: 900030,
};

const SIZES = [
  ["phone", 390, 844],
  ["computer", 1280, 800],
] as const;
const violations = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations;
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const streamOf = (page: Page, body: string) =>
  page.route("**/api/stream?*", (route) => route.fulfill({ contentType: "text/event-stream", body }));
const streamAnswered = (page: Page) => page.waitForResponse((r) => r.url().includes("/api/stream?"));

for (const [size, width, height] of SIZES) {
  test(`a call to GovDAO's realm is a card of its room's thread with its block, on a ${size}, with no axe violation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await streamOf(page, `${frame("chain", CALL)}${SINCE}`);
    await page.goto("/w/govdao");
    await hydrated(page);
    // A card of the room's thread in the chat, not a line of the plate (frames 25 and 27).
    const card = page.locator("#chat [data-chain]");
    await expect(card).toBeVisible();
    await expect(card.getByText(/MustVoteOnProposal/)).toBeVisible();
    await expect(card.getByText(/block 900030/)).toBeVisible();
    await expect(page.locator("#chat").getByRole("list", { name: "Messages" }).locator("[data-chain]")).toHaveCount(1);
    expect(await violations(page)).toEqual([]);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
  });
}

test("a room shows no chain line before its chain event, and a hostile frame is no line", async ({ page }) => {
  await streamOf(page, `${frame("chain", { ...CALL, func: "<img src=x onerror=alert(1)>" })}${SINCE}`);
  const stream = streamAnswered(page);
  await page.goto("/w/govdao");
  await hydrated(page);
  await stream;
  await expect(page.locator("[data-chain]")).toHaveCount(0);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
});

test("a call to another world's realm is not a line of this room", async ({ page }) => {
  await streamOf(page, `${frame("chain", { ...CALL, world: "bubble" })}${frame("chain", CALL)}${SINCE}`);
  await page.goto("/w/govdao");
  await hydrated(page);
  await expect(page.locator("[data-chain]")).toHaveCount(1);
});
