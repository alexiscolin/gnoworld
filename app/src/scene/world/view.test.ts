import { statusOrbit, worldLook } from "@gnoworld/core";
import {
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Scene as Stage,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  Vector4,
  type Mesh,
  type Object3D,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Circle } from "../earth/device.ts";
import { createPlanet } from "../planet/planet.ts";
import type { WorldReading } from "./reading.ts";
import { CLOSE_WIDTH } from "./standing.ts";
import { WorldView, type MoonMark } from "./view.ts";

const maps = vi.hoisted(() => ({ load: vi.fn(), made: [] as unknown[] }));
vi.mock("../planet/maps.ts", async (original) => ({
  ...(await original<typeof import("../planet/maps.ts")>()),
  loadMap: maps.load,
}));

// A world's page in space (frames 20 to 35, 90 to 107, 115 to 125): its planet stands in the circle the page keeps, as the Earth's does, with
// its signs drawn by one overlay, the tilted status ring for what its realm reports, its rooms as moons clear of the plate, and real shadows:
// the moons' and the ring's moon's fall on the world. The one world seen close is the only one that casts them.
const WIDTH = 1728;
const HEIGHT = 1080;
// The plate's box reaches under the world's left side, as the page's does: a moon passing there goes.
const PLATE = { left: 24, top: 98, right: 900, bottom: 1056, fill: [24, 31, 50] as const };
const PLACE: Circle = { x: 960, y: 561, radius: 300, plate: PLATE };
const ID = "gov/dao";

function device({ halved = false } = {}) {
  const stage = new Stage();
  const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 2000);
  const moved = vi.fn();
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 16 },
    initTexture: vi.fn(),
    compileAsync: vi.fn((scene: Object3D) => Promise.resolve(scene)),
  };
  const view = new WorldView({ renderer, stage, camera, halved: () => halved, base: "/", moved, stood: vi.fn() });
  return { stage, camera, moved, renderer, view };
}

const settled = async () => {
  for (let task = 0; task < 12; task += 1) await new Promise((done) => setTimeout(done));
};

const reading = (more: Partial<WorldReading> = {}): WorldReading => ({
  look: worldLook(ID),
  signs: {
    stage: "rest",
    size: 1,
    signal: 0,
    lights: { extent: 0, level: 0.35, kind: "towns", grain: 1, fine: 1, offset: [0, 0, 0], turn: 0 },
  },
  vitality: 0,
  heat: 0,
  aurora: 0,
  storms: [0, 0, 0],
  wake: false,
  ...more,
});

async function opened({ halved = false, id = ID } = {}) {
  const made = device({ halved });
  const said: string[] = [];
  const colours: string[] = [];
  made.view.resize(WIDTH, HEIGHT, 1);
  made.view.show({ circle: PLACE, id }, (state, colour) => {
    said.push(state);
    if (colour !== undefined) colours.push(colour);
  });
  made.view.read(reading({ look: worldLook(id) }));
  await settled();
  made.view.tick(0);
  return { ...made, said, colours };
}

const mark = (room: string, size = 0.5) => {
  const spots: { x: number; y: number; shown: boolean }[] = [];
  const moon: MoonMark = {
    room,
    size,
    place: (x, y, shown) => {
      spots.push({ x, y, shown });
    },
  };
  return { moon, spots };
};

const materials = (stage: Stage) => {
  const found: ShaderMaterial[] = [];
  stage.traverse((part) => {
    const material = (part as Partial<Mesh>).material;
    if (material instanceof ShaderMaterial) found.push(material);
  });
  return found;
};
const overlayOf = (stage: Stage) => materials(stage).find((material) => "occluders" in material.uniforms);
const value = (material: ShaderMaterial | undefined, name: string) => material?.uniforms[name]?.value as unknown;

