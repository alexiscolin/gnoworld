// The rail's planets (7i): each world drawn alone by the planets' own code, the Earth from its own maps, in a corner of the scene's canvas at
// the start of frames the scene lends, a few a frame, before it draws its own over them, so their grade is the scene's. A frame only draws
// and reads pixels into buffers made before it; the JPEGs the page shows are made between frames. Maps are small and go with the planets.
import { PerspectiveCamera, Scene, SphereGeometry, Vector3, Vector4, type Texture, type WebGLRenderer } from "three";
import { encoded, Packs, webgl2 } from "./pixels.ts";
import { mapSetOf, namedLoad } from "./parts/maps.ts";
import { earthPlanet } from "./earth/earth.ts";
import { freeMap, loadMap, mapUrl } from "./planet/maps.ts";
import type { Planet } from "./planet/planet.ts";

/** A map's width for a portrait: a planet a hundred pixels wide shows half its map. */
const MAP_WIDTH = 512;
/** The most portraits drawn in one of the scene's frames. */
const PER_FRAME = 4;
/** Where the star stands for every portrait: up and to the left, a little toward the eye, as frame 4's rail lights its planets. */
const SUN = new Vector3(-0.55, 0.3, 0.78).normalize();
const EARTH = "earth";
const EARTH_MAPS = ["earth-day", "earth-night", "clouds"];
const ANISOTROPY = 4;
// The eye's distance, and the lens that fits the planet to the picture's side from there, a hair past it: the thumb's disc clips the edge,
// so no black shows round it.
const AWAY = 10;
const FIT = 0.98;
const FIELD = (2 * Math.atan(FIT / Math.sqrt(AWAY * AWAY - FIT * FIT)) * 180) / Math.PI;

type PortraitRenderer = Pick<
  WebGLRenderer,
  | "getContext"
  | "getPixelRatio"
  | "getViewport"
  | "setViewport"
  | "getScissor"
  | "setScissor"
  | "getScissorTest"
  | "setScissorTest"
  | "render"
  | "compileAsync"
> & { readonly capabilities: Pick<WebGLRenderer["capabilities"], "getMaxAnisotropy"> };

/** What the portraits need of the scene: its renderer, where its maps are, whether it halves them, its frames, and its end. */
export interface PortraitDevice {
  readonly renderer: PortraitRenderer;
  readonly base: string;
  readonly halved: () => boolean;
  /** Runs `draw` at the start of the scene's next frame, before it draws its own. */
  readonly lend: (draw: () => void) => void;
  readonly signal: AbortSignal;
}

type Kit = typeof import("./planet/generated.ts");

// What a frame draws with, made before it: the lens, the stage, the renderer's state kept, a buffer for each portrait of a frame.
interface Easel {
  readonly camera: PerspectiveCamera;
  readonly stage: Scene;
  readonly viewport: Vector4;
  readonly scissor: Vector4;
  readonly size: number;
  readonly side: number;
  /** Where each portrait of a frame is read to, on the GPU and then in memory. */
  readonly packs: Packs;
}

async function mapsFor({ renderer, base, halved }: PortraitDevice, names: ReadonlySet<string>) {
  const width = halved() ? MAP_WIDTH / 2 : MAP_WIDTH;
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), ANISOTROPY);
  const loaded = await Promise.allSettled(
    [...names].map(
      async (name) =>
        [name, await loadMap(mapUrl(name, base, width), { ...namedLoad(name, width), anisotropy })] as const,
    ),
  );
  return new Map<string, Texture>(loaded.flatMap((each) => (each.status === "fulfilled" ? [each.value] : [])));
}

// Each world's planet into `planets`, from the maps that came: one whose maps did not gets none, nor one that cannot be made.
function make(
  ids: readonly string[],
  { kit, maps, sphere }: { kit: Kit; maps: ReadonlyMap<string, Texture>; sphere: SphereGeometry },
  planets: Map<string, Planet>,
) {
  for (const id of ids) {
    try {
      const planet = id === EARTH ? earthOf(maps, sphere) : worldOf(kit, id, { maps, sphere });
      if (planet !== undefined) planets.set(id, planet);
    } catch {
      // A planet that cannot be made leaves its world the rail's drawn disc, and the others their portraits.
    }
  }
}

function worldOf(
  kit: Kit,
  id: string,
  { maps, sphere }: { maps: ReadonlyMap<string, Texture>; sphere: SphereGeometry },
) {
  const world = kit.worldOf(id);
  const set = mapSetOf(kit.mapNamesOf(world), maps);
  return set === undefined ? undefined : kit.createWorld(world, set, sphere);
}

function earthOf(maps: ReadonlyMap<string, Texture>, sphere: SphereGeometry) {
  const [day, night, clouds] = EARTH_MAPS.map((name) => maps.get(name));
  return day === undefined || night === undefined || clouds === undefined
    ? undefined
    : earthPlanet({ day, night, clouds }, sphere);
}

