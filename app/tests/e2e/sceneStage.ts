import type { CDPSession } from "@playwright/test";
import { expect, hydrated, type Page } from "./fixtures.ts";
import { box } from "./geometry.ts";
import type { Space } from "../../src/space/scene.ts";

// What the scene's journeys share: the running engine, read through `__gnoworldSpace` (features/universe/spaceHook.ts), a test build's hook
// that hands out the engine itself, and its context lost and given back. A journey reads the engine's own state: the rig's flight, the
// place it asked, the universe laid out, the frames the renderer drew; it never sleeps for a flight, it polls what the engine says.
/** What the engine says of where the camera is and how it goes. */
export interface Flight {
  /** The rig's flight runs. */
  flying: boolean;
  /** How far along it, 0 to 1, eased; 1 with none. */
  along: number;
  /** The kind of place asked (`home`, `universe`, `system`, `world`), none before the first. */
  kind: string | undefined;
  /** The place's id (a system's, a world's), none for the home and the universe. */
  id: string | undefined;
  /** Whether the flight to the page's planet passed its 68 %. */
  neared: boolean;
  /** How many flights `countFlights` has seen start. */
  flights: number;
  eye: { x: number; y: number; z: number };
}

/** Counts, from now, every flight the rig is asked: the engine keeps none, a journey waits on the count. */
export const countFlights = (page: Page) =>
  page.evaluate(() => {
    const { rig } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
    Reflect.set(globalThis, "__flights", 0);
    const fly = rig.fly.bind(rig);
    rig.fly = (goal) => {
      Reflect.set(globalThis, "__flights", Number(Reflect.get(globalThis, "__flights")) + 1);
      fly(goal);
    };
  });

/** Where the camera is and goes, now. */
export const flightOf = (page: Page): Promise<Flight> =>
  page.evaluate(() => {
    const { rig, place, neared } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
    const { x, y, z } = rig.eye;
    return {
      flying: rig.flying,
      along: rig.along,
      kind: place?.kind,
      id: place !== undefined && "id" in place ? place.id : undefined,
      neared,
      flights: Number(Reflect.get(globalThis, "__flights") ?? 0),
      eye: { x, y, z },
    };
  });

/** How many worlds the engine's universe lays out, the Earth among them: none before the worlds' file came. */
export const worldsDrawn = (page: Page) =>
  page.evaluate(() => (Reflect.get(globalThis, "__gnoworldSpace") as Space).universe?.planets.length ?? 0);

/** Each name of the engine's own layer (`options.labels`), shown or not: its words, its opacity, whether it takes the pointer, its right edge. */
export const labelsOf = (page: Page) =>
  page.evaluate(() =>
    [...(Reflect.get(globalThis, "__gnoworldSpace") as Space).options.labels.children].map((label) => {
      const style = getComputedStyle(label);
      return {
        text: label.textContent,
        opacity: Number(style.opacity),
        pointer: style.pointerEvents,
        right: label.getBoundingClientRect().right,
      };
    }),
  );

/** The names standing over the canvas, each as visible as its opacity says. */
export const shownLabels = async (page: Page) => (await labelsOf(page)).filter(({ opacity }) => opacity > 0.05);

/** How many frames the engine's renderer has drawn: none is counted while its context is lost. */
export const framesOf = (page: Page) =>
  page.evaluate(() => (Reflect.get(globalThis, "__gnoworldSpace") as Space).renderer.info.render.frame);

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

/** The home's dive over: the worlds' file came and the camera stands at the home, at rest. Until then it flies in from the whole cosmos, so
 * the sky and the worlds are not the arrival's. */
export const landed = (page: Page) =>
  expect
    .poll(
      async () => {
        const flight = await flightOf(page);
        return flight.kind === "home" && !flight.flying && flight.neared && (await worldsDrawn(page)) > 0;
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

/** The router's own move, as a link on the page would make it: no load, the engine kept. */
export const goInPage = (page: Page, path: string) =>
  page.evaluate((to) => {
    history.pushState(null, "", to);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
