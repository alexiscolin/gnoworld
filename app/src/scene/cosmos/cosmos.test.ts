import {
  BELT_INNER,
  BOUNDS,
  GROWTH,
  growthAt,
  HOME,
  NEBULA_IMAGES,
  ROOM,
  spreadAt,
  systemsOf,
  toMap,
  toScene,
  worldLook,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LineLoop,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Points,
  Scene as Stage,
  Texture,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type LineBasicMaterial,
  type ShaderMaterial,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Disposer } from "../disposer.ts";
import { MOON_FAR } from "../earth/orbit.ts";
import { LIMB_LIGHT } from "../planet/planet.ts";
import { Cosmos, type CosmosWorld } from "./cosmos.ts";
import { FAR_ANGLE, limbAt } from "./far.ts";

const maps = vi.hoisted(() => ({ load: vi.fn() }));
const globes = vi.hoisted(() => ({ build: vi.fn() }));

vi.mock("../planet/maps.ts", async (original) => ({
  ...(await original<typeof import("../planet/maps.ts")>()),
  loadMap: maps.load,
}));
vi.mock("../earth/globe.ts", () => ({ buildGlobe: globes.build }));

const WIDTH = 1728;
const HEIGHT = 1080;
const IMAGE = { width: 8, height: 4 };
const nameOf = (url: string) => /textures\/([\w-]+)\.webp$/.exec(url)?.[1] ?? url;

interface FakeGlobe {
  readonly group: Stage;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly aim: ReturnType<typeof vi.fn>;
  readonly setSun: ReturnType<typeof vi.fn>;
  readonly setTurn: ReturnType<typeof vi.fn>;
  readonly setMoon: ReturnType<typeof vi.fn>;
  readonly stand: ReturnType<typeof vi.fn>;
}

const fakeGlobe = (): FakeGlobe => ({
  group: new Stage(),
  dispose: vi.fn(),
  aim: vi.fn(),
  setSun: vi.fn(),
  setTurn: vi.fn(),
  setMoon: vi.fn(),
  stand: vi.fn(),
});

const worlds = (systems: number, each = 3): CosmosWorld[] =>
  Array.from({ length: systems }, (_, system) =>
    Array.from({ length: each }, (__, world) => ({
      id: `n${String(system)}/w${String(world)}`,
      namespace: `n${String(system)}`,
      realms: [{ callers: world === 0 ? 40 : null }, { callers: null }],
    })),
  ).flat();

function made() {
  const stage = new Stage();
  const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 2000);
  const owner = new Disposer();
  const moved = vi.fn();
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 16 },
    initTexture: vi.fn(),
    compileAsync: vi.fn((scene: Object3D) => Promise.resolve(scene)),
  };
  const stood = vi.fn();
  const cosmos = owner.add(new Cosmos({ renderer, stage, camera, halved: () => false, base: "/", moved, stood }));
  cosmos.resize(HEIGHT, 1);
  return { stage, camera, owner, moved, renderer, cosmos, stood };
}

// A look runs off the frame, and maps load behind it: every task due is run, none guessed at.
const settled = () => vi.advanceTimersByTimeAsync(100);
// A body waits for the generated worlds' code, a chunk of its own, as it waits for its maps (7b5).
const shown = async (made_: ReturnType<typeof made>, list: readonly CosmosWorld[] = worlds(30)) => {
  made_.cosmos.show(list);
  await vi.dynamicImportSettled();
  made_.cosmos.tick(HOME, 0);
  await settled();
  made_.cosmos.tick(HOME, 0);
  await settled();
};
const parts = ({ stage }: { stage: Stage }) => {
  const found: Object3D[] = [];
  stage.traverse((object) => found.push(object));
  return found;
};
const held = (list: readonly CosmosWorld[]): StarSystem[] =>
  systemsOf(
    list.map(({ id, namespace, realms }) => ({
      id,
      namespace,
      use: realms.reduce((sum, { callers }) => sum + (callers ?? 0), realms.length),
    })),
  );
// What the renderer would draw: each visible mesh or points, the instanced ones once.
const draws = (from: { stage: Stage }) =>
  parts(from).filter((object) => object.visible && (object instanceof Mesh || object instanceof Points)).length;
const glows = (from: { stage: Stage }) =>
  parts(from).filter(
    (object): object is Mesh<InstancedBufferGeometry, ShaderMaterial> =>
      object instanceof Mesh && object.geometry instanceof InstancedBufferGeometry,
  );
const pointsWith = (from: { stage: Stage }, attribute: string) =>
  parts(from).filter(
    (object): object is Points<BufferGeometry, ShaderMaterial> =>
      object instanceof Points && (object.geometry as BufferGeometry).hasAttribute(attribute),
  );
