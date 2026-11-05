import AxeBuilder from "@axe-core/playwright";
import { lines } from "./chat.ts";
import { open } from "./chatScreenOpen.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box, brightness, near } from "./geometry.ts";

// Slice 5r (O1, O2, O4): header, plate, home hero and list measured at the video's size (1728 by 1080, scale 1) against
// frames 1, 6, 20, 26, 37, 90 and 102 (docs/design/video-screens.md; frames in ~/.cache/gnoworld-tools/video-frames/). A box is
// held to 2 px of the frame's, for anti-aliasing and compression; the pictures' own numbers are read off the frames' pixels.
const style = (page: Page, selector: string, property: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);

// A plate as frames 20, 37 and 90 draw it: 24 px from the left, 98 from the top, 808 wide with its fade, and the box it stands in.
const plateAt = async (page: Page, path: string) => {
  await page.goto(path);
  await hydrated(page);
  const plate = await box(page, "[data-look='plate']");
  near(plate.x, 24, "the plate's left");
  near(plate.y, 98, "the plate's top");
  near(plate.width, 808, "the plate's width");
  return plate;
};

test.describe("at the video's size", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  // The header is "the same on every view" (DESIGN-SYSTEM.md, Layout; frames 1, 20 and 37 are three pages): each page is measured.
  for (const path of ["/", "/earth", "/list", "/w/bubble"]) {
    test(`${path}: the header is 96 px high, its logo at 32 px and 56 px down, the views 44 px tall and centred, one row 34 px from the top (frames 1, 20, 37)`, async ({
      page,
    }) => {
      await page.goto(path);
      await hydrated(page);
      const header = await box(page, "header");
      near(header.height, 96, "the header's height");
      const logo = await box(page, "header a[href='/']");
      near(logo.x, 32, "the logo's left");
      const views = await box(page, "header nav[aria-label='Views']");
      near(views.y, 34, "the views' top");
      near(views.height, 44, "the views' height");
      near(views.x + views.width / 2, 864, "the views' middle");
      const earth = await box(page, "header nav[aria-label='Views'] a:text-is('Earth')");
      near(earth.y + earth.height / 2, 56, "the views' row's middle");
      near(logo.y + logo.height / 2, 56, "the logo's middle");
      // The header's right edge keeps the same 32 px, once the login has said whether a session is open.
      await expect(page.getByRole("button", { name: "Connect Adena" })).toBeVisible();
      const right = await page.evaluate(() => {
        const items = [...document.querySelectorAll("header a, header button")].map(
          (el) => el.getBoundingClientRect().right,
        );
        return Math.max(...items);
      });
      near(1728 - right, 32, "the right gutter");
    });
  }

  test("the views are 11.5 px sans capitals, 0.1em apart, with the search after a divider in the same pill (frames 20, 37)", async ({
    page,
  }) => {
    await page.goto("/earth");
    await hydrated(page);
    const link = "header nav[aria-label='Views'] a:text-is('Earth')";
    expect(await style(page, link, "font-size")).toBe("11.5px");
    expect(await style(page, link, "letter-spacing")).toBe("1.15px");
    expect(await style(page, link, "font-family")).not.toMatch(/mono/i);
    expect(await style(page, link, "text-transform")).toBe("uppercase");
    const pill = await box(page, "header nav[aria-label='Views']");
    const list = await box(page, "header nav[aria-label='Views'] a:text-is('List')");
    const search = await box(page, "header nav[aria-label='Views'] button[aria-label='Search']");
    expect(search.x).toBeGreaterThan(list.x + list.width);
    expect(search.x + search.width).toBeLessThanOrEqual(pill.x + pill.width);
    // A control's own size, 40 px, centred in the 34 px between the pill's padding (touch asks 44: search.spec.ts).
    expect(search.width).toBeGreaterThanOrEqual(34);
    near(search.y + search.height / 2, 56, "the search's middle");
  });

  test("the logo is the video's: the mark at 32 px, the word at 19 px, 'gno' in 600 and 'world' in 300 (frames 6, 20)", async ({
    page,
  }) => {
    await page.goto("/");
    await hydrated(page);
    const logo = "header a[href='/']";
    const mark = await box(page, `${logo} svg`);
    near(mark.width, 32, "the mark's width");
    expect(await style(page, `${logo} b`, "font-weight")).toBe("600");
    expect(await style(page, `${logo} b`, "font-size")).toBe("19px");
    const word = await style(page, `${logo} span:has(> b)`, "font-weight");
    expect(word).toBe("300");
  });

  test("the header stays at the top of the screen while the page scrolls, as the prototype's #hnav (F3272)", async ({
    page,
  }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    await page.evaluate(() => {
      document.body.style.minBlockSize = "3000px";
      window.scrollTo(0, 800);
    });
    near((await box(page, "header")).y, 0, "the header's top after a scroll");
    near((await box(page, "[data-look='plate']")).y, 98, "the plate's top after a scroll");
  });

  test("the network is named in the header, with Testnet beside it, on the default universe (O4)", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const header = page.getByRole("banner");
    await expect(header.getByText("Onyx")).toBeVisible();
    await expect(header.getByText("Testnet")).toBeVisible();
  });

  test("a world's plate: 24 px from the left, 98 from the top, 808 wide, to 24 from the bottom, with a text column from 100 to 584 px (frames 20, 37, 90)", async ({
    page,
  }) => {
    const plate = await plateAt(page, "/w/bubble");
    near(1080 - (plate.y + plate.height), 24, "the plate's bottom gap");
    const title = await box(page, "[data-look='plate'] h1");
    near(title.x, 100, "the title's left");
    const column = await page.locator("[data-look='plate'] > div:last-child").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.right - Number.parseFloat(getComputedStyle(el).paddingRight);
    });
    near(column, 584, "the text column's right edge");
    // The plate has no border: the one outline of the frame draws the edge, so the planet keeps the free area.
    expect(await style(page, "[data-look='plate']", "border-right-width")).toBe("0px");
  });

  // The picture of a plate is compared with a colour threshold that let amber-brown pass as navy (dock-1728 kept the old plate after
  // 647ffb79): the plate's computed fill is read here, and must be the frames' navy, #182033 (frame 37), within 4 a channel.
  test("a world's plate is the frames' navy, not amber: its computed fill, read as pixels (frame 37)", async ({
    page,
  }) => {
    await plateAt(page, "/w/bubble");
    const fill = await page.locator("[data-look='plate']").evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("no canvas context");
      context.fillStyle = getComputedStyle(el, "::before").backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    });
    const navy = [0x18, 0x20, 0x33];
    fill.forEach((channel, index) => {
      const wanted = navy[index] ?? 0;
      expect(
        Math.abs(channel - wanted),
        `the plate's fill, channel ${String(index)}: ${String(channel)}, not ${String(wanted)}`,
      ).toBeLessThanOrEqual(4);
    });
  });

  test("one outline runs round plate, scene and dock: 24 px from the sides, 98 from the top, 24 from the foot (frames 20, 37)", async ({
    page,
  }) => {
    await page.goto("/earth");
    await hydrated(page);
    const frame = "main > div > div[aria-hidden='true']";
    const outline = await box(page, frame);
    near(outline.x, 24, "the outline's left");
    near(outline.y, 98, "the outline's top");
    near(outline.x + outline.width, 1728 - 24, "the outline's right");
    near(outline.y + outline.height, 1080 - 24, "the outline's foot");
    expect(await style(page, frame, "border-top-width")).toBe("1px");
    expect(await style(page, frame, "border-top-left-radius")).toBe("24px");
  });

  // The title fits its words (the prototype's fitName): the frames' 118 px for Earth, GovDAO and BUBBLE, 81.7 px for Fresh Mint.
  test("the title is 118 px for a name of six letters or fewer, at 1080 px high (frames 26, 37, 102)", async ({
    page,
  }) => {
    for (const path of ["/w/bubble", "/earth"]) {
      await page.goto(path);
      await hydrated(page);
      const size = Number.parseFloat(await style(page, "[data-look='plate'] h1", "font-size"));
      near(size, 118, `${path}'s title`);
    }
  });

  test("the title of ten letters is 81.7 px (frame 90, Fresh Mint) and a name of 20 letters 40.9 px", async ({
    page,
  }) => {
    await page.goto("/earth");
    await hydrated(page);
    for (const [fit, wanted] of [
      ["10", 81.7],
      ["20", 40.9],
    ] as const) {
      await page.locator("[data-look='plate']").evaluate((el, step) => {
        el.setAttribute("data-fit", step);
      }, fit);
      near(Number.parseFloat(await style(page, "[data-look='plate'] h1", "font-size")), wanted, `the step ${fit}`);
    }
  });

  test("the plate's crumbs and description stand where the frames put them: the kicker at y 133 to 141, the text from 310 (frames 26, 37)", async ({
    page,
  }) => {
    await page.goto("/earth");
    await hydrated(page);
    const crumbs = await box(page, "[data-look='plate'] nav[aria-label='You are here']");
    near(crumbs.x, 100, "the crumbs' left");
    near(crumbs.y + crumbs.height / 2, 137, "the crumbs' middle");
    expect(await style(page, "[data-look='plate'] nav", "text-transform")).toBe("uppercase");
    expect(await style(page, "[data-look='plate'] nav", "font-size")).toBe("12px");
    expect(await style(page, "[data-look='plate'] nav", "letter-spacing")).toBe("0.96px");
    const text = await box(page, "[data-look='plate'] h1 + p");
    expect(await style(page, "[data-look='plate'] h1 + p", "font-size")).toBe("16px");
    near(text.y + (text.height - 25) / 2 + 3, 310 - 2, "the description's first line");
  });

  // The pixels: the plate's flat surface, its fade over the last 64 px (frames 90 and 102: flat to x 756, half at 800, gone by
  // 830, between the same dark sky), and the dot grid on a 14 px pitch (frame 20: a dot at x 45 and 59, y 105 and 119).
  test("the plate fades out over its last 64 px, from x 768 to 832, to the sky beside it (frames 90, 102)", async ({
    page,
  }) => {
    await page.goto("/earth");
    await hydrated(page);
    const picture = await page.screenshot();
    const rows: [number, number] = [990, 1040];
    const [flat, mid, near830, sky] = await brightness(page, picture, [
      [700, rows[0], 708, rows[1]],
      [796, rows[0], 804, rows[1]],
      [828, rows[0], 832, rows[1]],
      [900, rows[0], 908, rows[1]],
    ]);
    const share = (value: number | undefined) => ((value ?? 0) - (sky ?? 0)) / ((flat ?? 1) - (sky ?? 0));
    expect(share(flat)).toBeCloseTo(1, 5);
    expect(share(mid), "half the way across the fade").toBeGreaterThan(0.35);
    expect(share(mid)).toBeLessThan(0.65);
    expect(share(near830), "gone at its end").toBeLessThan(0.1);
  });

  test("the plate's dot grid sits on a 14 px pitch with its dots at x 45 and y 105 and every 14 px (frame 20)", async ({
    page,
  }) => {
    await page.goto("/earth");
    await hydrated(page);
    const picture = await page.screenshot();
    // The brightest pixel of each 1 px column and row of the tiles in a plain stretch of the plate.
    const columns = await brightness(
      page,
      picture,
      Array.from({ length: 14 }, (_, dx): [number, number, number, number] => [42 + dx, 600, 43 + dx, 640]),
    );
    const rows = await brightness(
      page,
      picture,
      // 8g: the Earth's plate holds its latest post on X at y 600, so the rows are read lower, in a plain stretch under its links.
      Array.from({ length: 14 }, (_, dy): [number, number, number, number] => [300, 900 + dy, 340, 901 + dy]),
    );
    const peak = (values: number[]) => values.indexOf(Math.max(...values));
    // The tiles start at 42 px and 900 px: the dot of x 45 is the 4th column, the dot of y 105 + 14 * 57 = 903 the 4th row.
    near(42 + peak(columns), 45, "the dots' column");
    near(900 + peak(rows), 903, "the dots' row");
  });

  test("the plate's caption stands vertical at the plate's foot, from y 813 to 1001, in the atlas's tracking (frame 20)", async ({
    page,
  }) => {
    await page.goto("/earth");
    await hydrated(page);
    const caption = await box(page, "[data-look='plate'] [data-orientation='vertical']");
    expect(caption.height).toBeGreaterThan(caption.width);
    near(caption.x + caption.width / 2, 54, "the caption's middle");
    near(caption.y + caption.height, 1002, "the caption's start, at its foot");
    // 20 letters of 10.5 px mono at 0.32em apart, the last one's space after it included.
    near(caption.height, 193, "the caption's length");
    expect(await style(page, "[data-look='plate'] [data-orientation='vertical']", "letter-spacing")).toBe("3.36px");
  });

  test("the Earth's plate is the same plate: same left, top and width as a world's (frame 37)", async ({ page }) => {
    await plateAt(page, "/earth");
  });

  test("the wide plate looks as approved, the header masked", async ({ page }) => {
    await page.goto("/earth");
    await hydrated(page);
    // The dock's room holds the Earth's chat, whose people and lines are the server's: chatDock.spec.ts holds its look.
    await page.evaluate(() => document.getElementById("chat")?.style.setProperty("display", "none"));
    await expect(page).toHaveScreenshot("plate-wide-1728.png", { mask: [page.getByRole("banner")] });
  });

  test("the home's hero: the kicker with its dot, the number at 176 px, the line and two actions of 52 px on one row (frames 1 to 8, prototype 514 to 546)", async ({
    page,
  }) => {
    await page.goto("/");
    await hydrated(page);
    const hero = await box(page, "[data-hero='number']");
    near(hero.x, 48, "the number's left");
    expect(await style(page, "[data-hero='number']", "font-size")).toBe("176px");
    const actions = page.locator("[data-hero='actions'] a");
    await expect(actions).toHaveCount(2);
    const first = await box(page, "[data-hero='actions'] a >> nth=0");
    const second = await box(page, "[data-hero='actions'] a >> nth=1");
    near(first.height, 52, "an action's height");
    near(second.x - (first.x + first.width), 10, "the gap between the actions");
    expect(await style(page, "[data-hero='actions'] a", "font-size")).toBe("15px");
    // The line is the row's first cell, 28 px before the actions, on their middle line (frame 6): the page's heading and what a world is
    // after it (ADR-0003, 2a), in the line's own size.
    const line = await box(page, "[data-hero='line']");
    near(first.x - (line.x + line.width), 28, "the gap between the line and the actions");
    near(line.y + line.height / 2, first.y + first.height / 2, "the line's middle against the actions'");
    expect(await style(page, "[data-hero='line']", "font-size")).toBe("17px");
    expect(await style(page, "h1", "font-size")).toBe("17px");
    // 22 px between the kicker, the number and the row (the prototype's #hero gap).
    const label = await box(page, "main p.label");
    near(hero.y - (label.y + label.height), 22, "the kicker's gap above the number");
    near(first.y - (hero.y + hero.height), 22, "the number's gap above the row");
    await expect(page.locator("main p.label [data-tone='warm']")).toBeVisible();
    // The hero stands 64 px from the bottom (prototype 514): the gap under the whole hero. Since 5m the live line (markets and
    // block, here a state for want of a file) ends it, and the actions stand above it, 22 px (frame 6).
    await expect(page.locator("[data-hero='markets']")).toBeVisible();
    const live = await box(page, "[data-hero='markets']");
    near(1080 - (live.y + live.height), 64, "the hero's bottom gap");
    near(live.y - (first.y + first.height), 22, "the actions' gap above the live line");
  });

  test("the hero's own box takes no click from the page behind it (prototype 514)", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    expect(await style(page, "[data-hero='number']", "pointer-events")).toBe("auto");
    expect(await style(page, "[data-hero='number'] + div", "pointer-events")).toBe("auto");
    expect(
      await page
        .locator("[data-hero='number']")
        .evaluate((el) => getComputedStyle(el.parentElement ?? el).pointerEvents),
    ).toBe("none");
  });

  test("the home's worlds are a plain list: no bullet, no link blue, at the hero's left edge, over it and under the header (C)", async ({
    page,
  }) => {
    await page.goto("/");
    await hydrated(page);
    const list = "nav[aria-label='Worlds'] ul";
    expect(await style(page, list, "list-style-type")).toBe("none");
    const link = "nav[aria-label='Worlds'] a";
    expect(await style(page, link, "text-decoration-line")).toBe("none");
    expect(await style(page, link, "color")).not.toBe("rgb(0, 0, 238)");
    const where = await box(page, link);
    near(where.x, 48, "the list's left edge, the hero's");
    expect(where.y).toBeGreaterThanOrEqual(96);
    const hero = await box(page, "main p.label");
    expect(where.y + where.height).toBeLessThanOrEqual(hero.y);
  });

  test("the home's worlds never sit under the hero on a short screen: the page holds the hero and the list one under the other (F3273)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1728, height: 600 });
    await page.goto("/");
    await hydrated(page);
    const where = await box(page, "nav[aria-label='Worlds'] a");
    const hero = await page
      .locator("[data-hero='number']")
      .evaluate((el) => el.parentElement?.getBoundingClientRect().bottom ?? 0);
    expect(where.y, "the list starts under the whole hero").toBeGreaterThanOrEqual(hero);
    expect(await style(page, "[data-hero='number']", "position")).toBe("static");
    const bubble = page.getByRole("link", { name: "Bubble", exact: true });
    await bubble.click();
    await expect(page).toHaveURL(/\/w\/bubble$/);
  });

  test("a click on a card's planet opens the place, as a click on its name does (F3157)", async ({ page }) => {
    await page.goto("/list");
    await hydrated(page);
    await page.locator("ul[aria-label='Places'] img").first().click();
    await expect(page).toHaveURL(/\/w\/bubble$/);
  });

  test("the list is the prototype's board: 24 px from the sides and the foot, 98 from the top, radius 24, cards from 240 px (#board, .hubcard)", async ({
    page,
  }) => {
    await page.goto("/list");
    await hydrated(page);
    const board = await box(page, "main > div");
    near(board.x, 24, "the board's left");
    near(board.y, 98, "the board's top");
    near(board.x + board.width, 1704, "the board's right");
    near(board.y + board.height, 1056, "the board's foot");
    expect(await style(page, "main > div", "border-top-left-radius")).toBe("24px");
    expect(await style(page, "main > div", "overflow-y")).toBe("auto");
    const card = "ul[aria-label='Places'] a";
    const where = await box(page, card);
    expect(where.width).toBeGreaterThanOrEqual(240);
    expect(await style(page, card, "border-top-left-radius")).toBe("16px");
    expect(await style(page, card, "padding-top")).toBe("16px");
    const thumb = await box(page, `${card} img`);
    near(thumb.width, 52, "the planet's size");
    expect(await style(page, `${card} span[class*='name']`, "font-size")).toBe("18px");
    expect(await style(page, `${card} span[class*='description']`, "font-size")).toBe("12px");
  });
});

