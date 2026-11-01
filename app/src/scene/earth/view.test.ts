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
  type Vector4,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPIN } from "../planet/surfaceShader.ts";
import { MAP_WIDTH, MOON_WIDTH } from "./maps.ts";
import { MOON_REST, ORBIT_RADIUS } from "./orbit.ts";
import { EarthView, SUN_REST, type Circle, type EarthState } from "./view.ts";

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
    initTexture: vi.fn(),
    compileAsync: vi.fn((scene: Object3D) => Promise.resolve(scene)),
  };
  const view = new EarthView({ renderer, stage, camera, halved: () => halved, base: "/", moved });
  return { stage, camera, moved, renderer, view };
}

const widthAsked = (name: string) =>
  (maps.load.mock.calls.find(([url]) => nameOf(url as string) === name)?.[1] as { width?: number }).width;

// Everything that was asked has answered, and what follows it.
const settled = async () => {
  await vi.dynamicImportSettled();
  for (let task = 0; task < NAMES.length + 2; task += 1) await new Promise((done) => setTimeout(done));
};

function opened(halved = false) {
  const made = device(halved);
  const said: EarthState[] = [];
  made.view.resize(WIDTH, HEIGHT, 1);
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

  it("uploads each map ahead of the first frame, one a task, so no draw stalls on all four at once", async () => {
    const { renderer, stage } = opened();
    await settled();
    expect(renderer.initTexture).toHaveBeenCalledTimes(NAMES.length);
    expect(stage.children).toHaveLength(1);
  });

  it("stops at the maps when the reader has left, and builds nothing for a page that is gone", async () => {
    const { view, renderer } = opened();
    view.show(undefined, () => undefined);
    await settled();
    expect(renderer.compileAsync).not.toHaveBeenCalled();
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

  it("says so and frees the maps when the shaders fail to compile", async () => {
    const { renderer, said, stage } = opened();
    renderer.compileAsync.mockImplementationOnce(() => Promise.reject(new Error("no shader")));
    const freed = vi.spyOn(Texture.prototype, "dispose");
    await settled();
    expect(said.at(-1)).toBe("failed");
    expect(stage.children).toEqual([]);
    expect(freed).toHaveBeenCalledTimes(NAMES.length);
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
    made.view.resize(width, height, 1);
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

  it("shifts the lens and not the sphere, so the disc stays round where the page says", async () => {
    const { camera, stage } = await placed(PLACE);
    expect(camera.view?.offsetX).toBeCloseTo(WIDTH / 2 - PLACE.x, 6);
    expect(camera.view?.offsetY).toBeCloseTo(HEIGHT / 2 - PLACE.y, 6);
    const [globe] = stage.children;
    expect(globe?.position.x).toBeCloseTo(0, 6);
    expect(globe?.position.y).toBeCloseTo(0, 6);
  });

  it("gives the lens back when the Earth goes", async () => {
    const { view, camera } = await placed(PLACE);
    view.show(undefined, () => undefined);
    expect(camera.view?.enabled ?? false).toBe(false);
  });

  it("paints the plate behind the globe where a page gives one, in its colour, at its place", async () => {
    const plate = { left: 24, top: 98, right: 832, bottom: 1056, fill: [24, 34, 56] as const };
    const { stage } = await placed({ ...PLACE, plate });
    const ground = materialsOf(stage).find(({ material }) => "plate" in material.uniforms);
    expect((ground?.material.uniforms["plate"]?.value as Vector4).toArray()).toEqual([24, 98, 832, 1056]);
    expect(ground?.mesh.visible).toBe(true);
    expect((ground?.material.uniforms["fill"]?.value as Vector3).toArray()).toEqual([24 / 255, 34 / 255, 56 / 255]);
  });

  it("paints no plate where the page keeps it in the flow, for it would stay behind as the page scrolls", async () => {
    const { stage } = await placed(PLACE);
    const ground = materialsOf(stage).find(({ material }) => "plate" in material.uniforms);
    expect(ground?.mesh.visible).toBe(false);
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

describe("the bodies on the stage", () => {
  it("lights the Earth's limb, and only the Earth's", async () => {
    const { stage } = opened();
    await settled();
    const lit = materialsOf(stage).filter(({ material }) => (material.uniforms["limbLight"]?.value ?? 0) > 0);
    expect(lit).toHaveLength(1);
  });

  it("reads both maps through the mirror, the Moon's too", async () => {
    const { stage } = opened();
    await settled();
    for (const { material } of surfacesOf(stage))
      expect((material.uniforms["spin"]?.value as Matrix3).determinant()).toBeCloseTo(-1, 9);
  });

  it("makes the Moon a small world on the ring's path", async () => {
    const { view, stage } = opened();
    await settled();
    view.tick(0);
    const moon = surfacesOf(stage)[1]?.mesh.parent;
    expect(moon?.scale.x).toBeLessThan(0.15);
    expect(moon?.position.length()).toBeCloseTo(ORBIT_RADIUS, 6);
  });

  it("stands the Moon's glow and the ring's wake where it stands", async () => {
    const { view, stage } = opened();
    await settled();
    view.tick(0);
    const moon = surfacesOf(stage)[1]?.mesh.parent;
    const glow = materialsOf(stage).find(({ mesh }) => mesh.geometry.type === "PlaneGeometry" && mesh.visible);
    expect(glow?.mesh.position.x).toBeCloseTo(moon?.position.x ?? 0, 6);
    expect(glow?.mesh.position.y).toBeCloseTo(moon?.position.y ?? 0, 6);
    const line = materialsOf(stage).find(({ material }) => "head" in material.uniforms);
    expect(line?.material.uniforms["head"]?.value).toBeCloseTo(MOON_REST, 6);
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
    expect(view.stats()).toEqual({ ...rest, drawn: 2 });
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

  it("plays the whole arrival again on a second visit, at the true hour", async () => {
    vi.useFakeTimers({ now: NOON, toFake: ["Date"] });
    const { view, stage } = moving();
    await settled();
    run(view, 0, 4);
    vi.setSystemTime(NOON + 3600 * 1000);
    view.show(undefined, () => undefined);
    view.show(PLACE, () => undefined);
    await settled();
    view.tick(100);
    expect(view.arriving).toBe(true);
    expect(sunOf(stage)?.z).toBeLessThan(-0.5);
    run(view, 100, 4);
    expect(view.stats()?.turn).toBeCloseTo(subSolarPoint(NOON + 3600 * 1000).longitude - SUN_REST - SPIN * 4, 0);
  });

  it("settles the globe into its place as the sun comes: it starts nearer and to the left", async () => {
    const { view, stage } = moving();
    await settled();
    view.tick(0);
    const [globe] = stage.children;
    expect(globe?.scale.x).toBeGreaterThan(1.02);
    expect(globe?.position.x).toBeLessThan(-0.05);
    run(view, 0, 4);
    expect(globe?.scale.x).toBe(1);
    expect(globe?.position.x).toBeCloseTo(0, 6);
  });

  it("counts the frames drawn since it came, for a journey to wait on the first", async () => {
    const { view } = moving();
    await settled();
    expect(view.stats()?.drawn).toBe(0);
    view.tick(0);
    view.tick(1);
    expect(view.stats()?.drawn).toBe(2);
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

// 7f2: the page's signs stand on the ground, and the HTML is told where: the picture's own sums, read back here through the shader's.
describe("marks on the ground", () => {
  interface Told {
    x: number;
    y: number;
    front: boolean;
  }
  function mark(lat: number, lon: number) {
    const told: Told[] = [];
    return {
      told,
      lat,
      lon,
      place: (x: number, y: number, front: boolean) => {
        told.push({ x, y, front });
      },
    };
  }
  const last = (m: ReturnType<typeof mark>): Told => {
    const found = m.told.at(-1);
    if (found === undefined) throw new Error("the mark was told nothing");
    return found;
  };
  const DEGREE = Math.PI / 180;

  // Where the eye's ray through a page's pixel meets the surface, in the mesh's own space, and in the world's.
  function hit(stage: Stage, camera: PerspectiveCamera, { x, y }: Pick<Told, "x" | "y">) {
    const surface = surfacesOf(stage)[0];
    if (surface === undefined) throw new Error("no Earth");
    stage.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const ray = new Vector3((x / WIDTH) * 2 - 1, 1 - (y / HEIGHT) * 2, 0.5).unproject(camera).normalize();
    const inverse = new Matrix4().copy(surface.mesh.matrixWorld).invert();
    const origin = new Vector3().applyMatrix4(inverse);
    const direction = ray.clone().transformDirection(inverse);
    const b = origin.dot(direction);
    const local = origin.clone().addScaledVector(direction, -b - Math.sqrt(b * b - origin.lengthSq() + 1));
    return { local: local.clone(), world: local.clone().applyMatrix4(surface.mesh.matrixWorld), surface };
  }

  // The place the shader draws at a pixel: `turned`, then `spin`, then `lookupOf`'s longitude and colatitude.
  function drawnAt(stage: Stage, camera: PerspectiveCamera, at: Pick<Told, "x" | "y">) {
    const { local, surface } = hit(stage, camera, at);
    const angle = (surface.material.uniforms["time"]?.value as number) * SPIN;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    const axis = new Vector3(c * local.x + s * local.z, local.y, c * local.z - s * local.x).normalize();
    const direction = axis.applyMatrix3(surface.material.uniforms["spin"]?.value as Matrix3);
    return { lat: Math.asin(direction.y) / DEGREE, lon: Math.atan2(direction.z, direction.x) / DEGREE };
  }

  async function ready() {
    vi.useFakeTimers({ now: NOON, toFake: ["Date"] });
    const made = opened();
    await settled();
    made.view.tick(0);
    return made;
  }

  it("stands a place where the shader draws it: the map under the mark is the place's own", async () => {
    const { stage, camera, view } = await ready();
    const here = view.facing();
    if (here === undefined) throw new Error("no facing");
    const places = [
      mark(46.7, here.lon),
      mark(23.9, here.lon + 30),
      mark(-13, here.lon - 40),
      mark(0, here.lon + 10),
      mark(60, here.lon - 15),
    ];
    view.setMarks(places);
    expect(places.every((each) => last(each).front)).toBe(true);
    for (const place of places) {
      const drawn = drawnAt(stage, camera, last(place));
      expect(drawn.lat).toBeCloseTo(place.lat, 3);
      expect(drawn.lon).toBeCloseTo(place.lon, 3);
    }
  });

  it("tells a place behind the globe that it stands behind, and one on the eye's side that it does not", async () => {
    const { view } = await ready();
    const here = view.facing();
    if (here === undefined) throw new Error("no facing");
    const near = mark(here.lat, here.lon);
    const opposite = mark(-here.lat, here.lon > 0 ? here.lon - 180 : here.lon + 180);
    view.setMarks([near, opposite]);
    expect(last(near).front).toBe(true);
    expect(last(opposite).front).toBe(false);
  });

  it("hides a place at the limb, where a sign would slide off the edge", async () => {
    const { view } = await ready();
    const here = view.facing();
    if (here === undefined) throw new Error("no facing");
    const rim = mark(here.lat, here.lon + 70);
    const clear = mark(here.lat, here.lon + 60);
    view.setMarks([rim, clear]);
    expect(last(rim).front).toBe(false);
    expect(last(clear).front).toBe(true);
  });

  it("says which place faces the eye: the ground at the middle of the disc", async () => {
    const { stage, camera, view } = await ready();
    const here = view.facing();
    if (here === undefined) throw new Error("no facing");
    const drawn = drawnAt(stage, camera, PLACE);
    expect(here.lat).toBeCloseTo(drawn.lat, 3);
    expect(here.lon).toBeCloseTo(drawn.lon, 3);
  });

  it("faces nothing before the Earth stands, nor after it left", async () => {
    const { view } = device();
    expect(view.facing()).toBeUndefined();
    const { view: left } = await ready();
    left.show(undefined, () => undefined);
    expect(left.facing()).toBeUndefined();
  });

  it("gives a place its point at once, and owes the frame that shows it", async () => {
    const { view, moved } = await ready();
    moved.mockClear();
    const place = mark(0, 0);
    view.setMarks([place]);
    expect(place.told).toHaveLength(1);
    expect(moved).toHaveBeenCalled();
  });

  it("holds marks given before the Earth stands, and places them as it comes", async () => {
    const made = device();
    const place = mark(0, 0);
    made.view.setMarks([place]);
    expect(place.told).toEqual([]);
    made.view.resize(WIDTH, HEIGHT, 1);
    made.view.show(PLACE, () => undefined);
    await settled();
    expect(place.told.length).toBeGreaterThan(0);
  });

  it("moves its marks with the page: a resize and a frame both tell them", async () => {
    const { view } = await ready();
    const place = mark(0, 0);
    view.setMarks([place]);
    const before = place.told.length;
    view.show({ x: 700, y: 400, radius: 200 }, () => undefined);
    expect(place.told.length).toBeGreaterThan(before);
    view.tick(1);
    expect(place.told.length).toBeGreaterThan(before + 1);
  });

  it("tells a mark nothing once it was taken away, or once the Earth left", async () => {
    const { view } = await ready();
    const place = mark(0, 0);
    view.setMarks([place]);
    view.setMarks([]);
    const count = place.told.length;
    view.tick(1);
    expect(place.told).toHaveLength(count);
    const other = mark(10, 10);
    view.setMarks([other]);
    view.show(undefined, () => undefined);
    const after = other.told.length;
    view.tick(2);
    expect(other.told).toHaveLength(after);
  });

  describe("turning to a place", () => {
    const motion = (on: boolean) => {
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: !on && query.includes("reduced-motion") }));
    };
    const lit = (stage: Stage, camera: PerspectiveCamera, told: Told) => {
      const sun = sunOf(stage);
      if (sun === undefined) throw new Error("no sun");
      const { world } = hit(stage, camera, told);
      const centre = hit(stage, camera, PLACE).surface.mesh.getWorldPosition(new Vector3());
      return world.sub(centre).normalize().dot(sun.clone().normalize());
    };

    it("brings the place to the middle of the disc's width, at once under reduced motion", async () => {
      const { view } = await ready();
      const paris = mark(48.9, 2.4);
      view.setMarks([paris]);
      view.face({ lat: 48.9, lon: 2.4 });
      expect(last(paris).front).toBe(true);
      expect(Math.abs(last(paris).x - PLACE.x)).toBeLessThan(PLACE.radius * 0.2);
    });

    it("brings it to the disc's height too, as frames 43 to 55 hold Europe: the Earth leans to it", async () => {
      const { view } = await ready();
      const paris = mark(48.9, 2.4);
      view.setMarks([paris]);
      view.face({ lat: 48.9, lon: 2.4 });
      expect(Math.abs(last(paris).y - PLACE.y)).toBeLessThan(PLACE.radius * 0.2);
      const south = mark(-33.9, 151.2);
      view.setMarks([south]);
      view.face({ lat: -33.9, lon: 151.2 });
      expect(Math.abs(last(south).y - PLACE.y)).toBeLessThan(PLACE.radius * 0.2);
    });

    it("keeps the sun where it was as the Earth leans: the sun's own lean is the ground's", async () => {
      const { stage, camera, view } = await ready();
      const noon = subSolarPoint(NOON);
      const [lat, lon] = [noon.latitude / DEGREE, noon.longitude / DEGREE];
      const under = mark(lat, lon);
      view.setMarks([under]);
      view.face({ lat: 50, lon: lon + 20 });
      view.tick(1);
      expect(last(under).front).toBe(true);
      expect(lit(stage, camera, last(under))).toBeCloseTo(1, 3);
    });

    it("stays the same for a turn that asks nothing new, and eases its lean with its turn", async () => {
      motion(true);
      const { view } = await ready();
      for (let at = 0.05; at < 4; at += 0.05) view.tick(at);
      const paris = mark(48.9, 2.4);
      view.setMarks([paris]);
      view.face({ lat: 48.9, lon: 2.4 });
      view.tick(4.1);
      const midway = last(paris).y;
      view.tick(6);
      const done = last(paris).y;
      expect(Math.abs(done - PLACE.y)).toBeLessThan(PLACE.radius * 0.2);
      expect(Math.abs(midway - done)).toBeGreaterThan(1);
    });

    const settledIn = (view: EarthView) => {
      for (let at = 0.05; at < 4; at += 0.05) view.tick(at);
    };
    const wrapped = (degrees: number) => ((degrees + 540) % 360) - 180;
    const lonOf = (view: EarthView) => {
      const here = view.facing();
      if (here === undefined) throw new Error("no facing");
      return here.lon;
    };

    it.each([
      ["east", 170, 1],
      ["west", -170, -1],
    ])("takes the short way round to a place %s of the eye, past the antimeridian too", async (_side, by, sign) => {
      motion(true);
      const { view } = await ready();
      settledIn(view);
      const from = lonOf(view);
      view.face({ lat: 0, lon: wrapped(from + by) });
      view.tick(4.2);
      const gone = wrapped(lonOf(view) - from);
      expect(Math.sign(gone)).toBe(sign);
      expect(Math.abs(gone)).toBeLessThan(170);
    });

    it("starts a new turn from where the eye is, in mid-turn: nothing jumps", async () => {
      motion(true);
      const { view } = await ready();
      settledIn(view);
      view.face({ lat: 40, lon: wrapped(lonOf(view) + 90) });
      view.tick(4.4);
      const here = view.facing();
      view.face({ lat: -20, lon: wrapped(lonOf(view) - 60) });
      view.tick(4.4);
      expect(view.facing()?.lon).toBeCloseTo(here?.lon ?? 0, 3);
      expect(view.facing()?.lat).toBeCloseTo(here?.lat ?? 0, 3);
    });

    it("holds the full rate for 1.4 s of a turn, and no longer", async () => {
      motion(true);
      const { view } = await ready();
      settledIn(view);
      view.face({ lat: 0, lon: wrapped(lonOf(view) + 40) });
      view.tick(5.3);
      expect(view.arriving).toBe(true);
      view.tick(5.5);
      expect(view.arriving).toBe(false);
    });

    it("sets the sun again when only the lean moves: the same meridian at another latitude", async () => {
      const { stage, camera, view } = await ready();
      const noon = subSolarPoint(NOON);
      const [lat, lon] = [noon.latitude / DEGREE, noon.longitude / DEGREE];
      const under = mark(lat, lon);
      view.setMarks([under]);
      view.face({ lat: 60, lon: lonOf(view) });
      view.tick(1);
      expect(lit(stage, camera, last(under))).toBeCloseTo(1, 3);
    });

    it("leaves the clouds on their ground: a turn of the eye is no wind", async () => {
      const { stage, view } = await ready();
      const surface = surfacesOf(stage)[0]?.material;
      const clouds = () => surface?.uniforms["cloudTime"]?.value as number;
      const [time, drift] = [surface?.uniforms["time"]?.value as number, clouds()];
      view.face({ lat: 0, lon: wrapped(lonOf(view) + 120) });
      expect(surface?.uniforms["time"]?.value).not.toBeCloseTo(time, 1);
      expect(clouds()).toBeCloseTo(drift, 6);
    });

    it("comes back at rest in its lean too: a new visit faces what it faced", async () => {
      const { view } = await ready();
      const first = view.facing();
      view.face({ lat: 60, lon: 10 });
      view.show(undefined, () => undefined);
      view.show(PLACE, () => undefined);
      await settled();
      view.tick(0);
      expect(view.facing()?.lat).toBeCloseTo(first?.lat ?? 0, 3);
    });

    it("owes the frame that shows the turn", async () => {
      const { view, moved } = await ready();
      moved.mockClear();
      view.face({ lat: 0, lon: 170 });
      expect(moved).toHaveBeenCalled();
    });

    it("moves the sun with the ground: the place keeps its true hour, so a night city stays at night", async () => {
      const { stage, camera, view } = await ready();
      const noon = subSolarPoint(NOON);
      const [lat, lon] = [noon.latitude / DEGREE, noon.longitude / DEGREE];
      const under = mark(lat, lon);
      const dusk = mark(lat, lon - 50);
      view.setMarks([under, dusk]);
      const [noonLight, duskLight] = [lit(stage, camera, last(under)), lit(stage, camera, last(dusk))];
      expect(noonLight).toBeCloseTo(1, 3);
      expect(duskLight).toBeLessThan(0.8);
      const before = view.facing()?.lon ?? Number.NaN;
      view.face({ lat, lon: lon + 40 });
      view.tick(1);
      const after = view.facing()?.lon ?? Number.NaN;
      expect(Math.abs(after - before)).toBeGreaterThan(5);
      expect(last(under).front).toBe(true);
      expect(lit(stage, camera, last(under))).toBeCloseTo(noonLight, 3);
    });

    it("shows a city under the night as night: facing it brings the dark, and never the sun, to the eye", async () => {
      const { stage, camera, view } = await ready();
      const noon = subSolarPoint(NOON);
      const [lat, lon] = [-noon.latitude / DEGREE, noon.longitude / DEGREE + 150];
      const city = mark(lat, lon);
      view.setMarks([city]);
      view.face({ lat, lon });
      view.tick(1);
      expect(last(city).front).toBe(true);
      expect(lit(stage, camera, last(city))).toBeLessThan(-0.5);
    });

    it("takes the short way round: a place just behind the eye's left is reached going left", async () => {
      motion(true);
      const { view } = await ready();
      view.tick(10);
      const here = view.facing();
      if (here === undefined) throw new Error("no facing");
      const lon = here.lon + 170 > 180 ? here.lon - 190 : here.lon + 170;
      view.face({ lat: 0, lon });
      view.tick(10.4);
      const midway = view.facing();
      if (midway === undefined) throw new Error("no facing");
      const gone = Math.abs(((midway.lon - here.lon + 540) % 360) - 180);
      expect(gone).toBeGreaterThan(0);
      expect(gone).toBeLessThan(171);
    });

    it("eases there over a turn of its own, at the full rate, then lets go of it", async () => {
      motion(true);
      const { view } = await ready();
      for (let at = 0.05; at < 4; at += 0.05) view.tick(at);
      view.tick(20);
      expect(view.arriving).toBe(false);
      const paris = mark(48.9, 2.4);
      view.setMarks([paris]);
      view.face({ lat: 48.9, lon: 2.4 });
      expect(view.arriving).toBe(true);
      view.tick(20.5);
      expect(view.arriving).toBe(true);
      view.tick(22);
      expect(view.arriving).toBe(false);
      expect(last(paris).front).toBe(true);
      expect(Math.abs(last(paris).x - PLACE.x)).toBeLessThan(PLACE.radius * 0.2);
    });

    it("keeps the arrival's own sweep apart: a turn asked on arrival ends at the place", async () => {
      motion(true);
      const { view } = await ready();
      const paris = mark(48.9, 2.4);
      view.setMarks([paris]);
      view.face({ lat: 48.9, lon: 2.4 });
      for (let at = 0.05; at < 4; at += 0.05) view.tick(at);
      expect(last(paris).front).toBe(true);
      expect(Math.abs(last(paris).x - PLACE.x)).toBeLessThan(PLACE.radius * 0.2);
    });

    it("turns nothing before the Earth stands", () => {
      const { view } = device();
      expect(() => {
        view.face({ lat: 0, lon: 0 });
      }).not.toThrow();
      expect(view.arriving).toBe(false);
    });

    it("comes back at rest on the way back: a new visit starts from the true hour", async () => {
      const { stage, camera, view } = await ready();
      view.face({ lat: 0, lon: 170 });
      view.show(undefined, () => undefined);
      view.show(PLACE, () => undefined);
      await settled();
      view.tick(0);
      const noon = subSolarPoint(NOON);
      const under = mark(noon.latitude / DEGREE, noon.longitude / DEGREE);
      view.setMarks([under]);
      expect(last(under).x).toBeGreaterThan(PLACE.x);
      expect(lit(stage, camera, last(under))).toBeCloseTo(1, 3);
    });
  });
});