const dots = (from: { stage: Stage }) => pointsWith(from, "aOrbit");
const rocks = (from: { stage: Stage }) => pointsWith(from, "aStar");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  maps.load.mockReset();
  globes.build.mockReset();
  maps.load.mockImplementation((url: string) => {
    const texture = new Texture(IMAGE);
    texture.name = nameOf(url);
    return Promise.resolve(texture);
  });
  globes.build.mockImplementation(() => Promise.resolve(fakeGlobe()));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("what it draws", () => {
  it("draws nothing until a page asks for it, and asks for no map", async () => {
    const scene = made();
    scene.cosmos.tick(HOME, 0);
    await settled();
    expect(scene.cosmos.stats()).toMatchObject({ shown: false, bodies: 0, stars: 0, dots: 0 });
    expect(maps.load).not.toHaveBeenCalled();
    expect(globes.build).not.toHaveBeenCalled();
  });

  it("stands stars, worlds and bodies from the file, each a draw of its own however many", async () => {
    const scene = made();
    await shown(scene);
    const { stars, dots: points, bodies } = scene.cosmos.stats();
    expect(stars).toBe(31);
    expect(bodies).toBeGreaterThan(10);
    expect(bodies).toBeLessThanOrEqual(BOUNDS.bodies);
    expect(points).toBe(90 - bodies);
    expect(glows(scene)).toHaveLength(1);
    expect(dots(scene)).toHaveLength(1);
  });

  it("draws the same at 100, 1,000 and 10,000 systems: the bound is the ladder's, not the file's", async () => {
    const counted = [];
    for (const size of [100, 1000, 10_000]) {
      const scene = made();
      await shown(scene, worlds(size));
      counted.push(draws(scene));
    }
    // The worlds differ, so their air and rings do: a body takes one to three draws.
    expect(Math.abs((counted[1] ?? NaN) - (counted[0] ?? NaN))).toBeLessThanOrEqual(BOUNDS.bodies / 2);
    expect(Math.abs((counted[2] ?? NaN) - (counted[0] ?? NaN))).toBeLessThanOrEqual(BOUNDS.bodies / 2);
    expect(Math.max(...counted)).toBeLessThanOrEqual(3 + 3 * BOUNDS.bodies);
  });

  it("draws the fixed places with no file at all: gno.land's star and the Earth", async () => {
    const scene = made();
    await shown(scene, []);
    expect(scene.cosmos.stats().stars).toBe(1);
    expect(globes.build).toHaveBeenCalledTimes(1);
    expect(scene.cosmos.stats().earth).toBe(true);
  });

  it("gives each body the look of its world and its size", async () => {
    const scene = made();
    await shown(scene);
    const known = new Map(held(worlds(30)).flatMap(({ worlds: list }) => list.map((world) => [world.id, world])));
    const { list } = scene.cosmos.stats();
    expect(list.length).toBeGreaterThan(5);
    for (const body of list) {
      expect(body.anchor).toBe(worldLook(body.id).anchor);
      expect(body.planet.group.scale.x).toBeGreaterThan(0.5);
      expect(body.planet.group.scale.x).toBeLessThanOrEqual((known.get(body.id)?.radius ?? 0) * GROWTH + 1e-9);
    }
  });

  it("sizes a body by its use: a world of more callers stands larger", async () => {
    const scene = made();
    const busy = [{ id: "a/busy", namespace: "a", realms: [{ callers: 900 }] }];
    const quiet = [{ id: "a/quiet", namespace: "a", realms: [{ callers: 0 }] }];
    await shown(scene, [...busy, ...quiet]);
    const size = (id: string) => scene.cosmos.stats().list.find((body) => body.id === id)?.planet.group.scale.x ?? NaN;
    expect(size("a/busy")).toBeGreaterThan(size("a/quiet"));
  });

  it("lights a far body from where its star stands on screen, near the eye, so its whole disc reads", async () => {
    const scene = made();
    await shown(scene);
    for (const { at, star, sun } of scene.cosmos.stats().list) {
      const toEye = at.clone().negate().normalize();
      const toStar = star.clone().sub(at).normalize();
      const flat = (of: Vector3) => of.clone().addScaledVector(toEye, -of.dot(toEye)).normalize();
      expect(flat(sun).dot(flat(toStar))).toBeGreaterThan(0.999);
      expect(sun.angleTo(toEye)).toBeCloseTo(FAR_ANGLE, 6);
    }
  });

  it("leans every body by what the eye sees: no pole towards it, a ring open 30 degrees at most", async () => {
    const scene = made();
    await shown(scene, worlds(40, 4));
    const { list } = scene.cosmos.stats();
    for (const { at, planet } of list) {
      const seen = Math.atan2(at.y, -at.z);
      expect(Math.abs(planet.group.rotation.x - seen)).toBeLessThanOrEqual((30 * Math.PI) / 180 + 1e-9);
    }
  });

  it("softens a far body's limb: the Earth's bright band fits no pixel at this size, and draws a hard line", async () => {
    const scene = made();
    await shown(scene);
    const aired = scene.cosmos.stats().list.filter(({ planet }) => planet.look.rim !== null);
    expect(aired.length).toBeGreaterThan(0);
    for (const { planet, star } of aired) {
      const limb = vi.spyOn(planet, "setLimb");
      scene.cosmos.tick(HOME, 0);
      expect(limb.mock.lastCall?.[0]).toBeCloseTo(limbAt(star.length()), 6);
      expect(limb.mock.lastCall?.[0]).toBeLessThan(LIMB_LIGHT / 2);
    }
  });

  it("hands the Earth one faint line for its ring, and frees it with the Earth", async () => {
    const globe = fakeGlobe();
    globes.build.mockImplementation(() => Promise.resolve(globe));
    const scene = made();
    await shown(scene);
    const line = globe.stand.mock.lastCall?.[1] as LineLoop<BufferGeometry, LineBasicMaterial>;
    expect(line).toBeInstanceOf(LineLoop);
    expect(line.material.opacity).toBeCloseTo(0.22, 6);
    const freed = [vi.spyOn(line.geometry, "dispose"), vi.spyOn(line.material, "dispose")];
    scene.owner.dispose();
    for (const spy of freed) expect(spy).toHaveBeenCalledOnce();
  });

  it("rests the Earth's Moon out at the ring's left end, as frame 4's", async () => {
    const globe = fakeGlobe();
    globes.build.mockImplementation(() => Promise.resolve(globe));
    const scene = made();
    await shown(scene);
    expect(globe.setMoon).toHaveBeenLastCalledWith(MOON_FAR);
  });

  it("grows a far body, and keeps its true size in the ladder", async () => {
    const scene = made();
    await shown(scene);
    const known = new Map(held(worlds(30)).flatMap(({ worlds: list }) => list.map((world) => [world.id, world])));
    for (const { id, star, planet } of scene.cosmos.stats().list)
      expect(planet.group.scale.x / (known.get(id)?.radius ?? NaN)).toBeCloseTo(growthAt(star.length()), 6);
  });

  it("gives a body the world's own angle up close, the night side marked", async () => {
    const scene = made();
    await shown(scene, worlds(1, 1));
    const body = scene.cosmos.stats().list[0];
    const place = { x: NaN, y: NaN, z: NaN };
    toScene(held(worlds(1, 1)).find(({ worlds: list }) => list.length > 0)?.place ?? HOME, place);
    scene.cosmos.tick({ x: place.x + 1, y: place.y + 1, z: place.z + 4 }, 0);
    await settled();
    const toEye = (body?.at ?? new Vector3()).clone().negate().normalize();
    expect(body?.sun.angleTo(toEye)).toBeGreaterThan(1.19);
  });

  it("opens a far system: a world stands further from its star than its true orbit, the same way round", async () => {
    const scene = made();
    await shown(scene);
    const known = new Map(
      held(worlds(30)).flatMap((system) => system.worlds.map((world) => [world.id, { system, world }])),
    );
    const { list } = scene.cosmos.stats();
    for (const { id, at, star } of list) {
      const found = known.get(id);
      if (found === undefined) throw new Error("no world");
      const opened = at.distanceTo(star);
      expect(opened / found.world.orbit).toBeCloseTo(spreadAt(star.length()), 6);
    }
  });

  it("is seen from the arrival: the camera stays at the origin, and the bodies come to it near the middle of the view", async () => {
    const scene = made();
    await shown(scene);
    const { list } = scene.cosmos.stats();
    expect(Math.max(...list.map(({ at }) => at.length()))).toBeLessThan(200);
    expect(list.some(({ at }) => at.z < 0)).toBe(true);
  });

  it("sends only additive glow through the sun's draw, at depth tested so a world before a star covers it", async () => {
    const scene = made();
    await shown(scene);
    const [mesh] = glows(scene);
    expect(mesh?.material.blending).toBe(AdditiveBlending);
    expect(mesh?.material.depthWrite).toBe(false);
    expect(mesh?.material.depthTest).toBe(true);
    expect(mesh?.frustumCulled).toBe(false);
  });

  it("tells the instances how many to draw, so what the ladder left out costs nothing", async () => {
    const scene = made();
    await shown(scene);
    const [mesh] = glows(scene);
    expect(mesh?.geometry.instanceCount).toBe(scene.cosmos.stats().stars);
    const [points] = dots(scene);
    expect(points?.geometry.drawRange.count).toBe(scene.cosmos.stats().dots);
  });

  it("writes each world as a point of its own look's colour, around its star", async () => {
    const scene = made();
    await shown(scene);
    const [points] = dots(scene);
    const { dots: count } = scene.cosmos.stats();
    const tint = points?.geometry.getAttribute("aTint") as BufferAttribute;
    const orbit = points?.geometry.getAttribute("aOrbit") as BufferAttribute;
    const colours = new Set<string>();
    for (let at = 0; at < count; at += 1) {
      expect(tint.getX(at) + tint.getY(at) + tint.getZ(at)).toBeGreaterThan(0.002);
      expect(orbit.getX(at)).toBeGreaterThan(1);
      colours.add(`${String(tint.getX(at))}/${String(tint.getY(at))}`);
    }
    expect(colours.size).toBeGreaterThan(3);
  });

  it("reads the points' size for the journeys as the mean of all it wrote, not the first world's", async () => {
    const scene = made();
    await shown(scene, worlds(30, 6));
    const [points] = dots(scene);
    const size = points?.geometry.getAttribute("aSize") as BufferAttribute;
    const { dots: count, dotPixels } = scene.cosmos.stats();
    const sizes = Array.from({ length: count }, (_, at) => size.getX(at));
    expect(new Set(sizes.map((one) => one.toFixed(3))).size).toBeGreaterThan(1);
    expect(dotPixels).toBeCloseTo(sizes.reduce((sum, one) => sum + one, 0) / count, 6);
  });

  it("writes a point's size from the ladder, so it falls as the eye leaves: no size of its own", async () => {
    const scene = made();
    await shown(scene);
    const near = scene.cosmos.stats().dotPixels;
    scene.cosmos.tick({ x: HOME.x, y: HOME.y + 150, z: HOME.z + 150 }, 0);
    await settled();
    const far = scene.cosmos.stats().dotPixels;
    expect(near).toBeGreaterThan(1);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(near);
  });

  it("never punches a hole in the light: a rock is soft and lets a share of the glow through", async () => {
    const scene = made();
    await shown(scene);
    const [belt] = rocks(scene);
    expect(belt?.material).toMatchObject({ transparent: true, depthWrite: false });
  });

  it("writes a crowd's grain warm, dim and of varied sizes, never white", async () => {
    const scene = made();
    const crowd = Array.from({ length: 120 }, (_, at) => ({
      id: `c/w${String(at)}`,
      namespace: "c",
      realms: [{ callers: null }],
    }));
    await shown(scene, crowd);
    const [points] = dots(scene);
    const { dots: count } = scene.cosmos.stats();
    const tint = points?.geometry.getAttribute("aTint") as BufferAttribute;
    const size = points?.geometry.getAttribute("aSize") as BufferAttribute;
    const sizes = new Set<string>();
    expect(count).toBeGreaterThan(100);
    for (let at = 0; at < count; at += 1) {
      expect(tint.getX(at)).toBeGreaterThan(tint.getZ(at));
      expect(tint.getX(at)).toBeLessThan(0.6);
      sizes.add(size.getX(at).toFixed(2));
    }
    expect(sizes.size).toBeGreaterThan(8);
  });

  it("gives a far belt its rocks, one draw, outside every world's orbit and inside its system's room", async () => {
    const scene = made();
    const list = worlds(30);
    await shown(scene, list);
    const [belt] = rocks(scene);
    if (belt === undefined) throw new Error("no belt");
    expect(rocks(scene)).toHaveLength(1);
    const { rocks: count } = scene.cosmos.stats();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(BOUNDS.rocks);
    expect(belt.geometry.drawRange.count).toBe(count);
    expect(belt.frustumCulled).toBe(false);
    const stars = belt.geometry.getAttribute("aStar") as BufferAttribute;
    const places = belt.geometry.getAttribute("position") as BufferAttribute;
    const sizes = belt.geometry.getAttribute("aSize") as BufferAttribute;
    const eye = { x: NaN, y: NaN, z: NaN };
    toMap(HOME, eye);
    for (let at = 0; at < count; at += 1) {
      expect(sizes.getX(at)).toBeLessThanOrEqual(3.6);
      const star = new Vector3(stars.getX(at), stars.getY(at), stars.getZ(at));
      const spread = spreadAt(star.distanceTo(new Vector3(eye.x, eye.y, eye.z)));
      const away = new Vector3(places.getX(at), places.getY(at), places.getZ(at)).distanceTo(star);
      expect(away / spread).toBeGreaterThanOrEqual(BELT_INNER - 0.2);
      expect(away / spread).toBeLessThanOrEqual(ROOM + 0.2);
    }
  });
});

