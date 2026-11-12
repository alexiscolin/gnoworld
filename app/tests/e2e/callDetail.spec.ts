import { expect, hydrated, test, type Page } from "./fixtures.ts";

// A chain line's Details: the call's own read (/api/calls/<hash>/<index>) shown in the panel the link opens, and each way that read fails.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const HASH = "A".repeat(42) + "B";
const SINCE = `event: since\ndata: ${JSON.stringify({ time: "2026-11-05T12:00:00.000Z" })}\n\n`;
const CALL = {
  id: `${HASH}:0`,
  kind: "call",
  universe: "onyx",
  world: "govdao",
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: ALICE,
  height: 900030,
};
const DETAIL = {
  height: 900030,
  time: "2026-11-05T12:00:30.000Z",
  caller: ALICE,
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  success: true,
  error: null,
  gas: { used: 123456, wanted: 800000 },
  fee: { amount: 1000000, denom: "ugnot" },
  send: null,
  memo: null,
  args: ["7", "YES"],
  moreArgs: 3,
  events: [{ type: "VoteAdded", attrs: [{ key: "proposal", value: "7" }] }],
  moreEvents: 2,
};

async function open(page: Page, answer: { status: number; body: unknown }) {
  const asked: string[] = [];
  await page.route("**/api/calls/**", (route) => {
    asked.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: answer.status,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answer.body),
    });
  });
  await page.route("**/api/stream?*", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `event: chain\ndata: ${JSON.stringify(CALL)}\n\n${SINCE}`,
    }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/w/govdao");
  await hydrated(page);
  const card = page.locator("#chat [data-chain]");
  await expect(card).toBeVisible();
  await card.getByText("Details").click();
  return { asked };
}

test("a chain line's Details show the call's arguments, events, gas, fee and block", async ({ page }) => {
  const { asked } = await open(page, { status: 200, body: DETAIL });
  const text = page.locator("body");
  await expect(text).toContainText("Succeeded");
  await expect(text).toContainText("0: 7");
  await expect(text).toContainText("1: YES");
  await expect(text).toContainText("and 3 more");
  await expect(text).toContainText("VoteAdded (proposal: 7)");
  await expect(text).toContainText("and 2 more");
  await expect(text).toContainText("Gas 123,456 of 800,000 wanted; fee 1,000,000 ugnot");
  await expect(text).toContainText("block 900,030 · 2026-11-05 12:00 UTC");
  expect(asked).toEqual([`/api/calls/${HASH}/0`]);
});

test("a failed call's Details say it failed, with the chain's error", async ({ page }) => {
  await open(page, { status: 200, body: { ...DETAIL, success: false, error: "panic: not a member" } });
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await expect(page.getByText("panic: not a member")).toBeVisible();
});

for (const [name, status, body] of [
  ["a hash the indexer does not hold", 404, { error: "not_found" }],
  ["a visitor asking too fast", 429, { error: "too_many" }],
  ["the route off", 404, { error: "not_ready" }],
] as const)
  test(`Details of ${name} tell an error in place, with a way to try again`, async ({ page }) => {
    const { asked } = await open(page, { status, body });
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
    await expect(page.getByText("Succeeded")).toHaveCount(0);
    const before = asked.length;
    await page.getByRole("button", { name: /try again/i }).click();
    await expect.poll(() => asked.length).toBeGreaterThan(before);
  });