beforeEach(() => {
  maps.made.length = 0;
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  maps.load.mockImplementation(() => {
    const texture = new Texture({ width: 4, height: 2, close: vi.fn() });
    maps.made.push(texture);
    return Promise.resolve(texture);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  maps.load.mockReset();
});

describe("the world in its circle", () => {
  it("loads the world's maps at the close view's width, and says it is drawn with its colour", async () => {
    const { said, colours } = await opened();
    expect(said).toEqual(["loading", "drawn"]);
    const { map, second } = worldLook(ID);
    for (const name of [map, second].filter((each) => each !== null))
      expect(
        maps.load.mock.calls.some(
          ([url, how]) =>
            (url as string).endsWith(`/${name}.webp`) && (how as { width?: number }).width === CLOSE_WIDTH,
        ),
        name,
      ).toBe(true);
    const [low, mid] = worldLook(ID).ramp;
    expect(low).toBeDefined();
    // The palette's hue, lit and coloured enough to tint a plate (the design review's second finding changed this test).
    const hsl = (hex: string) => new Color(hex).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
    const ramp = new Color().setRGB(...mid, SRGBColorSpace).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
    const [colour = ""] = colours;
    expect(colours).toHaveLength(1);
    expect(hsl(colour).h).toBeCloseTo(ramp.h, 1);
    expect(hsl(colour).l).toBeGreaterThanOrEqual(0.59);
    expect(hsl(colour).s).toBeGreaterThanOrEqual(0.34);
  });

  it("halves the maps where memory is short, and casts no shadow there", async () => {
    const { view } = await opened({ halved: true });
    expect(maps.load.mock.calls.map(([, how]) => (how as { width?: number }).width)).toContain(CLOSE_WIDTH / 2);
    view.ring(statusOrbit({ lit: 0.4, mark: 0.5 }));
    view.moons([mark("#a", 1).moon]);
    await settled();
    view.tick(1);
    expect(view.stats().shadows).toBe(0);
  });

  it("stands the world's centre on the circle the page keeps, within it", async () => {
    const { view } = await opened();
    const { centre } = view.stats();
    expect(centre.x).toBeCloseTo(PLACE.x, 0);
    expect(centre.y).toBeCloseTo(PLACE.y, 0);
    expect(centre.radius).toBeGreaterThan(PLACE.radius * 0.7);
    expect(centre.radius).toBeLessThanOrEqual(PLACE.radius);
  });

  it("keeps the world on its circle as the eye turns about, its light turning with it", async () => {
    const { view, camera } = await opened();
    const before = view.stats();
    camera.rotation.set(0.12, -0.26, 0);
    camera.updateMatrixWorld();
    view.tick(5);
    const { centre, sun } = view.stats();
    expect(centre.x).toBeCloseTo(PLACE.x, 0);
    expect(centre.y).toBeCloseTo(PLACE.y, 0);
    const seen = new Vector3(sun.x, sun.y, sun.z).applyQuaternion(camera.quaternion.clone().invert());
    expect(seen.distanceTo(new Vector3(before.sun.x, before.sun.y, before.sun.z))).toBeLessThan(1e-6);
  });

  it("draws the look the cosmos draws for the same id: its palette on its surface", async () => {
    for (const id of [ID, "gnoland/blog"]) {
      const { stage } = await opened({ id });
      const [, mid] = worldLook(id).ramp;
      const surface = materials(stage).find((material) => "rampMid" in material.uniforms);
      expect((value(surface, "rampMid") as Color).getHexString()).toBe(
        new Color().setRGB(...mid, SRGBColorSpace).getHexString(),
      );
    }
  });

  it("says it failed, and tints nothing, when a map does not come", async () => {
    maps.load.mockImplementation(() => Promise.reject(new Error("404")));
    const { said, colours } = await opened();
    expect(said).toEqual(["loading", "failed"]);
    expect(colours).toEqual([]);
  });

  it("says it failed when only the moons' small maps do not come (A2a-1)", async () => {
    maps.load.mockImplementation((_url: string, how: { width?: number }) =>
      how.width === 512
        ? Promise.reject(new Error("404"))
        : Promise.resolve(new Texture({ width: 4, height: 2, close: vi.fn() })),
    );
    const { said } = await opened();
    expect(said).toEqual(["loading", "failed"]);
  });

  it("asks for a world that failed no more maps when the page places it again (A2a-2)", async () => {
    maps.load.mockImplementation(() => Promise.reject(new Error("404")));
    const { view } = await opened();
    const asked = maps.load.mock.calls.length;
    for (let again = 0; again < 5; again += 1) view.show({ circle: PLACE, id: ID }, () => undefined);
    await settled();
    expect(maps.load.mock.calls.length).toBe(asked);
  });

  it("compiles a seed's glow with the world: nothing is made on the wake's first frame (A2a-3)", async () => {
    const { view, stage } = await opened();
    const before = materials(stage).length;
    view.read(
      reading({
        wake: true,
        signs: { ...reading().signs, stage: "seed", size: 0.3, signal: 0.8 },
        woken: reading().signs,
      }),
    );
    view.tick(1);
    expect(materials(stage).length).toBe(before);
  });

  it("never stands a world the page left while it compiled, and takes its lens shift back (A2a-4)", async () => {
    const made = device();
    let compiled: () => void = () => undefined;
    made.renderer.compileAsync.mockImplementationOnce(
      (scene: Object3D) =>
        new Promise<Object3D>((done) => {
          compiled = () => {
            done(scene);
          };
        }),
    );
    made.view.resize(WIDTH, HEIGHT, 1);
    made.view.show({ circle: PLACE, id: ID }, () => undefined);
    await settled();
    made.view.show({ circle: PLACE, id: "gnoland/blog" }, () => undefined);
    await settled();
    compiled();
    await settled();
    expect(made.view.stats().anchor).toBe(worldLook("gnoland/blog").anchor);
    expect(made.stage.children.filter((child) => child.children.length > 0)).toHaveLength(1);
    made.view.show(undefined, () => undefined);
    expect(made.camera.view?.enabled === true).toBe(false);
  });

  it("keeps the wake that ran when a lost context comes back: the world does not wake twice (A2a-6)", async () => {
    const { view } = await opened();
    const seed = { ...reading().signs, stage: "seed" as const, size: 0.3, signal: 0.8 };
    view.read(reading({ wake: true, signs: seed, woken: reading().signs }));
    for (let second = 0; second < 6; second += 0.5) view.tick(second);
    const woken = view.stats().size;
    view.restored();
    await settled();
    view.tick(7);
    expect(view.stats().wake).toBe(0);
    expect(view.stats().size).toBeCloseTo(woken, 6);
  });

  it("stands another world in place of the first when the page names another, and never the first late", async () => {
    let arrive: (texture: Texture) => void = () => undefined;
    maps.load.mockImplementationOnce(
      () =>
        new Promise<Texture>((done) => {
          arrive = done;
        }),
    );
    const { view } = device();
    view.resize(WIDTH, HEIGHT, 1);
    view.show({ circle: PLACE, id: ID }, () => undefined);
    view.show({ circle: PLACE, id: "gnoland/blog" }, () => undefined);
    view.read(reading({ look: worldLook("gnoland/blog") }));
    await settled();
    arrive(new Texture({ width: 4, height: 2, close: vi.fn() }));
    await settled();
    view.tick(1);
    expect(view.stats().anchor).toBe(worldLook("gnoland/blog").anchor);
  });

  it("takes the world away with the page, and frees every material, shape and map it made", async () => {
    const { view, stage, said } = await opened();
    view.moons([mark("#a", 1).moon]);
    await settled();
    view.ring(statusOrbit({ lit: 0.5, mark: 0.6 }));
    view.tick(1);
    const drawn = materials(stage).length;
    const shapes = new Set<BufferGeometry>();
    stage.traverse((part) => {
      const geometry = (part as Partial<Mesh>).geometry;
      if (geometry instanceof BufferGeometry) shapes.add(geometry);
    });
    const freedMaterials = vi.spyOn(ShaderMaterial.prototype, "dispose");
    const freedShapes = vi.spyOn(BufferGeometry.prototype, "dispose");
    const freedMaps = vi.spyOn(Texture.prototype, "dispose");
    view.show(undefined, (state) => said.push(state));
    await settled();
    expect(said.at(-1)).toBe("gone");
    expect(materials(stage)).toEqual([]);
    expect(freedMaterials.mock.calls.length).toBeGreaterThanOrEqual(drawn);
    expect(freedShapes.mock.calls.length).toBeGreaterThanOrEqual(shapes.size);
    expect(freedMaps.mock.calls.length).toBeGreaterThanOrEqual(maps.made.length);
  });
});

describe("each sign on its data", () => {
  it("shows no status ring when the realm reports no tally", async () => {
    const { view } = await opened();
    view.ring(undefined);
    view.tick(1);
    expect(view.stats().ring).toBeUndefined();
  });

  it("stands the ring's moon on the front half, at the share its realm reports", async () => {
    const { view, stage } = await opened();
    const orbit = statusOrbit({ lit: 0.33, mark: 0.6666 });
    view.ring(orbit);
    view.tick(1);
    const ring = view.stats().ring;
    expect(ring?.moon).toBeCloseTo(orbit.moon, 12);
    expect(ring?.front).toBe(true);
    const tube = materials(stage).find((material) => "litTo" in material.uniforms);
    expect(value(tube, "litTo")).toBeCloseTo(orbit.moon, 12);
    expect(value(tube, "mark")).toBeCloseTo(orbit.mark, 12);
    expect(tube?.fragmentShader).toMatch(/litTo/);
    expect(tube?.fragmentShader).toMatch(/mark/);
  });

  it("draws no aurora, storm nor heat for a world that has none, and each for its own data", async () => {
    const { view, stage } = await opened();
    const overlay = overlayOf(stage);
    expect(value(overlay, "aurora")).toBe(0);
    expect(value(overlay, "storms")).toEqual(new Vector3(0, 0, 0));
    expect(value(overlay, "heat")).toBe(0);
    view.read(reading({ aurora: 0.6, storms: [0.8, 0.3, 0], heat: 0.4 }));
    view.tick(2);
    expect(value(overlay, "aurora")).toBe(0.6);
    expect(value(overlay, "storms")).toEqual(new Vector3(0.8, 0.3, 0));
    expect(value(overlay, "heat")).toBe(0.4);
    for (const name of ["aurora", "storms", "heat", "occluders"])
      expect(overlay?.fragmentShader.split(name).length ?? 0, name).toBeGreaterThan(2);
  });

  it("orbits one moon a room it is given, each placed on the page", async () => {
    const { view } = await opened();
    view.moons([]);
    view.tick(1);
    expect(view.stats().moons).toEqual([]);
    const marks = [mark("#govdao", 1), mark("#builders", 0.4)];
    view.moons(marks.map(({ moon }) => moon));
    await settled();
    view.tick(2);
    expect(view.stats().moons.map(({ room }) => room)).toEqual(["#govdao", "#builders"]);
    expect(marks.every(({ spots }) => spots.length > 0)).toBe(true);
  });

  it("shows a moon beside the world and hides it where its orbit reaches the plate", async () => {
    const { view } = await opened();
    const marks = Array.from({ length: 4 }, (_, at) => mark(`#r${String(at)}`, 1));
    view.moons(marks.map(({ moon }) => moon));
    await settled();
    let shown = 0;
    let hidden = 0;
    for (let second = 0; second < 600; second += 2) {
      view.tick(second);
      for (const { x, shown: visible } of view.stats().moons) {
        if (visible) expect(x).toBeGreaterThan(PLATE.right + 8);
        if (visible) shown += 1;
        else if (x <= PLATE.right + 8) hidden += 1;
      }
    }
    expect(shown).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
  });

  it("holds the moons still under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const { view } = await opened();
    view.moons([mark("#a", 1).moon]);
    await settled();
    view.tick(1);
    const first = view.stats().moons[0];
    view.tick(40);
    expect(view.stats().moons[0]).toEqual(first);
  });

  it("wakes a seed on this reader's first visit: it grows to a world's size in one step, carried by the wake", async () => {
    const { view } = await opened();
    const seed = { ...reading().signs, stage: "seed" as const, size: 0.3, signal: 0.8 };
    view.read(reading({ wake: true, signs: seed, woken: reading().signs }));
    view.tick(0);
    const before = view.stats();
    expect(before.wake).toBeGreaterThan(0);
    for (let second = 0; second < 6; second += 0.5) view.tick(second);
    const after = view.stats();
    expect(after.size).toBeGreaterThan(before.size * 2.5);
    expect(after.wake).toBe(0);
  });

  it("wakes it at once with no wave under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const { view } = await opened();
    const seed = { ...reading().signs, stage: "seed" as const, size: 0.3, signal: 0.8 };
    view.read(reading({ wake: true, signs: seed, woken: reading().signs }));
    view.tick(0);
    expect(view.stats().wake).toBe(0);
    expect(view.stats().size).toBeCloseTo((await opened()).view.stats().size, 6);
  });
});