describe("the page's text keeps its room", () => {
  const WHOLE = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT };

  it("hides a body whose edge alone crosses the box", async () => {
    const scene = made();
    await shown(scene);
    const body = scene.cosmos.stats().screen.bodies.find(({ x, radius }) => x - radius > 100 && radius > 8);
    if (body === undefined) throw new Error("no body clear of the left");
    scene.cosmos.keepClear({ left: 0, top: 0, right: body.x - body.radius * 0.5, bottom: HEIGHT });
    scene.cosmos.tick(HOME, 0);
    const still = scene.cosmos.stats().screen.bodies.find(({ x, y }) => Math.hypot(x - body.x, y - body.y) < 1);
    expect(still).toBeUndefined();
  });

  it("puts out every body and point under the box, and every star but a faint one", async () => {
    const scene = made();
    scene.cosmos.keepClear(WHOLE);
    await shown(scene, worlds(30, 12));
    const onView = scene.cosmos.stats().list.filter(({ at }) => {
      const { x, y } = at.clone().project(scene.camera);
      return Math.abs(x) < 0.99 && Math.abs(y) < 0.99;
    });
    expect(onView.length).toBeGreaterThan(0);
    for (const { planet } of onView) expect(planet.group.visible).toBe(false);
    const [points] = dots(scene);
    const size = points?.geometry.getAttribute("aSize") as BufferAttribute;
    const put = Array.from({ length: scene.cosmos.stats().dots }, (_, at) => size.getY(at));
    expect(put.filter((light) => light === 0).length).toBeGreaterThan(20);
  });

  it("keeps a star's heart out of the box: under it, a little of the halo and no core", async () => {
    const scene = made();
    scene.cosmos.keepClear(WHOLE);
    await shown(scene, []);
    const [mesh] = glows(scene);
    const sun = mesh?.geometry.getAttribute("aSun") as InstancedBufferAttribute;
    expect(sun.getW(0)).toBeCloseTo(0.1, 6);
  });

  it("takes a star's size into the box's reach: a heart beside the digit is under it", async () => {
    const scene = made();
    await shown(scene, []);
    const { x: sunX } = scene.cosmos.stats().screen.sun;
    scene.cosmos.keepClear({ left: 0, top: 0, right: sunX - 20, bottom: HEIGHT });
    scene.cosmos.tick(HOME, 0);
    await settled();
    const [mesh] = glows(scene);
    const sun = mesh?.geometry.getAttribute("aSun") as InstancedBufferAttribute;
    expect(sun.getW(0)).toBeLessThan(0.2);
  });

  it("leaves what stands clear of it whole", async () => {
    const scene = made();
    scene.cosmos.keepClear({ left: 0, top: 0, right: 1, bottom: 1 });
    await shown(scene);
    const visible = scene.cosmos.stats().list.filter(({ planet }) => planet.group.visible);
    expect(visible.length).toBeGreaterThan(5);
  });

  it("shrinks a body by degrees as it nears the box, never over its own size", async () => {
    const scene = made();
    await shown(scene);
    const free = new Map(scene.cosmos.stats().list.map(({ id, planet }) => [id, planet.group.scale.x]));
    scene.cosmos.keepClear({ left: 0, top: 0, right: WIDTH / 2, bottom: HEIGHT });
    scene.cosmos.tick(HOME, 0);
    for (const { id, planet } of scene.cosmos.stats().list)
      expect(planet.group.scale.x).toBeLessThanOrEqual(free.get(id) ?? 0);
  });

  it("looks again when the box moves", async () => {
    const scene = made();
    await shown(scene);
    const { looks } = scene.cosmos.stats();
    scene.cosmos.keepClear(WHOLE);
    scene.cosmos.tick(HOME, 0);
    await settled();
    expect(scene.cosmos.stats().looks).toBe(looks + 1);
  });
});

