import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { framesOf } from "./sceneStage.ts";

// The Earth (frames 37 to 42) on the software GPU the gate has, under the page's real CSP (the fixtures fail a journey on any violation).
// Reduced motion draws once a change: a software GPU takes seconds a frame, and nothing here depends on the arrival.
const EARTH = "/earth?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const PHONE = { width: 390, height: 844 };
const MAP = /\/textures\/(?:earth-day|earth-night|clouds|moon)(?:\.\d+\.[0-9a-f]{8})?\.webp$/;
const EARTH_MAP = /\/textures\/(?:earth-day|earth-night|moon)\./;
const NIGHT = /\/textures\/earth-night\.2048\.[0-9a-f]{8}\.webp$/;
const FULL_NIGHT = "/textures/earth-night.4096.";
const SLOW = { timeout: 90_000 };

// A software GPU decodes and uploads four maps, and draws a frame, in tens of seconds at the worst.
test.describe.configure({ timeout: 180_000 });

// The Earth's maps the page asks for, as it asks for them, from now on.
function mapsAsked(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (MAP.test(request.url())) asked.push(new URL(request.url()).pathname);
  });
  return asked;
}

// The globe's room is kept, or the plate is open.
const kept = (page: Page) => page.locator("[data-earth='loading'], [data-earth='drawn']");
const credits = (page: Page) => page.getByRole("button", { name: "Credits", exact: true });

// A frame drawn after the Earth reached the stage: the page says drawn as it goes on stage, before any frame shows it.
const painted = async (page: Page) => {
  await expect(page.locator("[data-earth='drawn']")).toBeAttached(SLOW);
  const before = await framesOf(page);
  await expect.poll(() => framesOf(page), SLOW).toBeGreaterThan(before);
};

test.describe("the pages that hold no Earth", () => {
  test.use({ viewport: COMPUTER });

  // A world's page draws its own planet first: its first screen preloads its own maps and none of the Earth's, and the maps of the planets
  // seen next, the Earth's among its system's, are asked only once its own have come.
  test("/w/bubble?test-gpu preloads none of the Earth's maps, and asks them only after its own", async ({ page }) => {
    const html = await (await page.request.get("/w/bubble")).text();
    const own = [...html.matchAll(/<link rel="preload" href="(\/textures\/[^"]+)"/g)].map(([, href]) => href ?? "");
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((href) => EARTH_MAP.test(href))).toEqual([]);
    // Each texture's ask and answer, in the order the browser told them.
    const told: { path: string; event: "asked" | "came" }[] = [];
    const tell = (event: "asked" | "came") => (request: { url: () => string }) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/textures/")) told.push({ path: pathname, event });
    };
    page.on("request", tell("asked"));
    page.on("requestfinished", tell("came"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/w/bubble?test-gpu");
    await hydrated(page);
    const came = (path: string) => told.findIndex((one) => one.path === path && one.event === "came");
    await expect.poll(() => own.every((path) => came(path) >= 0), SLOW).toBe(true);
    await page.evaluate(() => new Promise((done) => setTimeout(done, 3000)));
    const lastOwn = Math.max(...own.map(came));
    const others = told.flatMap((one, at) => (one.event === "asked" && !own.includes(one.path) ? [at] : []));
    expect(others.filter((at) => at < lastOwn).map((at) => told[at]?.path)).toEqual([]);
    await expect(kept(page)).toHaveCount(0);
  });
});

// The worker would answer these requests itself, past `page.route`: with it off, the fault is the one planted.
test.describe("a texture that does not come", () => {
  test.use({ viewport: COMPUTER, serviceWorkers: "block" });

  // A map that did not come is asked again; once the Earth's first set is whole, its full-size maps follow.
  test("a map's answer that is no picture counts as one that did not come", async ({ page }) => {
    let answers = 0;
    await page.route(NIGHT, async (route) => {
      answers += 1;
      if (answers === 1) await route.fulfill({ status: 200, contentType: "image/webp", body: "<html>" });
      else await route.fallback();
    });
    const asked = mapsAsked(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(EARTH);
    await expect.poll(() => answers, SLOW).toBeGreaterThan(1);
    await expect.poll(() => asked.some((path) => path.includes(FULL_NIGHT)), SLOW).toBe(true);
  });
});

test.describe("a touch screen", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test("keeps Credits clear of the views' bar, a finger's size", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(EARTH);
    await hydrated(page);
    await page.getByRole("button", { name: "View in space" }).click();
    await painted(page);
    const link = await credits(page).boundingBox();
    const views = await page.getByRole("navigation", { name: "Views" }).boundingBox();
    if (link === null || views === null) throw new Error("no link or no bar");
    expect(link.height).toBeGreaterThanOrEqual(44);
    expect(link.y + link.height).toBeLessThanOrEqual(views.y);
  });
});
