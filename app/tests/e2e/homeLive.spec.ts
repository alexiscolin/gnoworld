import AxeBuilder from "@axe-core/playwright";
import { statusEnvelope } from "../chain/chainEnvelopes.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box, near } from "./geometry.ts";

// Slice 5m, overlays on frames 1 and 6 (docs/design/video-screens.md), at 1728 by 1080: the actions at 876 to 928, the live
// line's rule at 950 and its box ending at 1016, the ticker 34 px high at the foot, its pause a 34 px square. No "people online".
const RPC = "https://rpc.onyx.testnets.gno.land/**";
const MARKETS = {
  source: "CoinGecko",
  updated: new Date(Date.now() - 4 * 60_000).toISOString(),
  tokens: [
    { symbol: "GNOT", usd: 1.234, change24h: 3.1 },
    { symbol: "ATONE", usd: 0.4321, change24h: -2.4 },
    { symbol: "BTC", usd: 67123.456, change24h: 4.2 },
  ],
};
const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };

interface Options {
  /** The file's content; none is a 404. */
  markets?: unknown;
  /** The file's answer as it is sent, whatever its content (a status and a body). */
  raw?: { status: number; body: string };
  /** The chain's answer: a block, or a 503. */
  chain?: "ok" | "down" | "wrong";
  /** The instant the block was made 3 minutes before, as an ISO time; the real clock when none. */
  at?: string;
  /** The RPC host asked, by its pattern: the universe's own. */
  rpc?: string;
  /** Both answers wait for it, as a slow network would. */
  gate?: Promise<void>;
}

/** The two reads of the home, answered as a browser would get them; counted. */
async function answers(page: Page, options: Options = {}) {
  const asked = { markets: 0, status: 0 };
  await page.route("**/markets.json", async (route) => {
    asked.markets += 1;
    await options.gate;
    if (options.raw) await route.fulfill({ headers: cors, ...options.raw });
    else if (options.markets === undefined) await route.fulfill({ status: 404, body: "not found" });
    else await route.fulfill({ headers: cors, body: JSON.stringify(options.markets) });
  });
  await page.route(options.rpc ?? RPC, async (route) => {
    asked.status += 1;
    await options.gate;
    if (options.chain === "down") await route.fulfill({ status: 503, headers: cors, body: "{}" });
    else if (options.chain === "wrong") await route.fulfill({ headers: cors, body: '{"result":{"unexpected":true}}' });
    else
      await route.fulfill({
        headers: cors,
        body: JSON.stringify(
          statusEnvelope(
            1203885,
            new Date(Date.parse(options.at ?? new Date().toISOString()) - 3 * 60_000).toISOString(),
          ),
        ),
      });
  });
  return asked;
}
/** The home with its two reads answered, hydrated. */
async function openHome(page: Page, options: Options = { markets: MARKETS }, path = "/") {
  const asked = await answers(page, options);
  await page.goto(path);
  await hydrated(page);
  return asked;
}
const style = (page: Page, selector: string, property: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);