describe("a look costs a step, never a frame", () => {
  const eyeAt = (x: number): Point => ({ x: HOME.x + x, y: HOME.y, z: HOME.z });

  it("does not look again for a small step: a frame writes no buffer", async () => {
    const scene = made();
    await shown(scene);
    const { looks } = scene.cosmos.stats();
    const [mesh] = glows(scene);
    const written = (mesh?.geometry.getAttribute("aAt") as InstancedBufferAttribute).version;
    for (let step = 1; step <= 20; step += 1) scene.cosmos.tick(eyeAt(step * 0.05), step / 60);
    await settled();
    expect(scene.cosmos.stats().looks).toBe(looks);
    expect((mesh?.geometry.getAttribute("aAt") as InstancedBufferAttribute).version).toBe(written);
  });

  it("shows a small step all the same: what is drawn comes to the eye, without a look", async () => {
    const scene = made();
    await shown(scene);
    const before = scene.cosmos.stats().list.map(({ at }) => at.clone());
    const [mesh] = glows(scene);
    const held_ = mesh?.parent?.position.clone();
    scene.cosmos.tick(eyeAt(0.25), 0);
    scene.cosmos.stats().list.forEach(({ at }, index) => {
      expect(at.x).toBeCloseTo((before[index]?.x ?? NaN) - 0.25, 6);
      expect(at.y).toBeCloseTo(before[index]?.y ?? NaN, 6);
    });
    expect(mesh?.parent?.position.x).toBeCloseTo((held_?.x ?? NaN) - 0.25, 6);
  });

  it("looks again past its step, once, and off the frame", async () => {
    const scene = made();
    await shown(scene);
    const { looks } = scene.cosmos.stats();
    scene.cosmos.tick(eyeAt(30), 1);
    scene.cosmos.tick(eyeAt(30.1), 1.1);
    expect(scene.cosmos.stats().looks).toBe(looks);
    await settled();
    expect(scene.cosmos.stats().looks).toBe(looks + 1);
  });

  it("owes a frame after a look, for what it wrote is not on the screen", async () => {
    const scene = made();
    await shown(scene);
    scene.moved.mockClear();
    scene.cosmos.tick(eyeAt(30), 1);
    await settled();
    expect(scene.moved).toHaveBeenCalled();
  });

  it("frees a body that left the ladder, its materials with it, and keeps the shared maps", async () => {
    const scene = made();
    await shown(scene);
    const before = scene.cosmos.stats().list;
    const planet = before[0]?.planet;
    if (planet === undefined) throw new Error("no body");
    const left = vi.spyOn(planet, "dispose");
    const shared = vi.spyOn(Texture.prototype, "dispose");
    const { maps: kept } = scene.cosmos.stats();
    scene.cosmos.tick({ x: HOME.x + 5000, y: HOME.y, z: HOME.z }, 1);
    await settled();
    expect(scene.cosmos.stats().bodies).toBe(0);
    expect(left).toHaveBeenCalledOnce();
    expect(shared).not.toHaveBeenCalled();
    expect(scene.cosmos.stats().maps).toBe(kept);
    shared.mockRestore();
  });

  it("poses a new body at once: one that stood at the eye a frame would fill the screen", async () => {
    const scene = made();
    scene.cosmos.show(worlds(5));
    scene.cosmos.tick(HOME, 0);
    await settled();
    const { list } = scene.cosmos.stats();
    expect(list.length).toBeGreaterThan(0);
    for (const { at } of list) expect(at.length()).toBeGreaterThan(5);
  });

  it("reuses a body the ladder keeps: no new material for a step", async () => {
    const scene = made();
    await shown(scene);
    const before = scene.cosmos.stats().list[0]?.planet;
    scene.cosmos.tick(eyeAt(5), 1);
    await settled();
    expect(scene.cosmos.stats().list.map(({ planet }) => planet)).toContain(before);
  });

  it("turns a body with the seconds it is given: a still clock, a still world", async () => {
    const scene = made();
    await shown(scene);
    const { list } = scene.cosmos.stats();
    const places = list.map(({ at }) => at.clone());
    scene.cosmos.tick(HOME, 0);
    expect(scene.cosmos.stats().list.map(({ at }) => at)).toEqual(places);
    scene.cosmos.tick(HOME, 30);
    expect(scene.cosmos.stats().list.map(({ at }) => at)).not.toEqual(places);
  });
});