for (const width of [390, 1280, 1728] as const) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: width === 1728 ? 1080 : 844 } });
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
        ["Universe", "/"],
        ["List", "/list"],
      ] as const) {
        const link = views.getByRole("link", { name });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("href", path);
      }
    });

    if (width < 1728) {
      for (const path of ["/earth", "/w/bubble"]) {
        test(`${path}: the plate starts below the header`, async ({ page }) => {
          await page.goto(path);
          await hydrated(page);
          const header = await box(page, "header");
          const plate = await box(page, "[data-look='plate']");
          expect(plate.y).toBeGreaterThanOrEqual(header.y + header.height - 0.5);
        });
      }
    }
  });
}

// F4642: at 320 px "Join the chat" ran past the window's right edge (7v's pictures): the hero's calls wrap to a second row before they leave
// the page's 16 px gutter, and at 390 px they share a row, as the approved hero-390 draws them.
for (const width of [320, 390] as const)
  test(`the hero's calls stand inside the page's 16 px gutter at ${String(width)} px, wrapping before they overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await hydrated(page);
    // The line's face changes its width, and so whether it wraps: the calls are measured in the page's own fonts.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect(page.locator("[data-hero='actions'] a")).toHaveCount(2);
    const first = await box(page, "[data-hero='actions'] a >> nth=0");
    const second = await box(page, "[data-hero='actions'] a >> nth=1");
    for (const [at, call] of [first, second].entries()) {
      expect(call.x, `call ${String(at)}'s left`).toBeGreaterThanOrEqual(16 - 0.5);
      expect(call.x + call.width, `call ${String(at)}'s right`).toBeLessThanOrEqual(width - 16 + 0.5);
    }
    if (width === 320) expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
    else near(second.y, first.y, "the calls' row");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

