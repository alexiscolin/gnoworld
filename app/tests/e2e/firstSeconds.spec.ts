import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { reading } from "./pixels.ts";
import { landed, running, stats } from "./sceneStage.ts";

// The first seconds (ADR-0003): a newcomer's arrival says what gnoworld is over the dive, and "Start here" in the Earth's label is the one
// filled call; once a place was entered, the return is the video's (frame 4): no opening, the Earth's heat, "Go explore" filled and "Join the
// chat" beside it. On the software GPU, with the recorded worlds' file.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const PHONE = { width: 390, height: 844 };
const RECORDED = readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8");
const SLOW = { timeout: 90_000 };
const EARTH_HERE = { world: "earth", here: 184, perHour: 130, rise: 0.21 };

test.describe.configure({ timeout: 180_000 });

const served = (page: Page, worlds: unknown[] = [EARTH_HERE]) =>
  Promise.all([
    page.route("**/worlds.json", (route) => route.fulfill({ body: RECORDED, contentType: "application/json" })),
    page.route("**/api/presence", (route) =>
      route.fulfill({ body: JSON.stringify({ worlds }), contentType: "application/json" }),
    ),
  ]);
const opening = (page: Page) => page.locator("[data-opening]");
const explore = (page: Page) => page.getByRole("link", { name: "Go explore" });
const chat = (page: Page) => page.getByRole("link", { name: "Join the chat" });
// The cream primary's fill, read off the page's own token, so a filled call is the one the design system fills.
const filled = (link: ReturnType<Page["getByRole"]>) =>
  link.evaluate((element) => {
    const probe = document.createElement("i");
    probe.style.setProperty("color", "var(--color-primary)");
    document.body.append(probe);
    const cream = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(element).backgroundColor === cream;
  });

async function arrive(
  page: Page,
  size = COMPUTER,
  { motion = "no-preference", path = HOME }: { motion?: "reduce" | "no-preference"; path?: string } = {},
) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto(path);
  await hydrated(page);
}

interface Part {
  readonly name: string;
  readonly colour: readonly [number, number, number];
  readonly lines: readonly (readonly [number, number, number, number])[];
}

// The opening's words, each part's colour in sRGB and the boxes of its lines in the clip that holds them all, their fill then taken off.
function wordsOf(words: HTMLElement) {
  const pieces = [
    words.querySelector("p > span"),
    ...words.querySelectorAll(":scope > p:nth-of-type(n + 2)"),
    words.querySelector("a"),
  ].filter((piece): piece is HTMLElement => piece instanceof HTMLElement);
  const paint = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
  const rgb = (colour: string): [number, number, number] => {
    if (paint === null) throw new Error("no canvas");
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = colour;
    paint.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0] = paint.getImageData(0, 0, 1, 1).data;
    return [red, green, blue];
  };
  const rects = pieces.map((piece) => {
    const range = document.createRange();
    range.selectNodeContents(piece);
    return [...range.getClientRects()];
  });
  const all = rects.flat();
  const [left, top] = [Math.min(...all.map((r) => r.left)), Math.min(...all.map((r) => r.top))];
  const [right, bottom] = [Math.max(...all.map((r) => r.right)), Math.max(...all.map((r) => r.bottom))];
  const clip = {
    x: Math.floor(left),
    y: Math.floor(top),
    width: Math.ceil(right - left) + 1,
    height: Math.ceil(bottom - top) + 1,
  };
  const parts = pieces.map((piece, at) => ({
    name: piece.textContent.slice(0, 24),
    colour: rgb(getComputedStyle(piece).color),
    lines: (rects[at] ?? []).map(
      (r) =>
        [
          Math.round(r.left) - clip.x,
          Math.round(r.top) - clip.y,
          Math.round(r.right) - clip.x,
          Math.round(r.bottom) - clip.y,
        ] as const,
    ),
  }));
  // The link's focus ring, which the reading's hold draws, is no word.
  for (const piece of pieces) {
    piece.style.setProperty("color", "transparent");
    piece.style.setProperty("outline", "none");
  }
  return { clip, parts };
}

// A newcomer's phone once `press` pressed View in space, the scene come and the focus handed to its heading. What is read then is the
// yield's rule, not its 600 ms fade, which a loaded machine stretches past a poll.
async function spaceOnAPhone(page: Page, press: (button: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await served(page);
  await arrive(page, PHONE);
  await press(page.getByRole("button", { name: "View in space" }));
  await expect(opening(page)).toBeVisible(SLOW);
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName), SLOW).toBe("H1");
  await page.evaluate(() => {
    for (const part of document.querySelectorAll<HTMLElement>("[data-yield]"))
      part.style.setProperty("transition", "none");
  });
}