describe("its Earth", () => {
  it("stands one Earth however a context's return and the file cross its build (F3571)", async () => {
    const builds: ((globe: FakeGlobe) => void)[] = [];
    const made_ = [] as FakeGlobe[];
    globes.build.mockImplementation(
      () =>
        new Promise<FakeGlobe>((done) => {
          builds.push(done);
        }),
    );
    const scene = made();
    scene.cosmos.show([]);
    scene.cosmos.restored();
    const first = fakeGlobe();
    builds[0]?.(first);
    await settled();
    scene.cosmos.show(worlds(5));
    for (const build of builds.slice(1)) {
      const globe = fakeGlobe();
      made_.push(globe);
      build(globe);
    }
    await settled();
    const onStage = [first, ...made_].filter((globe) => globe.group.parent !== null);
    expect(onStage).toHaveLength(1);
    expect(first.dispose).toHaveBeenCalledOnce();
  });

  it("goes with the maps after five minutes covered, and comes back with the page", async () => {
    const globe = fakeGlobe();
    globes.build.mockImplementation(() => Promise.resolve(globe));
    const scene = made();
    await shown(scene);
    scene.cosmos.show(undefined);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    expect(globe.dispose).toHaveBeenCalledOnce();
    expect(scene.cosmos.stats().earth).toBe(false);
    await shown(scene);
    expect(globes.build).toHaveBeenCalledTimes(2);
  });

  it("says it stood once, for the Auto probe to time what the home draws", async () => {
    const scene = made();
    await shown(scene);
    expect(scene.stood).toHaveBeenCalledOnce();
    scene.cosmos.show(undefined);
    await shown(scene);
    expect(scene.stood).toHaveBeenCalledOnce();
  });
});