// F3274: the bar of the three views stands over the foot of a phone's page; the page leaves it the room, so at the page's end
// nothing of it lies under the bar (the prototype reserves it: lines 770 to 774).
test.describe("the views' bar on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const path of ["/list", "/w/bubble", "/"]) {
    test(`${path}: at the page's end nothing of the page meets the bar`, async ({ page }) => {
      await page.goto(path);
      await hydrated(page);
      // A page long enough to scroll: a block at the end of main stands for what a long page holds.
      await page.evaluate(() => {
        const filler = document.createElement("div");
        filler.setAttribute("data-filler", "");
        filler.style.blockSize = "2000px";
        document.querySelector("main")?.append(filler);
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      const bar = await box(page, "nav[aria-label='Views']");
      const lowest = await page.evaluate(() => {
        const inside = [...document.querySelectorAll("main *")].filter(
          (el) => getComputedStyle(el).position !== "fixed",
        );
        return Math.max(...inside.map((el) => el.getBoundingClientRect().bottom));
      });
      expect(lowest, `the page's last pixel ${String(lowest)}, the bar's top ${String(bar.y)}`).toBeLessThanOrEqual(
        bar.y,
      );
    });
  }
});

// The bug: the fixed plate pushed the chat's slot to 612 px at 1280, so opening a thread hid the room (F3258: and at 1366 the
// message list fell to 242 px wide). 5q's fix pass (review 1): the chat is the plate's dock at the right from 1280 px, 320 px
// wide under 1400 and 360 from it, its lines 300 px wide or more; under 1280 px the plate is a block and the chat the page.
test.describe("the chat's dock beside the plate", () => {
  for (const width of [900, 1279, 1280, 1366, 1399, 1400, 1728, 1900] as const) {
    test(`/w/bubble at ${String(width)} px: the plate and the dock stand side by side from 1280 px, the lines 300 px wide or more`, async ({
      page,
    }) => {
      await open(page, { width, as: "guest-geometry", height: 1080, full: false });
      const beside = await page
        .locator("[data-look='plate']")
        .evaluate((el) => getComputedStyle(el.parentElement ?? el).position === "fixed");
      expect(beside, "the plate is beside the dock from 1280 px, not under it").toBe(width >= 1280);
      const line = await lines(page).first().boundingBox();
      if (line === null) throw new Error("no line");
      expect(line.width, "the line's width").toBeGreaterThanOrEqual(width >= 1280 ? 300 : 600);
      if (!beside) return;
      const [plate, dock] = await Promise.all([box(page, "[data-look='plate']"), box(page, "[data-chat-layout]")]);
      expect(plate.x + plate.width, "the plate ends before the dock").toBeLessThanOrEqual(dock.x);
      expect(Math.abs(dock.width + 2 - (width >= 1400 ? 360 : 320)), "the dock's width").toBeLessThanOrEqual(1);
    });
  }
});
