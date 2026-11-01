import { subSolarPoint } from "@gnoworld/core";
import {
  Matrix3,
  Matrix4,
  PerspectiveCamera,
  Scene as Stage,
  Texture,
  Vector3,
  type Mesh,
  type Object3D,
  type ShaderMaterial,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPIN } from "../planet/surfaceShader.ts";
import { MAP_WIDTH, MOON_WIDTH } from "./maps.ts";
import { EarthView, type Circle, type EarthState } from "./view.ts";

const maps = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("../planet/maps.ts", async (original) => ({
  ...(await original<typeof import("../planet/maps.ts")>()),
  loadMap: maps.load,
}));

const WIDTH = 1728;
const HEIGHT = 1080;
const PLACE: Circle = { x: 960, y: 561, radius: 321 };
const NAMES = ["earth-day", "earth-night", "clouds", "moon"];
const NOON = Date.parse("2026-06-21T12:00:00Z");

interface Bitmap {
  readonly close: ReturnType<typeof vi.fn>;
}

const nameOf = (url: string) => /textures\/([\w-]+)\.webp$/.exec(url)?.[1] ?? url;
const textures = new Map<string, Texture>();

function device(halved = false) {
  const stage = new Stage();
  const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 2000);
  const moved = vi.fn();
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 16 },
    compileAsync: vi.fn((scene: Object3D) => Promise.resolve(scene)),
  };
  const view = new EarthView({ renderer, stage, camera, halved: () => halved, base: "/", moved });
  return { stage, camera, moved, renderer, view };
}

const widthAsked = (name: string) =>
  (maps.load.mock.calls.find(([url]) => nameOf(url as string) === name)?.[1] as { width?: number }).width;

// Everything that was asked has answered, and what follows it.
const settled = () => vi.dynamicImportSettled().then(() => new Promise((done) => setTimeout(done)));

function opened(halved = false) {
  const made = device(halved);
  const said: EarthState[] = [];
  made.view.resize(WIDTH, HEIGHT);
  made.view.show(PLACE, (state) => said.push(state));
  return { ...made, said };
}

// Every drawn material of the stage: the Earth's surface first, for the globe is made first.
const materialsOf = (stage: Stage) => {
  const found: { mesh: Mesh; material: ShaderMaterial }[] = [];
  stage.traverse((part) => {
    const material = (part as Partial<Mesh>).material;
    if (material !== undefined) found.push({ mesh: part as Mesh, material: material as ShaderMaterial });
  });
  return found;
};
const surfacesOf = (stage: Stage) => materialsOf(stage).filter(({ material }) => "spin" in material.uniforms);
const sunOf = (stage: Stage) => surfacesOf(stage)[0]?.material.uniforms["sun"]?.value as Vector3 | undefined;

