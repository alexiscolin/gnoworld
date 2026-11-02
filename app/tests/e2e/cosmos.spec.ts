import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { BOUNDS } from "../../../packages/core/src/lod/ladder.ts";
import { NEBULA_IMAGES } from "../../../packages/core/src/space/nebulae.ts";
import { toScene } from "../../../packages/core/src/frame/disc.ts";
import { CREDITS } from "../../src/scene/planet/credits.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box, colours, near } from "./geometry.ts";
import { hideThePage, opened, running, stats } from "./sceneStage.ts";

// The cosmos (frames 1 to 8, 16, 17, 143, 144) on the gate's software GPU, under the page's real CSP, from Onyx's 743 recorded paths grouped
// by the server's code (app/lab/worlds.json, no deployer or calls). Reduced motion owes a frame a change. The canvas is not pixel-compared
// (the plan, section 6): these hold what is drawn, how much, where it stands against f0004, and what is freed.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const RECORDED = readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8");
const MAP = /\/textures\/[\w-]+\.webp$/;
// Three a sun, its dots, the belt; three a body at most: the budget this part records.
const DRAWS_AT_MOST = 130;
const fileOf = (systems: number) =>
  JSON.stringify({
    version: 1,
    universe: "onyx",
    updated: "2026-11-01T00:00:00Z",
    worlds: Array.from({ length: Math.min(systems * 2, 20_000) }, (_, at) => ({
      id: `n${String(at % systems)}/w${String(at)}`,
      namespace: `n${String(at % systems)}`,
      realms: [],
    })),
  });
const SLOW = { timeout: 90_000 };

test.describe.configure({ timeout: 180_000 });

const cosmos = async (page: Page) => (await stats(page)).cosmos ?? NOT_YET;
const NOT_YET = {
  shown: false,
  bodies: 0,
  stars: 0,
  dots: 0,
  glows: 0,
  rocks: 0,
  maps: 0,
  looks: 0,
  dotPixels: 0,
  earth: false,
  screen: { sun: { x: 0, y: 0, radius: 0 }, earth: undefined, bodies: [] },
  nebulae: 0,
};
const served = (page: Page, body: string, status = 200) =>
  page.route("**/worlds.json", (route) => route.fulfill({ status, body, contentType: "application/json" }));
const standing = (page: Page, bodies = 10) =>
  expect.poll(async () => (await cosmos(page)).bodies, SLOW).toBeGreaterThan(bodies);

async function arrived(page: Page, query = HOME) {
  await page.setViewportSize(COMPUTER);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(query);
  await hydrated(page);
  await running(page);
}

// A place drawn: the look runs off the frame, so the count of looks says it has been taken.
const moveTo = async (page: Page, spot: { x: number; y: number; z: number }) => {
  const { looks } = await cosmos(page);
  const { frames } = await stats(page);
  await page.evaluate((to) => {
    (Reflect.get(globalThis, "__gnoworldScene") as { moveTo: (at: typeof to) => void }).moveTo(to);
  }, spot);
  await expect.poll(async () => (await cosmos(page)).looks, SLOW).toBeGreaterThan(looks);
  await expect.poll(async () => (await stats(page)).frames, SLOW).toBeGreaterThanOrEqual(frames + 2);
};

test("draws the real file: a star a namespace, a landmark a system, under the page's policy", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  const drawn = await cosmos(page);
  expect(drawn.stars).toBeGreaterThan(40);
  expect(drawn.dots).toBeGreaterThan(50);
  await expect.poll(async () => (await cosmos(page)).earth, SLOW).toBe(true);
  expect(drawn.rocks).toBeGreaterThan(0);
  const { calls } = await stats(page);
  expect(calls).toBeLessThanOrEqual(DRAWS_AT_MOST);
});

