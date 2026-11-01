import AxeBuilder from "@axe-core/playwright";
import { cacheContents, controlled, expect, hydrated, test, type Page } from "./fixtures.ts";
import { brightness } from "./geometry.ts";

// The scene in a real browser, on the software GPU the gate has, under the page's real CSP (the fixtures fail a journey on any
// violation). `?test-gpu` lets that GPU through in a test build only: dataFiles.test.ts holds a production build to it.
const SCENE = /\/assets\/scene-[\w-]+\.js$/;
const HOME = "/?test-gpu";
const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

interface Stats {
  frames: number;
  tier: "high" | "low";
  ratio: number;
  probing: boolean;
  calls: number;
  geometries: number;
  textures: number;
}

const stats = (page: Page) =>
  page.evaluate(() => {
    const scene: unknown = Reflect.get(globalThis, "__gnoworldScene");
    return (scene as { stats: () => Stats }).stats();
  });

const running = (page: Page) => expect(page.locator("canvas[data-scene='on']")).toBeAttached();

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

// The scene's chunk as the page asks for it, from now on.
function sceneAsks(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (SCENE.test(request.url())) asked.push(request.url());
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

// A patch of the window's right edge, where the page holds no word.
const patch = async (page: Page) => {
  const clip = { x: COMPUTER.width - 40, y: 400, width: 8, height: 8 };
  const [light] = await brightness(page, await page.screenshot({ clip }), [[0, 0, clip.width, clip.height]]);
  return light ?? Infinity;
};

test.describe("a computer", () => {
  test.use({ viewport: COMPUTER });

  test("draws the frames' deep black over the page's, with no CSP violation", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    // The page's #05070d reads 6.8; the frames' rgb(1, 1, 1) reads 1.
    expect(await patch(page), "the page's own colour before the scene").toBeGreaterThan(5);
    await page.goto(HOME);
    await running(page);
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(0);
    await expect.poll(() => patch(page)).toBeLessThan(1.5);
  });

  test("keeps every place reachable over the scene, and passes axe", async ({ page }) => {
    await page.goto(HOME);
    await running(page);
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("a page that does not show space asks for none of its code, and the first that does asks", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (request) => {
      if (/\/assets\/(?:mountUniverse|scene)-/.test(request.url())) asked.push(request.url());
    });
    await page.goto("/w/bubble?test-gpu");
    await hydrated(page);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(asked).toEqual([]);
    await page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: "Cosmos" }).click();
    await expect(page.locator("canvas")).toBeAttached();
    expect(asked.length).toBeGreaterThan(0);
  });

  test("a software GPU gets the list, and nothing of three", async ({ page }) => {
    const asked = sceneAsks(page);
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
    await page.evaluate(() => {
      const context = document.querySelector("canvas")?.getContext("webgl2");
      Reflect.set(globalThis, "__lose", context?.getExtension("WEBGL_lose_context"));
      (Reflect.get(globalThis, "__lose") as WEBGL_lose_context).loseContext();
    });
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Space is not available here" })).toBeVisible();
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toBeVisible();
    await page.evaluate(() => {
      (Reflect.get(globalThis, "__lose") as WEBGL_lose_context).restoreContext();
    });
    await running(page);
    const frames = (await stats(page)).frames;
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(frames);
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

  test("reduced motion draws its frame, then none", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await countFrames(page);
    await page.goto(HOME);
    await running(page);
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
    const asked = sceneAsks(page);
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

  test("the data saver waits to be asked on a computer too", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { value: { saveData: true } });
    });
    await page.goto(HOME);
    await expect(page.getByRole("button", { name: "View in space" })).toBeVisible();
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
  });
});
