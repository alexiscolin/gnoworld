import {
  driftAt,
  glideAt,
  HOME,
  NEBULA_IMAGES,
  NEBULA_LAYERS,
  NebulaField,
  nebulaLight,
  nebulaTint,
  sheetOf,
  windowOf,
  type Nebula,
  type Point,
} from "@gnoworld/core";
import {
  AdditiveBlending,
  Mesh,
  PerspectiveCamera,
  Scene as Stage,
  Texture,
  type BufferAttribute,
  type BufferGeometry,
  type Object3D,
  type ShaderMaterial,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Disposer } from "../disposer.ts";
import { Nebulae } from "./nebulae.ts";

// The layout these tests read: a mesh an image, in `NEBULA_IMAGES`' order, the image in its `uImage`; a sheet is four vertices and six
// indices, each vertex holding the sheet's numbers: `position` where it stands from the eye, `aSheet` its half-width, turn, blur and warp
// seed, `aWindow` its window in the image, `aLight` its colour and, fourth, its light.
const maps = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("../planet/maps.ts", async (original) => ({
  ...(await original<typeof import("../planet/maps.ts")>()),
  loadMap: maps.load,
}));

const IMAGE = { width: 8, height: 4 };
const nameOf = (url: string) => /textures\/([\w-]+)\.webp$/.exec(url)?.[1] ?? url;
// Long enough for the worlds' maps to have been asked first: the scene's own wait, whatever it is, has passed.
const AFTER_THE_WAIT = 5000;

type Sheets = Mesh<BufferGeometry, ShaderMaterial>;

function made(halved = false) {
  const stage = new Stage();
  const owner = new Disposer();
  const moved = vi.fn();
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 16 },
    initTexture: vi.fn(),
    compileAsync: vi.fn((scene: Object3D) => Promise.resolve(scene)),
  };
  const camera = new PerspectiveCamera(50, 1.6, 0.1, 2000);
  const device = { renderer, stage, camera, halved: () => halved, base: "/", moved, stood: vi.fn() };
  const nebulae = new Nebulae(device, owner);
  stage.add(nebulae.group);
  return { stage, owner, moved, renderer, nebulae };
}

const asked = () => maps.load.mock.calls.map(([url]) => nameOf(url as string));
const meshes = ({ nebulae }: ReturnType<typeof made>) =>
  nebulae.group.children.filter((child): child is Sheets => child instanceof Mesh);
const shownMeshes = (scene: ReturnType<typeof made>) => meshes(scene).filter(({ visible }) => visible);
const sheetCount = (mesh: Sheets) => mesh.geometry.drawRange.count / 6;
const numbers = (mesh: Sheets, name: string, sheet: number) => {
  const attribute = mesh.geometry.getAttribute(name) as BufferAttribute;
  return [0, 1, 2, 3].slice(0, attribute.itemSize).map((item) => attribute.getComponent(sheet * 4, item));
};
const lights = (mesh: Sheets) =>
  Array.from({ length: sheetCount(mesh) }, (_, sheet) => numbers(mesh, "aLight", sheet)[3] ?? NaN);
const totalLight = (scene: ReturnType<typeof made>) =>
  shownMeshes(scene).reduce((sum, mesh) => sum + lights(mesh).reduce((a, b) => a + b, 0), 0);
const imageOf = (mesh: Sheets) => (mesh.material.uniforms["uImage"]?.value as Texture | null)?.name;
// What the eye at `eye` has lit.
const litFrom = (eye: Point): Nebula[] => {
  const field = new NebulaField();
  field.around(eye);
  return field.list.slice(0, field.count).filter((nebula) => nebulaLight(nebula, eye) > 0);
};
// A sheet's numbers, read as the GPU's floats hold them.
const key = (values: readonly number[]) => values.map((value) => Math.fround(value).toFixed(3)).join(" ");

async function awake(scene: ReturnType<typeof made>, eye: Point = HOME) {
  scene.nebulae.wake();
  scene.nebulae.place(eye);
  await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT);
}