test("stands the arrival as frame f0004 does: the great sun left of nothing, the Earth beside it, bodies around", async ({
  page,
}) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  await expect.poll(async () => (await cosmos(page)).screen.earth !== undefined, SLOW).toBe(true);
  const { screen } = await cosmos(page);
  // The frame's: the great sun at (862, 535), the Earth at (645, 540), 47 px, 20 or so bodies in view of 30 to 50 px.
  near(screen.sun.x, 862, "the great sun's x");
  near(screen.sun.y, 535, "the great sun's y");
  near(screen.earth?.x ?? NaN, 645, "the Earth's x");
  near(screen.earth?.y ?? NaN, 540, "the Earth's y");
  near(screen.earth?.radius ?? NaN, 47, "the Earth's radius");
  // A body shows once its programs are compiled, which a software GPU takes its time over.
  const inViewOf = (bodies: typeof screen.bodies) =>
    bodies.filter(({ x, y }) => x > 0 && x < COMPUTER.width && y > 0 && y < COMPUTER.height);
  await expect.poll(async () => inViewOf((await cosmos(page)).screen.bodies).length, SLOW).toBeGreaterThan(12);
  for (const { radius } of inViewOf((await cosmos(page)).screen.bodies)) {
    expect(radius).toBeGreaterThan(5);
    expect(radius).toBeLessThan(95);
  }
});

test("keeps every body off the hero, at the video's size and on a small window", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  const hero = await box(page, "[data-clear]");
  for (const { x, y, radius } of (await cosmos(page)).screen.bodies) {
    const outside = Math.max(hero.x - x, x - hero.x - hero.width, hero.y - y, y - hero.y - hero.height);
    expect(outside + radius * 0.001).toBeGreaterThan(-radius);
  }
});

test("shows warm suns on near-black: the great sun's glow, deep black in the corners", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  await opened(page);
  await hideThePage(page);
  const { screen } = await cosmos(page);
  const [x, y] = [Math.round(screen.sun.x), Math.round(screen.sun.y)];
  const shot = await page.locator("canvas").screenshot();
  const [core, halo, corner] = await colours(page, shot, [
    [x - 8, y - 8, x + 8, y + 8],
    [x - 170, y - 130, x - 130, y - 90],
    [4, 4, 40, 40],
  ]);
  expect(Math.min(...(core ?? [0]))).toBeGreaterThan(235);
  const [red = 0, green = 0, blue = 0] = halo ?? [];
  expect(red).toBeGreaterThan(blue * 1.5);
  expect(red).toBeGreaterThan(green);
  expect(Math.max(...(corner ?? [255]))).toBeLessThan(60);
});

test("holds the draw bound from far above, and piles nothing up", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  const { eye } = await stats(page);
  const start = await cosmos(page);
  const sizes = [start.dotPixels];
  const biggest = [Math.max(...start.screen.bodies.map(({ radius }) => radius))];
  for (const height of [60, 180, 300]) {
    await moveTo(page, { x: eye.x, y: eye.y + height, z: eye.z + height });
    const drawn = await cosmos(page);
    const { calls } = await stats(page);
    expect(calls).toBeLessThanOrEqual(DRAWS_AT_MOST);
    expect(drawn.bodies).toBeLessThanOrEqual(BOUNDS.bodies);
    const covered = drawn.screen.bodies.reduce((sum, { radius }) => sum + Math.PI * radius * radius, 0);
    expect(covered / (COMPUTER.width * COMPUTER.height)).toBeLessThan(0.1);
    sizes.push(drawn.dotPixels);
    biggest.push(Math.max(0, ...drawn.screen.bodies.map(({ radius }) => radius)));
  }
  // A world keeps no size as the eye leaves: the mock-up's pile-up.
  expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  expect(sizes.at(-1)).toBeLessThan(sizes[0] ?? 0);
  expect(biggest).toEqual([...biggest].sort((a, b) => b - a));
});

test("stands the fixed places and every link when the file is down", async ({ page }) => {
  await served(page, "not here", 404);
  await arrived(page);
  await expect.poll(async () => (await cosmos(page)).earth, SLOW).toBe(true);
  expect((await cosmos(page)).stars).toBe(1);
  await expect(page.locator("nav[aria-label='Worlds'] a").first()).toBeVisible();
});

test("refuses a hostile file whole, and draws no word of it", async ({ page }) => {
  const hostile = JSON.stringify({
    version: 1,
    universe: "onyx",
    updated: "2026-11-01T00:00:00Z",
    worlds: [{ id: "<img src=x onerror=alert(1)>", namespace: "x", realms: [] }],
  });
  await served(page, hostile);
  await arrived(page);
  await expect.poll(async () => (await cosmos(page)).stars, SLOW).toBe(1);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
});

