import type { Locator } from "@playwright/test";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { violations } from "./axe.ts";
import { open } from "./chatScreenOpen.ts";
import { logIn } from "./irc.ts";
import { box, near } from "./geometry.ts";

// A world's page at the video's size (1728 by 1080, scale 1; a box to 2 px of the proposal's, as pageGeometry.spec.ts holds it). Bubble
// has no figure, no history and no linked world, so the page draws what its data holds: the kicker, the title, its line, the actions, the
// figures band.

const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

// Bubble has no history here: the plate's hours come from the server's rooms, where the other journeys of the run have said lines, so
// each test below answers them as a server with none does, and reads no rate it did not plant.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/presence/hours*", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_ready" }) }),
  );
});

test.describe("a world's page at the video's size", () => {
  // Reduced motion: the plate's parts stand where they settle, not where their entrance has them as the box is read.
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1, reducedMotion: "reduce" });

  // The kicker is the plate's first row: the planet's disc, then the genre and the kind; the header's levels say where the place is.
  test("the kicker stands at the text column's left, over the title, and carries no crumb", async ({ page }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    const row = await box(page, "[data-look='plate'] [data-planet]");
    const title = await box(page, "[data-look='plate'] h1");
    near(row.x, title.x, "the kicker's left, the title's");
    expect(row.y + row.height).toBeLessThanOrEqual(title.y + 0.5);
    await expect(page.locator("[data-look='plate'] [data-planet]")).toContainText("Games · dApp");
    await expect(page.locator("[data-look='plate'] nav")).toHaveCount(0);
  });

  test("the title, the line, the actions and the figures stand in their order, from the column's left", async ({
    page,
  }) => {
    // The demo's rooms hold people: nobody is counted here, as the test's premise says.
    await page.routeWebSocket(/\/ws$/, () => undefined);
    await page.goto("/w/bubble");
    await hydrated(page);
    const plate = page.locator("[data-look='plate']");
    await expect(plate.getByRole("region", { name: "Figures" })).toBeVisible();
    const title = await box(page, "[data-look='plate'] h1");
    const line = await box(page, "[data-look='plate'] p:has-text('Bubble, a world')");
    const main = await box(page, "[data-look='plate'] a[href='#chat']");
    const band = await box(page, "[data-look='plate'] section[aria-label='Figures']");
    near(line.x, title.x, "the line's left");
    near(main.x, title.x, "the actions' left");
    near(band.x, title.x, "the figures' left");
    expect(line.y, "the line under the title").toBeGreaterThanOrEqual(title.y + title.height);
    expect(main.y, "the actions under the line").toBeGreaterThanOrEqual(line.y + line.height);
    expect(band.y, "the figures under the actions").toBeGreaterThanOrEqual(main.y + main.height);
  });

  test("the actions are 44 px tall from the column's left, Follow 10 px after the main one, Share 10 px after Follow", async ({
    page,
  }) => {
    await page.routeWebSocket(/\/ws$/, () => undefined);
    await page.goto("/w/bubble");
    await hydrated(page);
    const plate = page.locator("[data-look='plate']");
    const main = plate.getByRole("link", { name: "Say hi in the chat" });
    const share = plate.getByRole("button", { name: "Share" });
    await expect(share).toBeVisible();
    const follow = plate.getByRole("button", { name: "Follow" });
    await expect(follow).toBeVisible();
    const none = { x: 0, y: 0, width: 0, height: 0 };
    const first = (await main.boundingBox()) ?? none;
    const second = (await follow.boundingBox()) ?? none;
    const third = (await share.boundingBox()) ?? none;
    near(first.x, 101, "the main action's left");
    near(first.height, 44, "the main action's height");
    near(second.height, 44, "Follow's height");
    near(third.height, 44, "Share's height");
    near(second.x - (first.x + first.width), 10, "the gap between the main action and Follow");
    near(third.x - (second.x + second.width), 10, "the gap between Follow and Share");
    near(second.y, first.y, "Follow's top");
    near(third.y, first.y, "Share's top");
  });

  test("the hours card draws its chart flat for a world nobody spoke in, a dot an hour", async ({ page }) => {
    const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000 - 23 * 3_600_000;
    await page.route("**/api/presence/hours*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ from: hour, hours: [], now: null }),
      }),
    );
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.getByRole("group", { name: "Chat messages per hour" })).toBeVisible();
    await expect(page.getByText(/No message in the last 24 hours/)).toBeVisible();
    await expect(page.getByText("messages now")).toHaveCount(0);
    await expect(page.getByText(/connected worlds/i)).toHaveCount(0);
  });
});

