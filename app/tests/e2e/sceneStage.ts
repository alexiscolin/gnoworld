import { expect, type Page } from "./fixtures.ts";

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
  screen: { sun: Spot; earth: Spot | undefined; bodies: Spot[] };
  nebulae: number;
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