test.describe("the home at the video's size", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  test("the live line sits under the actions, the actions move up, and the hero still ends 64 px from the bottom (frame 6)", async ({
    page,
  }) => {
    await openHome(page);
    const row = page.locator("[data-hero='markets']");
    await expect(row.locator("[data-token]")).toHaveCount(3);
    const live = await box(page, "[data-hero='markets']");
    const first = await box(page, "[data-hero='actions'] a >> nth=0");
    near(live.x, 48, "the live line's left, the hero's");
    near(first.y, 876, "the actions' top");
    near(first.y + first.height, 928, "the actions' bottom");
    near(live.y, 950, "the live line's rule, 22 px under the actions");
    near(live.y - (first.y + first.height), 22, "the gap between the actions and the live line");
    near(1080 - (live.y + live.height), 64, "the hero's bottom gap, now the live line's");
    expect(await style(page, "[data-hero='markets']", "border-top-width")).toBe("1px");
  });

  test("the live line holds the tokens in the video's order, then the block, each left of the next", async ({
    page,
  }) => {
    await openHome(page);
    const row = page.locator("[data-hero='markets']");
    await expect(row.locator("[data-height]")).toHaveText("1,203,885");
    const lefts: number[] = [];
    for (const name of ["GNOT", "ATONE", "BTC"]) lefts.push((await box(page, `[data-token='${name}']`)).x);
    lefts.push((await box(page, "[data-height]")).x);
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    near(lefts[0] ?? 0, 48, "the first token's left");
    await expect(row).toContainText("CoinGecko");
    await expect(row).toContainText(/\$1\.23\b/);
    await expect(row).not.toContainText(/online/i);
  });

  test("leaves a token with no price out, and the live line keeps its height whatever it holds (no jump)", async ({
    page,
  }) => {
    await answers(page, { markets: { ...MARKETS, tokens: [MARKETS.tokens[0], MARKETS.tokens[2]] } });
    await page.goto("/");
    await hydrated(page);
    await expect(page.locator("[data-token]")).toHaveCount(2);
    await expect(page.locator("[data-token='ATONE']")).toHaveCount(0);
    const withPrices = (await box(page, "[data-hero='markets']")).height;
    // The file missing: a state in words, in the same box.
    const other = await page.context().newPage();
    await answers(other);
    await other.goto("/");
    await hydrated(other);
    await expect(other.locator("[data-markets='missing']")).toBeVisible();
    await expect(other.locator("[data-token]")).toHaveCount(0);
    near(
      (await box(other, "[data-hero='markets']")).height,
      withPrices,
      "the live line's height with the file missing",
    );
    const first = await box(other, "[data-hero='actions'] a >> nth=0");
    near(first.y, 876, "the actions' top with the file missing: the line is there as a state, not a gap");
  });

  test("reads the file and the block height once a load, and nothing more as time passes", async ({ page }) => {
    const asked = await openHome(page);
    await expect(page.locator("[data-height]")).toBeVisible();
    await page.waitForTimeout(3000);
    expect(asked).toEqual({ markets: 1, status: 1 });
  });

  test("draws the ticker 34 px high across the foot of the page, its pause a 34 px square at the left (frame 6)", async ({
    page,
  }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    const strip = await box(page, "[data-ticker]");
    near(strip.x, 0, "the ticker's left");
    near(strip.width, 1728, "the ticker's width");
    near(strip.height, 34, "the ticker's height");
    near(strip.y + strip.height, 1080, "the ticker's foot");
    expect(await style(page, "[data-ticker]", "position")).toBe("fixed");
    expect(await style(page, "[data-ticker]", "border-top-width")).toBe("1px");
    const pause = await box(page, "[data-ticker] button");
    near(pause.x, 0, "the pause's left");
    near(pause.width, 34, "the pause's width");
    near(pause.height, 34, "the pause's height");
    expect(await style(page, "[data-ticker] a", "font-size")).toBe("11.5px");
    expect(await style(page, "[data-ticker] a", "font-family")).toMatch(/mono/i);
  });

  test("scrolls every title past the pause: at the end of a pass the whole line has left, the last link included", async ({
    page,
  }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    const links = page.locator("[data-ticker] a");
    expect(await links.count()).toBeGreaterThan(3);
    // A pass takes 60 s: the animation is put 10 ms from its end, and held there.
    await page.locator("[data-ticker-track]").evaluate((track) => {
      for (const each of track.getAnimations()) {
        each.pause();
        each.currentTime = 59_990;
      }
    });
    const clip = await box(page, "[data-ticker] button");
    const last = await box(page, "[data-ticker] a >> nth=-1");
    expect(last.x + last.width, "the last title's right edge, against the pause's right edge").toBeLessThanOrEqual(
      clip.x + clip.width + 1,
    );
    const first = await box(page, "[data-ticker] a >> nth=0");
    expect(first.x + first.width).toBeLessThanOrEqual(clip.x + clip.width + 1);
  });

  test("stands still under the pointer and under keyboard focus, so a link does not move while it is aimed at", async ({
    page,
  }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    const state = () => style(page, "[data-ticker-track]", "animation-play-state");
    expect(await state()).toBe("running");
    // The line moves, so the pointer goes to the strip's middle rather than to a link, which Playwright would wait on.
    await page.mouse.move(864, 1080 - 17);
    expect(await state()).toBe("paused");
    await page.mouse.move(5, 5);
    expect(await state()).toBe("running");
    await page.locator("[data-ticker] a").first().focus();
    expect(await state()).toBe("paused");
    await page.locator("[data-ticker] a").first().blur();
    expect(await state()).toBe("running");
  });

  test("pauses the strip with its button, and plays it again", async ({ page }) => {
    await openHome(page);
    const track = "[data-ticker-track]";
    await expect(page.locator(track)).toBeAttached();
    expect(await style(page, track, "animation-play-state")).toBe("running");
    await page.getByRole("button", { name: "Pause the ticker" }).click();
    expect(await style(page, track, "animation-play-state")).toBe("paused");
    await expect(page.getByRole("button", { name: "Play the ticker" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Play the ticker" }).click();
    // The pointer stays over the strip, which stands still under it (the prototype's #ticker:hover): it plays once the pointer leaves.
    await page.mouse.move(864, 400);
    expect(await style(page, track, "animation-play-state")).toBe("running");
  });

  test("keeps the strip still for a visitor who asks for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHome(page);
    await expect(page.locator("[data-ticker-track]")).toBeAttached();
    expect(await style(page, "[data-ticker-track]", "animation-name")).toBe("none");
  });

  test("keeps the strip out of the way of the hero: the actions stay above it and take the click", async ({ page }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    const strip = await box(page, "[data-ticker]");
    const live = await box(page, "[data-hero='markets']");
    expect(live.y + live.height).toBeLessThanOrEqual(strip.y);
    await page.getByRole("link", { name: /go explore/i }).click();
    await expect(page).toHaveURL(/\/earth$/);
  });

  test("has no accessibility violation, the live line and the ticker included", async ({ page }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    const found = await new AxeBuilder({ page }).analyze();
    expect(found.violations.map((each) => each.id)).toEqual([]);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test("the ticker is 34 px high above the views' bar, and the page does not scroll sideways", async ({ page }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    const strip = await box(page, "[data-ticker]");
    near(strip.height, 34, "the ticker's height");
    near(strip.y + strip.height, 844 - 76, "the ticker's foot, over the views' bar (44 px, 16 over and 16 under it)");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the last world link can be scrolled above the ticker, and nothing is covered", async ({ page }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const strip = await box(page, "[data-ticker]");
    const last = await box(page, "nav[aria-label='Worlds'] a >> nth=-1");
    expect(last.y + last.height).toBeLessThanOrEqual(strip.y);
    // The page holds room under its list for the strip, so a longer list still scrolls clear of it.
    const room = Number.parseFloat(await style(page, "nav[aria-label='Worlds']", "padding-bottom"));
    expect(room).toBeGreaterThanOrEqual(strip.height);
  });

  test("hides the live line, as the prototype's does under 900 px, and has no accessibility violation", async ({
    page,
  }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    await expect(page.locator("[data-hero='markets']")).toBeHidden();
    const found = await new AxeBuilder({ page }).analyze();
    expect(found.violations.map((each) => each.id)).toEqual([]);
  });
});

// Frame 1 is the opening (the ticker at the foot, the reads on their way) and frame 6 the settled home. What the frames draw
// and is not built, on purpose: the sparklines beside each price, and the second line under the block ("every ~2 s"), which
// would be a poll; the page reads once.
const MAINNET = "https://rpc.gno.land/**";
const ONYX = "https://rpc.onyx.testnets.gno.land/**";

test.describe("the home's live line at every stage and in every universe", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  test("under /net/gnoland the block is read from the mainnet's chain, and Onyx's is never asked", async ({ page }) => {
    const asked = await answers(page, { markets: MARKETS, rpc: MAINNET });
    let onyx = 0;
    await page.route(ONYX, async (route) => {
      onyx += 1;
      await route.abort();
    });
    await page.goto("/net/gnoland");
    await hydrated(page);
    await expect(page.locator("[data-height]")).toHaveText("1,203,885");
    expect(asked.status).toBe(1);
    expect(onyx).toBe(0);
  });

  test("frame 1: while the reads are on their way, the ticker is at the foot and the actions are where they stay", async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    await answers(page, { markets: MARKETS, gate: new Promise<void>((resolve) => (release = resolve)) });
    await page.goto("/");
    await hydrated(page);
    await expect(page.locator("[data-markets='loading']")).toBeVisible();
    const strip = await box(page, "[data-ticker]");
    near(strip.height, 34, "the ticker's height in the opening");
    near(strip.y + strip.height, 1080, "the ticker's foot in the opening");
    near((await box(page, "[data-hero='actions'] a >> nth=0")).y, 876, "the actions' top in the opening");
    release();
    await expect(page.locator("[data-token]")).toHaveCount(3);
  });

  // Every state of the line keeps the box and the actions where they are: nothing moves when the answers come.
  const STATES: [string, Options][] = [
    ["prices and a block", { markets: MARKETS }],
    ["no token with a price", { markets: { ...MARKETS, tokens: [] } }],
    ["the file missing", {}],
    ["the file failing (500)", { raw: { status: 500, body: "" } }],
    ["the file malformed", { raw: { status: 200, body: "{" } }],
    ["the chain failing", { markets: MARKETS, chain: "down" }],
  ];
  for (const [name, options] of STATES) {
    test(`keeps the live line's box and the actions still from loading to ${name}`, async ({ page }) => {
      let release: () => void = () => undefined;
      await answers(page, { ...options, gate: new Promise<void>((resolve) => (release = resolve)) });
      await page.goto("/");
      await hydrated(page);
      await expect(page.locator("[data-markets='loading']")).toBeVisible();
      const loadingBox = await box(page, "[data-hero='markets']");
      const loadingActions = await box(page, "[data-hero='actions'] a >> nth=0");
      release();
      await expect(page.locator("[data-markets='loading']")).toHaveCount(0);
      await expect(page.locator("[data-block] >> text=Reading the chain")).toHaveCount(0);
      const settled = await box(page, "[data-hero='markets']");
      const actions = await box(page, "[data-hero='actions'] a >> nth=0");
      near(settled.y, loadingBox.y, "the live line's top");
      near(settled.height, loadingBox.height, "the live line's height");
      near(actions.y, loadingActions.y, "the actions' top");
      near(actions.y, 876, "the actions' top, the frame's");
    });
  }

  test("a wrong-shape chain and a missing file stay inside the live line's box, at 900 px as at 1728", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await openHome(page, { chain: "wrong" });
    await expect(page.locator("[data-block]")).toContainText(/try again|report it/i);
    await expect(page.locator("[data-markets='missing']")).toBeVisible();
    const inside = await page.locator("[data-hero='markets']").evaluate((live) => {
      const frame = live.getBoundingClientRect();
      const out = [...live.querySelectorAll("*")].filter(
        (el) => el.getBoundingClientRect().bottom > frame.bottom + 0.5,
      );
      return { fits: live.scrollHeight <= live.clientHeight, out: out.map((el) => el.tagName) };
    });
    expect(inside).toEqual({ fits: true, out: [] });
  });

  test("the live line looks as approved, the moving words masked", async ({ page }) => {
    // The clock is held, so the times' words are the same each run, and the masks as wide.
    const at = "2026-10-31T06:07:00.000Z";
    await page.clock.install({ time: new Date(at) });
    await openHome(page, { markets: { ...MARKETS, updated: "2026-10-31T06:03:00.000Z" }, at });
    await expect(page.locator("[data-height]")).toBeVisible();
    await expect(page.locator("[data-hero='markets']")).toHaveScreenshot("home-live-line.png", {
      mask: [page.locator("[data-hero='markets'] time")],
    });
  });

  test("the ticker looks as approved, at rest", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    await expect(page.locator("[data-ticker]")).toHaveScreenshot("home-ticker.png");
  });
});
