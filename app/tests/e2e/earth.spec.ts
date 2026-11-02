import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box, brightness, near } from "./geometry.ts";
import { countShifts, loseContext, restoreContext, running, shifted, stats } from "./sceneStage.ts";

// The Earth (frames 37 to 42) on the software GPU the gate has, under the page's real CSP (the fixtures fail a journey on any violation).
// Reduced motion draws once a change: a software GPU takes seconds a frame, and nothing here depends on the arrival. The canvas is not
// pixel-compared (the plan, section 6): these hold where things stand, which side is lit, and what is freed.
const EARTH = "/earth?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const PHONE = { width: 390, height: 844 };
const MAP = /\/textures\/(?:earth-day|earth-night|clouds|moon)\.webp$/;
const NIGHT = /\/textures\/earth-night\.webp$/;
const SORRY = "The Earth's maps did not come. Every place is in the list.";
const SLOW = { timeout: 90_000 };

// A software GPU decodes and uploads four maps, and draws a frame, in tens of seconds at the worst.
test.describe.configure({ timeout: 180_000 });

interface EarthStats {
  state: string;
  x: number;
  y: number;
  radius: number;
  turn: number;
  orbit: { left: number; right: number; top: number; bottom: number };
  moon: { x: number; y: number; front: boolean };
  mapWidth: number;
  drawn: number;
}
const earthOf = async (page: Page) => ((await stats(page)) as unknown as { earth?: EarthStats }).earth;
const earth = async (page: Page): Promise<EarthStats> => {
  const found = await earthOf(page);
  if (found === undefined) throw new Error("no Earth");
  return found;
};

// The Earth's maps the page asks for, as it asks for them, from now on.
function mapsAsked(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (MAP.test(request.url())) asked.push(new URL(request.url()).pathname);
  });
  return asked;
}

const drawn = (page: Page) => expect(page.locator("[data-earth='drawn']")).toBeAttached(SLOW);
// The globe's room is kept, or the plate is open.
const kept = (page: Page) => page.locator("[data-earth='loading'], [data-earth='drawn']");
const credits = (page: Page) => page.getByRole("button", { name: "Credits", exact: true });

// A frame drawn after the Earth reached the stage: the page says drawn as it goes on stage, before any frame shows it.
const painted = async (page: Page) => {
  await drawn(page);
  await expect.poll(async () => (await earth(page)).drawn, SLOW).toBeGreaterThan(0);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
};

async function opened(page: Page, path = EARTH) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await hydrated(page);
  await painted(page);
}

