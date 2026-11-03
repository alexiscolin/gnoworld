import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { BOUNDS } from "../../../packages/core/src/lod/ladder.ts";
import { NEBULA_IMAGES } from "../../../packages/core/src/space/nebulae.ts";
import { EARTH_PLACE, systemsOf } from "../../../packages/core/src/cosmos/system.ts";
import { distanceOf } from "../../../packages/core/src/space/cell.ts";
import { coveredShare, offLine } from "../../../packages/core/src/frame/composition.ts";
import { arrivalOf } from "../../../packages/core/src/frame/arrival.ts";
import { STAR_HEART } from "../../../packages/core/src/frame/restLook.ts";
import { BLOCK_MS } from "../../../packages/core/src/planet/activity.ts";
import { beatAt } from "../../../packages/core/src/space/beat.ts";
import { FIELD_OF_VIEW, postcardOf, restView } from "../../../packages/core/src/frame/rest.ts";
import { toScene } from "../../../packages/core/src/frame/disc.ts";
import { heldOf } from "../../src/scene/cosmos/cosmosWorld.ts";
import { CREDITS } from "../../src/scene/planet/credits.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box, brightness, brightShare, colours, near } from "./geometry.ts";
import { hideThePage, landed, opened, running, stats, type CosmosStats } from "./sceneStage.ts";

// The cosmos (frames 1 to 8, 16, 17, 143, 144) on the gate's software GPU, under the page's real CSP, from Onyx's 743 recorded paths grouped
// by the server's code (app/lab/worlds.json, no deployer or calls). Reduced motion owes a frame a change. The canvas is not pixel-compared
// (the plan, section 6): these hold what is drawn, how much, where it stands against f0004, and what is freed.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const WIDE = { width: 1920, height: 1080 };
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
  worlds: 0,
  eye: { x: 0, y: 0, z: 0 },
  sky: { share: 0, eye: { x: 0, y: 0, z: 0 } },
  dive: { along: 0, veil: 0 },
};
const served = (page: Page, body: string, status = 200) =>
  page.route("**/worlds.json", (route) => route.fulfill({ status, body, contentType: "application/json" }));
// More than `bodies` bodies held, and each on the screen: a body waits off it until its programs are compiled.
async function standing(page: Page, bodies = 2) {
  await expect.poll(async () => (await cosmos(page)).bodies, SLOW).toBeGreaterThan(bodies);
  await expect
    .poll(async () => {
      const drawn = await cosmos(page);
      return drawn.screen.bodies.length >= drawn.bodies;
    }, SLOW)
    .toBe(true);
}

async function arrived(page: Page, query = HOME, size = COMPUTER) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(query);
  await hydrated(page);
  await running(page);
  await landed(page);
}

