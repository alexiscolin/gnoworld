import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { open } from "./chatScreenOpen.ts";
import { logIn } from "./irc.ts";
import { box, near } from "./geometry.ts";

// Slice 5j: a world's page as frames 20 to 35 and 90 to 97 show it, at the video's size (1728 by 1080, scale 1; a box to
// 2 px of the frame's, as pageGeometry.spec.ts holds it). Bubble has no figure, no history and no linked world, so the
// page draws what its data holds: the kicker, the title, its line, the activity's words, the actions.

const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

test.describe("a world's page at the video's size", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  test("the kicker stands at the text column's left, 137 px down, over the title (frame 26)", async ({ page }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    // The plate's vertical atlas caption is a label too: the kicker is the one that is not vertical.
    const label = "[data-look='plate'] p.label:not([data-orientation])";
    const kicker = await box(page, label);
    const title = await box(page, "[data-look='plate'] h1");
    near(kicker.x, 100, "the kicker's left");
    near(kicker.y + kicker.height / 2, 137, "the kicker's middle");
    expect(kicker.y + kicker.height).toBeLessThanOrEqual(title.y + 0.5);
    await expect(page.locator(label).first()).toHaveText("Onyx");
    await expect(page.getByRole("navigation", { name: "You are here" })).toHaveCount(0);
  });

  // F2871: the kicker's row (24 px, flex) is the paragraph right before the title, not any first paragraph of a block of the plate: the
  // activity's own title, which a history draws, stays a plain label. The probe stands where Activity's title would.
  test("sets the kicker's row on the paragraph before the title and on no other first paragraph", async ({ page }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    const rows = await page.evaluate(() => {
      const kicker = document.querySelector("[data-look='plate'] h1")?.previousElementSibling;
      const block = document.createElement("div");
      const probe = document.createElement("p");
      probe.className = "label";
      probe.textContent = "Activity · last 24 h";
      block.append(probe);
      document.querySelector("[data-look='plate'] h1 + p")?.after(block);
      const row = (node: Element | null | undefined) => (node ? getComputedStyle(node) : undefined);
      return [row(kicker)?.display, row(kicker)?.minHeight, row(probe)?.display, row(probe)?.minHeight];
    });
    expect(rows).toEqual(["flex", "24px", "block", "0px"]);
  });

  // F2869: each block at its place. Frame 26's description line stands at y 316 (its centre); Bubble's has two lines, the first at
  // the frame's place. The frame's facts, chart (479) and actions (574) have the data Bubble lacks (no source for who is here, no
  // history), so below the description the page is pinned at what it lays: the words of no history, then the actions under them.
  test("the title, the line, the activity's words and the actions stand at their y (frames 26, 90)", async ({
    page,
  }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    const title = await box(page, "[data-look='plate'] h1");
    const line = await box(page, "[data-look='plate'] h1 + p");
    // The activity's words by what they say: from 1,280 px nobody counted holds no place over them (Alexis, 2026-11-03, "retire le vide").
    const activity = await box(page, "[data-look='plate'] p:text-is('No activity recorded yet')");
    const main = await box(page, "[data-look='plate'] a[href='#chat']");
    near(title.y, 172, "the title's top");
    near(line.y + 12.4, 316, "the line's first line's middle");
    near(line.x, 100, "the line's left");
    near(activity.y, 371, "the activity words' top");
    // Frame 26: the actions' top 30 px under the chart's last words' ink (544 to 574); a label's box ends 2 px under its ink.
    near(main.y - (activity.y + activity.height), 574 - 544 - 2, "the actions under the words");
    expect(main.y, "the actions come after the activity's words").toBeGreaterThan(activity.y + activity.height);
  });

  test("the actions are 56 px tall from the column's left, Share 10 px after the main one, and no Follow (frames 26, 92)", async ({
    page,
  }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    const plate = page.locator("[data-look='plate']");
    const main = plate.getByRole("link", { name: "Say hi in the chat" });
    const share = plate.getByRole("button", { name: "Share" });
    await expect(share).toBeVisible();
    await expect(plate.getByRole("button", { name: "Follow" })).toHaveCount(0);
    const first = (await main.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const second = (await share.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    near(first.x, 100, "the main action's left");
    near(first.height, 56, "the main action's height");
    near(second.height, 56, "Share's height");
    near(second.x - (first.x + first.width), 10, "the gap between the two actions");
    near(second.y, first.y, "Share's top");
  });

  test("the activity block says in words that no history is known, and draws no chart or rate for Bubble", async ({
    page,
  }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.getByText(/no activity (recorded|known) yet/i)).toBeVisible();
    await expect(page.locator("[data-look='plate'] [data-hour]")).toHaveCount(0);
    await expect(page.getByText("messages now")).toHaveCount(0);
    await expect(page.getByText(/connected worlds/i)).toHaveCount(0);
  });
});

