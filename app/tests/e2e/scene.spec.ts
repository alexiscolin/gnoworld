import { cacheContents, controlled, expect, hydrated, test, type Page } from "./fixtures.ts";
import type { Space } from "../../src/space/scene.ts";
import { framesOf, goInPage, landed, loseContext, restoreContext, running } from "./sceneStage.ts";
import { axeOf } from "./axe.ts";

// The scene in a real browser, on the software GPU the gate has, under the page's real CSP (the fixtures fail a journey on any
// violation). `?test-gpu` lets that GPU through in a test build only: dataFiles.test.ts holds a production build to it.
const SCENE = /\/assets\/scene-[\w-]+\.js$/;
const DOOR = /\/assets\/(?:mountUniverse|scene)-/;
const HOME = "/?test-gpu";
const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
// Long enough for the view to come to rest on the software GPU.
const REST = { timeout: 30_000 };

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

// Counts, from now, each frame the engine's renderer draws on a live context: a restored context starts its own count of frames again.
const countDraws = (page: Page) =>
  page.evaluate(() => {
    const { renderer } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
    const render = renderer.render.bind(renderer);
    Reflect.set(globalThis, "__draws", 0);
    renderer.render = (scene, camera) => {
      if (!renderer.getContext().isContextLost())
        Reflect.set(globalThis, "__draws", Number(Reflect.get(globalThis, "__draws")) + 1);
      render(scene, camera);
    };
  });
const draws = (page: Page) => page.evaluate(() => Number(Reflect.get(globalThis, "__draws")));

// The frames the engine draws in a stretch of real time: the page's other code asks frames of its own (a tween's ticker).
async function drawnOver(page: Page, ms: number): Promise<number> {
  const before = await framesOf(page);
  await page.evaluate((wait) => new Promise((done) => setTimeout(done, wait)), ms);
  return (await framesOf(page)) - before;
}

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

test.describe("a computer", () => {
  test.use({ viewport: COMPUTER });

  test("keeps every place reachable over the scene, and passes axe", async ({ page }) => {
    await page.goto(HOME);
    await running(page);
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toBeVisible();
    expect((await axeOf(page).analyze()).violations).toEqual([]);
  });

  // D333: the canvas is not seen while its first frame is not whole; it opens as an iris once the dive started and leaves no clip behind.
  test("the canvas stays unseen till the dive starts, then opens whole and leaves no clip behind", async ({ page }) => {
    await page.goto(HOME);
    await running(page);
    await expect(page.locator("canvas[data-dive]")).toBeAttached({ timeout: 90_000 });
    await expect(page.locator("canvas")).not.toHaveAttribute("data-wait");
    await expect.poll(() => page.locator("canvas").evaluate((canvas) => canvas.getAnimations().length)).toBe(0);
    expect(await page.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).clipPath)).toBe("none");
    expect(await page.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).opacity)).toBe("1");
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

  // Under reduced motion the loop rests once the home has landed: a frame after the restore is the restore's own.
  test("draws again with the same engine once a lost context is restored", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(HOME);
    await running(page);
    await landed(page);
    await expect.poll(() => drawnOver(page, 300), REST).toBe(0);
    const first = await page.evaluateHandle(() => Reflect.get(globalThis, "__gnoworldSpace") as unknown);
    await countDraws(page);
    await loseContext(page);
    expect(await draws(page)).toBe(0);
    await restoreContext(page);
    await expect.poll(() => draws(page)).toBeGreaterThan(0);
    expect(await first.evaluate((was) => was === Reflect.get(globalThis, "__gnoworldSpace"))).toBe(true);
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

  test("/nowhere does not", async ({ page }) => {
    const asked = asks(page, DOOR);
    await page.goto("/nowhere?test-gpu");
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

  // A page with no place in space (here the one for an address that leads nowhere) covers it: the engine stays, its loop sleeps.
  test("draws no frame on a page that covers the scene, and comes back unrebuilt", async ({ page }) => {
    await page.goto(HOME);
    await running(page);
    const first = await page.evaluateHandle(() => Reflect.get(globalThis, "__gnoworldSpace") as unknown);
    const covered = () => page.evaluate(() => (Reflect.get(globalThis, "__gnoworldSpace") as Space).covered);
    await goInPage(page, "/nowhere");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect.poll(covered).toBe(true);
    await expect.poll(() => drawnOver(page, 500), REST).toBe(0);
    await goInPage(page, "/");
    await expect.poll(covered).toBe(false);
    await expect.poll(() => drawnOver(page, 200)).toBeGreaterThan(0);
    expect(await first.evaluate((was) => was === Reflect.get(globalThis, "__gnoworldSpace"))).toBe(true);
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
    // The home's dive over first (7d7): while it runs it asks each frame, and its bodies' maps come as it lands.
    await landed(page);
    await page.clock.fastForward(61_000);
    expect(await servedOver(page, 2000)).toBeLessThanOrEqual(22);
  });

  test("reduced motion draws its frame, then none, and opens no iris", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(HOME);
    await running(page);
    expect(await page.locator("canvas").evaluate((canvas) => canvas.getAnimations().length)).toBe(0);
    await expect.poll(() => framesOf(page)).toBeGreaterThan(0);
    // The first layout owes its frame, and the home's dissolve each of its own (7d7): at rest once those have passed.
    await landed(page);
    await expect.poll(() => drawnOver(page, 300), REST).toBe(0);
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

test.describe("a phone", () => {
  test.use({ viewport: PHONE });

  test("loads nothing of the 3D before View in space, the worker included", async ({ page }) => {
    const asked = asks(page, SCENE);
    // A first visit's welcome card covers the button: it is told away.
    await page.addInitScript(() => {
      localStorage.setItem("gnoworld:welcomed", "1");
    });
    const view = await offered(page);
    await controlled(page);
    expect(asked).toEqual([]);
    expect((await cacheContents(page)).paths.filter((path) => SCENE.test(path))).toEqual([]);
    await view.click();
    await running(page);
    expect(asked.length).toBeGreaterThan(0);
    await expect(view).toHaveCount(0);
    await expect.poll(() => framesOf(page)).toBeGreaterThan(0);
  });

  test("View in space sits inside the gutter, and passes axe", async ({ page }) => {
    const box = await (await offered(page)).boundingBox();
    if (box === null) throw new Error("no button");
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width - 16);
    expect((await axeOf(page).analyze()).violations).toEqual([]);
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