// The release's lab page, its cosmos view standing, for Alexis's own GPU.
async function inTheLab(page: Page) {
  await page.setViewportSize(COMPUTER);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab/realism.html?view=cosmos");
  await running(page);
  await landed(page);
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

// Alexis, 2026-11-02: the Earth exactly at the canvas's centre, the great star beside it; frame 4 gives the light and the Earth's size.
for (const size of [COMPUTER, WIDE])
  test(`stands the Earth at the canvas's centre at rest, the great star beside it, at ${String(size.width)} by ${String(size.height)}`, async ({
    page,
  }) => {
    await served(page, RECORDED);
    await arrived(page, HOME, size);
    await standing(page);
    await expect.poll(async () => (await cosmos(page)).screen.earth !== undefined, SLOW).toBe(true);
    const { screen } = await cosmos(page);
    near(screen.earth?.x ?? NaN, size.width / 2, "the Earth's x");
    near(screen.earth?.y ?? NaN, size.height / 2, "the Earth's y");
    // Alexis, 2026-11-02: "la Terre un peu plus grosse", about 110 pixels across against frame 4's 95; then, 2026-11-03, 1.2 times that
    // through the home's lens, about 130.
    expect(screen.earth?.radius).toBeGreaterThanOrEqual(60);
    expect(screen.earth?.radius).toBeLessThanOrEqual(72);
    expect(screen.sun.x - size.width / 2).toBeGreaterThanOrEqual(100);
    expect(screen.sun.x).toBeLessThan(size.width);
    expect(Math.abs(screen.sun.y - size.height / 2)).toBeLessThanOrEqual(0.3 * size.height);
    // The room the view keeps for the hero holds the hero the page draws (core/frame/rest.ts, HERO_ZONE).
    const hero = await box(page, "[data-clear]");
    expect(hero.x + hero.width).toBeLessThanOrEqual(0.45 * size.width);
    expect(hero.y).toBeGreaterThanOrEqual(0.58 * size.height);
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

// 7d6's design review: the low view's halos washed the sky (18.8% of it at 150 or over, frame 4 7.2%); the great star is now the main light,
// every other sun half its size at most, no halo wider than the approved arrival's great star. Measured on SwiftShader at the tip: 1.2% of
// the canvas, the page hidden; frame 4, read the same way, 6.3%.
test("keeps the sky dark between its suns: 150 and over on under 9% of it, as frame 4", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  await opened(page);
  await hideThePage(page);
  const shot = await page.locator("canvas").screenshot();
  expect(await brightShare(page, shot, 150)).toBeLessThan(0.09);
});

test("holds the draw bound from far above, and piles nothing up", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  const { eye } = await stats(page);
  // From off the view at rest, whose distant stars' worlds glint at a share of their size (7d6): the drawing anywhere.
  await moveTo(page, { x: eye.x, y: eye.y + 20, z: eye.z + 20 });
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
  // No cosmos is drawn yet, so the hero names the worlds with no number (7d6): it counts what the cosmos draws.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Worlds in Onyx");
});

// The view at rest (7d6): three systems' bodies at most, measured on the screen as frame 4 was.
const byId = new Map(
  (JSON.parse(RECORDED) as { worlds: { id: string; namespace: string }[] }).worlds.map(({ id, namespace }) => [
    id,
    namespace,
  ]),
);
type Body = Awaited<ReturnType<typeof cosmos>>["screen"]["bodies"][number];
interface Spot {
  x: number;
  y: number;
  radius: number;
}
const heroZone = (spot: Spot, size: typeof COMPUTER) =>
  spot.x - spot.radius < 0.45 * size.width && spot.y + spot.radius > 0.58 * size.height;
const cutBy = (body: Body, size: typeof COMPUTER) => body.x - body.radius < 0 || body.x + body.radius > size.width;
// Frame 4's densest group: four bodies in about 200 by 120 pixels.
const groupOf = (bodies: readonly Spot[], one: Spot) =>
  bodies.filter(({ x, y }) => Math.abs(x - one.x) <= 100 && Math.abs(y - one.y) <= 60).length;
// A body that is not the close world stands whole; none covers the Earth from in front, the great star's heart or the hero.
function holdsItsPlace(body: Body, screen: { earth: Spot; sun: Spot }, size: typeof COMPUTER) {
  if (!cutBy(body, size)) {
    expect(body.y - body.radius).toBeGreaterThanOrEqual(0);
    expect(body.y + body.radius).toBeLessThanOrEqual(size.height);
  }
  const { earth, sun } = screen;
  expect(body.away < 30 && Math.hypot(body.x - earth.x, body.y - earth.y) < body.radius + earth.radius).toBe(false);
  expect(Math.hypot(body.x - sun.x, body.y - sun.y)).toBeGreaterThan(body.radius + 40);
  expect(heroZone(body, size)).toBe(false);
}

// The file's systems as the cosmos holds them, and the view the core gives them: what the screen must show.
const viewOf = () => {
  const { worlds } = JSON.parse(RECORDED) as {
    worlds: { id: string; namespace: string; realms: { callers: number | null }[] }[];
  };
  const systems = systemsOf(
    worlds.map(({ id, namespace, realms }) => ({
      id,
      namespace,
      use: realms.reduce((sum, { callers }) => sum + (callers ?? 0), realms.length),
    })),
  );
  return { systems, view: restView(systems) };
};

// Alexis, 2026-11-02: each postcard draws as many bodies as its system stands apart in its cell; the close world first, where one stands.
for (const size of [COMPUTER, WIDE])
  test(`draws its postcards whole, each with the bodies its cell holds apart, and its close world cut by the frame, at ${String(size.width)} by ${String(size.height)}`, async ({
    page,
  }) => {
    const { systems, view } = viewOf();
    await served(page, RECORDED);
    await arrived(page, HOME, size);
    await standing(page);
    await expect.poll(async () => (await cosmos(page)).screen.earth !== undefined, SLOW).toBe(true);
    const { earth, sun, bodies } = (await cosmos(page)).screen;
    if (earth === undefined) throw new Error("no Earth");
    // 7p (Alexis, 2026-11-03, "la perspective doit être partout"): beside the view's own three systems, four more stand a body each.
    const own = new Set(
      [...view.postcards, ...(view.close === undefined ? [] : [view.close.system])].map((at) => systems[at]?.id),
    );
    const deep = bodies.filter(({ id }) => !own.has(byId.get(id)));
    expect(new Set(deep.map(({ id }) => byId.get(id))).size).toBe(deep.length);
    expect(deep.length).toBeLessThanOrEqual(4);
    expect(new Set(bodies.map(({ id }) => byId.get(id))).size).toBeLessThanOrEqual(3 + 4);
    const close = bodies.filter((body) => cutBy(body, size));
    expect(close).toHaveLength(view.close === undefined ? 0 : 1);
    for (const one of close) expect(one.radius).toBeGreaterThanOrEqual(2 * earth.radius);
    const postcards = new Map<string, number>();
    for (const body of bodies.filter((one) => !cutBy(one, size) && !deep.includes(one))) {
      const system = byId.get(body.id) ?? body.id;
      postcards.set(system, (postcards.get(system) ?? 0) + 1);
    }
    const wanted = new Map(
      view.postcards.flatMap((index) => {
        const system = systems[index];
        return system === undefined ? [] : [[system.id, postcardOf(system, view.eye).worlds.length] as const];
      }),
    );
    expect(postcards).toEqual(wanted);
    for (const one of [earth, ...bodies]) expect(groupOf([earth, ...bodies], one)).toBeLessThanOrEqual(4);
    for (const body of bodies) holdsItsPlace(body, { earth, sun }, size);
    // The chief, 2026-11-02: two bodies at a like distance keep a third of the smaller one's width apart; one 1.5 times nearer covers a
    // farther one by half at most; the Earth among them.
    const { eye } = view;
    const all = [
      { ...earth, id: "earth", away: Math.hypot(eye.x - EARTH_PLACE.x, eye.y - EARTH_PLACE.y, eye.z - EARTH_PLACE.z) },
      ...bodies,
    ];
    all.forEach((one, at) => {
      for (const other of all.slice(at + 1)) {
        const [near, far] = one.away <= other.away ? [one, other] : [other, one];
        if (far.away / near.away >= 1.5) expect(coveredShare(near, far)).toBeLessThanOrEqual(0.5);
        else
          expect(Math.hypot(near.x - far.x, near.y - far.y) - near.radius - far.radius).toBeGreaterThanOrEqual(
            (2 / 3) * Math.min(near.radius, far.radius),
          );
      }
    });
  });

test("reads in depth and in 3D at rest: sizes four times apart, distances two and a half, no line of bodies", async ({
  page,
}) => {
  await served(page, RECORDED);
  await arrived(page);
  await standing(page);
  const { earth, bodies } = (await cosmos(page)).screen;
  if (earth === undefined) throw new Error("no Earth");
  const shown = bodies.filter(
    ({ x, y, radius }) =>
      x + radius > 0 && x - radius < COMPUTER.width && y + radius > 0 && y - radius < COMPUTER.height,
  );
  const sizes = [earth.radius, ...shown.map(({ radius }) => radius)];
  expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThanOrEqual(4);
  const { eye } = viewOf().view;
  const distances = [
    Math.hypot(eye.x - EARTH_PLACE.x, eye.y - EARTH_PLACE.y, eye.z - EARTH_PLACE.z),
    ...shown.map(({ away }) => away),
  ];
  expect(Math.max(...distances) / Math.min(...distances)).toBeGreaterThanOrEqual(2.5);
  // Three points make a triangle: a line shows from four, the Earth among them. A view with a close world stands low: a tenth across.
  expect(shown.length + 1).toBeGreaterThanOrEqual(4);
  expect(offLine([earth, ...shown])).toBeGreaterThan(viewOf().view.close === undefined ? 0.2 : 0.1);
});

// F4250, and Alexis's "on devrait avoir de la profondeur": with motion on the eye drifts, the near worlds slide past the far ones,
// and the Earth stays at the centre.
const slid = (first: readonly Body[], last: readonly Body[]) =>
  first
    .flatMap((body) => {
      const later = last.find(({ id }) => id === body.id);
      return later === undefined ? [] : [{ away: body.away, by: Math.hypot(later.x - body.x, later.y - body.y) }];
    })
    .sort((a, b) => a.away - b.away);

test("keeps the Earth at the centre with motion on, the near bodies sliding more than the far ones", async ({
  page,
}) => {
  await served(page, RECORDED);
  await page.setViewportSize(COMPUTER);
  await page.goto(HOME);
  await hydrated(page);
  await running(page);
  await standing(page);
  const at = async () => {
    const { frames } = await stats(page);
    await expect.poll(async () => (await stats(page)).frames, SLOW).toBeGreaterThan(frames + 1);
    return (await cosmos(page)).screen;
  };
  // The dive over first (7d7): it moves the eye along the view, which slides the near world across the screen no more than a far one.
  await expect.poll(async () => (await stats(page)).seconds, SLOW).toBeGreaterThan(15);
  const first = await at();
  const { seconds } = await stats(page);
  await expect.poll(async () => (await stats(page)).seconds, SLOW).toBeGreaterThan(seconds + 3);
  const last = await at();
  for (const { earth } of [first, last]) {
    near(earth?.x ?? NaN, COMPUTER.width / 2, "the Earth's x with motion on");
    near(earth?.y ?? NaN, COMPUTER.height / 2, "the Earth's y with motion on");
  }
  const moved = slid(first.bodies, last.bodies);
  const [nearest, farthest] = [moved[0], moved.at(-1)];
  if (nearest === undefined || farthest === undefined) throw new Error("no body slid");
  expect(moved.length).toBeGreaterThanOrEqual(3);
  expect(nearest.by).toBeGreaterThan(farthest.by);
  expect(farthest.by).toBeGreaterThan(0);
});

test("counts in the hero the worlds the cosmos draws", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  await expect.poll(async () => (await cosmos(page)).worlds, SLOW).toBeGreaterThan(500);
  const { worlds } = await cosmos(page);
  await expect(page.locator("[data-hero='number']")).toHaveText(String(worlds));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${String(worlds)} worlds in Onyx`);
});

// The draw bound and a frame's cost at rest, on the High tier and on a weak GPU's: what this view adds is three systems' bodies. The points
// are the field of stars and the nebulae's dust: the approved arrival drew 47,438 on this file, this view 47,437 (7d6, SwiftShader).
const DRAWS_AT_REST = 90;
const POINTS_AT_REST = 48_000;
for (const tier of ["high", "low"] as const)
  test(`holds the draw bound and a frame's cost at rest on the ${tier} tier`, async ({ page }) => {
    if (tier === "low")
      await page.addInitScript(() => {
        localStorage.setItem("gnoworld:scene:tier", "low");
      });
    await served(page, RECORDED);
    await arrived(page);
    await standing(page);
    await expect.poll(async () => (await stats(page)).tier, SLOW).toBe(tier);
    const { calls, points, textures } = await stats(page);
    const drawn = await cosmos(page);
    expect(calls).toBeLessThanOrEqual(DRAWS_AT_REST);
    expect(points).toBeLessThanOrEqual(POINTS_AT_REST);
    expect(drawn.bodies).toBeLessThanOrEqual(2 * 12 + 1);
    expect(textures).toBeLessThanOrEqual(tier === "low" ? 40 : 60);
  });

