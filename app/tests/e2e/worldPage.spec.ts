import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test } from "./fixtures.ts";
import { roomsNav } from "./chat.ts";
import { box, near } from "./geometry.ts";

// Slice 5j: a world's page as frames 20 to 35 and 90 to 97 show it, at the video's size (1728 by 1080, scale 1; a box to
// 2 px of the frame's, as pageGeometry.spec.ts holds it). Bubble has no figure, no history and no linked world, so the
// page draws what its data holds: the kicker, the title, its line, the activity's words, the actions.

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
    const activity = await box(page, "[data-look='plate'] h1 + p + p");
    const main = await box(page, "[data-look='plate'] a[href='#chat']");
    near(title.y, 172, "the title's top");
    near(line.y + 12.4, 316, "the line's first line's middle");
    near(line.x, 100, "the line's left");
    near(activity.y, 371, "the activity words' top");
    near(main.y, 398, "the actions' top");
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

  test("the activity block says in words that no history is known, and draws no chart or fact for Bubble", async ({
    page,
  }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.getByText(/no activity (recorded|known) yet/i)).toBeVisible();
    await expect(page.locator("[data-look='plate'] [data-hour]")).toHaveCount(0);
    await expect(page.getByText("right now", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/connected worlds/i)).toHaveCount(0);
  });
});

// A room that fills the screen is taller than the window: "Say hi in the chat" must land its head under the header, not behind it (F2864).
test.describe("Say hi in the chat", () => {
  for (const width of [900, 1280, 1728] as const) {
    test(`at ${String(width)} px lands the chat's top under the 96 px header`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/w/bubble");
      await hydrated(page);
      // Through the style object: the page's policy refuses a style tag.
      await page.evaluate(() => {
        const slot = document.querySelector<HTMLElement>("#chat");
        if (slot !== null) slot.style.minBlockSize = "2000px";
      });
      await page.getByRole("link", { name: "Say hi in the chat" }).click();
      const top = await page.evaluate(() => document.querySelector("#chat")?.getBoundingClientRect().top ?? -1);
      // The header is 96 px; at 1728 the chat is already at the top of the page and does not move under it.
      expect(top, `the chat's top at ${String(width)} px`).toBeGreaterThanOrEqual(96 - 2);
    });
  }
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

// "900 px: phone layout, chat first" (docs/DESIGN-SYSTEM.md, Breakpoints): the chat above the plate under 900 px, the plate before it
// from 900 px, and from 1360 px the plate fixed at the left with the chat beside it.
test.describe("the page's order", () => {
  // F2865: the reading and the tab order are the plate's first at every width, and equal to the sight's on a computer; a phone
  // alone draws the chat above, by CSS (the order of a computer's page is the brief's, the phone's is DESIGN-SYSTEM.md's).
  test("on a phone, the chat is drawn above the plate, which stays first in the reading order", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/w/bubble");
    await hydrated(page);
    const slot = await box(page, "#chat");
    const plate = await box(page, "[data-look='plate']");
    expect(slot.y).toBeLessThan(plate.y);
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
    // The chat has loaded: its rooms are links to tab through.
    await expect(roomsNav(page)).toBeVisible();
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

  // The switch is at 900: 899 is a phone's, 900 and the widths up to 1359 draw the plate first.
  for (const [width, plateFirst] of [
    [899, false],
    [900, true],
    [1280, true],
  ] as const) {
    test(`at ${String(width)} px the ${plateFirst ? "plate" : "chat"} comes first`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/w/bubble");
      await hydrated(page);
      const slot = await box(page, "#chat");
      const plate = await box(page, "[data-look='plate']");
      expect(plate.y < slot.y).toBe(plateFirst);
    });
  }

  test("on a computer, the plate stays fixed at the left with the chat beside it", async ({ page }) => {
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