test("leaves a world a point when its map is refused, and draws on", async ({ page }) => {
  await page.route(MAP, (route) =>
    route.request().url().includes("clouds") ? route.fulfill({ status: 404 }) : route.fallback(),
  );
  await served(page, RECORDED);
  await arrived(page);
  await expect.poll(async () => (await cosmos(page)).dots, SLOW).toBeGreaterThan(100);
  expect((await cosmos(page)).bodies).toBe(0);
});

test("shows the credits with the maps, and passes axe with the scene on", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  await page.getByRole("button", { name: "Credits" }).click();
  await expect(page.getByRole("dialog")).toContainText("Solar System Scope");
  await page.keyboard.press("Escape");
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});

test("goes with the page: the Earth's page shows no system, and the way back shows them again", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  await page.getByRole("link", { name: "Earth", exact: true }).first().click();
  await expect.poll(async () => (await cosmos(page)).shown, SLOW).toBe(false);
  await page.goBack();
  await expect.poll(async () => (await cosmos(page)).shown, SLOW).toBe(true);
});

test("gives a phone nothing of it before View in space", async ({ page }) => {
  let asked = 0;
  await page.route("**/worlds.json", (route) => {
    asked += 1;
    return route.fulfill({ status: 200, body: RECORDED, contentType: "application/json" });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(HOME);
  await hydrated(page);
  await expect(page.getByRole("button", { name: "View in space" })).toBeVisible();
  expect(asked).toBe(0);
});

for (const systems of [100, 1000, 10_000])
  test(`holds the draw bound at ${String(systems)} systems`, async ({ page }) => {
    await served(page, fileOf(systems));
    await arrived(page);
    await standing(page);
    const { calls } = await stats(page);
    expect(calls).toBeLessThanOrEqual(DRAWS_AT_MOST);
    expect((await cosmos(page)).bodies).toBeLessThanOrEqual(BOUNDS.bodies);
  });

test("gives the release's page the cosmos as a view, from the recorded file, for Alexis's own GPU", async ({
  page,
}) => {
  await page.setViewportSize(COMPUTER);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab/realism.html?view=cosmos");
  await running(page);
  await standing(page);
  expect((await cosmos(page)).stars).toBeGreaterThan(40);
});

// The nebulae: real images, warped and recoloured, in layers behind the worlds (ADR-0002 §10, "Space views"), seen from a system's
// distance to a cluster's, near-black near a world, each with its credit wherever it shows.
const NEBULA = new RegExp(`/textures/(${NEBULA_IMAGES.join("|")})\\.webp$`);
const lit = (page: Page) => expect.poll(async () => (await cosmos(page)).nebulae, SLOW).toBeGreaterThan(0);

test("lights nebulae from real images behind the arrival, with their credits beside them", async ({ page }) => {
  const images = new Set<string>();
  page.on("request", (request) => {
    const name = NEBULA.exec(request.url())?.[1];
    if (name !== undefined) images.add(name);
  });
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  await lit(page);
  expect(images.size).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Credits" }).click();
  for (const name of images) {
    const credit = CREDITS.find(({ files }) => files.includes(name));
    expect(credit).toBeDefined();
    await expect(page.getByRole("dialog")).toContainText(credit?.line ?? "no credit");
  }
});

test("keeps the corners near-black and the draw bound with the nebulae lit", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  await lit(page);
  await opened(page);
  const { calls } = await stats(page);
  expect(calls).toBeLessThanOrEqual(DRAWS_AT_MOST);
  await hideThePage(page);
  const shot = await page.locator("canvas").screenshot();
  // The top left, and the bottom left under the hero; the right holds a sun and the Credits.
  const corners = await colours(page, shot, [
    [4, 4, 40, 40],
    [4, COMPUTER.height - 40, 40, COMPUTER.height - 4],
  ]);
  for (const corner of corners) expect(Math.max(...corner)).toBeLessThan(60);
});

test("puts the nebulae out near a world: space is near-black there", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  await lit(page);
  const near = { x: 0, y: 0, z: 0 };
  toScene({ x: 0, y: 2, z: 0 }, near);
  await moveTo(page, near);
  await expect.poll(async () => (await cosmos(page)).nebulae, SLOW).toBe(0);
});