// The page's time held, to move only as a journey runs it: a frame at a time, each 16 ms after the last however slow the software GPU,
// so the Auto probe keeps the tier it found. Held a little ahead of now, read again if the page went past it.
async function held(page: Page) {
  for (let tried = 0; ; tried += 1)
    try {
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 250));
      return;
    } catch (error) {
      if (tried > 4) throw error;
    }
}

// The home's dive (7d7; Alexis, 2026-11-02), with motion on: from the whole cosmos down to the view at rest, the Earth at the centre all the
// way. Each frame is read through the scene's stats as it comes, with what it cost to draw; with a `step`, the page's time is held and run
// that many ms a reading.
interface Dived {
  readonly along: number;
  readonly share: number;
  readonly earth: { readonly x: number; readonly y: number } | undefined;
  readonly eye: { readonly x: number; readonly y: number; readonly z: number };
  readonly calls: number;
  readonly points: number;
  readonly textures: number;
}
async function dove(
  page: Page,
  { size = COMPUTER, path = HOME, step }: { size?: typeof COMPUTER; path?: string; step?: number } = {},
): Promise<Dived[]> {
  if (step !== undefined) await page.clock.install();
  await served(page, RECORDED);
  await page.setViewportSize(size);
  await page.goto(path);
  if (path === HOME) await hydrated(page);
  await running(page);
  if (step !== undefined) await held(page);
  const seen: Dived[] = [];
  await expect
    .poll(
      async () => {
        if (step !== undefined) await page.clock.runFor(step);
        const { cosmos: drawn, ...cost } = await stats(page);
        const one = drawn === undefined ? undefined : divedOf(drawn, cost);
        if (one !== undefined && (one.share > 0 || one.along > 0)) seen.push(one);
        return one?.along === 1 && seen.some(({ along }) => along < 1);
      },
      { timeout: step === undefined ? SLOW.timeout : 4 * SLOW.timeout, intervals: [10] },
    )
    .toBe(true);
  return seen;
}
const divedOf = (
  { dive, web, screen, eye }: CosmosStats,
  { calls, points, textures }: { calls: number; points: number; textures: number },
): Dived => ({ along: dive.along, share: web?.share ?? 0, earth: screen.earth, eye, calls, points, textures });

