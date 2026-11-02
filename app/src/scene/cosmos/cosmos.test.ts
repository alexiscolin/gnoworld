import {
  asciiBytes,
  BELT_INNER,
  BOUNDS,
  CENTRE,
  EARTH_PLACE,
  glideAt,
  GRAIN,
  HOME,
  NEBULA_IMAGES,
  offLine,
  onScreen,
  planetSeed,
  postcardOf,
  restView,
  ROOM,
  systemsOf,
  toScene,
  worldLook,
  type Orbiter,
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
  Euler,
  Quaternion,
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
import { fromEyeOf, starAt } from "../planet/light.ts";
import { LIMB_LIGHT } from "../planet/planet.ts";
import recorded from "../../../lab/worlds.json" with { type: "json" };
import { Cosmos, type CosmosWorld } from "./cosmos.ts";
import { angleAt, limbAt } from "./far.ts";

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
  readonly lean: Euler;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly aim: ReturnType<typeof vi.fn>;
  readonly setSun: ReturnType<typeof vi.fn>;
  readonly setTurn: ReturnType<typeof vi.fn>;
  readonly setMoon: ReturnType<typeof vi.fn>;
  readonly stand: ReturnType<typeof vi.fn>;
}

// The Earth's own lean and tilt, as its look gives them (earth/look.ts): the light must reach the ground past them.
const fakeGlobe = (): FakeGlobe => ({
  group: new Stage(),
  lean: new Euler(0.1, 0, -0.14),
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

function made(width = WIDTH, height = HEIGHT) {
  const stage = new Stage();
  const camera = new PerspectiveCamera(50, width / height, 0.1, 2000);
  const owner = new Disposer();
  const moved = vi.fn();
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 16 },
    initTexture: vi.fn(),
    compileAsync: vi.fn((scene: Object3D) => Promise.resolve(scene)),
  };
  const stood = vi.fn();
  const cosmos = owner.add(new Cosmos({ renderer, stage, camera, halved: () => false, base: "/", moved, stood }));
  cosmos.resize(height, 1);
  return { stage, camera, owner, moved, renderer, cosmos, stood };
}