// F2864, with the dock: the chat stands beside the plate from 1280 px, so "Say hi in the chat" needs no scroll; it puts the reader's
// cursor in the chat's composer. Under 1280 px the chat is a block under the plate.
test.describe("Say hi in the chat", () => {
  for (const width of [1280, 1728] as const) {
    test(`at ${String(width)} px puts the cursor in the dock's composer`, async ({ page }) => {
      await logIn(page, "say-hi-world");
      await open(page, { width, as: ACCOUNT, full: false });
      await page.getByRole("link", { name: "Say hi in the chat" }).click();
      await expect(page.locator("#chat [role='textbox']")).toBeFocused();
    });
  }
});

// Who is here comes from the server's count, once it has answered, in the figures band's first cell; the page draws no rate (nothing gives one).
test.describe("who is here right now", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  // The plate of Bubble once the server has counted people: the band's "Here now" cell says so.
  const connected = async (page: Page) => {
    await page.route("**/api/presence", (route) =>
      route.fulfill({ json: { worlds: [{ world: "bubble", here: 7, perHour: 0, rise: 0 }] } }),
    );
    await page.goto("/w/bubble");
    await hydrated(page);
    const plate = page.locator("[data-look='plate']");
    await expect(plate.getByRole("region", { name: "Figures" }).locator(".visually-hidden").first()).toHaveText("7");
    return plate;
  };
  const hereCell = (plate: Locator) =>
    plate.getByRole("region", { name: "Figures" }).locator("div:has(> div > span:text-is('Here now'))").first();

  for (const width of [1280, 1728] as const)
    test(`draws the figures as one row of cells under the actions, at ${String(width)} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1080 });
      const plate = await connected(page);
      const cells = plate.locator("section[aria-label='Figures'] > div > div");
      const first = (await cells.first().boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
      const last = (await cells.last().boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
      near(last.y, first.y, "the cells share a row");
      near(last.width, first.width, "the cells are alike");
      const actions = await box(page, "[data-look='plate'] a[href='#chat']");
      expect(first.y, "the figures under the actions").toBeGreaterThan(actions.y + actions.height);
    });

  test("appears in the plate once the chat has connected, as a count of people, and writes no rate", async ({
    page,
  }) => {
    const plate = await connected(page);
    const people = Number(
      (await hereCell(plate).locator(".visually-hidden").first().textContent())?.replace(/\D/g, ""),
    );
    expect(people).toBeGreaterThan(0);
    await expect(plate.getByText("messages now")).toHaveCount(0);
  });

  // The instrument figures: the figure in the figure font, tabular and tracked -0.04em.
  test("sets the figure tabular and tracked, in Geist Mono", async ({ page }) => {
    const plate = await connected(page);
    const figure = await hereCell(plate)
      .locator("span[aria-hidden='true']")
      .first()
      .evaluate((node) => {
        const style = getComputedStyle(node.parentElement ?? node);
        return [style.fontFamily, style.fontVariantNumeric, style.fontSize, style.letterSpacing];
      });
    expect(figure[0]).toContain("Geist Mono");
    expect(figure[1]).toBe("tabular-nums");
    expect(figure[3]).toBe(`${String(Number.parseFloat(figure[2] ?? "0") * -0.04)}px`);
  });
});

// While nobody is counted, the band still draws its first cell with its zero (a count that was read is a value), at every width:
// the chat's socket answers nothing and the server counts nobody.
test.describe("who is here while nobody is counted", () => {
  for (const width of [390, 1279, 1280, 1728] as const)
    test(`at ${String(width)} px the band's "Here now" reads zero`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.routeWebSocket(/\/ws$/, () => undefined);
      // The server's count is the shared stack's, which the run's other journeys fill: a server that counted nobody here says zero.
      await page.route("**/api/presence", (route) =>
        route.fulfill({ json: { worlds: [{ world: "bubble", here: 0, perHour: 0, rise: 0 }] } }),
      );
      await page.goto("/w/bubble");
      await hydrated(page);
      const band = page.locator("[data-look='plate'] section[aria-label='Figures']");
      await expect(band.getByText("Here now")).toBeVisible();
      await expect(band.locator(".visually-hidden").first()).toHaveText("0");
    });
});