// A load that waits for the test to let it come.
function held() {
  let come: (texture: Texture) => void = () => undefined;
  maps.load.mockImplementationOnce(
    (url: string) =>
      new Promise<Texture>((done) => {
        come = (texture) => {
          texture.name = nameOf(url);
          done(texture);
        };
      }),
  );
  return (texture: Texture) => {
    come(texture);
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  maps.load.mockReset();
  maps.load.mockImplementation((url: string) => {
    const texture = new Texture(IMAGE);
    texture.name = nameOf(url);
    return Promise.resolve(texture);
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the nebulae's images", () => {
  it("asks none in the arrival's first moments: the worlds' maps come first", async () => {
    const scene = made();
    scene.nebulae.wake();
    scene.nebulae.place(HOME);
    await vi.advanceTimersByTimeAsync(1000);
    expect(maps.load).not.toHaveBeenCalled();
    expect(scene.nebulae.stats()).toEqual({ sheets: 0, images: 0 });
  });

  it("then asks each image a lit nebula is cut from, once, at a body's width", async () => {
    const scene = made();
    await awake(scene);
    const wanted = new Set(litFrom(HOME).map(({ image }) => NEBULA_IMAGES[image]));
    expect(wanted.size).toBeGreaterThan(0);
    expect(new Set(asked())).toEqual(wanted);
    expect(asked()).toHaveLength(wanted.size);
    for (const [, options] of maps.load.mock.calls) expect(options).toMatchObject({ kind: "colour", width: 2048 });
    scene.nebulae.place({ x: HOME.x + 10, y: HOME.y, z: HOME.z });
    await vi.advanceTimersByTimeAsync(100);
    expect(asked()).toHaveLength(wanted.size);
  });

  it("waits its two seconds from the cosmos showing, to the millisecond", async () => {
    const scene = made();
    scene.nebulae.wake();
    scene.nebulae.place(HOME);
    await vi.advanceTimersByTimeAsync(1999);
    expect(maps.load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(maps.load).toHaveBeenCalled();
  });

  it("asks a frame when an image comes: a still page draws only when asked", async () => {
    const scene = made();
    scene.nebulae.wake();
    scene.nebulae.place(HOME);
    await vi.advanceTimersByTimeAsync(10);
    scene.moved.mockClear();
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT);
    expect(shownMeshes(scene).length).toBeGreaterThan(0);
    expect(scene.moved).toHaveBeenCalled();
  });

  it("halves them where memory is short", async () => {
    const scene = made(true);
    await awake(scene);
    expect(asked().length).toBeGreaterThan(0);
    for (const [, options] of maps.load.mock.calls) expect(options).toMatchObject({ width: 1024 });
  });

  it("asks nothing while the cosmos is hidden, and shows nothing then: going stops the wait", async () => {
    const scene = made();
    scene.nebulae.wake();
    scene.nebulae.place(HOME);
    scene.nebulae.sleep();
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT * 4);
    expect(maps.load).not.toHaveBeenCalled();
    await awake(scene);
    scene.nebulae.advance(HOME, 1, 2);
    expect(scene.nebulae.group.visible).toBe(true);
    scene.nebulae.sleep();
    expect(scene.nebulae.group.visible).toBe(false);
  });

  it("frees its images when released, shows none, and asks them again when it comes back", async () => {
    const scene = made();
    await awake(scene);
    const loaded = await Promise.all(maps.load.mock.results.map(({ value }) => value as Promise<Texture>));
    const freed = loaded.map((texture) => vi.spyOn(texture, "dispose"));
    const count = asked().length;
    scene.nebulae.free();
    for (const spy of freed) expect(spy).toHaveBeenCalledOnce();
    expect(shownMeshes(scene)).toHaveLength(0);
    expect(scene.nebulae.stats().images).toBe(0);
    await awake(scene);
    expect(asked().length).toBe(count * 2);
  });

  it("waits its turn again after a release, behind the worlds' maps, and comes back by itself while shown", async () => {
    const scene = made();
    await awake(scene);
    const first = maps.load.mock.calls.length;
    scene.nebulae.free();
    await vi.advanceTimersByTimeAsync(1000);
    expect(maps.load.mock.calls.length).toBe(first);
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT);
    expect(maps.load.mock.calls.length).toBe(first * 2);
  });

  it("leaves out an image that does not come, and shows the rest", async () => {
    const [refused, ...others] = [...new Set(litFrom(HOME).map(({ image }) => NEBULA_IMAGES[image]))];
    maps.load.mockImplementation((url: string) => {
      if (nameOf(url) === refused) return Promise.reject(new Error("404"));
      const texture = new Texture(IMAGE);
      texture.name = nameOf(url);
      return Promise.resolve(texture);
    });
    const scene = made();
    await awake(scene);
    scene.nebulae.advance(HOME, 1, 2);
    expect(shownMeshes(scene).map(imageOf).sort()).toEqual([...others].sort());
  });

  it("keeps a mesh hidden until its image came", async () => {
    const come = held();
    const scene = made();
    await awake(scene);
    const waiting = meshes(scene)[NEBULA_IMAGES.findIndex((name) => name === asked()[0])];
    expect(waiting?.visible).toBe(false);
    come(new Texture(IMAGE));
    await vi.advanceTimersByTimeAsync(10);
    expect(waiting?.visible).toBe(true);
  });

  it("frees an image that comes after it was released, and never shows it", async () => {
    const come = held();
    const scene = made();
    await awake(scene);
    const late = new Texture(IMAGE);
    const freed = vi.spyOn(late, "dispose");
    scene.nebulae.free();
    come(late);
    await vi.advanceTimersByTimeAsync(10);
    expect(freed).toHaveBeenCalledOnce();
    expect(meshes(scene).some((mesh) => imageOf(mesh) !== undefined && mesh.visible)).toBe(false);
  });
});

