import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box, near } from "./geometry.ts";

// Slice 5m, overlays on frames 1 and 6 (docs/design/video-screens.md), at 1728 by 1080: the actions at 876 to 928, the live
// line's rule at 950 and its box ending at 1016, the ticker 34 px high at the foot, its pause a 34 px square. No "people online".
const MARKETS = {
  source: "CoinGecko",
  updated: new Date(Date.now() - 4 * 60_000).toISOString(),
  tokens: [
    { symbol: "GNOT", usd: 1.234, change24h: 3.1 },
    { symbol: "ATONE", usd: 0.4321, change24h: -2.4 },
    { symbol: "BTC", usd: 67123.456, change24h: 4.2 },
  ],
  // The default universe's latest block, as the server's timer writes it with the prices (decision of 2026-10-31).
  block: { height: 1203885, time: new Date(Date.now() - 3 * 60_000).toISOString(), host: "rpc.onyx.testnets.gno.land" },
};
const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };

interface Options {
  /** The file's content; none is a 404. */
  markets?: unknown;
  /** The file's answer as it is sent, whatever its content (a status and a body). */
  raw?: { status: number; body: string };
  /** The answer waits for it, as a slow network would. */
  gate?: Promise<void>;
}

/** The one read of the home, markets.json, answered as a browser would get it; counted. */
async function answers(page: Page, options: Options = {}) {
  const asked = { markets: 0 };
  await page.route("**/markets.json", async (route) => {
    asked.markets += 1;
    await options.gate;
    if (options.raw) await route.fulfill({ headers: cors, ...options.raw });
    else if (options.markets === undefined) await route.fulfill({ status: 404, body: "not found" });
    else await route.fulfill({ headers: cors, body: JSON.stringify(options.markets) });
  });
  return asked;
}
// 7t: the chain's trends, as the server answers them from its worlds job and who is here; days gone by, so their words stand still.
const TRENDS = {
  items: [
    {
      kind: "trending",
      by: "transactions",
      world: "gnoswap/pool",
      realm: "gno.land/r/gnoswap/pool",
      title: "pool",
      count: 45,
      rise: 1.2,
      since: "2026-10-30T09:00:00.000Z",
      at: "2026-10-30T09:31:00.000Z",
    },
    { kind: "rising", world: "bubble", rise: 0.45, at: "2026-10-30T09:39:00.000Z" },
    {
      kind: "new",
      world: "alexis/blog",
      realm: "gno.land/r/alexis/blog",
      title: "blog",
      at: "2026-10-30T22:10:00.000Z",
    },
  ],
};
/** The server's trends, answered as `answer` says: a body, or a status alone. */
const trendsServed = (page: Page, answer: { body: unknown } | { status: number } = { body: TRENDS }) =>
  page.route("**/api/trends", (route) =>
    "body" in answer
      ? route.fulfill({ contentType: "application/json", body: JSON.stringify(answer.body) })
      : route.fulfill({ status: answer.status }),
  );
/** Waits for the server's trends to lead the ticker, before what is on air (8i, onAir.json) and the news: the strip then holds the line it
 * keeps, six items. */
const trendsShown = (page: Page) =>
  expect(page.locator("[data-ticker] [data-kind]")).toHaveText(["Trending", "Rising", "New", "On air", "News", "News"]);