function easelOf(renderer: PortraitRenderer, size: number): Easel | undefined {
  const gl = webgl2(renderer.getContext());
  if (gl === undefined) return undefined;
  const side = Math.round(size * renderer.getPixelRatio());
  const camera = new PerspectiveCamera(FIELD, 1, AWAY / 2, AWAY * 2);
  camera.position.set(0, 0, AWAY);
  const packs = new Packs(gl, PER_FRAME, 4 * side * side);
  return { camera, stage: new Scene(), viewport: new Vector4(), scissor: new Vector4(), size, side, packs };
}

// Each planet of `batch` alone in the canvas's corner, its pixels read into the easel's pack of its place, which the GPU fills without the
// page waiting; the renderer's viewport, scissor and test given back as they were. A fence for the GPU's end of them, or none where the
// context is lost: nothing is read.
function draw(renderer: PortraitRenderer, easel: Easel, batch: readonly Planet[]): WebGLSync | undefined {
  if (renderer.getContext().isContextLost()) return undefined;
  renderer.getViewport(easel.viewport);
  renderer.getScissor(easel.scissor);
  const test = renderer.getScissorTest();
  try {
    renderer.setViewport(0, 0, easel.size, easel.size);
    renderer.setScissor(0, 0, easel.size, easel.size);
    renderer.setScissorTest(true);
    for (let at = 0; at < batch.length; at += 1) {
      const planet = batch[at];
      if (planet === undefined) continue;
      planet.setSun(SUN);
      easel.stage.add(planet.group);
      renderer.render(easel.stage, easel.camera);
      easel.stage.remove(planet.group);
      easel.packs.start(at, easel.side);
    }
  } finally {
    renderer.setViewport(easel.viewport.x, easel.viewport.y, easel.viewport.z, easel.viewport.w);
    renderer.setScissor(easel.scissor.x, easel.scissor.y, easel.scissor.z, easel.scissor.w);
    renderer.setScissorTest(test);
  }
  return easel.packs.fence();
}

// One of the scene's frames for `run`: its answer, or undefined once the scene has gone. A throw stays here, out of the scene's frame.
const frameOf = <T>({ lend, signal }: PortraitDevice, run: () => T) =>
  new Promise<T | undefined>((done, failed) => {
    if (signal.aborted) {
      done(undefined);
      return;
    }
    const gone = () => {
      done(undefined);
    };
    signal.addEventListener("abort", gone, { once: true });
    lend(() => {
      signal.removeEventListener("abort", gone);
      try {
        done(run());
      } catch (error) {
        failed(error instanceof Error ? error : new Error("a portrait failed", { cause: error }));
      }
    });
  });

// A batch's shaders made before its frame, the browser compiling them aside (KHR_parallel_shader_compile, as near.ts's planets): a frame
// that compiled them itself would hold the page for each new kind of planet. Without the extension the browser compiles them here, as before.
async function compiled(renderer: PortraitRenderer, easel: Easel, batch: readonly Planet[]): Promise<void> {
  for (const planet of batch) easel.stage.add(planet.group);
  try {
    await renderer.compileAsync(easel.stage, easel.camera);
  } finally {
    for (const planet of batch) easel.stage.remove(planet.group);
  }
}

// The planets drawn a few a frame, read once the GPU is done with them, and encoded between frames; what was drawn before the scene went,
// the context was lost or a draw threw is kept.
async function drawn(
  device: PortraitDevice,
  planets: ReadonlyMap<string, Planet>,
  size: number,
): Promise<Map<string, string>> {
  const pictures = new Map<string, string>();
  const easel = easelOf(device.renderer, size);
  if (easel === undefined) return pictures;
  const left = [...planets];
  try {
    while (left.length > 0) {
      const batch = left.splice(0, PER_FRAME);
      const planetsOf = batch.map(([, planet]) => planet);
      await compiled(device.renderer, easel, planetsOf);
      const fence = await frameOf(device, () => draw(device.renderer, easel, planetsOf)).catch(() => false);
      if (!fence || !(await easel.packs.finished(fence, batch.length, device.signal))) break;
      batch.forEach(([id], at) => {
        const picture = encoded(easel.packs.out[at] ?? new Uint8Array(), easel.side);
        if (picture !== undefined) pictures.set(id, picture);
      });
    }
  } finally {
    easel.packs.free();
  }
  return pictures;
}

/** The portraits of `ids`, `size` page pixels a side, by their ids: none of a world whose maps did not come, none once the scene went. */
export async function portraitsOf(
  device: PortraitDevice,
  ids: readonly string[],
  size: number,
): Promise<Map<string, string>> {
  const kit = await import("./planet/generated.ts");
  const maps = await mapsFor(
    device,
    new Set(ids.flatMap((id) => (id === EARTH ? EARTH_MAPS : kit.mapNamesOf(kit.worldOf(id))))),
  );
  const sphere = new SphereGeometry(1, 64, 48);
  const planets = new Map<string, Planet>();
  try {
    make(ids, { kit, maps, sphere }, planets);
    return await drawn(device, planets, size);
  } finally {
    for (const planet of planets.values()) planet.dispose();
    sphere.dispose();
    for (const map of maps.values()) freeMap(map);
  }
}