// The Earth at the canvas's centre, where it stands on screen.
function centred(earth: Dived["earth"], size: typeof COMPUTER) {
  // A globe that came between two frames has no place till the next.
  if (earth === undefined || !Number.isFinite(earth.x)) return;
  near(earth.x, size.width / 2, "the Earth's x on the way down");
  near(earth.y, size.height / 2, "the Earth's y on the way down");
}

for (const size of [COMPUTER, WIDE])
  test(`dives from the whole cosmos to the view at rest, the Earth at the centre all the way, at ${String(size.width)} by ${String(size.height)}`, async ({
    page,
  }) => {
    const seen = await dove(page, { size });
    // Read in real time, a few frames of it: its opening in the whole cosmos is read frame by frame below, the page's time held.
    expect(seen.some(({ share, along }) => share === 0 && along > 0 && along < 1)).toBe(true);
    for (const [at, { along }] of seen.entries()) expect(along).toBeGreaterThanOrEqual(seen[at - 1]?.along ?? 0);
    for (const { earth } of seen) centred(earth, size);
    // It lands on 7d6's eye, swayed: the view at rest the core searched on the same file.
    const rest = { x: 0, y: 0, z: 0 };
    toScene(viewOf().view.eye, rest);
    const landed_ = seen.at(-1);
    if (landed_ === undefined) throw new Error("no frame");
    expect(distanceOf(landed_.eye, rest)).toBeLessThan(0.3);
    // It only comes in, the sway apart: each frame read stands no farther from the Earth than the one before.
    for (const [at, { eye }] of seen.entries())
      expect(distanceOf(eye, EARTH)).toBeLessThanOrEqual(distanceOf(seen[at - 1]?.eye ?? eye, EARTH) + 0.3);
  });

// The draw bound and a frame's cost through the dive, on the High tier and a weak GPU's: what it adds to the view at rest is the whole
// cosmos's two draws and its worlds' points, at most. Every frame of it, in a small window, so the software GPU draws them all in time.
const SMALL = { width: 1024, height: 640 };
for (const tier of ["high", "low"] as const)
  test(`holds the draw bound and a frame's cost through the dive on the ${tier} tier`, async ({ page }) => {
    test.setTimeout(480_000);
    // Low as a weak GPU's device remembers it; High as the Auto probe finds it, the page's time held.
    if (tier === "low")
      await page.addInitScript(() => {
        localStorage.setItem("gnoworld:scene:tier", "low");
      });
    const seen = await dove(page, { size: SMALL, step: 16 });
    expect((await stats(page)).tier).toBe(tier);
    expect(seen.length).toBeGreaterThan(300);
    expect(seen.some(({ share, along }) => share === 1 && along < 0.25)).toBe(true);
    // The whole cosmos's two draws, the bodies passing behind the hero's text on the way down (7d9), 7p's two depth bodies among them, and
    // the rocks' one draw. Measured on the recorded file (2026-11-03): 24 draws at most after 7d9, 28 after 7p, 21 or 22 landed; 47,508
    // points at most, 47,465 landed.
    const landedFrame = seen.at(-1);
    expect(Math.max(...seen.map(({ calls }) => calls))).toBeLessThanOrEqual((landedFrame?.calls ?? 0) + 7);
    expect(Math.max(...seen.map(({ calls }) => calls))).toBeLessThanOrEqual(DRAWS_AT_REST);
    expect(Math.max(...seen.map(({ points }) => points))).toBeLessThanOrEqual((landedFrame?.points ?? 0) + 533);
    expect(Math.max(...seen.map(({ points }) => points))).toBeLessThanOrEqual(POINTS_AT_REST);
    expect(Math.max(...seen.map(({ textures }) => textures))).toBeLessThanOrEqual(tier === "low" ? 40 : 60);
  });