test.describe("a computer", () => {
  test.use({ viewport: COMPUTER });

  test("draws the Earth on its page, its maps from the site, with no CSP violation and no shader refused", async ({
    page,
  }) => {
    const refused: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("THREE.WebGLProgram")) refused.push(message.text());
    });
    const asked = mapsAsked(page);
    await opened(page);
    expect(refused).toEqual([]);
    expect(asked.sort()).toEqual([
      "/textures/clouds.webp",
      "/textures/earth-day.webp",
      "/textures/earth-night.webp",
      "/textures/moon.webp",
    ]);
    expect(await earth(page)).toMatchObject({ state: "drawn" });
  });

  test("lights the side towards the dock and leaves the side towards the plate to the cities: day and night from the terminator", async ({
    page,
  }) => {
    await opened(page);
    const { x, y, radius } = await earth(page);
    const side = Math.round(radius / 6);
    const patch = (at: number): [number, number, number, number] => [
      Math.round(at - side),
      Math.round(y - side),
      Math.round(at + side),
      Math.round(y + side),
    ];
    const [day, night] = await brightness(page, await page.screenshot(), [
      patch(x + radius * 0.55),
      patch(x - radius * 0.8),
    ]);
    expect(day ?? 0).toBeGreaterThan(20);
    expect(night ?? 255).toBeLessThan((day ?? 0) / 3);
  });

  test("shows the cities on the night side, as points of light over the dark", async ({ page }) => {
    await opened(page);
    const { x, y, radius } = await earth(page);
    const cell = 8;
    const cells: [number, number, number, number][] = [];
    for (let across = -0.8; across < -0.2; across += 0.03)
      for (let down = -0.55; down < 0.55; down += 0.03) {
        const left = Math.round(x + across * radius);
        const top = Math.round(y + down * radius);
        cells.push([left, top, left + cell, top + cell]);
      }
    const lights = await brightness(page, await page.screenshot(), cells);
    expect(Math.max(...lights)).toBeGreaterThan(Math.min(...lights) * 4 + 10);
  });

  test("stands as frame 39 stands: the globe between the plate's words and the dock, the ring around it", async ({
    page,
  }) => {
    await opened(page);
    const { x, y, radius, orbit } = await earth(page);
    near(x, 961, "the globe's centre, across");
    near(y, 561, "the globe's centre, down");
    near(radius, 321, "the globe's radius");
    // A tilted orbit, by the decision of 2026-10-31, so not to the flat ring's pixel: its reach within 8 px of it.
    expect(Math.abs(orbit.left - 605)).toBeLessThanOrEqual(8);
    expect(Math.abs(orbit.right - 1315)).toBeLessThanOrEqual(8);
  });

  // F4250: every other journey here runs under reduced motion, so none saw the eye's slow look about move the globe off its circle.
  // How far the eye turned from the first sample to the last, in radians.
  const turned = (seen: readonly { yaw: number; pitch: number }[]) => {
    const [first, last] = [seen[0], seen.at(-1)];
    return first === undefined || last === undefined ? 0 : Math.hypot(last.yaw - first.yaw, last.pitch - first.pitch);
  };

  test("keeps the globe on frame 39's circle with motion on, as the eye looks slowly about", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(EARTH);
    await hydrated(page);
    await painted(page);
    const seen: { x: number; y: number; radius: number; yaw: number; pitch: number }[] = [];
    // Past the globe's own arrival, which a software GPU draws in many slow frames: it settles on the circle, then the look about turns.
    await expect.poll(async () => Math.abs((await earth(page)).x - 961), SLOW).toBeLessThanOrEqual(2);
    for (let sample = 0; sample < 4; sample += 1) {
      const { seconds } = await stats(page);
      await expect.poll(async () => (await stats(page)).seconds, SLOW).toBeGreaterThan(seconds + 1);
      const [{ x, y, radius }, { turn }] = [await earth(page), await stats(page)];
      seen.push({ x, y, radius, ...turn });
    }
    for (const { x, y, radius } of seen) {
      near(x, 961, "the globe's centre, across, with motion on");
      near(y, 561, "the globe's centre, down, with motion on");
      near(radius, 321, "the globe's radius, with motion on");
    }
    // The look about is a circle of 0.26 radians at 150 s a turn: three seconds of the scene's clock turn the eye about 0.03 radians, in
    // yaw or in pitch as the circle goes, and the globe has had the time to leave.
    expect(turned(seen)).toBeGreaterThan(0.02);
  });

  test("keeps the plate's words clear of the ring", async ({ page }) => {
    await opened(page);
    const { orbit } = await earth(page);
    const heading = await box(page, "h1");
    expect(heading.x + heading.width).toBeLessThanOrEqual(orbit.left);
  });

  test("opens the plate around the globe: the night side stands over it, dark, as in frame 39", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Held back, so the plate is read whole before the globe opens it.
    let release: () => void = () => undefined;
    const held = new Promise<void>((done) => {
      release = done;
    });
    await page.route(NIGHT, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(EARTH);
    await hydrated(page);
    const { width } = await box(page, "section[aria-label='Earth']");
    const spot: [number, number, number, number] = [700, 555, 712, 567];
    const before = await brightness(page, await page.screenshot(), [spot]);
    release();
    expect(width).toBeGreaterThan(spot[2] - 24);
    await painted(page);
    const after = await brightness(page, await page.screenshot(), [spot]);
    expect(after[0] ?? 255).toBeLessThan((before[0] ?? 0) / 2);
  });

  test("keeps the plate's left corners round once the scene draws: the canvas paints no square behind them", async ({
    page,
  }) => {
    await opened(page);
    const [top = 255, bottom = 255, inside = 0] = await brightness(page, await page.screenshot(), [
      [26, 100, 28, 102],
      [26, 1052, 28, 1054],
      [38, 108, 40, 110],
    ]);
    expect(inside).toBeGreaterThan(20);
    // The sky shows past a round corner (7a2's nebula reads 12 there), so a corner is held under half of the plate's own light: a square
    // plate would read as much as the plate.
    expect(top).toBeLessThan(inside / 2);
    expect(bottom).toBeLessThan(inside / 2);
  });

  test("rests the Moon on the front of its orbit, off the plate's words", async ({ page }) => {
    await opened(page);
    const { moon, orbit, x } = await earth(page);
    expect(moon.front).toBe(true);
    // Frame 39's bead stands over the globe's middle, at the top of the ring.
    expect(Math.abs(moon.x - x)).toBeLessThan(16);
    expect(moon.x).toBeGreaterThan(orbit.left);
    expect(moon.x).toBeLessThan(orbit.right);
    // It rests at the top of the ring, which the orbit's samples may just miss.
    expect(moon.y).toBeGreaterThanOrEqual(orbit.top - 2);
    expect(moon.y).toBeLessThanOrEqual(orbit.bottom);
  });

  test("the Credits link sits in a corner, in the muted grey at 11 px, and opens the attributions", async ({
    page,
  }) => {
    await opened(page);
    const link = credits(page);
    await expect(link).toBeVisible();
    const place = await link.boundingBox();
    if (place === null) throw new Error("no link");
    expect(place.x + place.width).toBeGreaterThan(COMPUTER.width - 100);
    expect(place.y + place.height).toBeGreaterThan(COMPUTER.height - 26);
    expect(await link.evaluate((button) => getComputedStyle(button).fontSize)).toBe("11px");
    await link.click();
    const dialog = page.getByRole("dialog", { name: "Credits" });
    await expect(dialog).toContainText("Solar System Scope");
    await expect(dialog).toContainText("CC BY 4.0");
    await expect(dialog).toContainText("NASA");
    await expect(dialog.getByRole("link", { name: /solarsystemscope\.com/ }).first()).toHaveAttribute(
      "href",
      "https://www.solarsystemscope.com/textures/",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(link).toBeFocused();
  });

  test("the keyboard reaches the Credits link, by Tab", async ({ page }) => {
    await opened(page);
    let reached = false;
    for (let press = 0; press < 40 && !reached; press += 1) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.textContent === "Credits");
    }
    expect(reached).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Credits" })).toBeVisible();
  });

  test("passes axe with the Earth drawn", async ({ page }) => {
    await opened(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  // From a universe's home with no worlds: the default one's stands its own small Earth, whose maps stay with it (7d2).
  test("gives every map back when the reader leaves, and draws again on the way back", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/net/gnoland/?test-gpu");
    await expect(page.locator("canvas[data-scene='on']")).toBeAttached(SLOW);
    await expect.poll(async () => (await stats(page)).frames, SLOW).toBeGreaterThan(0);
    const before = await stats(page);
    const views = page.getByRole("navigation", { name: "Views" });
    await views.getByRole("link", { name: "Earth" }).click();
    await painted(page);
    await expect.poll(async () => (await stats(page)).textures, SLOW).toBeGreaterThan(before.textures);
    await views.getByRole("link", { name: "Cosmos" }).click();
    await expect(kept(page)).toHaveCount(0);
    await expect.poll(async () => (await stats(page)).textures, SLOW).toBe(before.textures);
    await expect.poll(async () => (await stats(page)).geometries, SLOW).toBe(before.geometries);
    await expect(credits(page)).toHaveCount(0);
    await views.getByRole("link", { name: "Earth" }).click();
    await painted(page);
    await expect.poll(async () => (await stats(page)).textures, SLOW).toBeGreaterThan(before.textures);
  });

  test("a lost context shows the list, and the Earth comes back with its maps", async ({ page }) => {
    await opened(page);
    const asked = mapsAsked(page);
    await loseContext(page);
    await expect(page.getByRole("status").filter({ hasText: "Space is not available here" })).toBeVisible();
    await expect(kept(page)).toHaveCount(0);
    await expect(credits(page)).toHaveCount(0);
    await restoreContext(page);
    await painted(page);
    await expect(credits(page)).toBeVisible();
    await expect.poll(() => asked.length, SLOW).toBe(4);
    expect(await earth(page)).toMatchObject({ state: "drawn" });
  });
});

