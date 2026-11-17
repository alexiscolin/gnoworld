import { expect, hydrated, test, type Page } from "./fixtures.ts";

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

// The Earth's maps the page asks for, as it asks for them.
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

// A phone has no globe nor views bar (D13711): the Earth is its full chat, and the textures' credit stands in the Rooms drawer.
// The framed Earth stands in front of the plate's words, masking them under its disc, yet takes none of their clicks or keys (D13735): a
// button set just inside its limb, in the plate, is the one a click there reaches, and Tab reaches it.
test.describe("the framed planet in front of the plate", () => {
  test.use({ viewport: COMPUTER });

  test("masks the plate under its disc and leaves its controls pressable and reachable", async ({ page }) => {
    await page.goto(EARTH);
    await hydrated(page);
    await expect(kept(page)).toHaveAttribute("data-earth", "drawn", SLOW);
    const plate = page.locator("[data-look='plate']");
    expect(await plate.evaluate((box) => getComputedStyle(box).maskImage)).toContain("radial-gradient");
    await plate.evaluate((box) => {
      const globe = document.querySelector("[data-globe]")?.getBoundingClientRect();
      const own = box.getBoundingClientRect();
      if (globe === undefined) throw new Error("no globe");
      // Inside the disc: 8 px right of its box's left edge, at its middle's height.
      const [x, y] = [globe.left + 8, globe.top + globe.width / 2];
      const under = document.createElement("button");
      under.type = "button";
      under.textContent = "Under the disc";
      // Through the CSSOM: the site's policy refuses a style attribute set as text.
      Object.assign(under.style, {
        position: "absolute",
        zIndex: "1",
        left: `${String(x - own.left)}px`,
        top: `${String(y - own.top)}px`,
      });
      under.addEventListener("click", () => {
        under.dataset["pressed"] = "";
      });
      box.prepend(under);
    });
    const under = page.getByRole("button", { name: "Under the disc" });
    // The page's arrival still moves the plate a moment: its place once it stands still.
    let at = { x: 0, y: 0 };
    await expect
      .poll(async () => {
        const box = await under.boundingBox();
        const next = box === null ? at : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const still = next.x === at.x && next.y === at.y;
        at = next;
        return still;
      }, SLOW)
      .toBe(true);
    expect(
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.textContent, at),
      "the disc takes no click",
    ).toBe("Under the disc");
    await page.mouse.click(at.x, at.y);
    await expect(under).toHaveAttribute("data-pressed", "");
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    let reached = false;
    for (let step = 0; step < 60 && !reached; step += 1) {
      await page.keyboard.press("Tab");
      reached = await under.evaluate((button) => document.activeElement === button);
    }
    expect(reached, "Tab reaches the button under the disc").toBe(true);
  });
});

test.describe("a touch screen", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test("keeps Credits in the Rooms drawer, a finger's size", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("gnoworld:welcomed", "1");
    });
    await page.goto("/earth");
    await hydrated(page);
    await expect(page).toHaveURL(/\/earth\?.*chat=full/);
    await page
      .getByRole("button", { name: /^Rooms\b/ })
      .first()
      .tap();
    const link = await credits(page).boundingBox();
    if (link === null) throw new Error("no Credits in the drawer");
    expect(link.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("navigation", { name: "Views" })).toHaveCount(0);
  });
});