// Under reduced motion no camera moves: the whole cosmos stands still, then dissolves into the view at rest (7d7). The page's clock is held,
// so each picture is taken where it is wanted. The dissolving one is the still cosmos laid over the view at rest as much as the veil says:
// nearer that mix than to the view at rest under a picture copied black.
test("dissolves the whole cosmos into the view at rest under reduced motion, and moves no camera", async ({ page }) => {
  await page.clock.install();
  await served(page, RECORDED);
  await page.setViewportSize(COMPUTER);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(HOME);
  await hydrated(page);
  await running(page);
  await hideThePage(page);
  // Held, the page's time moves only as the journey runs it, three frames at a time.
  await held(page);
  const eyes = new Set<string>();
  let veil = 0;
  const until = async (wanted: (drawn: CosmosStats) => boolean) => {
    await expect
      .poll(
        async () => {
          await page.clock.runFor(48);
          const drawn = await cosmos(page);
          if (drawn.shown && ((drawn.web?.share ?? 0) > 0 || drawn.dive.along > 0))
            eyes.add([drawn.eye.x, drawn.eye.y, drawn.eye.z].map((value) => value.toFixed(4)).join(","));
          veil = drawn.dive.veil;
          return wanted(drawn);
        },
        { ...SLOW, intervals: [10] },
      )
      .toBe(true);
    return page.locator("canvas").screenshot();
  };
  const still = await until(({ web, dive }) => web?.share === 1 && dive.veil === 0 && dive.along === 0);
  const dissolving = await until(({ dive }) => dive.veil > 0.4 && dive.veil < 0.9);
  const shown = veil;
  const rest = await until(({ dive }) => dive.along === 1 && dive.veil === 0);
  expect(eyes.size).toBe(2);
  const cells = Array.from({ length: 48 }, (_, at): [number, number, number, number] => {
    const [x, y] = [(at % 8) * 216, Math.floor(at / 8) * 180];
    return [x, y, x + 216, y + 180];
  });
  const [one = [], two = [], three = []] = await Promise.all(
    [still, dissolving, rest].map((shot) => brightness(page, shot, cells)),
  );
  const off = (made: (at: number) => number) => two.reduce((sum, value, at) => sum + Math.abs(value - made(at)), 0);
  const mixed = off((at) => shown * (one[at] ?? 0) + (1 - shown) * (three[at] ?? 0));
  const black = off((at) => (1 - shown) * (three[at] ?? 0));
  expect(mixed).toBeLessThan(black / 2);
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

// 7d7: the lab is the site's own scene, so it opens with the dive too, which Alexis judges on his own GPU.
// The whole cosmos shows whole for a tenth of a second of the dive, from its fade's end (0.145) till the eye passes 680 units (0.163): the
// page's time is held and stepped a frame at a time, in a small window, so no frame of it is missed under load.
test("opens the release's page with the dive, from the whole cosmos to the view at rest", async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await dove(page, { path: "/lab/realism.html?view=cosmos", size: SMALL, step: 16 });
  expect(seen.some(({ share, along }) => share === 1 && along < 0.25)).toBe(true);
  expect(seen.at(-1)?.along).toBe(1);
});

test("gives the release's page the cosmos as a view, from the recorded file, for Alexis's own GPU", async ({
  page,
}) => {
  await inTheLab(page);
  expect((await cosmos(page)).stars).toBeGreaterThan(40);
});

// Alexis, 2026-11-03, on the lab: "la grosse planète à gauche disparaît si on bouge en rétrécissant". The lab keeps the home's hero room,
// which has no text there, so a drag or the wheel slid the close world under it, shrank it and put it out. The room is the rest's alone.
test("keeps the close world at its size in the lab as a drag or the wheel takes the eye off the rest", async ({
  page,
}) => {
  const { systems, view } = viewOf();
  const world = systems[view.close?.system ?? -1]?.worlds[view.close?.world ?? -1];
  if (world === undefined) throw new Error("the recorded file gives no close world");
  const focal = COMPUTER.height / 2 / Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
  await inTheLab(page);
  // The lab's own moves: a drag takes the eye 0.06 units a pixel at rest (3 units, within the view at rest's reach, then 6, past it), the
  // "0" key brings it back, a wheel's step backs it off by a share of the way. F4271's journey holds the room kept at rest.
  const moves = [
    ...[50, 50].map(
      (pixels) => `dispatchEvent(new PointerEvent("pointermove", { buttons: 1, movementX: ${String(pixels)} }))`,
    ),
    `dispatchEvent(new KeyboardEvent("keydown", { key: "0" }))`,
    ...Array.from({ length: 6 }, () => `dispatchEvent(new WheelEvent("wheel", { deltaY: 20 }))`),
  ];
  // A step under the cosmos's own (4 units) takes no look, and reduced motion draws the one frame a change owes: it poses the bodies.
  for (const move of moves) {
    const { frames } = await stats(page);
    await page.evaluate(move);
    await expect.poll(async () => (await stats(page)).frames, SLOW).toBeGreaterThan(frames);
    const spot = (await cosmos(page)).screen.bodies.find(({ id }) => id === world.id);
    if (spot === undefined) throw new Error(`the close world went after ${move}`);
    // Its depth along the view is its distance or less, and more than 0.8 of it within the lens's corners: drawn whole, it stands as
    // large as its distance says, or up to a quarter larger off the view's axis.
    const truly = (world.radius * focal) / spot.away;
    expect(spot.radius).toBeGreaterThanOrEqual(0.98 * truly);
    expect(spot.radius).toBeLessThanOrEqual(1.25 * truly);
  }
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
  // The eye at rest stands where the view at rest puts it, off the scene's own: the scene's is moved so the eye stands 2 units over the Earth.
  const [{ eye: scene }, { eye }] = [await stats(page), await cosmos(page)];
  const near = { x: 0, y: 0, z: 0 };
  toScene({ ...EARTH_PLACE, y: EARTH_PLACE.y + 2 }, near);
  await moveTo(page, { x: near.x - eye.x + scene.x, y: near.y - eye.y + scene.y, z: near.z - eye.z + scene.z });
  await expect.poll(async () => (await cosmos(page)).nebulae, SLOW).toBe(0);
});

test("gives the release's page the nebulae, and their credits in its footer", async ({ page }) => {
  await inTheLab(page);
  await lit(page);
  for (const credit of CREDITS.filter(({ files }) => files.some((file) => NEBULA_IMAGES.some((name) => name === file))))
    await expect(page.locator("footer")).toContainText(credit.line);
});

// 7d6's design review: the lab drew in full the five suns the home dims under its hero, and Alexis judges the look on the lab.
test("dims in the lab the suns the home dims under its hero, the same view drawn", async ({ page }) => {
  await served(page, RECORDED);
  await arrived(page);
  const hero = await box(page, "[data-clear]");
  const under = [hero.x, hero.y, hero.x + hero.width, hero.y + hero.height].map(Math.round);
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = under;
  await lit(page);
  const [home] = await brightness(page, await stillPicture(page), [[x0, y0, x1, y1]]);
  const { eye } = await cosmos(page);
  await page.goto("/lab/realism.html?view=cosmos");
  await running(page);
  await lit(page);
  const [lab] = await brightness(page, await stillPicture(page), [[x0, y0, x1, y1]]);
  expect((await cosmos(page)).eye).toEqual(eye);
  expect(lab).toBeLessThanOrEqual((home ?? NaN) + 1);
});

// The light the nebulae add, read as the same view twice, their images refused and then let through: the video's nebulae are coloured
// dust and gas, never grey smoke (#19363C, #472819: saturation 0.6), and the warm glow under them keeps its shape.
const BOX = 48;
// Alexis, 2026-11-02: 36, the nebulae kept as he approved them; the view at rest looks towards a red nebula's bright side (7d6).
const ADDS_AT_MOST = 36;
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

// Where the Earth stands on the stage: what the eye looks at (7d6).
const EARTH = { x: 0, y: 0, z: 0 };
toScene(EARTH_PLACE, EARTH);

// The view at rest looks towards a red nebula's bright side (7d6); a quarter turn round the Earth, about the map's up, at the rest's
// distance, the cool ones stand behind it. A sweep of twelve turns on the merged tree (7d5's merge notes, 2026-11-03): 76 cool boxes, hues
// 195 to 198, at a quarter turn; none at the arrival.
async function quarterTurned(page: Page) {
  const [top, middle] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ];
  toScene({ x: 0, y: 1, z: 0 }, top);
  toScene({ x: 0, y: 0, z: 0 }, middle);
  const up = { x: top.x - middle.x, y: top.y - middle.y, z: top.z - middle.z };
  const [{ eye: rest }, { eye: scene }] = [await cosmos(page), await stats(page)];
  const [x, y, z] = [rest.x - EARTH.x, rest.y - EARTH.y, rest.z - EARTH.z];
  const along = up.x * x + up.y * y + up.z * z;
  // The rest's offset turned a quarter round `up`: up x offset, plus its part along up.
  const turned = {
    x: up.y * z - up.z * y + up.x * along,
    y: up.z * x - up.x * z + up.y * along,
    z: up.x * y - up.y * x + up.z * along,
  };
  await moveTo(page, {
    x: scene.x + EARTH.x + turned.x - rest.x,
    y: scene.y + EARTH.y + turned.y - rest.y,
    z: scene.z + EARTH.z + turned.z - rest.z,
  });
}

