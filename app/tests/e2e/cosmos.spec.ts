import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { BOUNDS } from "../../../packages/core/src/lod/ladder.ts";
import { NEBULA_IMAGES } from "../../../packages/core/src/space/nebulae.ts";
import { focusDistance, toScene } from "../../../packages/core/src/frame/disc.ts";
import { CREDITS } from "../../src/scene/planet/credits.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box, colours, near } from "./geometry.ts";
import { hideThePage, opened, running, stats, type CosmosStats } from "./sceneStage.ts";

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
const NOT_YET: CosmosStats = {
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

// The release's lab page, its cosmos view standing, for Alexis's own GPU.
async function inTheLab(page: Page) {
  await page.setViewportSize(COMPUTER);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab/realism.html?view=cosmos");
  await running(page);
  await standing(page);
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
  await inTheLab(page);
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
  await inTheLab(page);
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

// The arrival without its nebulae, their images refused, then with them.
async function bothWays(page: Page) {
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
  return { without, withNebulae: await stillPicture(page) };
}

// Frame 16's teal, top right (f0016.jpg read with ffmpeg, 2026-11-02): hues 182 to 193 from the tenth part of its pixels to the ninetieth,
// mean sRGB (10, 44, 50), its ninetieth (10, 62, 66). The light a nebula adds is read against black, so a few degrees more either way.
const FRAME_TEAL = { least: 176, most: 200, brightest: 66, saturation: 0.82 };
function hueOf([red, green, blue]: readonly number[]): number {
  const [r = 0, g = 0, b = 0] = [red, green, blue];
  const top = Math.max(r, g, b);
  const span = top - Math.min(r, g, b);
  const sector = top === r ? (g - b) / span : top === g ? 2 + (b - r) / span : 4 + (r - g) / span;
  return (sector * 60 + 360) % 360;
}

test.describe("the nebulae's light", () => {
  test.use({ serviceWorkers: "block" });

  test("recolours each nebula to the mood it stands in, and never washes out the glow behind it", async ({ page }) => {
    const { without, withNebulae } = await bothWays(page);
    expect(
      addedLight(await colours(page, without, boxes()), await colours(page, withNebulae, boxes())),
    ).toBeGreaterThan(10);
    // Behind every body: the Earth's disc takes nothing of them.
    const disc = await earthDisc(page);
    const [[onEarth], [offEarth]] = [await colours(page, withNebulae, [disc]), await colours(page, without, [disc])];
    for (const [channel, value] of (onEarth ?? []).entries())
      expect(Math.abs(value - (offEarth?.[channel] ?? NaN))).toBeLessThan(2);
  });

  test("gives a cool nebula frame 16's teal, dark and discreet as there, never the grey-blue", async ({ page }) => {
    const { without, withNebulae } = await bothWays(page);
    const [before, after] = [await colours(page, without, boxes()), await colours(page, withNebulae, boxes())];
    let teal = 0;
    for (const [at, colour] of after.entries()) {
      const behind = before[at] ?? [255, 255, 255];
      const added = colour.map((value, channel) => value - (behind[channel] ?? 0));
      const [red = 0, , blue = 0] = added;
      const top = Math.max(...added);
      // Read against near-black only, where the light added is the nebula's own; a warm box is no cool nebula.
      if (top < 4 || Math.max(...behind) > 40 || blue <= red + 2) continue;
      teal += 1;
      expect(hueOf(added), `box ${String(at)}`).toBeGreaterThanOrEqual(FRAME_TEAL.least);
      expect(hueOf(added), `box ${String(at)}`).toBeLessThanOrEqual(FRAME_TEAL.most);
      expect(Math.max(...colour), `box ${String(at)}`).toBeLessThanOrEqual(FRAME_TEAL.brightest);
      expect((top - Math.min(...added)) / top, `box ${String(at)}`).toBeLessThanOrEqual(FRAME_TEAL.saturation + 0.1);
    }
    expect(teal).toBeGreaterThan(3);
  });
});

// The whole cosmos (ADR-0002 §10; Alexis, 2026-11-02): past a cluster's distance the worlds themselves are the nebula, a soft point for each
// real world, a thin line for each real import between two, gold for real live activity only. Two draws of its own, whatever the file.
const WHOLE_JS = /\/assets\/web-[\w-]+\.js$/;
// The sky's own, the nebulae's three images and the whole cosmos's two: what a frame draws out there.
const WHOLE_DRAWS_AT_MOST = 10;
// The sky's stars and motes, whatever the file: 46,656 drawn on this window. Out there no point of the disc is.
const SKY_POINTS_AT_MOST = 48 * 1024;
const linkedFileOf = (count: number) => {
  const namespaces = Math.max(1, Math.round(count / 5));
  const id = (at: number) => `n${String(at % namespaces)}/w${String(at)}`;
  return JSON.stringify({
    version: 1,
    universe: "onyx",
    updated: "2026-11-01T00:00:00Z",
    worlds: Array.from({ length: count }, (_, at) => ({
      id: id(at),
      namespace: `n${String(at % namespaces)}`,
      realms: [
        {
          path: `gno.land/r/${id(at)}`,
          deployer: null,
          deployerName: null,
          functions: [],
          imports: at % 3 === 0 ? [`gno.land/r/${id((at + 7) % count)}`] : [],
          calls: null,
          callers: null,
          lastHeight: null,
        },
      ],
    })),
  });
};
// Its pairs, counted apart from the code: every third world names the seventh on, each pair once whichever way.
const linesOf = (count: number) => {
  const pairs = new Set<string>();
  for (let at = 0; at < count; at += 3) {
    const to = (at + 7) % count;
    if (to !== at) pairs.add([Math.min(at, to), Math.max(at, to)].join(" "));
  }
  return pairs.size;
};
const whole = async (page: Page) => {
  const { eye } = await stats(page);
  // Back along the view's axis, the disc in the middle.
  const far = { x: eye.x, y: eye.y, z: eye.z + 1100 };
  await moveTo(page, far);
  expect(focusDistance(far)).toBeGreaterThan(1000);
  await expect.poll(async () => (await cosmos(page)).web?.share ?? 0, SLOW).toBe(1);
};

test("asks nothing of the whole cosmos at the arrival", async ({ page }) => {
  let asked = 0;
  await page.route(WHOLE_JS, (route) => {
    asked += 1;
    return route.fallback();
  });
  await served(page, linkedFileOf(300));
  await arrived(page);
  await standing(page);
  expect(asked).toBe(0);
  expect((await cosmos(page)).web).toBeUndefined();
});

for (const count of [100, 1_000, 10_000, 20_000])
  test(`draws the whole cosmos at ${String(count)} worlds: a point a world, a line a link, two draws`, async ({
    page,
  }) => {
    await served(page, linkedFileOf(count));
    await arrived(page);
    await expect.poll(async () => (await cosmos(page)).stars, SLOW).toBeGreaterThan(1);
    await whole(page);
    expect((await cosmos(page)).web).toMatchObject({ points: count, lines: linesOf(count), gold: 0 });
    const { calls, points } = await stats(page);
    expect(calls).toBeLessThanOrEqual(WHOLE_DRAWS_AT_MOST);
    expect(points - count).toBeLessThanOrEqual(SKY_POINTS_AT_MOST);
  });

test("draws the recorded file whole: 533 soft points, no line and no gold, for it read no package and no call", async ({
  page,
}) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  await whole(page);
  expect((await cosmos(page)).web).toMatchObject({ points: 533, lines: 0, gold: 0 });
  await opened(page);
  await hideThePage(page);
  const shot = await page.locator("canvas").screenshot();
  const [middle, corner] = await colours(page, shot, [
    [COMPUTER.width / 2 - 60, COMPUTER.height / 2 - 60, COMPUTER.width / 2 + 60, COMPUTER.height / 2 + 60],
    [4, 4, 40, 40],
  ]);
  // Warm at home, rose and peach, on near-black: the disc's middle in the middle of the view (about (15, 9, 6) on average there).
  const [red = 0, green = 0, blue = 0] = middle ?? [];
  expect(red).toBeGreaterThan(blue * 1.5);
  expect(red + green + blue).toBeGreaterThan(15);
  expect(Math.max(...(corner ?? [255]))).toBeLessThan(60);
});

test("lights gold the one world called in the last run, read from a file written now", async ({ page }) => {
  const file = JSON.parse(linkedFileOf(300)) as {
    updated: string;
    worlds: { realms: { calls: number | null; lastHeight: number | null }[] }[];
  };
  file.updated = new Date().toISOString();
  const [first] = file.worlds;
  for (const realm of first?.realms ?? []) Object.assign(realm, { calls: 40, lastHeight: 9000 });
  await served(page, JSON.stringify(file));
  await arrived(page);
  await expect.poll(async () => (await cosmos(page)).stars, SLOW).toBeGreaterThan(1);
  await whole(page);
  expect((await cosmos(page)).web).toMatchObject({ points: 300, gold: 1 });
});

test("costs the same two draws on a weak GPU's tier, at 20,000 worlds", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gnoworld:scene:tier", "low");
  });
  await served(page, linkedFileOf(20_000));
  await arrived(page);
  await expect.poll(async () => (await stats(page)).tier, SLOW).toBe("low");
  await expect.poll(async () => (await cosmos(page)).stars, SLOW).toBeGreaterThan(1);
  await whole(page);
  expect((await cosmos(page)).web).toMatchObject({ points: 20_000, lines: linesOf(20_000) });
  expect((await stats(page)).calls).toBeLessThanOrEqual(WHOLE_DRAWS_AT_MOST);
});

test("gives the release's page the whole cosmos, with the links read on the chain for its sample", async ({ page }) => {
  await inTheLab(page);
  await whole(page);
  // The 18 pairs of worlds the sample of 58 realms read on Onyx links (app/lab/imports.json, the part's state file).
  expect((await cosmos(page)).web).toMatchObject({ points: 533, lines: 18, gold: 0 });
});
