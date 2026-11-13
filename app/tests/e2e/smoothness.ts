import { installFramePump } from "./earthStage.ts";
import type { Page } from "./fixtures.ts";

// Smoothness, measured frame by frame (the 11-11 question: no lag, bounce, jump or jank). `record` runs in the page and samples at every
// animation frame what moves; `analyse` reads the samples in Node. Absolute times are those of the journeys' software GPU: compare two
// trees on one machine, the same flows, the same counts.

/** One frame: its time (ms), the camera (position and look direction, a pair when the scene is on), the ground's lead, and the watched elements. */
interface Frame {
  t: number;
  eye?: [number, number, number];
  look?: [number, number, number];
  flying?: boolean;
  lead?: number;
  /** What faces the eye on the Earth's ground, in radians. */
  lat?: number;
  lon?: number;
  /** The strongest skeleton line (a shader line set drawn first, in a group of its own) showing this frame. */
  skeleton?: number;
  /** Whether the Earth stands as itself (not its quad, not its skeleton) this frame. */
  earthShown?: boolean;
  /** Per watched selector: opacity, and the transform's [scale, x, y], of its first match (NaN when none). */
  watched: Record<
    string,
    {
      opacity: number;
      seen: number;
      scale: number;
      x: number;
      y: number;
      left: number;
      width: number;
      id: number;
    } | null
  >;
}
export interface Raw {
  frames: Frame[];
  /** Long animation frames (else long tasks): start and duration in ms. */
  long: { start: number; duration: number; who: string[] }[];
  shifts: { value: number; nodes: string[] }[];
}

interface Vec {
  x: number;
  y: number;
  z: number;
}
interface Ground {
  lead: number;
  facing?: (earth: unknown, seconds: number, at: Vec) => { lat: number; lon: number };
}
interface Lines {
  renderOrder?: number;
  material?: { uniforms?: { uGain?: { value: number } } };
  parent?: { parent?: unknown } | null;
}
interface Spot {
  camera?: { position: Vec; quaternion?: Vec & { w: number } };
  rig?: { flying: boolean };
  seconds: number;
  universe?: { earth?: { index: number } };
  stage?: {
    near?: { shows: (index: number) => boolean };
    ground?: Ground;
    scene?: { traverseVisible: (visit: (object: Lines) => void) => void };
  };
}

// The page's own long frames and layout shifts, from now on.
const observe = (page: Page) =>
  page.evaluate(() => {
    const raw: Raw = { frames: [], long: [], shifts: [] };
    Reflect.set(globalThis, "__smooth", { raw, stop: false });
    const watching = (type: string, heard: (entries: PerformanceEntryList) => void) => {
      if (PerformanceObserver.supportedEntryTypes.includes(type))
        new PerformanceObserver((list) => {
          heard(list.getEntries());
        }).observe({ type, buffered: false });
    };
    const longType = PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")
      ? "long-animation-frame"
      : "longtask";
    watching(longType, (entries) => {
      for (const entry of entries) {
        const { scripts } = entry as unknown as {
          scripts?: { sourceURL: string; invoker: string; duration: number }[];
        };
        const who = (scripts ?? []).map(
          ({ sourceURL, invoker, duration }) => `${String(Math.round(duration))}ms ${invoker} ${sourceURL}`,
        );
        raw.long.push({ start: entry.startTime, duration: entry.duration, who });
      }
    });
    const nameOf = (node: Node | null) =>
      node instanceof Element ? `${node.tagName.toLowerCase()}${node.id === "" ? "" : `#${node.id}`}` : "?";
    watching("layout-shift", (entries) => {
      for (const entry of entries) {
        const shift = entry as unknown as { value: number; hadRecentInput: boolean; sources?: { node: Node | null }[] };
        if (!shift.hadRecentInput)
          raw.shifts.push({ value: shift.value, nodes: (shift.sources ?? []).map(({ node }) => nameOf(node)) });
      }
    });
  });

