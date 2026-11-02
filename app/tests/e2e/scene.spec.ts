import AxeBuilder from "@axe-core/playwright";
import { moodAt, newMood } from "../../../packages/core/src/space/mood.ts";
import { cacheContents, controlled, expect, hydrated, test, type Page } from "./fixtures.ts";
import { brightness } from "./geometry.ts";
import { loseContext, opened, restoreContext, running, stats } from "./sceneStage.ts";

// The scene in a real browser, on the software GPU the gate has, under the page's real CSP (the fixtures fail a journey on any
// violation). `?test-gpu` lets that GPU through in a test build only: dataFiles.test.ts holds a production build to it.
const SCENE = /\/assets\/scene-[\w-]+\.js$/;
const DOOR = /\/assets\/(?:mountUniverse|scene)-/;
const HOME = "/?test-gpu";
const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

// Frames served by the screen to anyone at all, counted before any of the page's code runs: a second loop hidden in a library
// shows here, where the scene's own count would not see it.
const countFrames = (page: Page) =>
  page.addInitScript(() => {
    const ask = globalThis.requestAnimationFrame.bind(globalThis);
    Reflect.set(globalThis, "__served", 0);
    globalThis.requestAnimationFrame = (run) =>
      ask((time) => {
        Reflect.set(globalThis, "__served", Number(Reflect.get(globalThis, "__served")) + 1);
        run(time);
      });
  });
const served = (page: Page) => page.evaluate(() => Number(Reflect.get(globalThis, "__served")));

// The frames served in a stretch of real time, with the clock left to run.
async function servedOver(page: Page, ms: number): Promise<number> {
  const before = await served(page);
  await page.evaluate((wait) => new Promise((done) => setTimeout(done, wait)), ms);
  return (await served(page)) - before;
}

// A tab sent to the back: headless Chromium never hides one, so the document says it is and tells the page, as the browser would.
const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

const worlds = (page: Page) => page.getByRole("navigation", { name: "Worlds" });

// The chunks that match as the page asks for them, from now on.
function asks(page: Page, chunks: RegExp): string[] {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (chunks.test(request.url())) asked.push(request.url());
  });
  return asked;
}

async function offered(page: Page) {
  await page.goto(HOME);
  await hydrated(page);
  const view = page.getByRole("button", { name: "View in space" });
  await expect(view).toBeVisible();
  return view;
}

// A place with no haze along the view, found as a journey needs it: there the stage's own black shows between the stars.
function emptySpot() {
  const mood = newMood();
  const hazeAround = (spot: { x: number; y: number; z: number }) =>
    [120, 260, 520, 1000].some((reach) =>
      [-320, 0, 320].some((side) => {
        moodAt(mood, { x: spot.x + side, y: spot.y + side, z: spot.z - reach });
        return mood.haze > 0;
      }),
    );
  for (let at = 1; at < 10_000; at += 1) {
    const spot = { x: at * 997, y: at * 613, z: at * -1409 };
    if (!hazeAround(spot)) return spot;
  }
  throw new Error("no empty place in reach");
}

const goToEmpty = (page: Page) =>
  page.evaluate((to) => {
    (Reflect.get(globalThis, "__gnoworldScene") as { moveTo: (at: typeof to) => void }).moveTo(to);
  }, emptySpot());

// The darkest patch of the window's right half, where the page holds no word: the scenery lights the rest.
const darkest = async (page: Page) => {
  const patches = Array.from({ length: 12 }, (_, row) =>
    Array.from({ length: 16 }, (_, column): [number, number, number, number] => {
      const [x, y] = [COMPUTER.width / 2 + column * 20, 120 + row * 50];
      return [x, y, x + 8, y + 8];
    }),
  ).flat();
  return Math.min(...(await brightness(page, await page.screenshot(), patches)));
};