// In one reading, for the words may leave as the dive lands: whether the hero gives way to them, and the hero's and the list's opacity.
const yielded = (page: Page) =>
  page.evaluate(() => {
    const hero = document.querySelector("[data-hero='number']")?.parentElement;
    const list = document.querySelector("nav[aria-label='Worlds']");
    const opacity = (part: Element | null | undefined) => (part ? getComputedStyle(part).opacity : "");
    return { words: hero?.getAttribute("data-yield"), hero: opacity(hero), list: opacity(list) };
  });

// Whether the dive came to rest, its dissolve over.
const landedNow = async (page: Page) => {
  const dive = (await stats(page)).cosmos?.dive;
  return dive?.along === 1 && dive.veil === 0;
};

// The words over white, the brightest the dive can stand behind them: the scene hidden, the page's ground white, then both given back.
async function overWhite(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const ground = (white: boolean) =>
    page.evaluate((on) => {
      document.documentElement.style.setProperty("background", on ? "white" : "");
      document.querySelector<HTMLElement>("canvas[data-scene]")?.style.setProperty("visibility", on ? "hidden" : "");
    }, white);
  await ground(true);
  const frame = await page.screenshot({ clip });
  await ground(false);
  return frame;
}

// Each part's worst contrast over the frames (WCAG's), against the brightest hundredth of what its lines stand on: a lone star's pixels
// aside, a sun's glow counts.
function contrasts(parts: readonly Part[]) {
  const { images, rgbAt } = Reflect.get(globalThis, "__pixels") as import("./pixels.ts").Tools;
  const linear = (value: number) =>
    value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4;
  const luminance = ([red, green, blue]: readonly number[]) =>
    0.2126 * linear(red ?? 0) + 0.7152 * linear(green ?? 0) + 0.0722 * linear(blue ?? 0);
  return parts.map(({ name, colour, lines }) => {
    let [ratio, frame] = [Infinity, -1];
    images.forEach((image, at) => {
      const behind: number[] = [];
      for (const [x0, y0, x1, y1] of lines)
        for (let y = Math.max(0, y0); y < y1; y++)
          for (let x = Math.max(0, x0); x < x1; x++) behind.push(luminance(rgbAt(image, x, y)));
      behind.sort((a, b) => a - b);
      const bright = behind[Math.floor(behind.length * 0.99)] ?? 0;
      const here = (luminance(colour) + 0.05) / (bright + 0.05);
      if (here < ratio) [ratio, frame] = [here, at];
    });
    return { name, ratio: Math.round(ratio * 100) / 100, frame };
  });
}