/** The home with its reads answered, hydrated: the prices' file, and the server's trends. */
async function openHome(page: Page, options: Options = { markets: MARKETS }, path = "/") {
  await trendsServed(page);
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
    // 8i: frame 6's "0.398 USD", the price and its unit raised.
    await expect(row).toContainText(/T1\.23 USD/);
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

  test("reads the file once a load, the block height in it, and nothing more as time passes", async ({ page }) => {
    const asked = await openHome(page);
    await expect(page.locator("[data-height]")).toBeVisible();
    await page.waitForTimeout(3000);
    expect(asked).toEqual({ markets: 1 });
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

  // The video's strip (frames 4 and 144): the kinds in capitals and mint, the titles in near-white text.
  test("draws each kind in capitals and mint and each title in the text colour (F5797)", async ({ page }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    const token = (name: string) =>
      page.evaluate((variable) => {
        const probe = document.body.appendChild(document.createElement("i"));
        probe.style.color = `var(${variable})`;
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      }, name);
    for (const kind of ["news", "event"]) {
      const selector = `[data-ticker] b[data-kind="${kind}"]`;
      expect(await style(page, selector, "text-transform")).toBe("uppercase");
      expect(await style(page, selector, "color")).toBe(await token("--color-mine"));
    }
    expect(await style(page, "[data-ticker] a", "color")).toBe(await token("--color-text"));
  });

  test("scrolls every title past the pause: at the end of a pass the whole line has left, the last link included", async ({
    page,
  }) => {
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    await trendsShown(page);
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

  test("leads the ticker with the chain's trends from the server, each in its word, linked to its world's page here (7t)", async ({
    page,
  }) => {
    await openHome(page);
    await trendsShown(page);
    expect(await style(page, "[data-ticker] [data-kind]", "text-transform")).toBe("uppercase");
    const links = page.locator("[data-ticker] a");
    await expect(links.nth(0)).toHaveText("pool · 45 calls in 31 min");
    await expect(links.nth(1)).toHaveText("Bubble · +45% this hour");
    await expect(links.nth(2)).toHaveText("blog · first seen 30 Oct 22:10 UTC");
    const trends = await links.evaluateAll((all) =>
      all
        .slice(0, 3)
        .map((link) => [link.getAttribute("href"), link.getAttribute("target"), link.getAttribute("title") !== null]),
    );
    expect(trends).toEqual([
      ["/r/gnoswap/pool", null, true],
      ["/w/bubble", null, true],
      ["/r/alexis/blog", null, true],
    ]);
    await expect(page.locator("[data-ticker]")).not.toContainText(/date to be confirmed/i);
  });

  for (const [name, answer] of [
    ["no trend", { body: { items: [] } }],
    ["a failing server", { status: 502 }],
    ["an answer its schema refuses", { body: { items: [{ kind: "trending", by: "transactions", count: -1 }] } }],
  ] as const) {
    test(`holds the dated news alone with ${name}, and never an event that waits for its date (7t)`, async ({
      page,
    }) => {
      await trendsServed(page, answer);
      await answers(page, { markets: MARKETS });
      const read = page.waitForResponse("**/api/trends");
      await page.goto("/");
      await hydrated(page);
      await read;
      // The answer is in: a trend drawn from it would show within this second.
      await page.waitForTimeout(1000);
      await expect(page.locator("[data-ticker] [data-kind]")).toHaveText(["On air", "News", "News", "News"]);
      await expect(page.locator("[data-ticker]")).not.toContainText(/date to be confirmed/i);
    });
  }

  test("asks the server's trends on the default universe's home alone, once a visit: the job reads no other (7t)", async ({
    page,
  }) => {
    let asked = 0;
    await page.route("**/api/trends", (route) => {
      asked += 1;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(TRENDS) });
    });
    await answers(page, { markets: MARKETS });
    await page.goto("/net/gnoland");
    await hydrated(page);
    await expect(page.locator("[data-ticker] [data-kind]")).toHaveText(["News", "News", "News"]);
    await page.waitForTimeout(1000);
    expect(asked).toBe(0);
    await page.goto("/");
    await hydrated(page);
    await trendsShown(page);
    await page.waitForTimeout(1000);
    expect(asked).toBe(1);
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
    // Nobody anywhere: Go explore goes to today's next stop (slice 8, a hub's or a realm's page, by the UTC day), so its click lands on one
    // page (F4516).
    await page.route("**/api/presence", (route) =>
      route.fulfill({ body: JSON.stringify({ worlds: [] }), contentType: "application/json" }),
    );
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    const strip = await box(page, "[data-ticker]");
    const live = await box(page, "[data-hero='markets']");
    expect(live.y + live.height).toBeLessThanOrEqual(strip.y);
    await page.getByRole("link", { name: /go explore/i }).click();
    await expect(page).toHaveURL(/\/(?:w|r)\/[^/]/);
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

/** Every chain read of the home aborted and counted: the home asks none, the file holds the height. */
async function chainReads(page: Page) {
  const counted = { reads: 0 };
  for (const host of [MAINNET, ONYX]) {
    await page.route(host, async (route) => {
      counted.reads += 1;
      await route.abort();
    });
  }
  return counted;
}

test.describe("the home's live line at every stage and in every universe", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  // The file's height is the default universe's: the home of another universe draws no block, and none asks a chain.
  for (const [path, drawn] of [
    ["/net/gnoland", false],
    ["/", true],
  ] as const) {
    test(`on ${path} the block is ${drawn ? "the file's" : "not drawn"}, and no chain is asked`, async ({ page }) => {
      const asked = await answers(page, { markets: MARKETS });
      const chain = await chainReads(page);
      await page.goto(path);
      await hydrated(page);
      await expect(page.locator("[data-token]")).toHaveCount(3);
      await expect(page.locator("[data-block]")).toHaveCount(drawn ? 1 : 0);
      if (drawn) await expect(page.locator("[data-height]")).toHaveText("1,203,885");
      expect(asked.markets).toBe(1);
      expect(chain.reads).toBe(0);
    });
  }

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
    ["a file with no height", { markets: { ...MARKETS, block: undefined } }],
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

  test("a missing file stays inside the live line's box, at 900 px as at 1728", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await openHome(page, {});
    await expect(page.locator("[data-block]")).toContainText(/not available/i);
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
    await openHome(page, {
      markets: {
        ...MARKETS,
        updated: "2026-10-31T06:03:00.000Z",
        block: { ...MARKETS.block, time: "2026-10-31T06:04:00.000Z" },
      },
    });
    await expect(page.locator("[data-height]")).toBeVisible();
    await expect(page.locator("[data-hero='markets']")).toHaveScreenshot("home-live-line.png", {
      mask: [page.locator("[data-hero='markets'] time")],
    });
  });

  test("the ticker looks as approved, at rest", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHome(page);
    await expect(page.locator("[data-ticker]")).toBeVisible();
    await trendsShown(page);
    await expect(page.locator("[data-ticker]")).toHaveScreenshot("home-ticker.png");
  });
});