test.describe("a computer", () => {
  test.use({ viewport: COMPUTER });

  test("draws the frames' deep black over the page's, with no CSP violation", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    // The page's #05070d reads 6.8; the frames' rgb(1, 1, 1) reads 1.
    expect(await darkest(page), "the page's own colour before the scene").toBeGreaterThan(5);
    await page.goto(HOME);
    await running(page);
    await opened(page);
    await goToEmpty(page);
    await expect.poll(() => darkest(page)).toBeLessThan(1.5);
  });

  test("keeps every place reachable over the scene, and passes axe", async ({ page }) => {
    await page.goto(HOME);
    await running(page);
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("the space opens like an iris, on the design system's easing, and leaves no clip behind", async ({ page }) => {
    await page.goto(HOME);
    await running(page);
    const iris = await page.locator("canvas").evaluate((canvas) =>
      canvas.getAnimations().map((each) => ({
        name: "animationName" in each ? each.animationName : "",
        easing: each.effect?.getComputedTiming().easing,
        duration: each.effect?.getComputedTiming().duration,
      })),
    );
    expect(iris).toEqual([expect.objectContaining({ duration: 1500 })]);
    await expect.poll(() => page.locator("canvas").evaluate((canvas) => canvas.getAnimations().length)).toBe(0);
    expect(await page.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).clipPath)).toBe("none");
  });

  test("a page that does not show space asks for none of its code, and the first that does asks", async ({ page }) => {
    const asked = asks(page, DOOR);
    await page.goto("/list?test-gpu");
    await hydrated(page);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(asked).toEqual([]);
    await page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: "Cosmos" }).click();
    await expect(page.locator("canvas")).toBeAttached();
    expect(asked.length).toBeGreaterThan(0);
  });

  test("a software GPU gets the list, and nothing of three", async ({ page }) => {
    const asked = asks(page, SCENE);
    await page.goto("/");
    await hydrated(page);
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toBeVisible();
    await expect(page.locator("canvas[data-scene='none']")).toBeAttached();
    expect(asked).toEqual([]);
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View in space" })).toHaveCount(0);
  });

  test("a lost context shows the list, and the scene comes back with its context", async ({ page }) => {
    await page.goto(HOME);
    await running(page);
    await loseContext(page);
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Space is not available here" })).toBeVisible();
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toBeVisible();
    await restoreContext(page);
    await running(page);
    const frames = (await stats(page)).frames;
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(frames);
    await opened(page);
    await goToEmpty(page);
    // The black of before, not the cleared context's rgb(0, 0, 0): a restore rebuilds three's background. Read after the iris, or the
    // page's colour would pass the first bound; the upper one first, for the page's colour is over it.
    await expect.poll(() => darkest(page)).toBeLessThan(1.5);
    expect(await darkest(page)).toBeGreaterThan(0.5);
  });
});

// Every route, by its first visit: the cosmos of each universe, the Earth and a world's page (its planet, since 7e) show space, and no
// other page asks for its code.
test.describe("which pages show space", () => {
  test.use({ viewport: COMPUTER });

  for (const path of [
    "/",
    "/net/onyx",
    "/net/gnoland",
    "/earth",
    "/net/gnoland/earth",
    "/w/bubble",
    "/net/onyx/w/bubble",
  ])
    test(`${path} does`, async ({ page }) => {
      await page.goto(`${path}?test-gpu`);
      await running(page);
    });

  for (const path of ["/list", "/nowhere"])
    test(`${path} does not`, async ({ page }) => {
      const asked = asks(page, DOOR);
      await page.goto(`${path}?test-gpu`);
      await hydrated(page);
      await expect(page.locator("h1").first()).toBeVisible();
      expect(asked).toEqual([]);
      await expect(page.locator("canvas")).toHaveCount(0);
    });
});