// A sample of every frame: what moves, read once the frame's own callbacks have run (a message after the animation frame), as the reader
// sees the frame: a read inside the frame's callbacks comes before the page's own corrections of it.
const sampling = (page: Page, selectors: readonly string[]) =>
  page.evaluate((watch) => {
    const pumpFrames = Reflect.get(globalThis, "__pumpFrames") as (read: (t: number) => boolean) => void;
    const raw = (Reflect.get(globalThis, "__smooth") as { raw: Raw }).raw;
    let ids = 0;
    const tag = (element: Element) => {
      Reflect.set(element, "__smoothId", ++ids);
      return ids;
    };
    const sample = (selector: string) => {
      const element = document.querySelector(selector);
      if (element === null) return null;
      const style = getComputedStyle(element);
      const m = new DOMMatrixReadOnly(style.transform === "none" ? "" : style.transform);
      const box = element.getBoundingClientRect();
      // What the reader sees: the opacities of the element and its ancestors multiplied, 0 where one is hidden.
      let seen = 1;
      for (let at: Element | null = element; at !== null; at = at.parentElement) {
        const own = getComputedStyle(at);
        seen *= own.visibility === "hidden" ? 0 : Number(own.opacity);
      }
      return {
        opacity: Number(style.opacity),
        seen,
        scale: Math.hypot(m.a, m.b),
        x: m.e + Number.parseFloat(style.translate === "none" ? "0" : style.translate),
        y: m.f,
        left: box.left,
        id: (Reflect.get(element, "__smoothId") as number | undefined) ?? tag(element),
        width: box.width,
      };
    };
    const camera = (space: Spot, frame: Frame) => {
      if (space.camera === undefined) return;
      const { x, y, z } = space.camera.position;
      frame.eye = [x, y, z];
      // The view's direction, (0, 0, -1) turned by the camera's quaternion.
      const q = space.camera.quaternion;
      if (q !== undefined)
        frame.look = [-2 * (q.x * q.z + q.w * q.y), -2 * (q.y * q.z - q.w * q.x), -(1 - 2 * (q.x * q.x + q.y * q.y))];
    };
    const earth = (space: Spot, frame: Frame) => {
      const ground = space.stage?.ground;
      if (ground === undefined) return;
      frame.lead = ground.lead;
      if (ground.facing === undefined || space.camera === undefined || space.universe?.earth === undefined) return;
      const { lat, lon } = ground.facing(space.universe.earth, space.seconds, space.camera.position);
      [frame.lat, frame.lon] = [lat, lon];
      if (space.stage?.near !== undefined) frame.earthShown = space.stage.near.shows(space.universe.earth.index);
    };
    const skeleton = (space: Spot, frame: Frame) => {
      let gain = 0;
      space.stage?.scene?.traverseVisible((object) => {
        const own = object.material?.uniforms?.uGain?.value;
        if (object.renderOrder === -1 && own !== undefined && object.parent?.parent != null) gain = Math.max(gain, own);
      });
      frame.skeleton = gain;
    };
    const read = (t: number) => {
      const ctl = Reflect.get(globalThis, "__smooth") as { stop: boolean };
      if (ctl.stop) return false;
      const space = Reflect.get(globalThis, "__gnoworldSpace") as Spot | undefined;
      const frame: Frame = { t, watched: {} };
      if (space !== undefined) {
        camera(space, frame);
        earth(space, frame);
        skeleton(space, frame);
        if (space.rig !== undefined) frame.flying = space.rig.flying;
      }
      for (const selector of watch) frame.watched[selector] = sample(selector);
      raw.frames.push(frame);
      return true;
    };
    pumpFrames(read);
  }, selectors);

/** Starts the recorder in the page, from the next frame, watching `selectors`. */
export const record = async (page: Page, selectors: readonly string[] = []) => {
  await installFramePump(page);
  await observe(page);
  await sampling(page, selectors);
};

/** Stops the recorder and hands back what it saw. */
export const stop = (page: Page) =>
  page.evaluate(() => {
    const ctl = Reflect.get(globalThis, "__smooth") as { raw: Raw; stop: boolean };
    ctl.stop = true;
    return ctl.raw;
  });