describe("its programs, compiled ahead", () => {
  it("keeps the disc off the screen until its programs are ready", async () => {
    const waiting: (() => void)[] = [];
    const ready = () => {
      for (const go of waiting) go();
    };
    const scene = made();
    scene.renderer.compileAsync.mockImplementation(
      () =>
        new Promise((done) => {
          waiting.push(() => {
            done(scene.stage);
          });
        }),
    );
    scene.cosmos.show(worlds(5));
    scene.cosmos.tick(HOME, 0);
    await settled();
    const [mesh] = glows(scene);
    expect(mesh?.parent?.visible).toBe(false);
    expect(scene.renderer.compileAsync).toHaveBeenCalled();
    ready();
    await settled();
    expect(mesh?.parent?.visible).toBe(true);
  });

  it("shows a new body only once its programs are ready", async () => {
    const waiting: (() => void)[] = [];
    const scene = made();
    scene.renderer.compileAsync.mockImplementation(
      () =>
        new Promise((done) => {
          waiting.push(() => {
            done(scene.stage);
          });
        }),
    );
    scene.cosmos.show(worlds(5));
    scene.cosmos.tick(HOME, 0);
    await settled();
    scene.cosmos.tick(HOME, 0);
    const { list } = scene.cosmos.stats();
    expect(list.length).toBeGreaterThan(0);
    for (const { planet } of list) expect(planet.group.visible).toBe(false);
    for (const go of waiting) go();
    await settled();
    scene.cosmos.tick(HOME, 0);
    expect(scene.cosmos.stats().list.some(({ planet }) => planet.group.visible)).toBe(true);
  });
});

describe("hidden, and gone", () => {
  it("asks no map and takes no look while hidden after its release", async () => {
    const scene = made();
    await shown(scene);
    scene.cosmos.show(undefined);
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    const [asked, { looks }] = [maps.load.mock.calls.length, scene.cosmos.stats()];
    scene.cosmos.tick({ x: HOME.x + 40, y: HOME.y, z: HOME.z }, 3);
    await settled();
    expect(maps.load.mock.calls.length).toBe(asked);
    expect(scene.cosmos.stats().looks).toBe(looks);
  });

  it("builds no Earth when a context comes back while it is hidden", async () => {
    const scene = made();
    await shown(scene);
    scene.cosmos.show(undefined);
    const built = globes.build.mock.calls.length;
    scene.cosmos.restored();
    await settled();
    expect(globes.build.mock.calls.length).toBe(built);
  });

  it("writes nothing for a look still pending when it goes", async () => {
    const scene = made();
    await shown(scene);
    const { looks } = scene.cosmos.stats();
    scene.cosmos.tick({ x: HOME.x + 40, y: HOME.y, z: HOME.z }, 1);
    scene.owner.dispose();
    await settled();
    expect(scene.cosmos.stats().looks).toBe(looks);
  });

  it("takes a body that left the ladder out of the scene, not only its materials", async () => {
    const scene = made();
    await shown(scene);
    const before = parts(scene).length;
    const { planet } = scene.cosmos.stats().list[0] ?? {};
    scene.cosmos.tick({ x: HOME.x + 5000, y: HOME.y, z: HOME.z }, 1);
    await settled();
    expect(planet?.group.parent).toBeNull();
    expect(parts(scene).length).toBeLessThan(before);
  });

  it("sends the suns' light to the GPU at each look", async () => {
    const scene = made();
    await shown(scene);
    const [mesh] = glows(scene);
    const light = mesh?.geometry.getAttribute("aSun") as InstancedBufferAttribute;
    const version = light.version;
    scene.cosmos.tick({ x: HOME.x + 30, y: HOME.y, z: HOME.z }, 1);
    await settled();
    expect(light.version).toBeGreaterThan(version);
  });

  it("frees an Earth that comes after it went, whatever its build did with the signal", async () => {
    let arrive: (globe: FakeGlobe) => void = () => undefined;
    globes.build.mockImplementation(
      () =>
        new Promise<FakeGlobe>((done) => {
          arrive = done;
        }),
    );
    const scene = made();
    scene.cosmos.show(worlds(5));
    scene.owner.dispose();
    const late = fakeGlobe();
    arrive(late);
    await settled();
    expect(late.dispose).toHaveBeenCalledOnce();
  });

  it("turns the points' clock and the Earth with the seconds it is given, and lights the Earth from the great star", async () => {
    const globe = fakeGlobe();
    globes.build.mockImplementation(() => Promise.resolve(globe));
    const scene = made();
    await shown(scene);
    scene.cosmos.tick(HOME, 12);
    const [points] = dots(scene);
    expect(points?.material.uniforms["uSeconds"]?.value).toBe(12);
    expect(globe.setTurn).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number));
    const [turn] = globe.setTurn.mock.lastCall as [number, number];
    scene.cosmos.tick(HOME, 24);
    expect((globe.setTurn.mock.lastCall as [number, number])[0]).not.toBe(turn);
    expect(globe.aim).toHaveBeenCalledOnce();
    expect(globe.setSun).toHaveBeenCalledOnce();
  });
});