test.describe("Share", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  // 8c: Share opens a sheet (the link, a picture, Copy link); the copy and its answer are the sheet's.
  test("copies the world's canonical address and says it did", async ({ page }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    await page.getByRole("button", { name: "Share" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText(/copied/i)).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://gno.world/net/onyx/w/bubble");
  });
});

test.describe("Share where the browser cannot copy", () => {
  test("shows the link to select, and says it could not copy: no dead button", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined });
    });
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Share" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("https://gno.world/net/onyx/w/bubble")).toBeVisible();
    await sheet.getByRole("button", { name: "Copy link" }).click();
    await expect(sheet.getByText("Could not copy: select the link above")).toBeVisible();
  });
});

// From 1280 px the chat is a dock at the plate's right, inside one outline; under it the chat is a block under the plate.
// The plate comes first in the reading and tab order at every width (F2865).
test.describe("the page's order", () => {
  for (const width of [390, 1279] as const) {
    test(`at ${String(width)} px the chat is a block under the plate, between the page's gutters`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/w/bubble");
      await hydrated(page);
      const chat = await box(page, "[data-chat-layout]");
      near(chat.x, 16, "the chat's left, the page's gutter");
      const plate = await box(page, "[data-look='plate']");
      expect(chat.y, "the chat under the plate").toBeGreaterThanOrEqual(plate.y + plate.height - 0.5);
      near(chat.width, width - 32, "the chat's width, the gutters apart");
    });
  }

  test("the plate comes first in the document, the chat after it", async ({ page }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    const plateFirst = await page.evaluate(() => {
      const plateEl = document.querySelector("[data-look='plate']");
      const slotEl = document.querySelector("#chat");
      return (
        plateEl !== null &&
        slotEl !== null &&
        !!(plateEl.compareDocumentPosition(slotEl) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    });
    expect(plateFirst).toBe(true);
  });

  test("on a computer, Tab meets the plate's actions before any control of the chat, as the page is drawn (F2865)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/w/bubble");
    await hydrated(page);
    // The chat has loaded: its dock is drawn.
    await expect(page.locator("[data-chat-layout]")).toBeVisible();
    const places: string[] = [];
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press("Tab");
      places.push(
        await page.evaluate(() => {
          const now = document.activeElement;
          if (now?.closest("#chat")) return "chat";
          if (now?.closest("[data-look='plate']")) return "plate";
          return "other";
        }),
      );
    }
    expect(places, "the plate's controls are reached").toContain("plate");
    expect(places, "the chat's controls are reached").toContain("chat");
    expect(places.indexOf("plate"), "the plate comes before the first control of the chat").toBeLessThan(
      places.indexOf("chat"),
    );
  });

  test("on a computer, the plate stays fixed at the left with the chat docked at the right", async ({ page }) => {
    await page.setViewportSize({ width: 1728, height: 1080 });
    await page.goto("/w/bubble");
    await hydrated(page);
    const plate = await box(page, "[data-look='plate']");
    const slot = await box(page, "#chat");
    near(plate.x, 24, "the plate's left");
    near(plate.y, 98, "the plate's top");
    expect(slot.x).toBeGreaterThanOrEqual(plate.x + plate.width);
  });
});

for (const width of [390, 1280] as const) {
  test(`at ${String(width)} px: axe finds nothing on the page with its kicker, its words, its actions`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.locator("[data-look='plate'] section[aria-label='Figures']")).toBeVisible();
    expect(await violations(page)).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