test.describe("the loop", () => {
  test.use({ viewport: COMPUTER });

  test("no frame is served in a hidden tab, and it comes back", async ({ page }) => {
    await countFrames(page);
    await page.goto(HOME);
    await running(page);
    await setHidden(page, true);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await servedOver(page, 500)).toBe(0);
    await setHidden(page, false);
    await expect.poll(() => servedOver(page, 200)).toBeGreaterThan(0);
  });

  test("no frame is served on a page that covers the scene, and it comes back unrebuilt", async ({ page }) => {
    await countFrames(page);
    await page.goto(HOME);
    await running(page);
    const first = await page.evaluateHandle(() => Reflect.get(globalThis, "__gnoworldScene") as unknown);
    await page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: "List" }).click();
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await servedOver(page, 500)).toBe(0);
    await page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: "Cosmos" }).click();
    await running(page);
    await expect.poll(() => servedOver(page, 200)).toBeGreaterThan(0);
    expect(await first.evaluate((was) => was === Reflect.get(globalThis, "__gnoworldScene"))).toBe(true);
  });

  test("asks at most 10 frames a second after a minute with no input", async ({ page }) => {
    await page.clock.install();
    await countFrames(page);
    // A device known slow runs no probe, which would hold the loop at 60 for its two seconds.
    await page.addInitScript(() => {
      localStorage.setItem("gnoworld:scene:tier", "low");
    });
    await page.goto(HOME);
    await running(page);
    await page.clock.fastForward(61_000);
    expect(await servedOver(page, 2000)).toBeLessThanOrEqual(22);
  });

  test("reduced motion draws its frame, then none, and opens no iris", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await countFrames(page);
    await page.goto(HOME);
    await running(page);
    expect(await page.locator("canvas").evaluate((canvas) => canvas.getAnimations().length)).toBe(0);
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(0);
    expect((await stats(page)).probing).toBe(false);
    // The first layout owes its frame: at rest once that has passed.
    await expect.poll(() => servedOver(page, 300)).toBe(0);
  });

  test("the Auto probe drops a slow device to Low and remembers it", async ({ page }) => {
    // A screen of 25 Hz, the frames 40 ms apart however fast this machine is.
    await page.addInitScript(() => {
      globalThis.requestAnimationFrame = (run) =>
        setTimeout(() => {
          run(performance.now());
        }, 40);
    });
    await page.goto(HOME);
    await running(page);
    await expect.poll(async () => (await stats(page)).tier).toBe("low");
    expect(await page.evaluate(() => localStorage.getItem("gnoworld:scene:tier"))).toBe("low");
    await page.reload();
    await running(page);
    expect(await stats(page)).toMatchObject({ tier: "low", probing: false });
  });
});

// The worker would answer these requests itself, past `page.route`: with it off, the fault is the one planted.
test.describe("a chunk that does not come", () => {
  test.use({ viewport: COMPUTER, serviceWorkers: "block" });

  test("shows the page without waiting for the 3D, which comes after the text", async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((done) => {
      release = done;
    });
    let asked = false;
    await page.route(SCENE, async (route) => {
      asked = true;
      await held;
      await route.continue();
    });
    await page.goto(HOME);
    await hydrated(page);
    await expect(page.locator("h1")).toContainText("in Onyx");
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toBeVisible();
    await expect.poll(() => asked, "the page holds the 3D's request, not the other way round").toBe(true);
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
    release();
    await running(page);
  });

  test("a scene that cannot load leaves the page whole, and says so", async ({ page }) => {
    await page.route(SCENE, (route) => route.abort());
    await page.goto(HOME);
    await expect(page.getByRole("status").filter({ hasText: "Space is not available here" })).toBeVisible();
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toBeVisible();
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
  });

  test("a universe that cannot load leaves the page whole, with its list", async ({ page }) => {
    await page.route(/\/assets\/mountUniverse-[\w-]+\.js$/, (route) => route.abort());
    await page.goto(HOME);
    await hydrated(page);
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toBeVisible();
    await expect(page.locator("h1")).toContainText("in Onyx");
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("a load that fails under the finger leaves no busy button, and the focus in the page", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.route(SCENE, (route) => route.abort());
    await page.goto(HOME);
    await page.getByRole("button", { name: "View in space" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Space is not available here" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View in space" })).toHaveCount(0);
    await expect(page.locator("h1")).toBeFocused();
  });
});

