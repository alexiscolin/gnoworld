import type { CDPSession } from "@playwright/test";
import { expect, hydrated, type Page } from "./fixtures.ts";
import { box } from "./geometry.ts";

// What the scene's journeys share: the running scene, read in a test build, and its context lost and given back.
interface Spot {
  x: number;
  y: number;
  radius: number;
}
interface CosmosStats {
  shown: boolean;
  bodies: number;
  stars: number;
  dots: number;
  glows: number;
  rocks: number;
  maps: number;
  looks: number;
  dotPixels: number;
  earth: boolean;
  screen: { sun: Spot; earth: Spot | undefined; bodies: (Spot & { id: string; away: number })[] };
  nebulae: number;
  worlds: number;
  eye: { x: number; y: number; z: number };
  web?: { points: number; particles: number; clumps: number; chosen?: string; share: number };
  sky: { share: number; eye: { x: number; y: number; z: number } };
  /** The home's dive (7d7): how far along it is, 1 at rest, and how much of the dissolve's picture still shows. */
  dive: { along: number; veil: number };
  /** The Earth's view (7x2), once its chunk came: its stations as bodies and as the belt's lights, their parts and draws, the scenery's
   * planets, and whether the orbits show. */
  stations?: { close: number; belt: number; parts: number; draws: number; scenery: number; orbits: boolean };
}
/** The flights (7g): how many started, one under way or not, how far along, its veil and streaks, where it goes, and the eye's way so far. */
export interface FlightStats {
  flights: number;
  flying: boolean;
  along: number;
  veil: number;
  streaks: number;
  kind: string;
  target: string;
  seconds: number;
  /** How long, on its own clock, the last flight waited in transit for its page's body. */
  waited: number;
  travel: { x: number; y: number; z: number };
}
interface Stats {
  frames: number;
  tier: "high" | "low";
  ratio: number;
  probing: boolean;
  calls: number;
  points: number;
  geometries: number;
  textures: number;
  eye: { x: number; y: number; z: number };
  seconds: number;
  cosmos: CosmosStats | undefined;
  flight: FlightStats | undefined;
}

/** The JS heap in use after a garbage collection, through CDP. */
export async function heapOf(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  return (await cdp.send("Runtime.getHeapUsage")).usedSize;
}

/** The GPU's resources the scene holds: its geometries and its textures. */
export async function gpuOf(page: Page): Promise<{ geometries: number; textures: number }> {
  return page.evaluate(() => {
    const space: unknown = Reflect.get(globalThis, "__gnoworldSpace");
    const { geometries, textures } = (
      space as { renderer: { info: { memory: { geometries: number; textures: number } } } }
    ).renderer.info.memory;
    return { geometries, textures };
  });
}

export const stats = (page: Page) =>
  page.evaluate(() => {
    const scene: unknown = Reflect.get(globalThis, "__gnoworldScene");
    return (scene as { stats: () => Stats }).stats();
  });

// Every layout shift the page makes, from before its first paint, kept for `shifted`.
export const countShifts = (page: Page) =>
  page.addInitScript(() => {
    Reflect.set(globalThis, "__shift", 0);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const { value, hadRecentInput } = entry as unknown as { value: number; hadRecentInput: boolean };
        if (!hadRecentInput) Reflect.set(globalThis, "__shift", Number(Reflect.get(globalThis, "__shift")) + value);
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

export const shifted = (page: Page) => page.evaluate(() => Number(Reflect.get(globalThis, "__shift")));

/** A page whose body in space has its room laid out from the first paint: the plate's title stays where it was drawn while the body comes
 * (`come`), and the page barely shifts. Under reduced motion, so only the layout moves. */
export async function keepsItsRoom(page: Page, path: string, come: (page: Page) => Promise<void>) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await countShifts(page);
  await page.goto(path);
  await hydrated(page);
  const before = await box(page, "h1");
  await come(page);
  const after = await box(page, "h1");
  expect(after.y).toBe(before.y);
  expect(await shifted(page)).toBeLessThan(0.1);
}

// The page's time held, to move only as a journey runs it: a frame at a time, each 16 ms after the last however slow the software GPU,
// so the Auto probe keeps the tier it found. Held a little ahead of now, read again if the page went past it. The clock is installed first.
export async function held(page: Page) {
  for (let tried = 0; ; tried += 1)
    try {
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 250));
      return;
    } catch (error) {
      if (tried > 4) throw error;
    }
}

export const running = (page: Page) => expect(page.locator("canvas[data-scene='on']")).toBeAttached();

/** The home's dive over (7d7): its cosmos came and stands at rest, the dissolve's picture gone. Until then the camera looks at the Earth
 * from the whole cosmos, so the sky and the worlds are not the arrival's. */
export const landed = (page: Page) =>
  expect
    .poll(
      async () => {
        const dive = (await stats(page)).cosmos?.dive;
        return dive?.along === 1 && dive.veil === 0;
      },
      { timeout: 90_000 },
    )
    .toBe(true);

// Once the iris has opened: before that a picture of the window shows the page's colour, not the stage.
export const opened = async (page: Page) => {
  await running(page);
  await expect
    .poll(() => page.locator("canvas").evaluate((canvas) => canvas.getAnimations().length), { timeout: 15_000 })
    .toBe(0);
};

export const loseContext = (page: Page) =>
  page.evaluate(() => {
    const context = document.querySelector("canvas")?.getContext("webgl2");
    Reflect.set(globalThis, "__lose", context?.getExtension("WEBGL_lose_context"));
    (Reflect.get(globalThis, "__lose") as WEBGL_lose_context).loseContext();
  });

export const restoreContext = (page: Page) =>
  page.evaluate(() => {
    (Reflect.get(globalThis, "__lose") as WEBGL_lose_context).restoreContext();
  });

/** Hides the page's text over the canvas, so a journey reads what the scene drew. */
export const hideThePage = (page: Page) =>
  page.evaluate(() => {
    for (const child of document.body.children)
      if (
        child instanceof HTMLElement &&
        !(child instanceof HTMLCanvasElement) &&
        child.querySelector("canvas") === null
      )
        child.style.visibility = "hidden";
  });