// The arrival drawn and still, its page hidden, as a picture; turned first if asked.
async function stillPicture(page: Page, turn?: (page: Page) => Promise<void>) {
  await standing(page);
  await turn?.(page);
  await opened(page);
  await hideThePage(page);
  return page.locator("canvas").screenshot();
}

// The arrival without its nebulae, their images refused, then with them.
async function bothWays(page: Page, turn?: (page: Page) => Promise<void>) {
  let refused = true;
  let asked = 0;
  await page.route(NEBULA, (route) => {
    asked += 1;
    return refused ? route.fulfill({ status: 404 }) : route.fallback();
  });
  await served(page, RECORDED);
  await arrived(page);
  await expect.poll(() => asked, SLOW).toBeGreaterThan(0);
  const without = await stillPicture(page, turn);
  expect((await cosmos(page)).nebulae).toBe(0);
  refused = false;
  await page.reload();
  await hydrated(page);
  await running(page);
  await landed(page);
  await lit(page);
  return { without, withNebulae: await stillPicture(page, turn) };
}

// Frame 16's teal, top right (f0016.jpg read with ffmpeg, 2026-11-02): hues 182 to 193 from the tenth part of its pixels to the ninetieth,
// mean sRGB (10, 44, 50), its ninetieth (10, 62, 66). The light a nebula adds is read against black, so a few degrees more either way.
const FRAME_TEAL = { least: 176, most: 200, brightest: 66, saturation: 0.82 };
const SATURATION_READ = 7;
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
    const { without, withNebulae } = await bothWays(page, quarterTurned);
    const [before, after] = [await colours(page, without, boxes()), await colours(page, withNebulae, boxes())];
    let [teal, read] = [0, 0];
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
      // Its saturation is read where the light added reaches 7 on its strongest channel: there half a step of 8-bit rounding moves it by
      // 0.07 at most, under the bound's margin over frame 16's 0.82 (7d9). Seventy-five boxes read at the least, so the floor hides no change.
      if (top < SATURATION_READ) continue;
      read += 1;
      expect((top - Math.min(...added)) / top, `box ${String(at)}`).toBeLessThanOrEqual(FRAME_TEAL.saturation + 0.1);
    }
    expect(teal).toBeGreaterThan(3);
    expect(read).toBeGreaterThanOrEqual(75);
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
  // What the eye looks at is the Earth (7d6): its distance from the cosmos's own eye says the share.
  expect(distanceOf((await cosmos(page)).eye, EARTH)).toBeGreaterThan(1000);
  await expect.poll(async () => (await cosmos(page)).web?.share ?? 0, SLOW).toBe(1);
  // A frame drawn still out there: the dive compiled the whole cosmos already, so it takes the view on the frame that moved, which also
  // marches the sky's picture (7d7).
  const { frames } = await stats(page);
  await page.evaluate((to) => {
    (Reflect.get(globalThis, "__gnoworldScene") as { moveTo: (at: typeof to) => void }).moveTo(to);
  }, far);
  await expect.poll(async () => (await stats(page)).frames, SLOW).toBeGreaterThan(frames);
};