describe("its maps", () => {
  it("asks a body's maps only: never the whole set for a few worlds", async () => {
    const scene = made();
    await shown(scene, worlds(1, 1));
    const asked = maps.load.mock.calls.map(([url]) => nameOf(url as string));
    const look = worldLook("n0/w0");
    expect(asked).toContain(look.map);
    expect(asked).toContain("clouds");
    expect(asked).toContain("ring");
    expect(new Set(asked).size).toBeLessThanOrEqual(4);
  });

  it("asks each map once, at 2048: a body of a few dozen pixels is not the close view", async () => {
    const scene = made();
    await shown(scene);
    const asked = maps.load.mock.calls.map(([url]) => url as string);
    expect(new Set(asked).size).toBe(asked.length);
    const widths = maps.load.mock.calls.flatMap(([url, options]) =>
      nameOf(url as string) === "ring" ? [] : [(options as { width?: number }).width],
    );
    expect(new Set(widths)).toEqual(new Set([2048]));
  });

  it("halves them where memory is short", async () => {
    const scene = made();
    const small = new Cosmos({
      renderer: scene.renderer,
      stage: scene.stage,
      camera: scene.camera,
      halved: () => true,
      base: "/",
      moved: scene.moved,
      stood: vi.fn(),
    });
    small.resize(HEIGHT, 1);
    small.show(worlds(5));
    small.tick(HOME, 0);
    await settled();
    const widths = maps.load.mock.calls.flatMap(([url, options]) =>
      nameOf(url as string) === "ring" ? [] : [(options as { width?: number }).width],
    );
    expect(new Set(widths)).toEqual(new Set([1024]));
    small.dispose();
  });

  it("uploads every map before a body shows it, so nothing stalls a frame", async () => {
    const order: string[] = [];
    const add = vi.spyOn(Object3D.prototype, "add");
    const scene = made();
    scene.renderer.initTexture.mockImplementation((texture: Texture) => order.push(`up ${texture.name}`));
    add.mockImplementation(function added(this: Object3D, ...objects: Object3D[]) {
      for (const object of objects) {
        const material = (object.children[0] as Mesh<never, ShaderMaterial> | undefined)?.material;
        const surface = material?.uniforms["surface"]?.value as Texture | undefined;
        if (surface !== undefined) order.push(`body ${surface.name}`);
        this.children.push(object);
      }
      return this;
    });
    await shown(scene);
    add.mockRestore();
    const bodies = order.filter((entry) => entry.startsWith("body "));
    expect(bodies.length).toBeGreaterThan(0);
    for (const entry of bodies) {
      const up = order.indexOf(entry.replace("body", "up"));
      expect(up).toBeGreaterThanOrEqual(0);
      expect(up).toBeLessThan(order.indexOf(entry));
    }
  });

  it("leaves a world a point when its map does not come, and the rest stand", async () => {
    maps.load.mockImplementation((url: string) =>
      nameOf(url) === "clouds" ? Promise.reject(new Error("404")) : Promise.resolve(new Texture(IMAGE)),
    );
    const scene = made();
    await shown(scene);
    expect(scene.cosmos.stats().bodies).toBe(0);
    expect(scene.cosmos.stats().dots).toBe(90);
    expect(scene.cosmos.stats().stars).toBe(31);
  });

  it("frees every map once on leaving for good, and stops what is on its way", async () => {
    const free: Texture[] = [];
    maps.load.mockImplementation(() => {
      const texture = new Texture(IMAGE);
      vi.spyOn(texture, "dispose").mockImplementation(() => {
        free.push(texture);
      });
      return Promise.resolve(texture);
    });
    const scene = made();
    await shown(scene);
    const asked = maps.load.mock.calls.length;
    scene.owner.dispose();
    expect(free).toHaveLength(asked);
    expect(new Set(free).size).toBe(asked);
  });

  it("frees its geometry, its materials and the Earth with it, and takes them off the stage", async () => {
    const globe = fakeGlobe();
    globes.build.mockImplementation(() => Promise.resolve(globe));
    const scene = made();
    await shown(scene);
    const owned = parts(scene).filter(
      (object): object is Mesh<InstancedBufferGeometry, ShaderMaterial> =>
        object instanceof Mesh || object instanceof Points,
    );
    const spies = owned.flatMap(({ geometry, material }) => [
      vi.spyOn(geometry, "dispose"),
      vi.spyOn(material, "dispose"),
    ]);
    expect(spies.length).toBeGreaterThan(6);
    scene.owner.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalled();
    expect(globe.dispose).toHaveBeenCalledOnce();
    expect(parts(scene)).toHaveLength(1);
  });

  it("frees the old Earth when a context comes back: one globe at a time", async () => {
    const globe = fakeGlobe();
    globes.build.mockImplementationOnce(() => Promise.resolve(globe));
    const scene = made();
    await shown(scene);
    scene.cosmos.restored();
    expect(globe.dispose).toHaveBeenCalledOnce();
  });
});

