import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// Slice 5r (O1, O2, O4): header, plate, home hero and list measured at the video's size (1728 by 1080, scale 1) against
// frames 1, 20 and 37 (docs/design/video-screens.md; frames in ~/.cache/gnoworld-tools/video-frames/). A box is held to
// 2 px of the frame's, for anti-aliasing and compression.
const NEAR = 2;
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const box = async (page: Page, selector: string): Promise<Box> => {
  const found = await page.locator(selector).first().boundingBox();
  expect(found, `${selector} is not on the page`).not.toBeNull();
  return found ?? { x: 0, y: 0, width: 0, height: 0 };
};
const near = (actual: number, wanted: number, what: string) => {
  expect(Math.abs(actual - wanted), `${what}: ${String(actual)}, the frame's ${String(wanted)}`).toBeLessThanOrEqual(
    NEAR,
  );
};

// A plate as frames 20 and 37 draw it: 24 px from the left, 98 from the top, 620 wide, and the box it stands in.
const plateAt = async (page: Page, path: string) => {
  await page.goto(path);
  await hydrated(page);
  const plate = await box(page, "[data-look='plate']");
  near(plate.x, 24, "the plate's left");
  near(plate.y, 98, "the plate's top");
  near(plate.width, 620, "the plate's width");
  return plate;
};

test.describe("at the video's size", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  // The header is "the same on every view" (DESIGN-SYSTEM.md, Layout; frames 1, 20 and 37 are three pages): each page is measured.
  for (const path of ["/", "/earth", "/list", "/w/bubble"]) {
    test(`${path}: the header's logo is at 32 px, the views 44 px tall and centred, one row 34 px from the top (frames 1, 20, 37)`, async ({
      page,
    }) => {
      await page.goto(path);
      await hydrated(page);
      const logo = await box(page, "header a[href='/']");
      near(logo.x, 32, "the logo's left");
      const views = await box(page, "header nav[aria-label='Views']");
      near(views.y, 34, "the views' top");
      near(views.height, 44, "the views' height");
      near(views.x + views.width / 2, 864, "the views' middle");
      const earth = await box(page, "header nav[aria-label='Views'] a:text-is('Earth')");
      near(earth.y + earth.height / 2, 56, "the views' row's middle");
      near(logo.y + logo.height / 2, 56, "the logo's middle");
      // The header's right edge keeps the same 32 px, once the login has said whether a session is open: until then the
      // account's box is empty and the right edge is the search's.
      await expect(page.getByRole("button", { name: "Log in with Adena" })).toBeVisible();
      const right = await page.evaluate(() => {
        const items = [...document.querySelectorAll("header a, header button")].map(
          (el) => el.getBoundingClientRect().right,
        );
        return Math.max(...items);
      });
      near(1728 - right, 32, "the right gutter");
    });
  }

  test("the network is named in the header, with Testnet beside it, on the default universe (O4)", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const header = page.getByRole("banner");
    await expect(header.getByText("Onyx")).toBeVisible();
    await expect(header.getByText("Testnet")).toBeVisible();
  });

  test("a world's plate: 24 px from the left, 98 from the top, 620 wide, to 24 from the bottom, with a text column from 100 px (frame 20)", async ({
    page,
  }) => {
    const plate = await plateAt(page, "/w/bubble");
    near(1080 - (plate.y + plate.height), 24, "the plate's bottom gap");
    const title = await box(page, "[data-look='plate'] h1");
    near(title.x, 100, "the title's left");
    // The title is the display size, clamp(4.5rem, 8vw, 7rem): 112 px at this width.
    expect(await page.locator("[data-look='plate'] h1").evaluate((el) => getComputedStyle(el).fontSize)).toBe("112px");
    // The plate has no border: the planet keeps the frame's free area (DESIGN-SYSTEM.md, Layout).
    expect(await page.locator("[data-look='plate']").evaluate((el) => getComputedStyle(el).borderRightWidth)).toBe(
      "0px",
    );
  });

  test("the plate's background is a dot grid, and it fades out over its right edge into the free area (DESIGN-SYSTEM.md, Layout)", async ({
    page,
  }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    const style = await page.locator("[data-look='plate']").evaluate((el) => {
      const computed = getComputedStyle(el);
      return { dots: computed.backgroundImage, fade: computed.maskImage };
    });
    expect(style.dots).toContain("radial-gradient");
    expect(style.fade).toContain("linear-gradient");
  });

  test("the plate's caption stands vertical at the plate's foot, in the one label style (frame 20)", async ({
    page,
  }) => {
    await page.goto("/earth");
    await hydrated(page);
    const caption = await box(page, "[data-look='plate'] [data-orientation='vertical']");
    expect(caption.height).toBeGreaterThan(caption.width);
    expect(caption.x).toBeLessThan(100);
    expect(caption.y + caption.height).toBeGreaterThan(900);
  });

  test("the Earth's plate is the same plate: same left, top and width as a world's (frame 37)", async ({ page }) => {
    await plateAt(page, "/earth");
  });

  test("the home's hero: 48 px from the left, the number at 176 px, two actions of 52 px under it (frames 1 to 8, prototype 543)", async ({
    page,
  }) => {
    await page.goto("/");
    await hydrated(page);
    const hero = await box(page, "[data-hero='number']");
    near(hero.x, 48, "the number's left");
    expect(await page.locator("[data-hero='number']").evaluate((el) => getComputedStyle(el).fontSize)).toBe("176px");
    const actions = page.locator("[data-hero='actions'] a");
    await expect(actions).toHaveCount(2);
    // Frame 6: "Go explore" and "Join the chat" span y 876 to 928, 52 px, as the prototype's `#hero .cta .link` says.
    near((await actions.first().boundingBox())?.height ?? 0, 52, "an action's height");
    const first = (await actions.first().boundingBox()) ?? { y: 0 };
    expect(first.y).toBeGreaterThan(hero.y + hero.height);
    // The hero stands 64 px from the bottom (prototype 514): the gap under the whole hero. It is the last action's gap only
    // while no markets row sits under the actions; slice 5m adds that row, and then this number is measured to the row.
    const last = (await actions.last().boundingBox()) ?? { y: 0, height: 0 };
    near(1080 - (last.y + last.height), 64, "the hero's bottom gap, with no markets row yet");
  });

  test("a click on a row's planet opens the place, as a click on its name does (F3157)", async ({ page }) => {
    await page.goto("/list");
    await hydrated(page);
    await page.locator("ul[aria-label='Places'] [data-look] img").first().click();
    await expect(page).toHaveURL(/\/w\/bubble$/);
  });

  test("the list's rows: one box each, a thumbnail at the left of each (prototype's CSS)", async ({ page }) => {
    await page.goto("/list");
    await hydrated(page);
    const row = await box(page, "ul[aria-label='Places'] [data-look]");
    const thumb = await box(page, "ul[aria-label='Places'] [data-look] img, ul[aria-label='Places'] [data-look] svg");
    expect(thumb.x).toBeGreaterThanOrEqual(row.x);
    expect(thumb.x + thumb.width).toBeLessThan(row.x + row.width / 2);
    expect(row.height).toBeGreaterThanOrEqual(56);
  });
});