// 7d7: the home opens in the whole cosmos, so its chunk is asked at the arrival, once, and the view at rest leaves it with nothing to draw.
// The service worker's own fetches escape page.route: blocked, so each ask is seen.
test.describe("the whole cosmos's chunk", () => {
  test.use({ serviceWorkers: "block" });
  test("asks for the whole cosmos once at the arrival, and leaves it nothing to draw at rest", async ({ page }) => {
    let asked = 0;
    await page.route(WHOLE_JS, (route) => {
      asked += 1;
      return route.fallback();
    });
    await served(page, linkedFileOf(300));
    await arrived(page);
    await standing(page);
    expect(asked).toBe(1);
    expect((await cosmos(page)).web?.share).toBe(0);
  });
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

// 7d3: a system's arrival, the eye come to it as 7g's flights will land it, now its dynamic view (7v). Onyx's gnoswap, sixteen worlds and a
// far belt; a lone world of no belt 156 units out; a view not chosen for these tests.
const ARRIVALS = ["gnoswap", "g1nufzhlvkr7ep9m9t52mk9jfymtn7ywclsaydf8"] as const;
// The header's band, a tenth of the height; the star at the centre within a pixel or two of the camera's rounding.
const [HEADER, CENTRED] = [0.09, 2];
const recorded = () => JSON.parse(RECORDED) as { updated: string; worlds: Parameters<typeof heldOf>[0] };
const arrivalAt = (id: string) => {
  const systems = systemsOf(heldOf(recorded().worlds));
  const system = systems.find((each) => each.id === id);
  if (system === undefined) throw new Error(`no system ${id}`);
  return { system, arrival: arrivalOf(system, systems) };
};
interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
const staged = (at: Point3): Point3 => {
  const out = { x: 0, y: 0, z: 0 };
  toScene(at, out);
  return out;
};
const minus3 = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot3 = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit3 = (a: Point3): Point3 => {
  const length = Math.sqrt(dot3(a, a));
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};
const cross3 = (a: Point3, b: Point3): Point3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
// Where the system's star stands on the screen, off its middle, through the scene's camera: at the eye, turned to what the arrival looks
// at, the map's up kept up (three's lookAt), the lens of 50 degrees.
async function starOf(page: Page, id: string, { height }: { width: number; height: number }) {
  const { system, arrival } = arrivalAt(id);
  const { eye } = await cosmos(page);
  const back = unit3(minus3(eye, staged(arrival.look)));
  const right = unit3(cross3(minus3(staged({ x: 0, y: 1, z: 0 }), staged({ x: 0, y: 0, z: 0 })), back));
  const up = cross3(back, right);
  const from = minus3(staged(system.place), eye);
  const [depth, focal] = [-dot3(from, back), height / 2 / Math.tan((25 * Math.PI) / 180)];
  return { x: (focal * dot3(from, right)) / depth, y: (-focal * dot3(from, up)) / depth };
}
async function cameTo(page: Page, id: string, { size = COMPUTER, still = true } = {}) {
  await page.setViewportSize(size);
  if (still) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/lab/realism.html?view=cosmos&arrive=${id}`);
  await running(page);
  await landed(page);
  const there = staged(arrivalAt(id).arrival.eye);
  // At its arrival, within the sway's reach with motion on.
  await expect
    .poll(async () => {
      const off = minus3((await cosmos(page)).eye, there);
      return Math.sqrt(dot3(off, off));
    }, SLOW)
    .toBeLessThan(0.5);
  // Every world its arrival draws held and on the screen: a body waits for its maps, then its programs, and `standing` counts the held
  // alone (F4408: under load it read two of gnoswap's three).
  const worlds = arrivalAt(id).arrival.postcard.worlds.map(({ id: world }) => world);
  await expect
    .poll(async () => {
      const shown = new Set((await cosmos(page)).screen.bodies.map(({ id: world }) => world));
      return worlds.every((world) => shown.has(world));
    }, SLOW)
    .toBe(true);
}
// The star at the centre (7v, Alexis's "centrée sur son soleil"); the nearest body cut by the frame, its head under the header; each other
// whole under it; none on the star's heart.
async function framed(page: Page, id: string, size: { width: number; height: number }) {
  const { bodies } = (await cosmos(page)).screen;
  const offset = await starOf(page, id, size);
  const star = { x: size.width / 2 + offset.x, y: size.height / 2 + offset.y };
  expect(Math.abs(offset.x)).toBeLessThanOrEqual(CENTRED);
  expect(Math.abs(offset.y)).toBeLessThanOrEqual(CENTRED);
  const [near, ...others] = [...bodies].sort((a, b) => a.away - b.away);
  if (near !== undefined) {
    const cut = near.x - near.radius < 0 || near.x + near.radius > size.width || near.y + near.radius > size.height;
    expect(cut).toBe(true);
    expect(near.y - near.radius).toBeGreaterThanOrEqual(HEADER * size.height);
    expect(Math.hypot(near.x - star.x, near.y - star.y) - near.radius).toBeGreaterThanOrEqual(STAR_HEART);
  }
  for (const body of others) {
    expect(body.x - body.radius).toBeGreaterThanOrEqual(0);
    expect(body.x + body.radius).toBeLessThanOrEqual(size.width);
    expect(body.y - body.radius).toBeGreaterThanOrEqual(HEADER * size.height);
    expect(body.y + body.radius).toBeLessThanOrEqual(size.height);
    expect(Math.hypot(body.x - star.x, body.y - star.y) - body.radius).toBeGreaterThanOrEqual(STAR_HEART);
  }
  return bodies;
}

for (const id of ARRIVALS)
  for (const size of id === "gnoswap" ? [COMPUTER, WIDE] : [COMPUTER])
    test(`comes to ${id.slice(0, 12)}'s dynamic view at ${String(size.width)} by ${String(size.height)}: its star at the centre, its nearest world cut by the frame, the others whole, none on its heart`, async ({
      page,
    }) => {
      await cameTo(page, id, { size });
      const bodies = await framed(page, id, size);
      expect(bodies.map(({ id: world }) => world).sort()).toEqual(
        arrivalAt(id)
          .arrival.postcard.worlds.map(({ id: world }) => world)
          .sort(),
      );
      if (id === "gnoswap") expect((await cosmos(page)).rocks).toBeGreaterThan(0);
    });

