import { expect, hydrated, type Page } from "./fixtures.ts";
import { box } from "./geometry.ts";

// What the scene's journeys share: the running scene, read in a test build, and its context lost and given back.
interface Spot {
  x: number;
  y: number;
  radius: number;
}
export interface CosmosStats {
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
  web?: { points: number; lines: number; gold: number; share: number };
  sky: { share: number; eye: { x: number; y: number; z: number } };
  /** The home's dive (7d7): how far along it is, 1 at rest, and how much of the dissolve's picture still shows. */
  dive: { along: number; veil: number };
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
  turn: { yaw: number; pitch: number };
  seconds: number;
  cosmos: CosmosStats | undefined;
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

export const running = (page: Page) => expect(page.locator("canvas[data-scene='on']")).toBeAttached();

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

/** Every shader the driver refused while the page runs, as three logs them. */
export function shaderRefusals(page: Page): string[] {
  const refused: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("THREE.WebGLProgram")) refused.push(message.text());
  });
  return refused;
}
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
