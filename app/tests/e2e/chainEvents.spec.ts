import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// Slice 9g (frames 20 to 35 and 90 to 97): a line in the GovDAO room, the ticker's deploy, the Earth's 24 h count, each with its block
// and none before its event. The page is handed the stream's frames a server would send and waits on the stream's own response.
// Guests only: no journey but arrival.spec.ts may open /w/govdao logged in (D210).
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const SINCE = `event: since\ndata: ${JSON.stringify({ time: "2026-11-05T12:00:00.000Z" })}\n\n`;
const frame = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const CALL = {
  kind: "call",
  universe: "onyx",
  world: "govdao",
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: ALICE,
  height: 900030,
};
const DEPLOY = { kind: "deploy", universe: "onyx", realm: `gno.land/r/${ALICE}/counter`, actor: ALICE, height: 887427 };

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
  test(`a call to GovDAO's realm is a line of its room with its block, on a ${size}, with no axe violation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await streamOf(page, `${frame("chain", CALL)}${SINCE}`);
    await page.goto("/w/govdao");
    await hydrated(page);
    const lines = page.getByRole("list", { name: "On chain" });
    await expect(lines).toBeVisible();
    await expect(lines.getByText("MustVoteOnProposal")).toBeVisible();
    await expect(lines.getByText("block 900030")).toBeVisible();
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
  await expect(page.getByRole("list", { name: "On chain" })).toHaveCount(0);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
});

test("a call to another world's realm is not a line of this room", async ({ page }) => {
  await streamOf(page, `${frame("chain", { ...CALL, world: "bubble" })}${frame("chain", CALL)}${SINCE}`);
  await page.goto("/w/govdao");
  await hydrated(page);
  const items = page.getByRole("list", { name: "On chain" }).getByRole("listitem");
  await expect(items).toHaveCount(1);
});

// Red pass: the Earth and the ticker are walked at both sizes, with no sideways scroll, the ticker's strip among them.
for (const [size, width, height] of SIZES) {
  test(`the Earth says its realms of the last 24 h with the block, on a ${size}, with no axe violation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await streamOf(page, `${frame("realms", { universe: "onyx", count: 17, height: 908297 })}${SINCE}`);
    await page.goto("/earth");
    await hydrated(page);
    await expect(page.getByText(/17 realms deployed in the last 24 h/)).toBeVisible();
    await expect(page.getByText("block 908297")).toBeVisible();
    expect(await violations(page)).toEqual([]);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
  });

  test(`the ticker shows a deploy of the chain with its block, linked to the realm's page, on a ${size}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await streamOf(page, `${frame("chain", DEPLOY)}${SINCE}`);
    await page.goto("/");
    await hydrated(page);
    const ticker = page.locator("[data-ticker]");
    await expect(ticker.locator("[data-kind='chain']").first()).toBeVisible();
    await expect(ticker.getByText("block 887427").first()).toBeAttached();
    await expect(ticker.locator(`a[href='/r/${ALICE}/counter']`).first()).toBeAttached();
    expect(await violations(page)).toEqual([]);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
  });
}