for (const width of [390, 1280] as const) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 844 } });
    for (const path of ["/", "/earth", "/list", "/w/bubble"]) {
      test(`${path}: axe finds nothing, the page has no sideways scroll, the header's network stays`, async ({
        page,
      }) => {
        await page.goto(path);
        await hydrated(page);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations).toHaveLength(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expect(page.getByRole("banner").getByText("Testnet")).toBeVisible();
      });
    }

    test("the three views stay reachable, wherever the build puts them", async ({ page }) => {
      await page.goto("/w/bubble");
      await hydrated(page);
      const views = page.getByRole("navigation", { name: "Views" });
      for (const [name, path] of [
        ["Earth", "/earth"],
        ["Cosmos", "/"],
        ["List", "/list"],
      ] as const) {
        const link = views.getByRole("link", { name });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("href", path);
      }
    });

    for (const path of ["/earth", "/w/bubble"]) {
      test(`${path}: the plate starts below the header`, async ({ page }) => {
        await page.goto(path);
        await hydrated(page);
        const header = await box(page, "header");
        const plate = await box(page, "[data-look='plate']");
        expect(plate.y).toBeGreaterThanOrEqual(header.y + header.height - 0.5);
      });
    }
  });
}

// The bug: the fixed plate pushed the chat's slot to 612 px at 1280, under the 40rem the room needs to sit beside a thread's
// panel, so opening a thread hid the room (16 threads journeys failed). The slot keeps 40rem wherever the plate stands fixed.
test.describe("the chat's slot beside the plate", () => {
  for (const width of [900, 1280, 1500] as const) {
    test(`/w/bubble at ${String(width)} px: the slot is 40rem wide or the plate stands above it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/w/bubble");
      await hydrated(page);
      const slot = await box(page, "main > div > :last-child");
      const plate = await box(page, "[data-look='plate']");
      const above = plate.y + plate.height <= slot.y + 0.5;
      expect(
        above || slot.width >= 640,
        `the slot is ${String(slot.width)} px, the plate's bottom ${String(plate.y + plate.height)}`,
      ).toBe(true);
    });
  }
});
