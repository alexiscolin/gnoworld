import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { BOUNDS } from "../../../packages/core/src/lod/ladder.ts";
import { NEBULA_IMAGES } from "../../../packages/core/src/space/nebulae.ts";
import { EARTH_PLACE, systemsOf } from "../../../packages/core/src/cosmos/system.ts";
import { coveredShare, offLine } from "../../../packages/core/src/frame/composition.ts";
import { postcardOf, restView } from "../../../packages/core/src/frame/rest.ts";
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
  worlds: 0,
  eye: { x: 0, y: 0, z: 0 },
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
    // Alexis, 2026-11-02: "la Terre un peu plus grosse", about 110 pixels across against frame 4's 95.
    expect(screen.earth?.radius).toBeGreaterThanOrEqual(50);
    expect(screen.earth?.radius).toBeLessThanOrEqual(60);
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
    expect(new Set(bodies.map(({ id }) => byId.get(id))).size).toBeLessThanOrEqual(3);
    const close = bodies.filter((body) => cutBy(body, size));
    expect(close).toHaveLength(view.close === undefined ? 0 : 1);
    for (const one of close) expect(one.radius).toBeGreaterThanOrEqual(2 * earth.radius);
    const postcards = new Map<string, number>();
    for (const body of bodies.filter((one) => !cutBy(one, size))) {
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
  // The arrival's glide over first: it moves the eye along the view, which slides the near world across the screen no more than a far one.
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
  // The eye at rest stands where the view at rest puts it, off the scene's own: the scene's is moved so the eye stands 2 units over the Earth.
  const [{ eye: scene }, { eye }] = [await stats(page), await cosmos(page)];
  const near = { x: 0, y: 0, z: 0 };
  toScene({ ...EARTH_PLACE, y: EARTH_PLACE.y + 2 }, near);
  await moveTo(page, { x: near.x - eye.x + scene.x, y: near.y - eye.y + scene.y, z: near.z - eye.z + scene.z });
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