test("keeps the dynamic view framed as the eye sways, motion on", async ({ page }) => {
  await cameTo(page, "gnoswap", { still: false });
  const { seconds } = await stats(page);
  for (let read = 0; read < 4; read += 1) {
    await expect.poll(async () => (await stats(page)).seconds, SLOW).toBeGreaterThan(seconds + read);
    await framed(page, "gnoswap", COMPUTER);
  }
});

// The sun's beat (ADR-0001 §7): the great star swells once a block from the file's time. The wall's clock held at the beat's top, then at
// its rest, a frame each, motion on: the halo round the great star's heart reads brighter at the top; no other sun's does.
const BEAT_FROM = Date.parse(recorded().updated);
const beatTop = () =>
  Array.from({ length: 400 }, (_, at) => BEAT_FROM + 30 * BLOCK_MS + at * 10).reduce((best, now) =>
    beatAt(BEAT_FROM, now, BEAT_FROM) > beatAt(BEAT_FROM, best, BEAT_FROM) ? now : best,
  );
const beatRest = () => beatTop() + BLOCK_MS / 2;
// The light of a box right of a star's heart, past its white, on a frame drawn at `now`: two more frames with motion on, the one a change
// owes under reduced motion, which a step of the eye too small for a look asks.
async function haloAt(page: Page, now: number, { at, still = false }: { at: string | undefined; still?: boolean }) {
  await page.clock.setFixedTime(now);
  const { frames, eye } = await stats(page);
  if (still)
    await page.evaluate((to) => {
      (Reflect.get(globalThis, "__gnoworldScene") as { moveTo: (at: typeof to) => void }).moveTo(to);
    }, eye);
  await expect.poll(async () => (await stats(page)).frames, SLOW).toBeGreaterThanOrEqual(frames + (still ? 1 : 2));
  // The great star at home, or the system's own star at its arrival.
  const spot =
    at === undefined
      ? (await cosmos(page)).screen.sun
      : await starOf(page, at, COMPUTER).then(({ x, y }) => ({
          x: x + COMPUTER.width / 2,
          y: y + COMPUTER.height / 2,
        }));
  const [x, y] = [Math.round(spot.x), Math.round(spot.y)];
  const [light] = await brightness(page, await page.locator("canvas").screenshot(), [
    [x + 60, y - 20, x + 110, y + 20],
  ]);
  return light ?? NaN;
}

test("beats the great star once a block: its halo brighter at the beat's top than at its rest", async ({ page }) => {
  await page.clock.setFixedTime(beatRest());
  await page.setViewportSize(COMPUTER);
  await page.goto("/lab/realism.html?view=cosmos");
  await running(page);
  await standing(page);
  const top = await haloAt(page, beatTop(), { at: undefined });
  const rest = await haloAt(page, beatRest(), { at: undefined });
  expect(beatAt(BEAT_FROM, beatRest(), BEAT_FROM)).toBe(0);
  expect(top).toBeGreaterThan(rest * 1.04);
});

test("beats no other sun: a system's own star at its arrival reads the same at the beat's top and rest", async ({
  page,
}) => {
  await page.clock.setFixedTime(beatRest());
  await cameTo(page, "gnoswap", { still: false });
  const top = await haloAt(page, beatTop(), { at: "gnoswap" });
  const rest = await haloAt(page, beatRest(), { at: "gnoswap" });
  expect(Math.abs(top - rest)).toBeLessThanOrEqual(0.01 * rest + 1);
});

test("beats nothing under reduced motion: the great star's halo the same at the beat's top and rest", async ({
  page,
}) => {
  await page.clock.setFixedTime(beatRest());
  await inTheLab(page);
  const top = await haloAt(page, beatTop(), { at: undefined, still: true });
  const rest = await haloAt(page, beatRest(), { at: undefined, still: true });
  expect(Math.abs(top - rest)).toBeLessThanOrEqual(0.01 * rest + 1);
});