describe("its sheets", () => {
  it("draws each image's lit nebulae in its own mesh, added to what is behind them", async () => {
    const scene = made();
    await awake(scene);
    scene.nebulae.advance(HOME, 1, 2);
    expect(meshes(scene)).toHaveLength(NEBULA_IMAGES.length);
    const shown = shownMeshes(scene);
    expect(shown).toHaveLength(asked().length);
    for (const [at, mesh] of meshes(scene).entries()) {
      if (!mesh.visible) continue;
      expect(imageOf(mesh)).toBe(NEBULA_IMAGES[at]);
      expect(mesh.material.blending).toBe(AdditiveBlending);
      expect(mesh.material.depthWrite).toBe(false);
      expect(mesh.frustumCulled).toBe(false);
      expect(sheetCount(mesh)).toBe(litFrom(HOME).filter(({ image }) => image === at).length * NEBULA_LAYERS.length);
    }
    const sheets = litFrom(HOME).length * NEBULA_LAYERS.length;
    expect(scene.nebulae.stats()).toEqual({ sheets, images: asked().length });
  });

  // Its colour is the nebula's tint: the mood's, or frame 16's teal where it is cool (Alexis, 2026-11-02, decision 627), no longer the
  // mood's alone as 7d4 drew it.
  it("cuts, turns, softens and colours each sheet as its nebula and its layer say", async () => {
    const scene = made();
    await awake(scene);
    scene.nebulae.advance(HOME, 1, 2);
    const window = { u: 0, v: 0, width: 0, height: 0 };
    const at = { x: 0, y: 0, z: 0 };
    const tint = { red: 0, green: 0, blue: 0 };
    for (const [image, mesh] of meshes(scene).entries()) {
      if (!mesh.visible) continue;
      const expected = litFrom(HOME)
        .filter((nebula) => nebula.image === image)
        .flatMap((nebula) =>
          NEBULA_LAYERS.map((layer) => {
            windowOf(nebula, layer, window);
            const half = sheetOf(nebula, layer, at);
            nebulaTint(nebula, tint);
            return key([
              window.u,
              window.v,
              window.width,
              window.height,
              half,
              nebula.turn,
              layer.blur,
              tint.red,
              tint.green,
              tint.blue,
            ]);
          }),
        );
      const found = Array.from({ length: sheetCount(mesh) }, (_, sheet) =>
        key([
          ...numbers(mesh, "aWindow", sheet),
          ...numbers(mesh, "aSheet", sheet).slice(0, 3),
          ...numbers(mesh, "aLight", sheet).slice(0, 3),
        ]),
      );
      expect(found.sort()).toEqual(expected.sort());
    }
  });

  it("uploads what a look writes and what a frame writes, each time", async () => {
    const scene = made();
    await awake(scene);
    const names = ["aSheet", "aWindow", "aLight", "position"];
    const shown = meshes(scene).filter(({ visible }) => visible);
    const versions = () =>
      names.flatMap((name) => shown.map((mesh) => (mesh.geometry.getAttribute(name) as BufferAttribute).version));
    expect(shown.length).toBeGreaterThan(0);
    const before = versions();
    scene.nebulae.place({ x: HOME.x + 5, y: HOME.y, z: HOME.z });
    scene.nebulae.advance(HOME, 1, 2);
    for (const [at, version] of versions().entries()) expect(version).toBeGreaterThan(before[at] ?? NaN);
  });

  it("bends each layer of a nebula its own way, the far one at the nebula's own seed", async () => {
    const scene = made();
    await awake(scene);
    for (const [image, mesh] of meshes(scene).entries()) {
      if (!mesh.visible) continue;
      const nebulae = litFrom(HOME).filter((nebula) => nebula.image === image);
      const seeds = Array.from({ length: sheetCount(mesh) }, (_, sheet) => numbers(mesh, "aSheet", sheet)[3] ?? NaN);
      expect(new Set(seeds).size).toBe(seeds.length);
      for (const nebula of nebulae) expect(seeds).toContain(Math.fround(nebula.seed));
    }
  });

  it("brings each sheet to the eye of the frame, not the eye of the look, and lights it from there", async () => {
    const scene = made();
    await awake(scene);
    const eye = { x: HOME.x + 50, y: HOME.y - 20, z: HOME.z + 30 };
    scene.nebulae.advance(eye, 1, 2);
    const at = { x: 0, y: 0, z: 0 };
    const expected = new Set<string>();
    for (const nebula of litFrom(HOME))
      for (const layer of NEBULA_LAYERS) {
        sheetOf(nebula, layer, at);
        expected.add(key([at.x - eye.x, at.y - eye.y, at.z - eye.z, nebulaLight(nebula, eye) * layer.light]));
      }
    const found = new Set<string>();
    for (const mesh of shownMeshes(scene))
      for (let sheet = 0; sheet < sheetCount(mesh); sheet += 1)
        found.add(key([...numbers(mesh, "position", sheet), numbers(mesh, "aLight", sheet)[3] ?? NaN]));
    expect(found).toEqual(expected);
  });

  it("drifts with the sky's cruise while the clock runs, standing with the eye of the scenery", async () => {
    const scene = made();
    scene.nebulae.wake();
    scene.nebulae.follow(HOME, 0);
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT);
    const seconds = 600;
    const [drift, glide] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ];
    driftAt(drift, seconds);
    glideAt(glide, seconds);
    // The scenery's eye, as eye.ts builds it: the worlds' eye and the cruise, which the worlds leave out.
    const scenery = { x: HOME.x + drift.x - glide.x, y: HOME.y + drift.y - glide.y, z: HOME.z + drift.z - glide.z };
    expect(Math.hypot(scenery.x - HOME.x, scenery.y - HOME.y, scenery.z - HOME.z)).toBeGreaterThan(300);
    scene.nebulae.follow(HOME, seconds);
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT);
    scene.nebulae.follow(HOME, seconds);
    const at = { x: 0, y: 0, z: 0 };
    const expected = new Set<string>();
    for (const nebula of litFrom(scenery))
      for (const layer of NEBULA_LAYERS) {
        sheetOf(nebula, layer, at);
        expected.add(key([at.x - scenery.x, at.y - scenery.y, at.z - scenery.z]));
      }
    const found = new Set<string>();
    for (const mesh of shownMeshes(scene))
      for (let sheet = 0; sheet < sheetCount(mesh); sheet += 1) found.add(key(numbers(mesh, "position", sheet)));
    expect(expected.size).toBeGreaterThan(0);
    expect(found).toEqual(expected);
  });

  it("shows none before its program is compiled: a first compile on a frame stalls it", async () => {
    const scene = made();
    scene.renderer.compileAsync.mockImplementation(() => new Promise<Object3D>(() => undefined));
    await awake(scene);
    expect(shownMeshes(scene)).toHaveLength(0);
  });

  it("stands each sheet where it is from the eye, in floats, however far out the eye is", async () => {
    const eye = { x: 2 ** 40 + 0.5, y: -(2 ** 33), z: 7.25 };
    const scene = made();
    await awake(scene, eye);
    scene.nebulae.advance(eye, 1, 2);
    const at = { x: 0, y: 0, z: 0 };
    const expected = new Set<string>();
    for (const nebula of litFrom(eye))
      for (const layer of NEBULA_LAYERS) {
        sheetOf(nebula, layer, at);
        expected.add([at.x - eye.x, at.y - eye.y, at.z - eye.z].map((value) => Math.round(value)).join(" "));
      }
    const found = new Set<string>();
    for (const mesh of shownMeshes(scene))
      for (let sheet = 0; sheet < sheetCount(mesh); sheet += 1) {
        const values = numbers(mesh, "position", sheet);
        for (const value of values) expect(Math.abs(value)).toBeLessThan(3000);
        found.add(values.map((value) => Math.round(value)).join(" "));
      }
    expect(expected.size).toBeGreaterThan(0);
    expect(found).toEqual(expected);
  });

  it("goes dark near a world, and takes the share it is given: half of it, half the light", async () => {
    const scene = made();
    await awake(scene);
    scene.nebulae.advance(HOME, 1, 2);
    const whole = totalLight(scene);
    expect(whole).toBeGreaterThan(0);
    scene.nebulae.advance(HOME, 0.5, 3);
    expect(totalLight(scene)).toBeCloseTo(whole / 2, 6);
    scene.nebulae.advance(HOME, 0, 4);
    for (const mesh of shownMeshes(scene)) for (const light of lights(mesh)) expect(light).toBe(0);
    expect(scene.nebulae.stats().sheets).toBe(0);
  });

  it("fades an image in over its first second, and at once where the clock stands still", async () => {
    const scene = made();
    await awake(scene);
    scene.nebulae.advance(HOME, 1, 0.1);
    const early = totalLight(scene);
    scene.nebulae.advance(HOME, 1, 0.5);
    const middle = totalLight(scene);
    scene.nebulae.advance(HOME, 1, 1);
    const second = totalLight(scene);
    scene.nebulae.advance(HOME, 1, 2);
    const whole = totalLight(scene);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(middle);
    expect(middle).toBeLessThan(second);
    expect(second).toBeCloseTo(whole, 6);
    const still = made();
    await awake(still);
    still.nebulae.advance(HOME, 1, 0);
    expect(totalLight(still)).toBeCloseTo(whole, 4);
  });

  it("leaves the near layer out where memory is short", async () => {
    const scene = made(true);
    await awake(scene);
    scene.nebulae.advance(HOME, 1, 2);
    const shown = shownMeshes(scene);
    expect(shown.length).toBeGreaterThan(0);
    const blurs = new Set(
      shown.flatMap((mesh) =>
        Array.from({ length: sheetCount(mesh) }, (_, sheet) => numbers(mesh, "aSheet", sheet)[2]),
      ),
    );
    expect(blurs).toEqual(new Set(NEBULA_LAYERS.slice(0, -1).map(({ blur }) => Math.fround(blur))));
    expect(shown.reduce((sum, mesh) => sum + sheetCount(mesh), 0)).toBe(
      litFrom(HOME).length * (NEBULA_LAYERS.length - 1),
    );
  });

  it("frees its geometries, materials and images with its owner, and leaves the stage", async () => {
    const scene = made();
    await awake(scene);
    const loaded = await Promise.all(maps.load.mock.results.map(({ value }) => value as Promise<Texture>));
    const spies = [
      ...meshes(scene).flatMap(({ geometry, material }) => [
        vi.spyOn(geometry, "dispose"),
        vi.spyOn(material, "dispose"),
      ]),
      ...loaded.map((texture) => vi.spyOn(texture, "dispose")),
    ];
    expect(loaded.length).toBeGreaterThan(0);
    scene.owner.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(scene.stage.children).toHaveLength(0);
  });

  it("asks nothing once its owner left, though its program finished compiling after", async () => {
    const scene = made();
    let compiled: (scene: Object3D) => void = () => undefined;
    scene.renderer.compileAsync.mockImplementation(
      () =>
        new Promise<Object3D>((done) => {
          compiled = done;
        }),
    );
    await awake(scene);
    const before = maps.load.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    scene.owner.dispose();
    compiled(scene.nebulae.group);
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT);
    expect(maps.load.mock.calls.length).toBe(before);
  });

  it("asks nothing once its owner left, though it was waiting to", async () => {
    const scene = made();
    scene.nebulae.wake();
    scene.nebulae.place(HOME);
    scene.owner.dispose();
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT * 2);
    expect(maps.load).not.toHaveBeenCalled();
  });
});