test("gives the release's page the nebulae, and their credits in its footer", async ({ page }) => {
  await page.setViewportSize(COMPUTER);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab/realism.html?view=cosmos");
  await running(page);
  await standing(page);
  await lit(page);
  for (const credit of CREDITS.filter(({ files }) => files.some((file) => NEBULA_IMAGES.some((name) => name === file))))
    await expect(page.locator("footer")).toContainText(credit.line);
});

// The light the nebulae add, read as the same view twice, their images refused and then let through: the video's nebulae are coloured
// dust and gas, never grey smoke (#19363C, #472819: saturation 0.6), and the warm glow under them keeps its shape.
const BOX = 48;
const ADDS_AT_MOST = 32;
const GREY_AT_MOST = 0.4;
const boxes = () => {
  const found: [number, number, number, number][] = [];
  for (let y = 0; y + BOX <= COMPUTER.height; y += BOX)
    for (let x = 0; x + BOX <= COMPUTER.width; x += BOX) found.push([x, y, x + BOX, y + BOX]);
  return found;
};
type Colour = readonly [number, number, number];

// Each box's added light: never past the bound, and coloured wherever the scene leaves it room to show; how many showed it.
function addedLight(before: readonly Colour[], after: readonly Colour[]): number {
  let shown = 0;
  for (const [at, [red, green, blue]] of after.entries()) {
    const [r0, g0, b0] = before[at] ?? [NaN, NaN, NaN];
    const added = [red - r0, green - g0, blue - b0];
    const top = Math.max(...added);
    expect(top, `box ${String(at)}`).toBeLessThanOrEqual(ADDS_AT_MOST);
    // Where the scene is near white already, the light it adds is cut at 255: no colour can show there.
    if (top < 6 || Math.max(r0, g0, b0) >= 200) continue;
    shown += 1;
    expect((top - Math.min(...added)) / top, `box ${String(at)} is grey`).toBeGreaterThanOrEqual(GREY_AT_MOST);
  }
  return shown;
}

// A box inside the Earth's disc, the middle third of it.
async function earthDisc(page: Page): Promise<[number, number, number, number]> {
  const { earth } = (await cosmos(page)).screen;
  if (earth === undefined) throw new Error("no Earth on screen");
  const third = Math.round(earth.radius / 3);
  const [x, y] = [Math.round(earth.x), Math.round(earth.y)];
  return [x - third, y - third, x + third, y + third];
}

// The arrival drawn and still, its page hidden, as a picture.
async function stillPicture(page: Page) {
  await standing(page);
  await opened(page);
  await hideThePage(page);
  return page.locator("canvas").screenshot();
}

test.describe("the nebulae's light", () => {
  test.use({ serviceWorkers: "block" });

  test("recolours each nebula to the mood it stands in, and never washes out the glow behind it", async ({ page }) => {
    let refused = true;
    let asked = 0;
    await page.route(NEBULA, (route) => {
      asked += 1;
      return refused ? route.fulfill({ status: 404 }) : route.fallback();
    });
    await served(page, RECORDED);
    await arrived(page);
    await expect.poll(() => asked, SLOW).toBeGreaterThan(0);
    const without = await stillPicture(page);
    expect((await cosmos(page)).nebulae).toBe(0);
    refused = false;
    await page.reload();
    await hydrated(page);
    await running(page);
    await lit(page);
    const withNebulae = await stillPicture(page);
    expect(
      addedLight(await colours(page, without, boxes()), await colours(page, withNebulae, boxes())),
    ).toBeGreaterThan(10);
    // Behind every body: the Earth's disc takes nothing of them.
    const disc = await earthDisc(page);
    const [[onEarth], [offEarth]] = [await colours(page, withNebulae, [disc]), await colours(page, without, [disc])];
    for (const [channel, value] of (onEarth ?? []).entries())
      expect(Math.abs(value - (offEarth?.[channel] ?? NaN))).toBeLessThan(2);
  });
});