test.describe("a touch screen at 3x", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test("takes the touch screen's cap on its pixels, and fills the screen", async ({ page }) => {
    await page.goto(HOME);
    await page.getByRole("button", { name: "View in space" }).click();
    await running(page);
    expect((await stats(page)).ratio).toBe(1);
    await expect.poll(async () => (await page.locator("canvas").boundingBox())?.width).toBe(PHONE.width);
  });
});

test.describe("a phone", () => {
  test.use({ viewport: PHONE });

  test("loads nothing of the 3D before View in space, the worker included", async ({ page }) => {
    const asked = asks(page, SCENE);
    const view = await offered(page);
    await controlled(page);
    expect(asked).toEqual([]);
    expect((await cacheContents(page)).paths.filter((path) => SCENE.test(path))).toEqual([]);
    await view.click();
    await running(page);
    expect(asked.length).toBeGreaterThan(0);
    await expect(view).toHaveCount(0);
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(0);
  });

  test("View in space sits over the ticker, inside the gutter, and passes axe", async ({ page }) => {
    const box = await (await offered(page)).boundingBox();
    const ticker = await page.getByRole("region", { name: "News and events" }).boundingBox();
    if (box === null || ticker === null) throw new Error("a box is missing");
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width - 16);
    expect(box.y + box.height).toBeLessThanOrEqual(ticker.y);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("View in space looks as approved", async ({ page }) => {
    await expect(await offered(page)).toHaveScreenshot("view-in-space-390.png");
  });

  test("the keyboard reaches View in space after the page's links", async ({ page }) => {
    const view = await offered(page);
    const order = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((each) => each.textContent === "View in space");
      const main = document.querySelector("main");
      if (button === undefined || main === null) throw new Error("no button or no main");
      return main.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order).not.toBe(0);
    await view.focus();
    await page.keyboard.press("Enter");
    await running(page);
    await expect(page.locator("h1")).toBeFocused();
  });

  test("the phone ends at 899 px: there it waits to be asked, at 900 px it loads by itself", async ({ page }) => {
    await page.setViewportSize({ width: 899, height: 844 });
    await page.goto(HOME);
    await expect(page.getByRole("button", { name: "View in space" })).toBeVisible();
    await page.setViewportSize({ width: 900, height: 844 });
    await page.reload();
    await running(page);
    await expect(page.getByRole("button", { name: "View in space" })).toHaveCount(0);
  });

  test("the data saver waits to be asked on a computer too, left of the rail and level with the hero", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1728, height: 1080 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { value: { saveData: true } });
    });
    await page.goto(HOME);
    const view = page.getByRole("button", { name: "View in space" });
    await expect(view).toBeVisible();
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
    const box = await view.boundingBox();
    if (box === null) throw new Error("no button");
    // The rail's column in f0004 and f0017 starts at x 1585; the hero's foot is 64 px from the window's.
    expect(box.x + box.width).toBeLessThanOrEqual(1585);
    expect(box.y + box.height).toBe(1080 - 64);
  });

  test("the failure's line stays clear of the markets at 900 px, and of the links at 390", async ({ page }) => {
    await page.route(SCENE, (route) => route.abort());
    for (const size of [{ width: 900, height: 900 }, PHONE]) {
      await page.setViewportSize(size);
      await page.goto(HOME);
      const view = page.getByRole("button", { name: "View in space" });
      if (size === PHONE) await view.click();
      const line = page.getByRole("status").filter({ hasText: "Space is not available here" });
      await expect(line).toBeVisible();
      const box = await line.boundingBox();
      if (box === null) throw new Error("no line");
      expect(box.x + box.width).toBeLessThanOrEqual(size.width - 16);
    }
  });
});