test.describe("a 16:9 window", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("keeps the Moon under the header's pill and the ring off the plate's outline", async ({ page }) => {
    await opened(page);
    const { moon, orbit } = await earth(page);
    const views = await box(page, "nav[aria-label='Views']");
    // The pill's foot, and the outline's top (98 px) with the 24 px the ring keeps off it.
    expect(moon.y).toBeGreaterThan(views.y + views.height + 24);
    expect(orbit.top).toBeGreaterThanOrEqual(98 + 24);
  });
});

test.describe("the pages that hold no Earth", () => {
  test.use({ viewport: COMPUTER });

  // The default home holds the Earth among its worlds (7d2): another universe's home is the bare space.
  for (const path of ["/net/gnoland/?test-gpu", "/list?test-gpu", "/w/bubble?test-gpu"])
    test(`${path} asks for none of its maps`, async ({ page }) => {
      const asked = mapsAsked(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      await hydrated(page);
      if (path.startsWith("/net/")) {
        await running(page);
        await expect.poll(async () => (await stats(page)).frames, SLOW).toBeGreaterThan(0);
      } else await page.evaluate(() => new Promise((done) => setTimeout(done, 300)));
      expect(asked).toEqual([]);
      await expect(kept(page)).toHaveCount(0);
    });
});

// The page keeps its words and its plate shut, says so, and credits nothing it does not show.
const givenUp = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(EARTH);
  await hydrated(page);
  await expect(page.getByRole("status").filter({ hasText: SORRY })).toBeVisible(SLOW);
  await expect(page.getByRole("heading", { level: 1, name: "Earth" })).toBeVisible();
  await expect(kept(page)).toHaveCount(0);
  await expect(credits(page)).toHaveCount(0);
  expect(await earthOf(page)).toMatchObject({ state: "failed" });
};