describe("its light (design review, 4 and 6)", () => {
  it("gives the world a soft halo on its lit limb and its star's haze on the sun's side, behind it", async () => {
    const { view, stage } = await opened();
    view.tick(1);
    const halo = materials(stage).find(
      (material) => "litSide" in material.uniforms && "rimColour" in material.uniforms,
    );
    const haze = materials(stage).find(
      (material) => "litSide" in material.uniforms && !("rimColour" in material.uniforms),
    );
    expect(halo).toBeDefined();
    expect(haze).toBeDefined();
    const side = value(haze, "litSide") as { x: number; y: number };
    expect(Math.sign(side.x)).toBe(Math.sign(view.stats().sun.x));
    let behind = Number.NaN;
    stage.traverse((part) => {
      if ((part as Partial<Mesh>).material === haze) behind = part.position.z;
    });
    expect(behind).toBeLessThan(0);
  });
});

describe("real shadows on the one world seen close", () => {
  it("casts each moon's and the ring moon's shadow on the world, from where they stand, and none with no moon", async () => {
    const { view, stage } = await opened();
    view.moons([]);
    view.tick(1);
    expect(view.stats().shadows).toBe(0);
    expect(value(overlayOf(stage), "occluderCount")).toBe(0);
    view.moons([mark("#a", 1).moon, mark("#b", 0.5).moon]);
    view.ring(statusOrbit({ lit: 0.4, mark: 0.5 }));
    await settled();
    view.tick(2);
    expect(view.stats().shadows).toBe(3);
    const overlay = overlayOf(stage);
    expect(value(overlay, "occluderCount")).toBe(3);
    const occluders = value(overlay, "occluders") as Vector4[];
    for (const { centre, radius } of view.stats().casters) {
      const found = occluders.some(
        (each) =>
          each
            .clone()
            .sub(new Vector4(centre.x, centre.y, centre.z, radius))
            .length() < 1e-6 && radius > 0,
      );
      expect(found).toBe(true);
    }
  });

  it("lights the shadows from the world's one sun", async () => {
    const { view, stage } = await opened();
    view.moons([mark("#a", 1).moon]);
    await settled();
    view.tick(3);
    const surface = materials(stage).find((material) => "rampMid" in material.uniforms);
    expect((value(overlayOf(stage), "sun") as Vector3).toArray()).toEqual((value(surface, "sun") as Vector3).toArray());
  });

  it("is the close view's alone: a world drawn among the others carries no shadow", () => {
    const planet = createPlanet(
      worldLook(ID),
      { map: () => new Texture(), clouds: new Texture(), ring: new Texture() },
      new BufferGeometry(),
    );
    const found: ShaderMaterial[] = [];
    planet.group.traverse((part) => {
      const material = (part as Partial<Mesh>).material;
      if (material instanceof ShaderMaterial) found.push(material);
    });
    expect(found.some((material) => "occluders" in material.uniforms)).toBe(false);
  });
});