// F2864, with the dock: the chat stands beside the plate from 1280 px, so "Say hi in the chat" needs no scroll; it puts the reader's
// cursor in the chat's composer. Under 1280 px the chat is the page and the plate is not seen.
test.describe("Say hi in the chat", () => {
  for (const width of [1280, 1728] as const) {
    test(`at ${String(width)} px puts the cursor in the dock's composer`, async ({ page }) => {
      await logIn(page, "say-hi-world");
      await open(page, { width, as: ACCOUNT, full: false });
      await page.getByRole("link", { name: "Say hi in the chat" }).click();
      await expect(page.locator("#chat textarea")).toBeFocused();
    });
  }
});

// F2868: who is here comes from the chat, once it has connected; the page draws no rate (nothing gives one).
test.describe("who is here right now", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  // The plate of Bubble once its chat has connected and the fact is drawn.
  const connected = async (page: Page) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    const plate = page.locator("[data-look='plate']");
    await expect(plate.getByText("right now", { exact: true })).toBeVisible();
    return plate;
  };

  // Frame 26 draws "38 here" under its one line, its digits from 372 to 405 px, the line's middle at 316: the page's figure, 44 px at line
  // height 1, stands its box 8 px over its digits, so 364 - (316 + half a line) under the line's last line, whatever its count of lines
  // (7w's design review: Bubble's two lines had put it there by chance). The fact comes there, the words under it, from 1,280 px.
  for (const width of [1280, 1728] as const)
    test(`stands where frame 26 draws it once someone is counted, the activity's words under it, at ${String(width)} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1080 });
      await connected(page);
      const line = page.locator("[data-look='plate'] h1 + p");
      const half = Number.parseFloat(await line.evaluate((node) => getComputedStyle(node).lineHeight)) / 2;
      const words = await box(page, "[data-look='plate'] h1 + p");
      const figure = await box(page, "[data-look='plate'] [data-value]");
      const activity = await box(page, "[data-look='plate'] p:text-is('No activity recorded yet')");
      near(figure.y - (words.y + words.height), 364 - (316 + half), "the figure under the line");
      expect(activity.y, "the activity's words under the fact").toBeGreaterThan(figure.y + figure.height);
    });

  test("appears in the plate once the chat has connected, as a count of people, and writes no rate", async ({
    page,
  }) => {
    const plate = await connected(page);
    const people = Number(await plate.locator("[data-value]").first().getAttribute("data-value"));
    expect(people).toBeGreaterThan(0);
    await expect(plate.getByText("messages now")).toHaveCount(0);
  });

  // The instrument figures (Alexis, 2026-10-31; the board "Instrument"): the figure in Geist Mono 500, tabular and tracked -0.04em, its
  // caption the label in mono capitals.
  test("sets the figure in Geist Mono 500, tabular, and its caption in mono capitals", async ({ page }) => {
    const plate = await connected(page);
    const figure = await plate
      .locator("[data-value]")
      .first()
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.fontFamily, style.fontWeight, style.fontVariantNumeric, style.fontSize, style.letterSpacing];
      });
    expect(figure[0]).toContain("Geist Mono");
    expect(figure.slice(1)).toEqual(["500", "tabular-nums", "44px", "-1.76px"]);
    const caption = await plate.getByText("right now", { exact: true }).evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.fontFamily, style.textTransform];
    });
    expect(caption[0]).toContain("Geist Mono");
    expect(caption[1]).toBe("uppercase");
  });
});

// Who is here, while nobody is counted (Alexis, 2026-11-03, "retire le vide"): where the plate is a block in the page, under 1,280 px, its
// place is held, so nothing under it moves as the count comes (7e); from 1,280 px, where the plate stands beside its dock, it holds none.
// The chat's socket answers nothing, so nobody is ever counted.
test.describe("who is here while nobody is counted", () => {
  const FACT = 59;
  for (const [width, held] of [
    [390, FACT],
    [1279, FACT],
    [1280, 0],
    [1728, 0],
  ] as const)
    test(`at ${String(width)} px holds ${held === 0 ? "no place" : "the fact's place"}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.routeWebSocket(/\/ws$/, () => undefined);
      await page.goto("/w/bubble");
      await hydrated(page);
      const here = page.locator("[data-look='plate'] h1 + p + div");
      await expect(here).toBeAttached();
      expect(await here.evaluate((node) => node.getBoundingClientRect().height)).toBeCloseTo(held, 0);
    });
});

test.describe("Share", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copies the world's canonical address and says it did", async ({ page }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText(/copied/i)).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://gno.world/net/onyx/w/bubble");
  });
});

test.describe("Share where the browser cannot copy", () => {
  test("is not drawn: no dead button", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined });
    });
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
  });
});

// From 1280 px the chat is a dock at the plate's right, inside one outline; under it the chat is the page, drawn over the plate.
// The plate comes first in the reading and tab order at every width (F2865).
test.describe("the page's order", () => {
  for (const width of [390, 1279] as const) {
    test(`at ${String(width)} px the chat takes the whole page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/w/bubble");
      await hydrated(page);
      const chat = await box(page, "[data-chat-layout]");
      near(chat.x, 0, "the chat's left");
      near(chat.y, 0, "the chat's top");
      near(chat.width, width, "the chat's width");
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
    await expect(page.getByText(/no activity (recorded|known) yet/i)).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