// The worker would answer these requests itself, past `page.route`: with it off, the fault is the one planted.
test.describe("a texture that does not come", () => {
  test.use({ viewport: COMPUTER, serviceWorkers: "block" });

  test("leaves the page whole, says so, keeps the plate shut, and shows no credit", async ({ page }) => {
    await page.route(NIGHT, (route) => route.fulfill({ status: 404, body: "" }));
    await givenUp(page);
    await expect(page.getByRole("link", { name: "Bubble" }).first()).toBeVisible();
  });

  test("tries again on the next visit, and draws", async ({ page }) => {
    let refused = false;
    await page.route(NIGHT, async (route) => {
      if (refused) return route.continue();
      refused = true;
      return route.fulfill({ status: 404, body: "" });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(EARTH);
    await expect(page.getByRole("status").filter({ hasText: SORRY })).toBeVisible(SLOW);
    const views = page.getByRole("navigation", { name: "Views" });
    await views.getByRole("link", { name: "Cosmos" }).click();
    await views.getByRole("link", { name: "Earth" }).click();
    await painted(page);
    await expect(page.getByRole("status").filter({ hasText: SORRY })).toHaveCount(0);
  });

  test("a map's answer that is no picture counts as one that did not come", async ({ page }) => {
    await page.route(NIGHT, (route) => route.fulfill({ status: 200, contentType: "image/webp", body: "<html>" }));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(EARTH);
    await expect(page.getByRole("status").filter({ hasText: SORRY })).toBeVisible(SLOW);
  });
});

// A software GPU refuses nothing, so the fault is planted in the chunk the worker would otherwise answer for.
test.describe("a shader the driver refuses", () => {
  test.use({ viewport: COMPUTER, serviceWorkers: "block" });

  test("leaves the page whole, says so, and keeps the plate shut: no hole with no word", async ({ page }) => {
    await page.route(/\/assets\/scene-[\w-]+\.js$/, async (route) => {
      const answer = await route.fetch();
      await route.fulfill({ response: answer, body: (await answer.text()).replace("float facing =", "flot facing =") });
    });
    const refused: string[] = [];
    page.on("pageerror", ({ message }) => refused.push(message));
    await givenUp(page);
    expect(refused.join()).toContain("a shader was refused");
  });
});

test.describe("a window that loads the scene by itself, under the plate's breakpoint", () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test("keeps the globe's room from the first paint: the plate does not jump", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await countShifts(page);
    await page.goto(EARTH);
    await hydrated(page);
    const before = await box(page, "h1");
    await painted(page);
    const after = await box(page, "h1");
    expect(after.y).toBe(before.y);
    expect(await shifted(page)).toBeLessThan(0.1);
  });
});

test.describe("a touch screen", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  const inSpace = async (page: Page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(EARTH);
    await hydrated(page);
    await page.getByRole("button", { name: "View in space" }).click();
    await painted(page);
  };

  test("holds the Earth at half the size each way, for the memory a phone has", async ({ page }) => {
    await inSpace(page);
    expect((await earth(page)).mapWidth).toBe(2048);
  });

  test("keeps Credits clear of the views' bar, a finger's size", async ({ page }) => {
    await inSpace(page);
    const link = await credits(page).boundingBox();
    const views = await page.getByRole("navigation", { name: "Views" }).boundingBox();
    if (link === null || views === null) throw new Error("no link or no bar");
    expect(link.height).toBeGreaterThanOrEqual(44);
    expect(link.y + link.height).toBeLessThanOrEqual(views.y);
  });
});

test.describe("a phone", () => {
  test.use({ viewport: PHONE });

  test("loads no map before View in space, and then the plate goes below the planet", async ({ page }) => {
    const asked = mapsAsked(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(EARTH);
    await hydrated(page);
    const view = page.getByRole("button", { name: "View in space" });
    await expect(view).toBeVisible();
    expect(asked).toEqual([]);
    await expect(page.locator("[data-globe]")).toBeHidden();
    await view.click();
    await painted(page);
    expect(asked.length).toBe(4);
    const { x, y, radius, orbit } = await earth(page);
    expect(x).toBeCloseTo(PHONE.width / 2, 0);
    expect(orbit.left).toBeGreaterThanOrEqual(0);
    expect(orbit.right).toBeLessThanOrEqual(PHONE.width);
    const heading = await box(page, "h1");
    expect(heading.y).toBeGreaterThanOrEqual(y + radius);
    await expect(credits(page)).toBeVisible();
    await credits(page).click();
    await expect(page.getByRole("dialog", { name: "Credits" })).toBeVisible();
    await page.keyboard.press("Escape");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
