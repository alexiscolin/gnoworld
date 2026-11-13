import type { Route } from "@playwright/test";
import { inGames, lines, word } from "./chat.ts";
import { CORS, HOME, RPC } from "./govdaoChain.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { another } from "./irc.ts";
import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";

// `/market`, `/trending` and `/proposals` typed in a room, on the real server and Ergo: the line goes to the room, every page draws it as
// the card, its data stubbed (the prices file, /api/trending, the GovDAO realm's page). A wrong command says why and sends nothing; a
// direct message has no room for them.
const json =
  (body: unknown, status = 200) =>
  (route: Route) =>
    route.fulfill({ status, headers: CORS, body: JSON.stringify(body) });
const field = (page: Page) => page.getByRole("textbox", { name: "Message #games" });
const send = (page: Page) => page.getByRole("button", { name: "Send" });
const now = () => new Date().toISOString();

const MARKETS = {
  source: "CoinGecko",
  updated: now(),
  tokens: [
    { symbol: "GNOT", usd: 0.4321, change24h: -3 },
    { symbol: "ATONE", usd: 1.25, change24h: 2.5 },
    { symbol: "BTC", usd: 65000, change24h: 0.1 },
  ],
};
const TRENDING = {
  updated: now(),
  called: 2,
  items: [
    {
      world: "demo/boards",
      title: "Boards",
      realm: "gno.land/r/demo/boards",
      owner: null,
      calls: 12,
      people: 5,
    },
    { world: "demo/shop", title: "Shop", realm: "gno.land/r/demo/shop", owner: null, calls: 1, people: 1 },
  ],
};

async function stub(page: Page, { trending = true }: { trending?: boolean } = {}): Promise<void> {
  await page.route("**/markets.json", json(MARKETS));
  await page.route("**/api/markets/history", json({ error: "not_ready" }, 404));
  await page.route("**/api/trending", trending ? json(TRENDING) : json({ error: "not_ready" }, 404));
  await page.route(RPC, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/status") return json(statusEnvelope(796379, "2026-10-31T09:46:00Z"))(route);
    return json(queryEnvelope({ data: HOME }))(route);
  });
}

async function command(page: Page, text: string): Promise<void> {
  await field(page).click();
  await field(page).pressSequentially(text);
  await send(page).click();
}

test.describe("the card commands", () => {
  test("/market gnot sends the card's line and draws one row", async ({ page }) => {
    await stub(page);
    await inGames(page);
    await command(page, "/market gnot");
    // The stack's room keeps other journeys' lines, and runs beside them: the card of GNOT alone is this one's.
    const card = page.locator('[data-market-card]:has([data-token="GNOT"]):not(:has([data-token="BTC"]))').first();
    await expect(card).toBeVisible();
    await expect(card.locator("[data-token]")).toHaveCount(1);
    await expect(card.locator('[data-token="GNOT"]')).toContainText("0.43");
    await expect(card.locator('[data-token="GNOT"]')).toContainText("3.0% · 24 h");
  });

  test("/market alone draws the three tokens", async ({ page }) => {
    await stub(page);
    await inGames(page);
    await command(page, "/market");
    // The room runs beside other tests' cards: one with all three tokens is this one's.
    const card = page.locator('[data-market-card]:has([data-token="GNOT"]):has([data-token="BTC"])').first();
    await expect(card.locator("[data-token]")).toHaveCount(3);
  });

  test("/trending draws the ranking, and says it is not available while the route is off (404)", async ({ page }) => {
    await stub(page);
    await inGames(page);
    await command(page, "/trending");
    const card = page.locator("[data-trending-card]").last();
    await expect(card.getByRole("listitem")).toHaveCount(2);
    await expect(card).toContainText("12 calls");
    await expect(card).toContainText("1 call");
    await expect(card).toContainText("2 worlds called");

    const off = await page.context().newPage();
    await stub(off, { trending: false });
    await off.goto("/w/bubble?room=games&chat=full");
    await expect(off.locator("[data-trending-card]").last()).toBeVisible();
    await expect(off.locator("[data-trending-card]").last()).toContainText(
      "The ranking is not available yet. Check back in a few minutes.",
    );
    await off.close();
  });

  test("/proposals draws GovDAO's open proposals, each with its Vote", async ({ page }) => {
    await stub(page);
    await inGames(page);
    await command(page, "/proposals");
    const card = page.locator("[data-proposals-card]").last();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Open GovDAO");
    await expect(card.getByRole("link", { name: /Prop #\d+|Set validator|Set node halt/ }).first()).toBeVisible();
  });

  test("a wrong command says why in the field and sends nothing", async ({ page }) => {
    await stub(page);
    await inGames(page);
    await field(page).click();
    await field(page).pressSequentially("/market doge");
    await expect(page.getByText("/market takes one token: gnot, atone or btc.").first()).toBeVisible();
    await expect(send(page)).toBeDisabled();
    await field(page).fill("/trending x");
    await expect(page.getByText("/trending takes nothing more.").first()).toBeVisible();
    await expect(send(page)).toBeDisabled();
    await field(page).press("Enter");
    // Nothing was said: not as the words, and not as a card of them.
    await expect(lines(page).filter({ hasText: /\/(market doge|trending x)/ })).toHaveCount(0);
    await expect(field(page)).toContainText("/trending x");
  });

  test("a direct message has no card commands: nothing is drawn", async ({ page, playwright, launchOptions }) => {
    await stub(page);
    await inGames(page);
    const bob = await another({ playwright, launchOptions }, word("bob"));
    await page.goto(`/w/bubble?dm=${bob.address}&chat=full`);
    const dm = page.getByRole("textbox", { name: /^Message / });
    await dm.click();
    await dm.pressSequentially("/market gnot");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByText("/market is not a command. /me sends an action.").first()).toBeVisible();
    await expect(send(page)).toBeDisabled();
    await expect(page.locator("[data-market-card]")).toHaveCount(0);
    await bob.close();
  });
});