// A look runs off the frame, and maps load behind it: every task due is run, none guessed at.
// The view at rest's search comes in a chunk of its own: what it imports is let in first.
const settled = async () => {
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(100);
};
const shown = async (made_: ReturnType<typeof made>, list: readonly CosmosWorld[] = worlds(30)) => {
  made_.cosmos.show(list);
  made_.cosmos.tick(HOME, 0);
  await settled();
  made_.cosmos.tick(HOME, 0);
  await settled();
};
// Each system's plane as the view at rest draws it: a postcard's opened towards the eye if need be, any other's its own.
const drawnPlanes = (systems: readonly StarSystem[]) => {
  const view = restView(systems);
  return (system: StarSystem): StarSystem =>
    view.postcards.includes(systems.indexOf(system)) ? postcardOf(system, view.eye).system : system;
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
// Onyx's 533 worlds in 91 systems, grouped by the server's code: the real file the home draws.
const ONYX: readonly CosmosWorld[] = recorded.worlds;
const systemOf = (systems: readonly StarSystem[], id: string) =>
  systems.find(({ worlds: list }) => list.some((world) => world.id === id));
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
    // The view at rest draws three systems' bodies at most (7d6): every other system is a distant star.
    expect(bodies).toBeGreaterThan(0);
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
    // The view at rest draws its postcards' and its close world's bodies, a few (Alexis, 2026-11-02).
    expect(list.length).toBeGreaterThan(0);
    for (const body of list) {
      expect(body.anchor).toBe(worldLook(body.id).anchor);
      expect(body.planet.group.scale.x).toBeGreaterThanOrEqual(GRAIN);
      expect(body.planet.group.scale.x).toBeLessThanOrEqual((known.get(body.id)?.radius ?? 0) + 1e-9);
    }
  });

  it("sizes a body by its use: a world of more callers stands larger", async () => {
    const scene = made();
    const busy = [{ id: "a/busy", namespace: "a", realms: [{ callers: 900 }] }];
    const quiet = [{ id: "a/quiet", namespace: "a", realms: [{ callers: 0 }] }];
    await shown(scene, [...busy, ...quiet]);
    // Up close to their star, where both stand as bodies whatever the view at rest draws.
    const place = { x: NaN, y: NaN, z: NaN };
    toScene(held([...busy, ...quiet]).find(({ worlds: list }) => list.length > 0)?.place ?? HOME, place);
    scene.cosmos.tick({ x: place.x + 1, y: place.y + 2, z: place.z + 8 }, 0);
    await settled();
    const size = (id: string) => scene.cosmos.stats().list.find((body) => body.id === id)?.planet.group.scale.x ?? NaN;
    expect(size("a/busy")).toBeGreaterThan(size("a/quiet"));
  });

  it("lights a body from where its star stands on screen, at its distance's angle, so its whole disc reads from afar", async () => {
    const scene = made();
    await shown(scene);
    const { list } = scene.cosmos.stats();
    expect(list.length).toBeGreaterThan(0);
    for (const { id, at, star, sun } of list) {
      const toEye = at.clone().negate().normalize();
      const toStar = star.clone().sub(at).normalize();
      const flat = (of: Vector3) => of.clone().addScaledVector(toEye, -of.dot(toEye)).normalize();
      expect(flat(sun).dot(flat(toStar))).toBeGreaterThan(0.999);
      const fromEye = fromEyeOf(planetSeed(asciiBytes(`gno.land/r/${id}`)));
      expect(sun.angleTo(toEye)).toBeCloseTo(angleAt(fromEye, star.length()), 6);
    }
  });

  it("leans every body by what the eye sees, the camera's way round: no pole towards it, a ring open 30 degrees at most", async () => {
    const scene = made();
    await shown(scene, worlds(40, 4));
    const { list } = scene.cosmos.stats();
    const back = scene.camera.quaternion.clone().invert();
    for (const { at, planet } of list) {
      const seenFrom = at.clone().applyQuaternion(back);
      const seen = Math.atan2(seenFrom.y, -seenFrom.z);
      const lean = planet.group.quaternion.clone().premultiply(back);
      const pole = new Vector3(0, 1, 0).applyQuaternion(lean);
      // The pole leans `seen` plus the look's own lean, 30 degrees at most, in the view's upright plane.
      expect(Math.abs(Math.atan2(pole.z, pole.y) - seen)).toBeLessThanOrEqual((30 * Math.PI) / 180 + 1e-6);
    }
  });

  it("softens a far body's limb: the Earth's bright band fits no pixel at this size, and draws a hard line", async () => {
    const scene = made();
    await shown(scene);
    const aired = scene.cosmos.stats().list.filter(({ planet }) => planet.look.rim !== null);
    expect(aired.length).toBeGreaterThan(0);
    const limbs = aired.map(({ planet, star }) => {
      const limb = vi.spyOn(planet, "setLimb");
      scene.cosmos.tick(HOME, 0);
      expect(limb.mock.lastCall?.[0]).toBeCloseTo(limbAt(star.length()), 6);
      return { away: star.length(), limb: limb.mock.lastCall?.[0] ?? NaN };
    });
    const farthest = limbs.reduce((far, one) => (one.away > far.away ? one : far));
    expect(farthest.limb).toBeLessThan(LIMB_LIGHT / 2);
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

  // The chief, 2026-11-02: a postcard's bodies spread on one ring round its star, its plane opened towards the eye if seen near its edge;
  // the close world keeps its true orbit and plane.
  it("stands each body round its own star: a postcard's on its ring, in its plane as drawn, the close world at its true orbit", async () => {
    const scene = made();
    await shown(scene);
    const systems = held(worlds(30));
    const view = restView(systems);
    const known = new Map(
      systems.flatMap((system, index) => {
        const postcard = view.postcards.includes(index)
          ? postcardOf(system, view.eye)
          : { system, worlds: system.worlds };
        return postcard.worlds.map((world) => [world.id, { system: postcard.system, world }] as const);
      }),
    );
    const { list } = scene.cosmos.stats();
    expect(list.length).toBeGreaterThan(0);
    for (const { id, at, star } of list) {
      const found = known.get(id);
      if (found === undefined) throw new Error("no world");
      expect(at.distanceTo(star)).toBeCloseTo(found.world.orbit, 6);
      // The plane's normal on the stage: the map's, turned as the disc stands (toScene less its centre).
      const { system } = found;
      const normal = { x: NaN, y: NaN, z: NaN };
      toScene(
        {
          x: -Math.sin(system.node) * Math.sin(system.tilt),
          y: Math.cos(system.tilt),
          z: Math.cos(system.node) * Math.sin(system.tilt),
        },
        normal,
      );
      const across = new Vector3(normal.x - CENTRE.x, normal.y - CENTRE.y, normal.z - CENTRE.z);
      expect(at.clone().sub(star).dot(across)).toBeCloseTo(0, 6);
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
    await shown(scene, worlds(100, 2));
    const [points] = dots(scene);
    const size = points?.geometry.getAttribute("aSize") as BufferAttribute;
    const { dots: count, dotPixels } = scene.cosmos.stats();
    const sizes = Array.from({ length: count }, (_, at) => size.getX(at));
    expect(new Set(sizes.map((one) => one.toFixed(3))).size).toBeGreaterThan(1);
    expect(dotPixels).toBeCloseTo(sizes.reduce((sum, one) => sum + one, 0) / count, 6);
  });

  it("writes a point's size from the ladder, so it falls as the eye leaves: no size of its own", async () => {
    const scene = made();
    await shown(scene, ONYX);
    // Off the view at rest, whose distant stars' worlds glint at a share of their size: two eyes, the second farther out.
    scene.cosmos.tick({ x: HOME.x, y: HOME.y + 30, z: HOME.z + 30 }, 0);
    await settled();
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
    const orbit = points?.geometry.getAttribute("aOrbit") as BufferAttribute;
    // The grain alone: a crowd's worlds of a body's size the view does not stand as bodies are points of their own look.
    const grains = new Set(
      (held(crowd).find(({ id }) => id === "c")?.worlds ?? [])
        .filter(({ radius }) => radius < GRAIN)
        .map(({ phase }) => phase.toFixed(4)),
    );
    const sizes = new Set<string>();
    expect(count).toBeGreaterThan(100);
    for (let at = 0; at < count; at += 1) {
      if (!grains.has(orbit.getY(at).toFixed(4))) continue;
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
    const systems = held(list);
    const planeOf = drawnPlanes(systems);
    for (let at = 0; at < count; at += 1) {
      expect(sizes.getX(at)).toBeLessThanOrEqual(3.6);
      const star = new Vector3(stars.getX(at), stars.getY(at), stars.getZ(at));
      const rock = new Vector3(places.getX(at), places.getY(at), places.getZ(at));
      expect(rock.distanceTo(star)).toBeGreaterThanOrEqual(BELT_INNER - 0.2);
      expect(rock.distanceTo(star)).toBeLessThanOrEqual(ROOM + 0.2);
      // In its system's plane as drawn (a postcard's opened at rest), a thin ring: its offset across the plane under a third of a unit.
      const found = systems.find(({ place }) => star.distanceTo(new Vector3(place.x, place.y, place.z)) < 1e-4);
      if (found === undefined) throw new Error("a rock with no star");
      const system = planeOf(found);
      const normal = new Vector3(
        -Math.sin(system.node) * Math.sin(system.tilt),
        Math.cos(system.tilt),
        Math.cos(system.node) * Math.sin(system.tilt),
      );
      expect(Math.abs(rock.clone().sub(star).dot(normal))).toBeLessThanOrEqual(0.31);
    }
  });

  it("turns each point in its system's plane: the plane's tilt and line of nodes go with it", async () => {
    const scene = made();
    const list = worlds(30);
    await shown(scene, list);
    const [points] = dots(scene);
    const plane = points?.geometry.getAttribute("aPlane") as BufferAttribute;
    const places = points?.geometry.getAttribute("position") as BufferAttribute;
    const systems = held(list);
    const planeOf = drawnPlanes(systems);
    const { dots: count } = scene.cosmos.stats();
    expect(count).toBeGreaterThan(0);
    for (let at = 0; at < count; at += 1) {
      const star = new Vector3(places.getX(at), places.getY(at), places.getZ(at));
      const found = systems.find(({ place }) => star.distanceTo(new Vector3(place.x, place.y, place.z)) < 1e-4);
      const system = found === undefined ? undefined : planeOf(found);
      expect(plane.getX(at)).toBeCloseTo(system?.node ?? NaN, 5);
      expect(plane.getY(at)).toBeCloseTo(system?.tilt ?? NaN, 5);
    }
  });
});

// Alexis, 2026-11-02: "la profondeur existe pour la vue, mais partout ailleurs aussi". Eyes the arrival's search never chose, drawn from a
// seed round the Earth at the cosmos's usual distances, 20 to 60 units, up to 30 degrees over or under the disc. The chief's bar: every eye
// that sees four bodies or more beside the Earth, twenty of them, holds each rule; the others are counted.
const EYES_TRIED = 400;
// The chief, 2026-11-02: 1.9 times, measured; Onyx's second eye, 60 units out, reads 1.993, use making its far worlds larger.
const SIZES_APART = 1.9;
const QUALIFYING = 20;
function seededEyes(seed: number): Point[] {
  let state = seed;
  const next = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  return Array.from({ length: EYES_TRIED }, () => {
    const [distance, slant, turn] = [20 + 40 * next(), ((next() * 60 - 30) * Math.PI) / 180, next() * 2 * Math.PI];
    return {
      x: EARTH_PLACE.x + distance * Math.cos(slant) * Math.sin(turn),
      y: EARTH_PLACE.y + distance * Math.sin(slant),
      z: EARTH_PLACE.z + distance * Math.cos(slant) * Math.cos(turn),
    };
  });
}

// How many pixels each drawn body slides as the eye steps half a unit to its right, its look and the orbits held: parallax alone.
function slides(scene: ReturnType<typeof made>) {
  const right = new Vector3(1, 0, 0).applyQuaternion(scene.camera.quaternion).multiplyScalar(0.5);
  const pixel = (at: Vector3) => {
    const seen = at.clone().project(scene.camera);
    return new Vector3((seen.x * WIDTH) / 2, (seen.y * HEIGHT) / 2, 0);
  };
  return scene.cosmos
    .stats()
    .list.filter(({ planet }) => planet.group.visible)
    .map(({ at }) => ({ away: at.length(), by: pixel(at).distanceTo(pixel(at.clone().sub(right))) }))
    .sort((a, b) => a.away - b.away);
}

describe("depth wherever the eye stands, not only at the arrival", () => {
  it.each([
    ["Onyx", ONYX],
    ["10,000 systems", worlds(10_000, 2)],
  ] as const)(
    "spreads sizes 1.9 times or more, off a line, the near bodies sliding more than the far ones, from twenty eyes on %s",
    async (_, file) => {
      const scene = made();
      await shown(scene, file);
      // The cosmos stands the eye the view at rest's way off the scene's: the scene's eye that puts it at `at`.
      const rest = { x: NaN, y: NaN, z: NaN };
      toScene(restView(held(file)).eye, rest);
      let qualified = 0;
      for (const eye of seededEyes(7)) {
        if (qualified === QUALIFYING) break;
        const at = { x: NaN, y: NaN, z: NaN };
        toScene(eye, at);
        scene.cosmos.tick({ x: at.x - rest.x + HOME.x, y: at.y - rest.y + HOME.y, z: at.z - rest.z + HOME.z }, 0);
        await settled();
        const { earth, bodies: all } = scene.cosmos.stats().screen;
        // The bodies the eye sees: in front of it, on the screen.
        const back = scene.camera.quaternion.clone().invert();
        const ahead = new Set(
          scene.cosmos
            .stats()
            .list.filter(({ at }) => at.clone().applyQuaternion(back).z < 0)
            .map(({ id }) => id),
        );
        const bodies = all.filter(
          ({ id, x, y, radius }) =>
            ahead.has(id) && x + radius > 0 && x - radius < WIDTH && y + radius > 0 && y - radius < HEIGHT,
        );
        if (earth === undefined || bodies.length < 4) continue;
        qualified += 1;
        const sizes = [earth.radius, ...bodies.map(({ radius }) => radius)];
        expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThanOrEqual(SIZES_APART);
        expect(offLine([earth, ...bodies])).toBeGreaterThan(0.1);
        const slid = slides(scene);
        expect(slid[0]?.by ?? 0).toBeGreaterThan(slid.at(-1)?.by ?? Infinity);
      }
      expect(qualified).toBe(QUALIFYING);
    },
  );
});

describe("the view at rest (7d6)", () => {
  it.each([
    [1728, 1080],
    [1920, 1080],
  ])("aims at the Earth: it stands at the canvas's centre, at %i by %i", async (width, height) => {
    const scene = made(width, height);
    await shown(scene, ONYX);
    const { earth } = scene.cosmos.stats().screen;
    expect(earth?.x).toBeCloseTo(width / 2, 1);
    expect(earth?.y).toBeCloseTo(height / 2, 1);
    expect(earth?.radius).toBeGreaterThan(40);
    expect(earth?.radius).toBeLessThan(56);
  });

  it("keeps the Earth at the centre as the eye drifts and leans: the camera follows it", async () => {
    const scene = made();
    await shown(scene, ONYX);
    for (const seconds of [3, 17, 61]) {
      scene.cosmos.tick({ x: HOME.x + 0.4, y: HOME.y - 0.3, z: HOME.z + 1 }, seconds);
      const { earth } = scene.cosmos.stats().screen;
      expect(earth?.x).toBeCloseTo(WIDTH / 2, 1);
      expect(earth?.y).toBeCloseTo(HEIGHT / 2, 1);
    }
  });

  it("draws the bodies of three systems at most, the view's own: two postcards and the close world's", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const view = restView(systems);
    const drawn = new Set(scene.cosmos.stats().list.map(({ id }) => systemOf(systems, id)?.id));
    const chosen = [...view.postcards, ...(view.close === undefined ? [] : [view.close.system])].map(
      (index) => systems[index]?.id,
    );
    expect(drawn.size).toBeLessThanOrEqual(3);
    expect([...drawn].sort()).toEqual([...new Set(chosen)].sort());
  });

  it("draws Onyx's close world cut by the frame's edge, twice the Earth's size or more", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const { close } = restView(systems);
    if (close === undefined) throw new Error("Onyx gives no close world");
    const id = systems[close.system]?.worlds[close.world]?.id;
    const { bodies, earth } = scene.cosmos.stats().screen;
    const spot = bodies.find((body) => body.id === id);
    if (spot === undefined || earth === undefined) throw new Error("the close world is not drawn");
    expect(spot.x - spot.radius < 0 || spot.x + spot.radius > WIDTH).toBe(true);
    expect(spot.radius).toBeGreaterThanOrEqual(2 * earth.radius);
  });

  // Each point drawn, with its system and its world, read back from the buffers: a world is its system's of that orbit and phase.
  const pointsOf = (scene: ReturnType<typeof made>, systems: readonly StarSystem[]) => {
    const [points] = dots(scene);
    const read = (name: string) => points?.geometry.getAttribute(name) as BufferAttribute;
    const [places, orbits, size] = [read("position"), read("aOrbit"), read("aSize")];
    return Array.from({ length: scene.cosmos.stats().dots }, (_, at) => {
      const star = new Vector3(places.getX(at), places.getY(at), places.getZ(at));
      const index = systems.findIndex(({ place }) => star.distanceTo(new Vector3(place.x, place.y, place.z)) < 1e-4);
      const near = ({ orbit, phase }: Orbiter) =>
        Math.abs(orbit - orbits.getX(at)) < 1e-4 && Math.abs(phase - orbits.getY(at)) < 1e-4;
      return { index, star, world: systems[index]?.worlds.find(near), size: size.getX(at) };
    });
  };

  it("leaves every other system a distant star: its worlds glint at an eighth of their size, the close world's system shows none", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const view = restView(systems);
    const focal = 540 / Math.tan((25 * Math.PI) / 180);
    const eye = new Vector3(view.eye.x, view.eye.y, view.eye.z);
    const drawn = pointsOf(scene, systems);
    expect(drawn.map(({ index }) => index)).not.toContain(view.close?.system);
    const glints = drawn.filter(
      ({ index, world }) => !view.postcards.includes(index) && world !== undefined && world.radius >= GRAIN,
    );
    expect(glints.length).toBeGreaterThan(50);
    for (const { star, world, size } of glints) {
      const whole = onScreen(world?.radius ?? NaN, star.distanceTo(eye), focal);
      expect(size).toBeLessThanOrEqual(Math.max(whole / 8, 0.75) + 1e-4);
    }
  });

  it("dims and softens a far body more than a near one", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const byDistance = [...scene.cosmos.stats().list].sort((a, b) => a.at.length() - b.at.length());
    const far = (body: (typeof byDistance)[number] | undefined) =>
      body?.planet.surface.uniforms["faraway"]?.value as number;
    expect(far(byDistance[0])).toBeLessThan(far(byDistance.at(-1)));
    expect(byDistance.length).toBeGreaterThanOrEqual(3);
    expect(far(byDistance.at(-1))).toBeGreaterThan(0.1);
    expect(far(byDistance.at(-1))).toBeLessThanOrEqual(0.5);
  });

  it("moves the nearest bodies across the screen more than the farthest as the eye drifts: parallax", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const spots = () => new Map(scene.cosmos.stats().screen.bodies.map((body) => [body.id, body]));
    const before = spots();
    scene.cosmos.tick(HOME, 4);
    const after = spots();
    const moved = [...before.values()].flatMap((body) => {
      const next = after.get(body.id);
      return next === undefined ? [] : [{ away: body.away, by: Math.hypot(next.x - body.x, next.y - body.y) }];
    });
    moved.sort((a, b) => a.away - b.away);
    expect(moved.length).toBeGreaterThanOrEqual(3);
    expect(moved[0]?.by ?? 0).toBeGreaterThan(moved.at(-1)?.by ?? Infinity);
  });

  // The cosmos sways the eye itself, from the clock it is given: reduced motion stands that clock still, so the view is the rest's.
  it("draws the very view at rest while its clock stands still, and sways once it runs", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const spots = () => scene.cosmos.stats().screen.bodies.map(({ x, y }) => [x, y]);
    scene.cosmos.tick(HOME, 0);
    const still = spots();
    scene.cosmos.tick(HOME, 0);
    expect(spots()).toEqual(still);
    // From the rest's own eye, to the Earth: what the camera looks along with no sway.
    const [earth, eye] = [
      { x: NaN, y: NaN, z: NaN },
      { x: NaN, y: NaN, z: NaN },
    ];
    toScene(EARTH_PLACE, earth);
    toScene(restView(held(ONYX)).eye, eye);
    const along = new Vector3(earth.x - eye.x, earth.y - eye.y, earth.z - eye.z).normalize();
    expect(new Vector3(0, 0, -1).applyQuaternion(scene.camera.quaternion).angleTo(along)).toBeCloseTo(0, 6);
    scene.cosmos.tick(HOME, 7);
    expect(spots()).not.toEqual(still);
  });

  it("counts the worlds it draws: the file's, each once, and the Earth", async () => {
    const scene = made();
    await shown(scene, ONYX);
    expect(scene.cosmos.stats().worlds).toBe(new Set(ONYX.map(({ id }) => id)).size + 1);
    await shown(scene, [...worlds(4), ...worlds(4)]);
    expect(scene.cosmos.stats().worlds).toBe(13);
    await shown(scene, []);
    expect(scene.cosmos.stats().worlds).toBe(1);
  });

  // A mouse at the window's edge leans the eye 3 units (eye.ts): the view at rest holds; past that the cosmos draws as anywhere.
  it("keeps the view at rest's bodies within a mouse's lean, and draws the ladder's bodies farther off", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const ids = () => new Set(scene.cosmos.stats().list.map(({ id }) => id));
    const rest = ids();
    scene.cosmos.tick({ x: HOME.x + 3, y: HOME.y + 3, z: HOME.z }, 0);
    await settled();
    expect(ids()).toEqual(rest);
    scene.cosmos.tick({ x: HOME.x, y: HOME.y + 6, z: HOME.z }, 0);
    await settled();
    expect(ids()).not.toEqual(rest);
    expect(ids().size).toBeGreaterThan(rest.size);
  });

  // 7d6's review: a postcard's bodies turned on its opened plane while its specks kept the plane `opened()` rejected (24.8 degrees apart).
  it("draws a postcard's specks in the plane its bodies turn in", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const view = restView(systems);
    const [points] = dots(scene);
    const plane = points?.geometry.getAttribute("aPlane") as BufferAttribute;
    const drawn = pointsOf(scene, systems);
    const ofPostcards = drawn.flatMap((point, at) => (view.postcards.includes(point.index) ? [{ point, at }] : []));
    expect(ofPostcards.length).toBeGreaterThan(0);
    for (const { point, at } of ofPostcards) {
      const system = systems[point.index];
      if (system === undefined) throw new Error("no system");
      const shown = postcardOf(system, view.eye).system;
      expect(plane.getX(at)).toBeCloseTo(shown.node, 6);
      expect(plane.getY(at)).toBeCloseTo(shown.tilt, 6);
    }
  });

  // 7d6's review: with motion on, the arrival's glide held the eye past the rest's reach, so the ladder's 33 bodies stood, then 29 went.
  it("keeps the view at rest's bodies through the arrival's glide", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const ids = () => [...scene.cosmos.stats().list.map(({ id }) => id)].sort();
    const rest = ids();
    const glide = { x: 0, y: 0, z: 0 };
    for (const seconds of [0, 0.5, 1, 2, 3, 5, 8]) {
      glideAt(glide, seconds);
      scene.cosmos.tick({ x: HOME.x + glide.x, y: HOME.y + glide.y, z: HOME.z + glide.z }, seconds, HOME);
      await settled();
      expect(ids()).toEqual(rest);
    }
  });

  // 7d6's review: the home shows no file first; the search ran on it, then the eye went back to the plain view, then to the file's.
  it("moves the eye once when the file comes: from the plain view to the file's, never through a view of no worlds", async () => {
    const scene = made();
    const eyes: Point[] = [];
    const seen = () => {
      const { eye } = scene.cosmos.stats();
      eyes.push(eye);
    };
    scene.cosmos.show([]);
    for (let step = 0; step < 3; step += 1) {
      scene.cosmos.tick(HOME, 0);
      await settled();
      seen();
    }
    await shown(scene, ONYX);
    seen();
    const plain = eyes[0];
    const onyx = eyes.at(-1);
    if (plain === undefined || onyx === undefined) throw new Error("no eye");
    for (const eye of eyes)
      expect([plain, onyx].some((one) => Math.hypot(one.x - eye.x, one.y - eye.y, one.z - eye.z) < 1e-9)).toBe(true);
    expect(Math.hypot(plain.x - HOME.x, plain.y - HOME.y, plain.z - HOME.z)).toBeLessThan(1e-9);
  });

  it("gives the body of a world its size on the screen, its id and how far it stands, for the journeys", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const { list, screen } = scene.cosmos.stats();
    expect(screen.bodies.length).toBeGreaterThan(0);
    for (const { id, away } of screen.bodies)
      expect(away).toBeCloseTo(list.find((body) => body.id === id)?.at.length() ?? NaN, 6);
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
    expect(visible.length).toBeGreaterThan(0);
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
    expect(globe.aim).toHaveBeenCalled();
    expect(globe.setSun).toHaveBeenCalled();
  });

  it("turns the Earth with the camera, so it shows the same face from any view's angle, lit from where the great star stands", async () => {
    const globe = fakeGlobe();
    globes.build.mockImplementation(() => Promise.resolve(globe));
    const scene = made();
    await shown(scene, ONYX);
    // A mouse's lean moves the eye: the camera turns to keep the Earth at the centre, and the Earth turns with it.
    scene.cosmos.tick({ x: HOME.x + 3, y: HOME.y + 2, z: HOME.z }, 5);
    expect(scene.camera.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0.01);
    expect(globe.group.quaternion.angleTo(scene.camera.quaternion)).toBeCloseTo(0, 6);
    // The light the globe takes (its aim and azimuth, past the Earth's lean and the globe's turn, as Globe.setSun does) points at the great
    // star (7d6's review: it fell 9.7 degrees off, the lean left out).
    const earth = { x: NaN, y: NaN, z: NaN };
    toScene(EARTH_PLACE, earth);
    const star = new Vector3(CENTRE.x - earth.x, CENTRE.y - earth.y, CENTRE.z - earth.z).normalize();
    const light = starAt(
      globe.aim.mock.lastCall?.[0] as number,
      globe.setSun.mock.lastCall?.[0] as number,
      new Vector3(),
    )
      .applyEuler(globe.lean)
      .applyQuaternion(globe.group.quaternion);
    expect(light.angleTo(star)).toBeLessThan(1e-6);
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
    // The view looks at the Earth (7d6): an eye two units off it, on the rest's own axis, is near a world.
    const [earth, eye] = [
      { x: NaN, y: NaN, z: NaN },
      { x: NaN, y: NaN, z: NaN },
    ];
    toScene(EARTH_PLACE, earth);
    toScene(restView(held(worlds(30))).eye, eye);
    const along = new Vector3(eye.x - earth.x, eye.y - earth.y, eye.z - earth.z).normalize().multiplyScalar(2);
    scene.cosmos.tick(
      {
        x: earth.x + along.x - eye.x + HOME.x,
        y: earth.y + along.y - eye.y + HOME.y,
        z: earth.z + along.z - eye.z + HOME.z,
      },
      0,
    );
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