describe("hidden", () => {
  it("takes it all off the stage while another page shows, and comes back with no second load", async () => {
    const scene = made();
    await shown(scene);
    const asked = maps.load.mock.calls.length;
    scene.cosmos.show(undefined);
    expect(scene.cosmos.stats().shown).toBe(false);
    const seen: Object3D[] = [];
    scene.stage.traverseVisible((part) => seen.push(part));
    expect(seen.filter((part) => part instanceof Points)).toHaveLength(0);
    scene.cosmos.show(worlds(30));
    await settled();
    expect(maps.load.mock.calls.length).toBe(asked);
    expect(scene.cosmos.stats().shown).toBe(true);
  });

  it("releases the maps after five minutes covered, and takes them again when it comes back", async () => {
    const scene = made();
    scene.cosmos.show(worlds(5));
    scene.cosmos.tick(HOME, 0);
    await settled();
    const asked = maps.load.mock.calls.length;
    scene.cosmos.show(undefined);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1000);
    expect(scene.cosmos.stats().maps).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(scene.cosmos.stats().maps).toBe(0);
    scene.cosmos.show(worlds(5));
    scene.cosmos.tick(HOME, 0);
    await vi.advanceTimersByTimeAsync(100);
    expect(maps.load.mock.calls.length).toBeGreaterThan(asked);
  });

  it("does not release what came back in time", async () => {
    const scene = made();
    scene.cosmos.show(worlds(5));
    scene.cosmos.tick(HOME, 0);
    await settled();
    scene.cosmos.show(undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    scene.cosmos.show(worlds(5));
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(scene.cosmos.stats().maps).toBeGreaterThan(0);
  });

  it("a context come back takes every body again: closed bitmaps cannot be uploaded twice", async () => {
    const scene = made();
    await shown(scene);
    const asked = maps.load.mock.calls.length;
    scene.cosmos.restored();
    scene.cosmos.tick(HOME, 0);
    await settled();
    expect(maps.load.mock.calls.length).toBeGreaterThan(asked);
    expect(globes.build).toHaveBeenCalledTimes(2);
    expect(scene.cosmos.stats().bodies).toBeGreaterThan(0);
  });

  it("leaves nothing on the stage once it is disposed, and a late map frees itself", async () => {
    let arrive: (texture: Texture) => void = () => undefined;
    maps.load.mockImplementationOnce(
      () =>
        new Promise<Texture>((done) => {
          arrive = done;
        }),
    );
    const scene = made();
    scene.cosmos.show(worlds(5));
    scene.cosmos.tick(HOME, 0);
    await settled();
    scene.owner.dispose();
    expect(parts(scene).length).toBe(1);
    const late = new Texture(IMAGE);
    const freed = vi.spyOn(late, "dispose");
    arrive(late);
    await settled();
    expect(freed).toHaveBeenCalledOnce();
  });
});

describe("its nebulae", () => {
  const AFTER_THE_WAIT = 5000;
  const nebulaImages = () =>
    maps.load.mock.calls
      .map(([url]) => nameOf(url as string))
      .filter((name) => NEBULA_IMAGES.some((image) => image === name));
  const sheetsShown = (scene: ReturnType<typeof made>) => {
    const seen: Object3D[] = [];
    scene.stage.traverseVisible((part) => seen.push(part));
    return seen.filter(
      (part) => part instanceof Mesh && "uImage" in ((part.material as Partial<ShaderMaterial>).uniforms ?? {}),
    );
  };
  const lit = async () => {
    const scene = made();
    await shown(scene);
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT);
    scene.cosmos.tick(HOME, 0);
    return scene;
  };

  it("brings them in behind the worlds: none at first, lit once their images came, none while hidden", async () => {
    const scene = made();
    await shown(scene);
    expect(scene.cosmos.stats().nebulae).toBe(0);
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT);
    scene.cosmos.tick(HOME, 0);
    expect(nebulaImages().length).toBeGreaterThan(0);
    expect(scene.cosmos.stats().nebulae).toBeGreaterThan(0);
    expect(sheetsShown(scene).length).toBeGreaterThan(0);
    scene.cosmos.show(undefined);
    expect(scene.cosmos.stats().nebulae).toBe(0);
    expect(sheetsShown(scene)).toHaveLength(0);
  });

  it("darkens them near a world: an eye a little above the disc sees black between the bodies", async () => {
    const scene = await lit();
    expect(scene.cosmos.stats().nebulae).toBeGreaterThan(0);
    const near = { x: 0, y: 0, z: 0 };
    toScene({ x: 0, y: 2, z: 0 }, near);
    scene.cosmos.tick(near, 0);
    expect(scene.cosmos.stats().nebulae).toBe(0);
  });

  it("puts them out past a cluster's distance, where the whole cosmos is the view", async () => {
    const scene = await lit();
    const above = { x: 0, y: 0, z: 0 };
    toScene({ x: 0, y: 700, z: 0 }, above);
    scene.cosmos.tick(above, 0);
    expect(scene.cosmos.stats().nebulae).toBe(0);
  });

  it("frees their images with the maps after five minutes covered, not before", async () => {
    const free: string[] = [];
    maps.load.mockImplementation((url: string) => {
      const texture = new Texture(IMAGE);
      vi.spyOn(texture, "dispose").mockImplementation(() => {
        free.push(nameOf(url));
      });
      return Promise.resolve(texture);
    });
    const scene = made();
    await shown(scene);
    await vi.advanceTimersByTimeAsync(AFTER_THE_WAIT);
    expect(nebulaImages().length).toBeGreaterThan(0);
    scene.cosmos.show(undefined);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1000);
    for (const image of nebulaImages()) expect(free).not.toContain(image);
    await vi.advanceTimersByTimeAsync(2000);
    for (const image of nebulaImages()) expect(free).toContain(image);
  });
});