test.describe("a newcomer", () => {
  test.use({ newcomer: true });

  test("reads the opening over the dive, which leaves as the camera lands, and is offered one filled call beside the cosmos", async ({
    page,
  }) => {
    await served(page);
    await arrive(page);
    await expect(opening(page)).toBeVisible();
    // F4529, mock-up 1: while the words stand, the hero has given way, still the page's reading; read with the words' own state, for the
    // dive may land soon on a loaded machine.
    const hero = page.locator("[data-hero='number']").locator("..");
    expect(
      await page.evaluate(() => {
        const words = document.querySelector("[data-opening]");
        const box = document.querySelector("[data-hero='number']")?.parentElement;
        return {
          left: words?.hasAttribute("data-left"),
          yielded: box?.getAttribute("data-yield"),
          inert: box?.hasAttribute("inert"),
        };
      }),
    ).toEqual({ left: false, yielded: "opening", inert: false });
    await expect.poll(() => hero.evaluate((box) => getComputedStyle(box).opacity)).toBe("0");
    await expect(opening(page)).toContainText("The living map of gno.land.");
    const about = opening(page).getByRole("link", { name: "What is gno.land?" });
    await expect(about).toHaveAttribute("href", "https://gno.land");
    await expect(about).toHaveAttribute("target", "_blank");
    await expect(about).toHaveAttribute("rel", "noreferrer noopener");
    expect(await opening(page).evaluate((words) => getComputedStyle(words).pointerEvents)).toBe("none");
    expect(await about.evaluate((link) => getComputedStyle(link).pointerEvents)).toBe("auto");
    // F4529, mock-up 1: the kicker in amber.
    expect(
      await opening(page)
        .getByText("gno.world")
        .evaluate((word) => {
          const probe = document.createElement("i");
          probe.style.setProperty("color", "var(--color-warm)");
          document.body.append(probe);
          const warm = getComputedStyle(probe).color;
          probe.remove();
          return getComputedStyle(word).color === warm;
        }),
    ).toBe(true);
    // F4517: a newcomer's page, its opening shown, under the axe as every page is.
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await running(page);
    await landed(page);
    await expect(page.locator("canvas[data-scene]")).toHaveAttribute("data-dive", "landed");
    await expect(opening(page)).toBeHidden();
    await expect(hero).toHaveAttribute("data-yield", "none");
    await expect.poll(() => hero.evaluate((box) => getComputedStyle(box).opacity)).toBe("1");
    await expect(page.locator("[data-hero='line']")).toHaveText(/worlds in Onyx\. Each one is a place to talk\.$/);
    await expect(explore(page)).toBeVisible();
    expect(await filled(explore(page))).toBe(false);
    await expect(chat(page)).toBeHidden();
  });

  // F4643: the line crossed the dive's brightest stars, "what's being built", "trending" and "and" lost behind them (7o's pictures). Each
  // part of the words, the link included, keeps 4.5:1 against the brightest hundredth of what stands behind its lines, over white, the
  // brightest the dive can show, and on frames of the whole dive, the focus on the link holding the words; their fill off for the reading.
  test("keeps the opening's words at 4.5:1 against the dive behind them, until the camera lands", async ({ page }) => {
    await served(page);
    await arrive(page);
    await expect(opening(page)).toBeVisible();
    const { clip, parts } = await opening(page).evaluate(wordsOf);
    await opening(page).getByRole("link").focus();
    const frames = [await overWhite(page, clip)];
    await running(page);
    // Through the dive and into its landing, where the labels come: three frames at least, however fast a loaded machine lands it.
    let dived = 0;
    while ((dived < 3 || !(await landedNow(page))) && dived < 40) {
      frames.push(await page.screenshot({ clip }));
      dived += 1;
    }
    await expect(opening(page)).not.toHaveAttribute("data-left");
    const worst = await reading(page, frames, [contrasts, parts]);
    for (const { name, ratio, frame } of worst)
      expect
        .soft(ratio, `${name}, at its worst on frame ${String(frame)} of ${String(frames.length)}`)
        .toBeGreaterThanOrEqual(4.5);
  });

  test("shortens the opening at a key, before the camera landed", async ({ page }) => {
    await served(page);
    await arrive(page);
    await expect(opening(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(opening(page)).toBeHidden({ timeout: 2_000 });
    await expect(page.locator("canvas[data-dive='landed']")).toHaveCount(0);
  });

  test("under reduced motion, shows the words, then gives way to the dissolve", async ({ page }) => {
    await served(page);
    await arrive(page, COMPUTER, { motion: "reduce" });
    await expect(opening(page)).toBeVisible();
    await running(page);
    await expect(page.locator("canvas[data-scene]")).toHaveAttribute("data-dive", "landed", SLOW);
    await expect(opening(page)).toBeHidden();
  });

  test("sees no opening on the home after a shared link to a world", async ({ page }) => {
    await served(page);
    await arrive(page, COMPUTER, { path: "/w/bubble?test-gpu" });
    await page.getByRole("link", { name: "Cosmos", exact: true }).click();
    await expect(page).toHaveURL(/\/(\?test-gpu)?$/, SLOW);
    await running(page);
    await expect(opening(page)).toHaveCount(0);
  });

  test("on a phone, sees no opening before View in space, and keeps the video's pair of calls", async ({ page }) => {
    await served(page);
    await arrive(page, PHONE);
    await expect(page.getByRole("button", { name: "View in space" })).toBeVisible();
    await expect(opening(page)).toHaveCount(0);
    expect(await filled(explore(page))).toBe(true);
    await expect(chat(page)).toBeVisible();
  });

  // F4644: on a phone, View in space hands the focus to the page's heading, the hero's, and the hero stood under the opening's words: it gives
  // way to them still, and comes back as the keyboard reaches it.
  test("on a phone, gives the hero's place to the opening once View in space is pressed, and back to the keyboard", async ({
    page,
  }) => {
    await spaceOnAPhone(page, (button) => button.click());
    // F4648: the page's list of worlds, under the hero on a phone, gives way with it.
    await expect.poll(() => yielded(page)).toEqual({ words: "opening", hero: "0", list: "0" });
    await page.keyboard.press("Tab");
    // Still the words' time: the hero came back for the keyboard, not because they left.
    await expect.poll(() => yielded(page)).toEqual({ words: "opening", hero: "1", list: "0" });
  });

  // F4651: pressed with the keyboard, View in space hands its heading a focus the browser draws, which brought the hero back under the words.
  test("on a phone, keeps the hero given way when View in space is pressed with the keyboard", async ({ page }) => {
    await spaceOnAPhone(page, async (button) => {
      await button.focus();
      await page.keyboard.press("Enter");
    });
    await expect.poll(() => yielded(page)).toEqual({ words: "opening", hero: "0", list: "0" });
  });

  // F4518: where no cosmos stands, no "Start here" either: the filled call and the way to the chat stay.
  test("keeps the video's pair on a computer whose scene does not run", async ({ page }) => {
    await served(page);
    await arrive(page, COMPUTER, { path: "/" });
    await expect(page.locator("canvas[data-scene='none']")).toBeAttached(SLOW);
    expect(await filled(explore(page))).toBe(true);
    await expect(chat(page)).toBeVisible();
    await expect(opening(page)).toHaveCount(0);
  });
});

test.describe("a reader who came back", () => {
  test("goes with Go explore to the world with the most people now, through the flight", async ({ page }) => {
    await served(page, [
      EARTH_HERE,
      { world: "bubble", here: 2, perHour: 0, rise: null },
      { world: "govdao", here: 5, perHour: 0, rise: null },
    ]);
    await arrive(page);
    await running(page);
    await landed(page);
    await explore(page).click();
    // The click asks its chunk and the server, then the router flies: slow on a software GPU, whose frames hold the page's thread.
    await expect(page).toHaveURL(/\/w\/govdao/, SLOW);
    await expect.poll(async () => (await stats(page)).flight?.flights ?? 0, SLOW).toBeGreaterThan(0);
  });

  test("hears each view described, and sees nothing drawn under the tabs", async ({ page }) => {
    await arrive(page);
    const views = page.getByRole("navigation", { name: "Views" });
    await expect(views.getByRole("link", { name: "Earth", exact: true })).toHaveAccessibleDescription(
      "where everyone talks",
    );
    await expect(views.getByRole("link", { name: "Cosmos", exact: true })).toHaveAccessibleDescription("every world");
    await expect(views.getByRole("link", { name: "List", exact: true })).toHaveAccessibleDescription(
      "every world, as text",
    );
    await expect(page.getByText("where everyone talks")).toHaveCount(0);
  });

  test("sees the page's list of worlds under its Worlds kicker where no rail stands", async ({ page }) => {
    await arrive(page, PHONE);
    const list = page.getByRole("navigation", { name: "Worlds" });
    await expect(list.locator("p").first()).toHaveText("Worlds");
    await expect(list.getByRole("link", { name: "Bubble" })).toBeVisible();
  });
});

// The labels' part (ADR-0003, 2b and 2e): "Start here" in the Earth's label, the labels as doors, the larger labels.

const earthLabel = (page: Page) => page.locator("[data-labels] [data-world='earth']");
const opened = (label: ReturnType<Page["locator"]>) =>
  label.evaluate((element) => getComputedStyle(element, "::before").content);
// A world's label the layout shows, the one the pointer reaches at its middle, held by the world it names: a hidden one stands at opacity 0,
// which Playwright counts as visible, and the shown ones change as the eye sways, so "the first shown" names another label at each reading.
async function shownWorld(page: Page) {
  const reached = () =>
    page.evaluate(() => {
      const labels = [
        ...document.querySelectorAll<HTMLElement>("[data-labels] [data-world]:not([data-world='earth'])"),
      ];
      const found = labels.find((label) => {
        if (label.style.opacity !== "1") return false;
        const { left, top, width, height } = label.getBoundingClientRect();
        return document.elementFromPoint(left + width / 2, top + height / 2)?.closest("[data-world]") === label;
      });
      return found?.dataset["world"] ?? "";
    });
  let world = "";
  await expect
    .poll(async () => {
      world = await reached();
      return world;
    }, SLOW)
    .not.toBe("");
  return page.locator(`[data-labels] [data-world="${world}"]`);
}

test.describe("a newcomer's Earth label", () => {
  test.use({ newcomer: true });

  test("says Start here, the one filled call, enters the Earth at a click, and the return is the video's", async ({
    page,
  }) => {
    await served(page);
    await arrive(page);
    await running(page);
    await landed(page);
    await expect(earthLabel(page)).toContainText("Start here →", SLOW);
    await expect(earthLabel(page)).not.toContainText("▲");
    expect(await filled(explore(page))).toBe(false);
    // F4509: the Earth's label larger than the others, its call amber with a glow.
    const start = await earthLabel(page).evaluate((label) => {
      const other = document.querySelector("[data-labels] [data-world]:not([data-world='earth'])");
      const probe = document.createElement("i");
      probe.style.setProperty("color", "var(--color-warm)");
      document.body.append(probe);
      const warm = getComputedStyle(probe).color;
      probe.remove();
      const [title, , badge] = [...label.children].map((part) => getComputedStyle(part));
      const size = (part: Element | null | undefined) =>
        part === null || part === undefined ? 0 : parseFloat(getComputedStyle(part).fontSize);
      return {
        larger: parseFloat(title?.fontSize ?? "0") > size(other?.children[0]),
        warm: badge?.backgroundColor === warm,
        glow: badge?.boxShadow !== "none",
      };
    });
    expect(start).toEqual({ larger: true, warm: true, glow: true });
    await page.locator("canvas").evaluate((canvas) => {
      canvas.style.visibility = "hidden";
    });
    await expect(earthLabel(page)).toHaveScreenshot("label-earth-start.png");
    await page.locator("canvas").evaluate((canvas) => {
      canvas.style.visibility = "";
    });
    // A label moves with the eye on every frame, so it is never still for a click's wait.
    await earthLabel(page).click({ force: true });
    await expect(page).toHaveURL(/\/earth$/, SLOW);
    await expect(page.getByRole("heading", { level: 1, name: "Earth" })).toBeVisible(SLOW);

    await page.goto(HOME);
    await hydrated(page);
    await running(page);
    await expect(opening(page)).toHaveCount(0);
    await landed(page);
    await expect(earthLabel(page)).toContainText("▲ 21% · 130/h", SLOW);
    await expect(earthLabel(page)).not.toContainText("Start here");
    expect(await filled(explore(page))).toBe(true);
    await expect(chat(page)).toBeVisible();
    await chat(page).click();
    await expect(page).toHaveURL(/\/earth$/, SLOW);
    // F4515: the Earth's general room, read with no account asked.
    await expect(page.locator("#chat")).toContainText("General chat", SLOW);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("sees no Start here after a shared link to a world: a place was entered", async ({ page }) => {
    await served(page);
    await arrive(page, COMPUTER, { path: "/w/bubble?test-gpu" });
    await page.getByRole("link", { name: "Cosmos", exact: true }).click();
    await expect(earthLabel(page)).toContainText("Earth", SLOW);
    await expect(earthLabel(page)).not.toContainText("Start here");
  });
});

// F4500: on a touch screen nothing hovers, so the first tap opens a label and the second enters.
test.describe("a reader with a finger", () => {
  test.use({ hasTouch: true });

  test("opens a world's label at a first tap, and enters its page at a second", async ({ page }) => {
    await served(page);
    await arrive(page);
    await running(page);
    await landed(page);
    const before = page.url();
    // F4525: a label moves with the eye; each try taps a label the layout shows and the pointer reaches now.
    let world = await shownWorld(page);
    await expect
      .poll(async () => {
        world = await shownWorld(page);
        await world.tap({ force: true });
        return opened(world);
      }, SLOW)
      .toContain("Enter →");
    expect(page.url()).toBe(before);
    await world.tap({ force: true });
    await expect.poll(() => page.url(), SLOW).not.toBe(before);
    expect(new URL(page.url()).pathname).toMatch(/^\/(w|r)\//);
  });
});

test.describe("a reader who came back, and the labels", () => {
  test("sees a world's label open to Enter under the pointer, and enters its page at a click", async ({ page }) => {
    await served(page);
    await arrive(page);
    await running(page);
    await landed(page);
    // A label sways with the eye, and one the layout hides takes no pointer: each try lays the pointer on a label it reaches now.
    await expect
      .poll(async () => {
        const world = await shownWorld(page);
        await world.hover({ force: true });
        return opened(world);
      }, SLOW)
      .toContain("Enter →");
    const before = page.url();
    await (await shownWorld(page)).click({ force: true });
    await expect.poll(() => page.url(), SLOW).not.toBe(before);
    expect(new URL(page.url()).pathname).toMatch(/^\/(w|r)\//);
  });

  test("reads the labels larger: names at 16 px, figures at 15 px", async ({ page }) => {
    await served(page);
    await arrive(page);
    await running(page);
    await landed(page);
    await expect(earthLabel(page)).toContainText("184 here", SLOW);
    const sizes = await earthLabel(page).evaluate((element) =>
      [...element.children].slice(0, 2).map((part) => getComputedStyle(part).fontSize),
    );
    expect(sizes).toEqual(["16px", "15px"]);
  });
});