beforeEach(() => {
  textures.clear();
  vi.useRealTimers();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduced-motion") }));
  maps.load.mockImplementation((url: string) => {
    const texture = new Texture({ width: 4, height: 2, close: vi.fn() });
    textures.set(nameOf(url), texture);
    return Promise.resolve(texture);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  maps.load.mockReset();
});

describe("what the Earth loads", () => {
  it("asks for its day, its night, the clouds and the Moon, each once, under the site's base", async () => {
    const { said } = opened();
    await settled();
    expect(maps.load.mock.calls.map(([url]) => nameOf(url as string)).sort()).toEqual([...NAMES].sort());
    expect(maps.load.mock.calls.every(([url]) => (url as string).startsWith("/textures/"))).toBe(true);
    expect(said).toEqual(["loading", "drawn"]);
  });

  it("reads its day and the Moon as colour, and the clouds as data", async () => {
    opened();
    await settled();
    const kinds = new Map(
      maps.load.mock.calls.map(([url, how]) => [nameOf(url as string), (how as { kind: string }).kind]),
    );
    expect(kinds.get("earth-day")).toBe("colour");
    expect(kinds.get("earth-night")).toBe("colour");
    expect(kinds.get("moon")).toBe("colour");
    expect(kinds.get("clouds")).toBe("data");
  });

  it("takes the plan's size at High, and halves each side where memory is short", async () => {
    opened(false);
    await settled();
    expect(widthAsked("earth-day")).toBe(MAP_WIDTH);
    maps.load.mockClear();
    opened(true);
    await settled();
    expect(widthAsked("earth-day")).toBe(MAP_WIDTH / 2);
    expect(widthAsked("earth-night")).toBe(MAP_WIDTH / 2);
  });

  it("asks how much memory there is at each load: a device found slow takes the small maps on its next visit", async () => {
    let short = false;
    const { stage, camera, moved, renderer } = device();
    const view = new EarthView({ renderer, stage, camera, halved: () => short, base: "/", moved });
    view.show(PLACE, () => undefined);
    await settled();
    short = true;
    view.show(undefined, () => undefined);
    maps.load.mockClear();
    view.show(PLACE, () => undefined);
    await settled();
    expect(widthAsked("earth-day")).toBe(MAP_WIDTH / 2);
  });

  it("hands the Earth's surface the day and the night it loaded", async () => {
    const { stage } = opened();
    await settled();
    const uniforms = surfacesOf(stage)[0]?.material.uniforms;
    expect(uniforms?.["surface"]?.value).toBe(textures.get("earth-day"));
    expect(uniforms?.["nightMap"]?.value).toBe(textures.get("earth-night"));
    expect(uniforms?.["nightLights"]?.value).toBe(1);
  });

  it("hands the Moon its own map, and no city", async () => {
    const { stage } = opened();
    await settled();
    const uniforms = surfacesOf(stage)[1]?.material.uniforms;
    expect(uniforms?.["surface"]?.value).toBe(textures.get("moon"));
    expect(uniforms?.["nightLights"]?.value).toBe(0);
  });

  it("draws one Earth and one Moon, and no other world", async () => {
    const { stage } = opened();
    await settled();
    expect(surfacesOf(stage)).toHaveLength(2);
  });

  it("gives a moon of a few pixels no more than its small size", async () => {
    opened();
    await settled();
    expect(widthAsked("moon")).toBe(MOON_WIDTH);
  });

  it("compiles before it shows, so the first frame stalls on no shader, against the stage's own lights", async () => {
    const { renderer, stage, camera } = opened();
    await settled();
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
    expect(renderer.compileAsync.mock.calls[0]).toEqual([expect.anything(), camera, stage]);
  });

  it("owes a frame once it is on the stage", async () => {
    const { moved } = opened();
    await settled();
    expect(moved).toHaveBeenCalled();
  });
});

describe("a map that does not come", () => {
  it("says so, and leaves the stage as it was", async () => {
    maps.load.mockImplementationOnce(() => Promise.reject(new Error("404")));
    const { said, stage } = opened();
    await settled();
    expect(said).toEqual(["loading", "failed"]);
    expect(stage.children).toEqual([]);
  });

  it("frees every map that did come, and closes what was never uploaded", async () => {
    maps.load.mockImplementationOnce(() => Promise.reject(new Error("404")));
    opened();
    await settled();
    expect(textures.size).toBe(NAMES.length - 1);
    for (const texture of textures.values()) {
      expect((texture.image as Bitmap).close).toHaveBeenCalledTimes(1);
    }
  });

  it("frees them through three as well", async () => {
    maps.load.mockImplementationOnce(() => Promise.reject(new Error("404")));
    const freed = vi.spyOn(Texture.prototype, "dispose");
    opened();
    await settled();
    expect(freed).toHaveBeenCalledTimes(NAMES.length - 1);
  });

  it.each(NAMES)("takes %s for a map the Earth cannot go without", async (name) => {
    maps.load.mockImplementation((url: string) => {
      const texture = new Texture({ width: 4, height: 2, close: vi.fn() });
      return nameOf(url) === name ? Promise.reject(new Error("404")) : Promise.resolve(texture);
    });
    const { said, stage } = opened();
    await settled();
    expect(said).toEqual(["loading", "failed"]);
    expect(stage.children).toEqual([]);
  });

  it("frees a slow map that lands after another failed, and keeps the Earth off the stage", async () => {
    let land: (texture: Texture) => void = () => undefined;
    const late = new Texture({ width: 4, height: 2, close: vi.fn() });
    const freed = vi.spyOn(late, "dispose");
    maps.load.mockImplementation((url: string) => {
      if (nameOf(url) === "earth-night") return Promise.reject(new Error("404"));
      if (nameOf(url) === "earth-day")
        return new Promise((done) => {
          land = done;
        });
      return Promise.resolve(new Texture({ width: 4, height: 2, close: vi.fn() }));
    });
    const { said, stage } = opened();
    await settled();
    land(late);
    await settled();
    expect(freed).toHaveBeenCalledTimes(1);
    expect((late.image as Bitmap).close).toHaveBeenCalledTimes(1);
    expect(stage.children).toEqual([]);
    expect(said).toEqual(["loading", "failed"]);
  });

  it("asks for nothing more while the page stays: a resize of a failed Earth never pulls the maps again", async () => {
    maps.load.mockImplementationOnce(() => Promise.reject(new Error("404")));
    const { view, said } = opened();
    await settled();
    const asked = maps.load.mock.calls.length;
    view.show({ ...PLACE, x: 900 }, (state) => said.push(state));
    await settled();
    expect(maps.load).toHaveBeenCalledTimes(asked);
    expect(said).toEqual(["loading", "failed"]);
  });

  it("asks again the next time the page shows the Earth", async () => {
    maps.load.mockImplementationOnce(() => Promise.reject(new Error("404")));
    const { view, said } = opened();
    await settled();
    view.show(undefined, (state) => said.push(state));
    view.show(PLACE, (state) => said.push(state));
    await settled();
    expect(said).toEqual(["loading", "failed", "gone", "loading", "drawn"]);
  });

  it("does not throw into the page when the shaders fail to compile", async () => {
    const { renderer, said, stage } = opened();
    renderer.compileAsync.mockImplementationOnce(() => Promise.reject(new Error("no shader")));
    await settled();
    expect(said.at(-1)).toBe("failed");
    expect(stage.children).toEqual([]);
  });
});

describe("leaving", () => {
  it("frees every map and takes the Earth off the stage", async () => {
    const { view, stage, said } = opened();
    await settled();
    const freed = vi.spyOn(Texture.prototype, "dispose");
    view.show(undefined, (state) => said.push(state));
    expect(stage.children).toEqual([]);
    expect(freed).toHaveBeenCalledTimes(NAMES.length);
    expect(said.at(-1)).toBe("gone");
  });

  it("frees what comes after the page left, and never draws it", async () => {
    const { view, stage, said } = opened();
    view.show(undefined, (state) => said.push(state));
    await settled();
    expect(stage.children).toEqual([]);
    expect(said).toEqual(["loading", "gone"]);
    for (const texture of textures.values()) expect((texture.image as Bitmap).close).toHaveBeenCalled();
  });

  it("keeps a second visit's answer and frees the first's when the reader came back in between", async () => {
    const { view, stage, said } = opened();
    view.show(undefined, (state) => said.push(state));
    view.show(PLACE, (state) => said.push(state));
    await settled();
    expect(stage.children).toHaveLength(1);
    expect(said).toEqual(["loading", "gone", "loading", "drawn"]);
  });

  it("frees all of it with the scene", async () => {
    const { view, stage } = opened();
    await settled();
    const freed = vi.spyOn(Texture.prototype, "dispose");
    view.dispose();
    expect(stage.children).toEqual([]);
    expect(freed).toHaveBeenCalledTimes(NAMES.length);
  });

  it("is told only once: showing the same place again asks for nothing", async () => {
    const { view, said } = opened();
    await settled();
    view.show({ ...PLACE, x: 900 }, (state) => said.push(state));
    await settled();
    expect(maps.load).toHaveBeenCalledTimes(NAMES.length);
    expect(said).toEqual(["loading", "drawn"]);
  });
});

describe("a context that comes back", () => {
  it("loads the maps again, for a closed bitmap cannot be uploaded twice", async () => {
    const { view, said, stage } = opened();
    await settled();
    view.restored();
    await settled();
    expect(maps.load).toHaveBeenCalledTimes(NAMES.length * 2);
    expect(said).toEqual(["loading", "drawn", "loading", "drawn"]);
    expect(stage.children).toHaveLength(1);
  });

  it("asks for nothing when no Earth was shown", async () => {
    const { stage, camera, moved, renderer } = device();
    new EarthView({ renderer, stage, camera, halved: () => false, base: "/", moved }).restored();
    await settled();
    expect(maps.load).not.toHaveBeenCalled();
  });
});

describe("where the globe stands", () => {
  async function placed(circle: Circle, width = WIDTH, height = HEIGHT) {
    const made = device();
    made.camera.aspect = width / height;
    made.camera.updateProjectionMatrix();
    made.view.resize(width, height);
    made.view.show(circle, () => undefined);
    await settled();
    made.view.tick(0);
    return made;
  }

  it("fills the circle the page drew for it, whatever the window", async () => {
    for (const [circle, width, height] of [
      [PLACE, WIDTH, HEIGHT],
      [{ x: 760, y: 450, radius: 136 }, 1280, 800],
      [{ x: 195, y: 180, radius: 170 }, 390, 844],
    ] as const) {
      const { view } = await placed(circle, width, height);
      const stats = view.stats();
      expect(stats?.x).toBeCloseTo(circle.x, 0);
      expect(stats?.y).toBeCloseTo(circle.y, 0);
      expect(stats?.radius).toBeCloseTo(circle.radius, 0);
    }
  });

  it("follows the page when the window changes", async () => {
    const { view } = await placed(PLACE);
    view.show({ x: 700, y: 400, radius: 200 }, () => undefined);
    view.tick(0);
    expect(view.stats()?.x).toBeCloseTo(700, 0);
    expect(view.stats()?.y).toBeCloseTo(400, 0);
  });

  it("owes a frame when the page moves it", async () => {
    const { view, moved } = await placed(PLACE);
    moved.mockClear();
    view.show({ x: 700, y: 400, radius: 200 }, () => undefined);
    expect(moved).toHaveBeenCalled();
  });
});

// The local direction the shader lights brightest at `now`: the map's point under the sun, taken back through the surface's own uniforms.
function underTheSun(stage: Stage, now: number): Vector3 {
  const earth = surfacesOf(stage)[0];
  if (earth === undefined) throw new Error("no Earth");
  const { latitude, longitude } = subSolarPoint(now);
  const onMap = new Vector3(
    Math.cos(latitude) * Math.cos(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.sin(longitude),
  );
  const spin = earth.material.uniforms["spin"]?.value as Matrix3;
  const angle = (earth.material.uniforms["time"]?.value as number) * SPIN;
  const axis = onMap.applyMatrix3(spin.clone().invert());
  const local = axis.applyMatrix4(new Matrix4().makeRotationY(-angle));
  stage.updateMatrixWorld(true);
  return local.transformDirection(earth.mesh.matrixWorld);
}

describe("the sun over the globe", () => {
  it.each([
    ["at noon on Greenwich", NOON],
    ["six hours on", NOON + 6 * 3600 * 1000],
    ["on a December evening", Date.parse("2026-12-21T19:30:00Z")],
  ])("stands over the real place under the sun %s, signed, so no side is lit by mistake", async (_, now) => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const { view, stage } = opened();
    await settled();
    view.tick(0);
    expect(underTheSun(stage, now).dot(sunOf(stage) ?? new Vector3())).toBeGreaterThan(0.999);
  });

  it("lights every part of a world with the one sun", async () => {
    const { view, stage } = opened();
    await settled();
    view.tick(0);
    const sun = sunOf(stage) ?? new Vector3();
    const holders = materialsOf(stage).filter(({ material }) => "sun" in material.uniforms);
    expect(holders.length).toBeGreaterThanOrEqual(3);
    for (const { material } of holders)
      expect((material.uniforms["sun"]?.value as Vector3).distanceTo(sun)).toBeLessThan(1e-9);
  });

  it("stands to the right of the eye, so the day lies towards the dock and the night towards the plate", async () => {
    vi.useFakeTimers({ now: NOON, toFake: ["Date"] });
    const { view, stage } = opened();
    await settled();
    view.tick(0);
    const sun = sunOf(stage);
    expect(sun?.x).toBeGreaterThan(0.5);
    expect(sun?.z).toBeGreaterThan(0);
  });

  it("stays where it is at any hour: the hour turns the globe under it", async () => {
    vi.useFakeTimers({ now: NOON, toFake: ["Date"] });
    const first = opened();
    await settled();
    first.view.tick(0);
    const noon = sunOf(first.stage)?.clone();
    const turn = first.view.stats()?.turn;
    vi.setSystemTime(NOON + 6 * 3600 * 1000);
    const second = opened();
    await settled();
    second.view.tick(0);
    expect(sunOf(second.stage)?.distanceTo(noon ?? new Vector3())).toBeLessThan(0.01);
    expect(Math.abs((second.view.stats()?.turn ?? 0) - (turn ?? 0))).toBeCloseTo(Math.PI / 2, 1);
  });

  it("stands 47° higher in June than in December, as the real sun does, whatever the globe's lean", async () => {
    vi.useFakeTimers({ now: NOON, toFake: ["Date"] });
    const june = opened();
    await settled();
    june.view.tick(0);
    const summer = sunOf(june.stage)?.clone();
    vi.setSystemTime(Date.parse("2026-12-21T12:00:00Z"));
    const december = opened();
    await settled();
    december.view.tick(0);
    const angle = summer?.angleTo(sunOf(december.stage) ?? new Vector3()) ?? 0;
    expect((angle * 180) / Math.PI).toBeCloseTo(46.9, 0);
  });
});

describe("motion", () => {
  function moving() {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    return opened();
  }

  it("rests at once under reduced motion: no arrival, no spin", async () => {
    const { view } = opened();
    await settled();
    expect(view.arriving).toBe(false);
    view.tick(0);
    const rest = view.stats();
    view.tick(120);
    expect(view.stats()).toEqual(rest);
  });

  // Frames of a twentieth of a second, from `from` for `seconds`.
  const run = (view: EarthView, from: number, seconds: number) => {
    for (let at = from; at <= from + seconds; at += 0.05) view.tick(at);
  };

  it("opens with the sun behind the globe, then brings the day across it", async () => {
    const { view, stage } = moving();
    await settled();
    view.tick(0);
    expect(view.arriving).toBe(true);
    expect(sunOf(stage)?.z).toBeLessThan(-0.5);
    run(view, 0, 4);
    expect(view.arriving).toBe(false);
    expect(sunOf(stage)?.z).toBeGreaterThan(0);
  });

  it("loses none of the arrival to a first frame that stalls on its uploads", async () => {
    const { view, stage } = moving();
    await settled();
    view.tick(0);
    view.tick(3);
    expect(view.arriving).toBe(true);
    expect(sunOf(stage)?.z).toBeLessThan(0);
  });

  it("turns the globe east at 7b's rate, as the video's globe turns", async () => {
    const { view } = moving();
    await settled();
    view.tick(10);
    const before = view.stats()?.turn ?? 0;
    view.tick(20);
    expect((view.stats()?.turn ?? 0) - before).toBeCloseTo(-SPIN * 10, 6);
  });

  it("keeps the sun steady once it has arrived, and turns the ground under it", async () => {
    const { view, stage } = moving();
    await settled();
    run(view, 0, 5);
    const rest = sunOf(stage)?.clone();
    view.tick(90);
    expect(sunOf(stage)?.distanceTo(rest ?? new Vector3())).toBeLessThan(1e-9);
  });

  it("carries the Moon round its orbit", async () => {
    const { view } = moving();
    await settled();
    view.tick(10);
    const before = view.stats()?.moon;
    view.tick(40);
    expect(view.stats()?.moon).not.toEqual(before);
  });
});
