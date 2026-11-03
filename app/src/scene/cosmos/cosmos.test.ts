import {
  ARRIVAL_LEAN,
  arrivalOf,
  deepOf,
  asciiBytes,
  beatAt,
  BELT_INNER,
  BOUNDS,
  CENTRE,
  distanceOf,
  DIVE,
  dotLight,
  driftAt,
  glideAt,
  EARTH_PLACE,
  evenRow,
  FIELD_OF_VIEW,
  GRAIN,
  HERO_ZONE,
  haloAt,
  LEAN,
  orbitPlace,
  orbitTime,
  HOME,
  judgeOf,
  LENT,
  BLOCK_MS,
  MOOD_SCALE,
  NEBULA_IMAGES,
  nebulaShare,
  offLine,
  onScreen,
  planetSeed,
  postcardOf,
  restView,
  ROCKS_FROM,
  ROOM,
  softPoint,
  systemsOf,
  toMap,
  toScene,
  wholeShare,
  worldLook,
  worldSize,
  type Orbiter,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import {
  AdditiveBlending,
  Box3,
  BufferGeometry,
  FramebufferTexture,
  Group,
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
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  type BufferAttribute,
  type LineBasicMaterial,
  type WebGLRenderer,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Disposer } from "../disposer.ts";
import { focalOf } from "../lens.ts";
import { MOON_FAR } from "../earth/orbit.ts";
import { fromEyeOf, starAt } from "../planet/light.ts";
import { LIMB_LIGHT } from "../planet/planet.ts";
import recorded from "../../../lab/worlds.json" with { type: "json" };
import { Cosmos } from "./cosmos.ts";
import { usageOf, type CosmosWorld } from "./cosmosWorld.ts";
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
  // The scene hands the camera the home's lens while the cosmos shows (7d9).
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, width / height, 0.1, 2000);
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
// A body waits for the generated worlds' code, a chunk of its own, as it waits for its maps (7b5).
const shown = async (made_: ReturnType<typeof made>, list: readonly CosmosWorld[] = worlds(30)) => {
  made_.cosmos.show(list);
  await vi.dynamicImportSettled();
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
// Each rock the belt draws, and its star's place, on the map.
const rocksOf = (from: { stage: Stage }, count: number) => {
  const [belt] = rocks(from);
  if (belt === undefined) return [];
  const [stars, places] = [belt.geometry.getAttribute("aStar"), belt.geometry.getAttribute("position")];
  return Array.from({ length: count }, (_, at) => ({
    star: new Vector3(stars.getX(at), stars.getY(at), stars.getZ(at)),
    rock: new Vector3(places.getX(at), places.getY(at), places.getZ(at)),
  }));
};
// Where `world` stands in `system`'s plane, `seconds` on its turn, on the map.
const turned = (system: StarSystem, world: Orbiter, seconds: number) => {
  const out = { x: NaN, y: NaN, z: NaN };
  orbitPlace({ system, world }, seconds, out);
  return new Vector3(out.x, out.y, out.z);
};
// Half a unit: debris is only a far belt (ADR-0002 §10), and a rock this near a world's ground would read as that world crumbling.
const DEBRIS_CLEAR = 0.5;
// Every rock `scene` draws, against every world of its system as drawn, `drawnOf` giving each system's plane and worlds, through a turn.
function debrisClear(
  scene: ReturnType<typeof made>,
  systems: readonly StarSystem[],
  drawnOf: (system: StarSystem) => { system: StarSystem; worlds: readonly Orbiter[] },
) {
  let judged = 0;
  for (const { star, rock } of rocksOf(scene, scene.cosmos.stats().rocks)) {
    // In its band: from ROCKS_FROM to the room's edge, a little off the plane.
    expect(rock.distanceTo(star)).toBeGreaterThanOrEqual(ROCKS_FROM - 1e-6);
    expect(rock.distanceTo(star)).toBeLessThanOrEqual(Math.hypot(ROOM, 0.15) + 1e-6);
    const found = systems.find(({ place }) => star.distanceTo(new Vector3(place.x, place.y, place.z)) < 1e-4);
    if (found === undefined) throw new Error("a rock with no star");
    const { system, worlds: drawnWorlds } = drawnOf(found);
    for (const world of drawnWorlds)
      for (let step = 0; step < 16; step += 1) {
        const seconds = (step * 2 * Math.PI) / 16 / Math.abs(system.spin);
        expect(rock.distanceTo(turned(system, world, seconds)) - world.radius).toBeGreaterThanOrEqual(DEBRIS_CLEAR);
        judged += 1;
      }
  }
  return judged;
}

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
    // A postcard's specks that would stand on one of its bodies are left out (7d3): 91 of the crowd's 120 points stand.
    expect(count).toBeGreaterThan(80);
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

  // 7d3: a postcard's worlds, widened at display, stood in its far belt's rocks (10 of Onyx's 31 belted systems).
  it.each([
    ["Onyx", ONYX],
    ["30 systems", worlds(30)],
  ] as const)(
    "leaves no debris near a planet on %s: every rock half a unit or more off every world its system draws, at any turn",
    async (_, list) => {
      const scene = made();
      await shown(scene, list);
      const systems = held(list);
      const view = restView(systems);
      const drawnOf = (system: StarSystem) => {
        if (!view.postcards.includes(systems.indexOf(system))) return { system, worlds: system.worlds };
        // A postcard's bodies widened round its star, its specks at their own orbits, all in its plane as drawn.
        const postcard = postcardOf(system, view.eye);
        return { system: postcard.system, worlds: [...postcard.worlds, ...system.worlds] };
      };
      expect(debrisClear(scene, systems, drawnOf)).toBeGreaterThan(0);
      // A band, not a line: the rocks spread across it.
      const reach = rocksOf(scene, scene.cosmos.stats().rocks).map(({ star, rock }) => rock.distanceTo(star));
      const mean = reach.reduce((sum, at) => sum + at, 0) / reach.length;
      const spread = Math.sqrt(reach.reduce((sum, at) => sum + (at - mean) ** 2, 0) / reach.length);
      expect(spread).toBeGreaterThanOrEqual((ROOM - ROCKS_FROM) / 4);
    },
  );

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
const EYES_FARTHEST = 60;
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
    const [distance, slant, turn] = [
      20 + (EYES_FARTHEST - 20) * next(),
      ((next() * 60 - 30) * Math.PI) / 180,
      next() * 2 * Math.PI,
    ];
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

// Whether a part shows, its parents with it.
const showing = (part: Object3D): boolean => {
  for (let at: Object3D | null = part; at !== null; at = at.parent) if (!at.visible) return false;
  return true;
};

const must = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(what);
  return value;
};
const nowhere = () => ({ x: NaN, y: NaN, z: NaN });

// 7d9: where a world truly stands this frame, where it holds at rest (its orbit's place at no time), through the camera the cosmos aimed:
// on the map and the stage, how large on screen, and whether it is on the screen.
function trueSpot(scene: ReturnType<typeof made>, system: StarSystem, world: Orbiter) {
  const { eye } = scene.cosmos.stats();
  const [onMap, onStage] = [nowhere(), nowhere()];
  orbitPlace({ system, world }, 0, onMap);
  toScene(onMap, onStage);
  const from = new Vector3(onStage.x - eye.x, onStage.y - eye.y, onStage.z - eye.z);
  const depth = -from.clone().applyQuaternion(scene.camera.quaternion.clone().invert()).z;
  const seen = from.clone().project(scene.camera);
  const [x, y] = [((seen.x + 1) * WIDTH) / 2, ((1 - seen.y) * HEIGHT) / 2];
  const radius = (world.radius * focalOf(scene.camera, HEIGHT)) / Math.max(depth, world.radius);
  const inside = x + radius > 0 && x - radius < WIDTH && y + radius > 0 && y - radius < HEIGHT;
  return {
    onMap,
    onStage: from.add(new Vector3(eye.x, eye.y, eye.z)),
    radius,
    onScreen: depth > world.radius && inside,
  };
}

// The world drawn as a body this frame, showing: how far from `at` on the stage, and its size on screen.
function asBodyOf(scene: ReturnType<typeof made>, world: Orbiter, at: Vector3) {
  const { eye, list, screen } = scene.cosmos.stats();
  const body = list.find(({ id }) => id === world.id);
  const spot = screen.bodies.find(({ id }) => id === world.id);
  if (body === undefined || spot === undefined || !showing(body.planet.group)) return undefined;
  return {
    off: body.at
      .clone()
      .add(new Vector3(eye.x, eye.y, eye.z))
      .distanceTo(at),
    size: spot.radius,
  };
}

// The world drawn as a point this frame, showing, where the points' clock puts it: how far from `at` on the map, and its size.
function asPointOf(
  scene: ReturnType<typeof made>,
  { system, world, at }: { readonly system: StarSystem; readonly world: Orbiter; readonly at: Point },
  seconds: number,
) {
  const [points] = dots(scene);
  if (points === undefined || !showing(points)) return undefined;
  const read = (name: string) => points.geometry.getAttribute(name) as BufferAttribute;
  const [places, orbits, planes, sizes] = [read("position"), read("aOrbit"), read("aPlane"), read("aSize")];
  for (let index = 0; index < scene.cosmos.stats().dots; index += 1) {
    const star = { x: places.getX(index), y: places.getY(index), z: places.getZ(index) };
    const orbit = Math.abs(orbits.getX(index) - world.orbit) + Math.abs(orbits.getY(index) - world.phase);
    if (distanceOf(star, system.place) >= 1e-4 || orbit >= 1e-5) continue;
    const turning = { ...system, node: planes.getX(index), tilt: planes.getY(index), spin: orbits.getZ(index) };
    const drifted = nowhere();
    orbitPlace({ system: turning, world }, orbitTime(seconds), drifted);
    return { off: distanceOf(drifted, at), size: sizes.getX(index) };
  }
  return undefined;
}

// How `world` of `system` is drawn this frame, `seconds` into the worlds' clock: where it truly stands, as a body, as a point.
function drawnOf(scene: ReturnType<typeof made>, [system, world]: readonly [StarSystem, Orbiter], seconds: number) {
  const truly = trueSpot(scene, system, world);
  const asBody = asBodyOf(scene, world, truly.onStage);
  return { ...truly, asBody, asPoint: asPointOf(scene, { system, world, at: truly.onMap }, seconds) };
}

// Each halo-less star the suns' draw holds, as the camera sees it beside the Earth: how far its heart stands off the Earth's limb, in
// pixels, whether it stands behind the Earth, and its light, the share the page's text dims too (aSun's fourth slot).
function bareSuns(scene: ReturnType<typeof made>) {
  const suns = must(glows(scene).find(({ geometry }) => geometry.hasAttribute("aHalo"))?.geometry, "no suns");
  const read = (name: string) => suns.getAttribute(name) as BufferAttribute;
  const [at, look, halo] = [read("aAt"), read("aSun"), read("aHalo")];
  const { eye, screen } = scene.cosmos.stats();
  const earth = must(screen.earth, "no Earth");
  const [earthAt, onStage] = [nowhere(), nowhere()];
  toScene(EARTH_PLACE, earthAt);
  const bare = Array.from({ length: suns.instanceCount }, (_, index) => index).filter(
    (index) => halo.getX(index) === 0 && look.getZ(index) === 0,
  );
  return bare.map((index) => {
    const place = { x: at.getX(index), y: at.getY(index), z: at.getZ(index) };
    toScene(place, onStage);
    const from = new Vector3(onStage.x - eye.x, onStage.y - eye.y, onStage.z - eye.z);
    const seen = from.clone().project(scene.camera);
    const limb = Math.hypot(((seen.x + 1) * WIDTH) / 2 - earth.x, ((1 - seen.y) * HEIGHT) / 2 - earth.y) - earth.radius;
    return { place, limb, behind: from.length() > distanceOf(earthAt, eye) && seen.z < 1, light: look.getW(index) };
  });
}

// Onyx's close world, with its system.
function onyxClose() {
  const systems = held(ONYX);
  const { close } = restView(systems);
  const system = must(systems[close?.system ?? -1], "Onyx gives no close world");
  return { system, world: must(system.worlds[close?.world ?? -1], "Onyx gives no close world") };
}

// A frame on which a world stands on the screen: drawn once, a body or else a point, never both, where it holds, at its true size.
function drawnOnce({ radius, asBody, asPoint }: ReturnType<typeof drawnOf>, where: string) {
  const drawn = must(asBody ?? asPoint, `the close world is not drawn ${where}`);
  if (asBody !== undefined) expect(asPoint, `a point under its body ${where}`).toBeUndefined();
  expect(drawn.off, where).toBeLessThan(1e-4);
  expect(Math.abs(drawn.size / radius - 1), where).toBeLessThanOrEqual(0.1);
  return { kind: asBody === undefined ? "point" : "body", size: drawn.size, radius };
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
    expect(earth?.radius).toBeGreaterThan(48);
    expect(earth?.radius).toBeLessThan(67);
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

  // Alexis, 2026-11-03 ("la perspective doit être partout"): beside the view's own three systems, real worlds of four more at most (7p).
  it("draws the bodies of the view's own systems, two postcards and the close world's, and of four more at most for depth", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const view = restView(systems);
    const drawn = new Set(scene.cosmos.stats().list.map(({ id }) => systemOf(systems, id)?.id));
    const chosen = [...view.postcards, ...(view.close === undefined ? [] : [view.close.system])].map(
      (index) => systems[index]?.id,
    );
    const deep = deepOf(systems, view, judgeOf(systems, view, LENT)).map(({ system }) => systems[system]?.id);
    expect(drawn.size).toBeLessThanOrEqual(3 + 4);
    expect([...drawn].sort()).toEqual([...new Set([...chosen, ...deep])].sort());
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

  // The chief, 2026-11-02: the close world holds still, its postcards' worlds turn (7d6's review, lot 8: no test held it).
  it("holds Onyx's close world still through the worlds' clock, while the postcards' worlds turn", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const { close } = restView(systems);
    const id = close === undefined ? "" : (systems[close.system]?.worlds[close.world]?.id ?? "");
    const placesAt = (seconds: number) => {
      scene.cosmos.tick(HOME, seconds);
      const { eye, list } = scene.cosmos.stats();
      return new Map(list.map((body) => [body.id, body.at.clone().add(new Vector3(eye.x, eye.y, eye.z))]));
    };
    const [before, after] = [placesAt(0), placesAt(30)];
    const moved = (body: string) => after.get(body)?.distanceTo(before.get(body) ?? new Vector3(NaN)) ?? NaN;
    expect(moved(id)).toBeLessThan(1e-6);
    expect([...before.keys()].filter((body) => body !== id && moved(body) > 1e-3).length).toBeGreaterThan(0);
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
    const focal = focalOf(scene.camera, HEIGHT);
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

  // A body and a point of one world turn by one clock, or a world that becomes a body jumps on its orbit (7d6's review, lot 5).
  it("turns a body by the worlds' clock its points turn by, and a point's spin is its system's own", async () => {
    const scene = made();
    await shown(scene, ONYX);
    scene.cosmos.tick({ x: HOME.x + 30, y: HOME.y + 20, z: HOME.z }, 40);
    await settled();
    const systems = held(ONYX);
    // A body of any system but the close world's, which holds still (7d9).
    const still = systems[restView(systems).close?.system ?? -1];
    const body = scene.cosmos.stats().list.find(({ id }) => !(still?.worlds.some((world) => world.id === id) ?? false));
    if (body === undefined) throw new Error("no body");
    const expected = { x: NaN, y: NaN, z: NaN };
    orbitPlace(body, orbitTime(40), expected);
    const place = { x: NaN, y: NaN, z: NaN };
    toScene(expected, place);
    const [eye] = [scene.cosmos.stats().eye];
    expect(body.at.distanceTo(new Vector3(place.x - eye.x, place.y - eye.y, place.z - eye.z))).toBeLessThan(1e-6);
    const [points] = dots(scene);
    const orbits = points?.geometry.getAttribute("aOrbit") as BufferAttribute;
    const spins = new Set(systems.map(({ spin }) => spin.toFixed(6)));
    expect(spins.has(orbits.getZ(0).toFixed(6))).toBe(true);
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

// Alexis, 2026-11-03, on the lab: the close world shrank and went as the eye left the rest. It is the world it is wherever the eye stands:
// its system holds its place everywhere (the chief, 2026-11-03), so it never jumps to its orbit's place as the ladder takes the view; it
// shrinks with its true distance, a body, then a point of its size, and it is drawn whenever it stands on the screen.
describe("the close world off the rest (7d9)", () => {
  // The worlds' clock run on: 40 seconds turn the close world's system some 0.94 radians, so where its orbit has it is far from where it
  // holds.
  const CLOCK = 40;
  // From the rest out to a cluster's distance, where the whole cosmos starts, or a share of that: small steps first, then a share of the way.
  const steps = (last: number, growth: number) => {
    const found = [0];
    for (let at = 0.25; at <= last; at = at * growth + 0.25) found.push(at);
    return found;
  };
  // The ways off the rest, from the eye the scene stood: back along the view and in towards the Earth, aside, up and down.
  const waysOff = (scene: ReturnType<typeof made>) => {
    const earth = nowhere();
    toScene(EARTH_PLACE, earth);
    const { eye } = scene.cosmos.stats();
    const back = new Vector3(eye.x - earth.x, eye.y - earth.y, eye.z - earth.z).normalize();
    const [aside, up] = [new Vector3(1, 0, 0), new Vector3(0, 1, 0)].map((axis) =>
      axis.applyQuaternion(scene.camera.quaternion),
    );
    const along = (axis: Vector3, last: number, growth: number) =>
      steps(last, growth).map((by) => axis.clone().multiplyScalar(by));
    return [
      along(back, 290, 1.06),
      along(back.clone().negate(), 20, 1.15),
      ...[aside, up].flatMap((axis) => {
        const one = must(axis, "no axis");
        return [along(one, 12, 1.15), along(one.clone().negate(), 12, 1.15)];
      }),
    ];
  };
  // The eye walked along each way from the rest, a look and a frame a step: each frame's drawing of `world`, where it stands on screen.
  const walk = async (
    scene: ReturnType<typeof made>,
    [system, world]: readonly [StarSystem, Orbiter],
    ways: Vector3[][],
  ) => {
    const seen: (ReturnType<typeof drawnOnce> | undefined)[][] = [];
    for (const way of ways) {
      const frames: (ReturnType<typeof drawnOnce> | undefined)[] = [];
      for (const by of way) {
        const to = { x: HOME.x + by.x, y: HOME.y + by.y, z: HOME.z + by.z };
        scene.cosmos.tick(to, CLOCK);
        await settled();
        scene.cosmos.tick(to, CLOCK);
        const drawn = drawnOf(scene, [system, world], CLOCK);
        frames.push(drawn.onScreen ? drawnOnce(drawn, `${by.length().toFixed(2)} units off the rest`) : undefined);
      }
      seen.push(frames);
    }
    return seen;
  };
  const restAt = async (file: readonly CosmosWorld[]) => {
    const scene = made();
    await shown(scene, file);
    scene.cosmos.tick(HOME, CLOCK);
    await settled();
    scene.cosmos.tick(HOME, CLOCK);
    return scene;
  };

  // The chief, 2026-11-03: 1.2 times and not 1.25, which left Onyx no eye with its close world and two postcards (0 of 712): a guard of
  // that choice, which holds at the old lens too.
  it("keeps Onyx's arrival through the home's lens: its close world and two postcards", () => {
    const { close, postcards } = restView(held(ONYX));
    expect(close).toBeDefined();
    expect(postcards).toHaveLength(2);
  });

  it("keeps it where it holds, at its true size, a body then a point, as the eye steps back, in, aside, up and down, the clock run on", async () => {
    const scene = await restAt(ONYX);
    const { system, world } = onyxClose();
    const seen = await walk(scene, [system, world], waysOff(scene));
    // From one step to the next its size changes as its true size does, within a tenth.
    for (const frames of seen)
      for (const [at, now] of frames.entries()) {
        const before = frames[at - 1];
        if (now === undefined || before === undefined) continue;
        const [drawn, truly] = [Math.log(now.size / before.size), Math.log(now.radius / before.radius)];
        expect(Math.abs(drawn - truly)).toBeLessThanOrEqual(Math.log(1.1));
      }
    expect(new Set(seen.flat().map((frame) => frame?.kind))).toEqual(new Set([undefined, "body", "point"]));
  });

  // The red pass (M2): the close world's whole system holds, its other worlds too, a body or a point, at their size. Onyx's close system
  // has one world; sixty systems of four, through the home's lens, give a close world with three beside it.
  it("holds the close world's whole system where it holds, its other worlds too, as the eye steps back", async () => {
    const file = worlds(60, 4);
    const systems = held(file);
    const { close } = restView(systems);
    const system = must(systems[close?.system ?? -1], "no close world");
    expect(system.worlds.length).toBeGreaterThan(1);
    const scene = await restAt(file);
    const [back] = waysOff(scene);
    for (const world of system.worlds) {
      const seen = await walk(scene, [system, world], [must(back, "no way back")]);
      expect(seen.flat().some((frame) => frame !== undefined)).toBe(true);
    }
  }, 20_000);

  // The chief, 2026-11-03: through the home's lens g1ut6usp's star stood 3 pixels off the Earth's limb, 87.8 units behind it, and read as
  // a glitch (its case is the disc's test). A star with no halo fades out behind the Earth within a few pixels of its limb; others keep it.
  it("puts out the light of a halo-less star behind the Earth within a few pixels of its limb, and leaves the others'", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const behind = bareSuns(scene).filter((sun) => sun.behind);
    expect(behind.length).toBeGreaterThan(0);
    for (const { light } of behind.filter(({ limb }) => limb <= 4)) expect(light).toBe(0);
    for (const { light } of behind.filter(({ limb }) => limb >= 20)) expect(light).toBe(1);
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
    // The generated worlds' maps come after their bodies are asked (7b5), each a look of its own: the place is seen once first, so the
    // step's look is counted alone.
    scene.cosmos.tick(eyeAt(30.1), 1);
    await settled();
    scene.cosmos.tick(eyeAt(0), 1);
    await settled();
    const { looks } = scene.cosmos.stats();
    // A body compiled takes a look of its own, to stand in place of its point (7d9): the bodies the step stands compile after the count.
    scene.renderer.compileAsync.mockImplementation(() => new Promise(() => undefined));
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

  it("hides a body it frees at once, so nothing that points at its object takes it for one still drawn (7h)", async () => {
    const scene = made();
    await shown(scene);
    const group = scene.cosmos.stats().list[0]?.planet.group;
    if (group === undefined) throw new Error("no body");
    expect(group.visible).toBe(true);
    scene.cosmos.tick({ x: HOME.x + 5000, y: HOME.y, z: HOME.z }, 1);
    await settled();
    expect(group.visible).toBe(false);
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

  it("turns the points by the worlds' clock (a fifth of the seconds) and the Earth, and lights the Earth from the great star", async () => {
    const globe = fakeGlobe();
    globes.build.mockImplementation(() => Promise.resolve(globe));
    const scene = made();
    await shown(scene);
    scene.cosmos.tick(HOME, 12);
    const [points] = dots(scene);
    expect(points?.material.uniforms["uSeconds"]?.value).toBeCloseTo(orbitTime(12), 12);
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

// Past a cluster's distance the worlds themselves are the nebula (ADR-0002 §10; Alexis, 2026-11-02): their soft points and the lines of
// their imports take the view from the bodies, the suns and the nebulae at one distance, never both whole, and with no second place.
describe("the whole cosmos", () => {
  // The eye going out as the lab's wheel takes it: back from the arrival, the Earth ahead.
  const out = (away: number) => ({ x: HOME.x, y: HOME.y, z: HOME.z + away });
  const earth = { x: 0, y: 0, z: 0 };
  toScene(EARTH_PLACE, earth);
  const linked = (count: number): CosmosWorld[] =>
    Array.from({ length: count }, (_, at) => ({
      id: `n${String(at % 9)}/w${String(at)}`,
      namespace: `n${String(at % 9)}`,
      realms: [
        {
          callers: null,
          path: `gno.land/r/n${String(at % 9)}/w${String(at)}`,
          imports: at % 4 === 0 ? [`gno.land/r/n${String((at + 1) % 9)}/w${String(at + 1)}`] : [],
          calls: null,
          lastHeight: null,
        },
      ],
    }));
  // Its chunk is a real import, which no fake clock waits for: a cold one, alone in a run, came after the frames.
  const at = async (scene: ReturnType<typeof made>, eye: Point) => {
    scene.cosmos.tick(eye, 0);
    await settled();
    await vi.dynamicImportSettled();
    scene.cosmos.tick(eye, 0);
    await settled();
  };
  const fades = (scene: ReturnType<typeof made>) =>
    parts(scene).flatMap((part) => {
      if (!(part instanceof Mesh || part instanceof Points)) return [];
      const material: unknown = part.material;
      return material instanceof ShaderMaterial && "uFade" in material.uniforms
        ? [Number(material.uniforms["uFade"].value)]
        : [];
    });
  const seen = (scene: ReturnType<typeof made>) => {
    const found: Object3D[] = [];
    scene.stage.traverseVisible((part) => found.push(part));
    return found;
  };
  const earthShown = (scene: ReturnType<typeof made>) =>
    seen(scene).some((part) => part instanceof Stage && part !== scene.stage);
  const shownWith = (scene: ReturnType<typeof made>, name: string) =>
    seen(scene).filter((part) => part instanceof Points && (part.geometry as BufferGeometry).hasAttribute(name));

  it("asks for its chunk only once the eye leaves for it, never at the arrival", async () => {
    const scene = made();
    await shown(scene, linked(90));
    await at(scene, HOME);
    expect(scene.cosmos.stats().web).toBeUndefined();
    await at(scene, out(400));
    expect(scene.cosmos.stats().web).toMatchObject({ points: 90, lines: 23 });
  });

  it("hands the view from the bodies, the suns and the nebulae to the worlds' points at one distance, never both whole", async () => {
    const scene = made();
    await shown(scene, linked(90));
    await at(scene, out(400));
    const shares: number[] = [];
    const outward = [0, 100, 200, 300, 380, 450, 520, 600, 640, 700, 900, 1500];
    // Out, then back in: nothing it hands over stays handed over.
    for (const away of [...outward, ...[...outward].reverse()]) {
      const eye = out(away);
      await at(scene, eye);
      // What the eye looks at is the Earth (7d6): its distance from where the cosmos stands the eye says the share, as for the nebulae.
      const { web, bodies, eye: placed, sky } = scene.cosmos.stats();
      const nebulae = sky.share;
      const whole = wholeShare(distanceOf(placed, earth));
      shares.push(web?.share ?? NaN);
      expect(web?.share).toBeCloseTo(whole, 9);
      expect(nebulae).toBeCloseTo(nebulaShare(distanceOf(placed, earth)), 9);
      expect(nebulae + whole).toBeLessThanOrEqual(1 + 1e-9);
      // The disc's suns, points and rocks give up faster than the worlds' points come (F4152, the hand-over's white glows), and the
      // bodies, the Earth among them, go as they start: an opaque body cannot fade.
      const disc = fades(scene);
      expect(disc).toHaveLength(3);
      for (const fade of disc) {
        expect(fade).toBeCloseTo((1 - whole) ** 2, 9);
        expect(fade + whole).toBeLessThanOrEqual(1 + 1e-9);
      }
      expect(earthShown(scene)).toBe(whole === 0);
      if (whole >= 1) {
        expect(bodies).toBe(0);
        expect(shownWith(scene, "aOrbit")).toHaveLength(0);
        expect(
          seen(scene).filter((part) => part instanceof Mesh && part.geometry instanceof InstancedBufferGeometry),
        ).toHaveLength(0);
      }
      expect(shownWith(scene, "aCircle")).toHaveLength(whole > 0 ? 1 : 0);
    }
    expect(Math.min(...shares)).toBe(0);
    expect(Math.max(...shares)).toBe(1);
    expect(shares.some((share) => share > 0.1 && share < 0.9)).toBe(true);
    expect(shares.at(-1)).toBe(0);
    expect(scene.cosmos.stats().bodies).toBeGreaterThan(0);
  });

  it("stands no whole cosmos once the page has gone, though its chunk was on its way", async () => {
    const hidden = made();
    await shown(hidden, linked(90));
    hidden.cosmos.tick(out(400), 0);
    hidden.cosmos.show(undefined);
    await settled();
    await vi.dynamicImportSettled();
    expect(shownWith(hidden, "aCircle")).toHaveLength(0);
    const gone = made();
    await shown(gone, linked(90));
    gone.cosmos.tick(out(400), 0);
    gone.owner.dispose();
    await settled();
    await vi.dynamicImportSettled();
    expect(gone.stage.getObjectByName("web")).toBeUndefined();
  });

  it("stands each world where the ladder's points stand it: one place for a world, at any distance", async () => {
    const scene = made();
    const list = linked(90);
    await shown(scene, list);
    await at(scene, out(150));
    const [ladder] = dots(scene);
    if (ladder === undefined) throw new Error("no points");
    // Each point's star, its orbit, phase and spin, and its system's plane (7d6's tilt), one row a world.
    const placesOf = (points: Points<BufferGeometry, ShaderMaterial>, orbit: string) => {
      const cells = ["position", orbit, "aPlane"].map((name) => points.geometry.getAttribute(name));
      return new Set(
        Array.from({ length: points.geometry.drawRange.count }, (_, index) =>
          cells
            .flatMap((cell) => Array.from({ length: cell.itemSize }, (_, item) => cell.getComponent(index, item)))
            .map((value) => value.toFixed(5))
            .join(","),
        ),
      );
    };
    const fromLadder = placesOf(ladder, "aOrbit");
    await at(scene, out(900));
    const web = parts(scene).find(
      (part): part is Points<BufferGeometry, ShaderMaterial> =>
        part instanceof Points && (part.geometry as BufferGeometry).hasAttribute("aCircle"),
    );
    if (web === undefined) throw new Error("no whole cosmos");
    expect(fromLadder.size).toBeGreaterThan(3);
    const fromWeb = placesOf(web, "aCircle");
    for (const place of fromLadder) expect(fromWeb.has(place)).toBe(true);
    expect(web.parent?.rotation.x).toBe(ladder.parent?.rotation.x);
    // One clock for both, 7d6's: a world keeps its place on its orbit as the view changes hands.
    scene.cosmos.tick(out(900), 12);
    const clockOf = ({ material }: Points<BufferGeometry, ShaderMaterial>) =>
      Number(material.uniforms["uSeconds"]?.value);
    expect(clockOf(web)).toBe(clockOf(ladder));
    expect(clockOf(web)).toBeGreaterThan(0);
    // Both at the eye the cosmos stands, the view at rest's swayed (7d6), not the scene's.
    expect(web.parent?.position.toArray()).toEqual(ladder.parent?.position.toArray());
    expect(scene.cosmos.stats().eye).not.toEqual(out(900));
  });

  const webLook = (scene: ReturnType<typeof made>) => {
    const found = shownWith(scene, "aCircle")[0];
    if (!(found instanceof Points)) throw new Error("no whole cosmos shown");
    return found as Points<BufferGeometry, ShaderMaterial>;
  };

  // F4153: the disc faded and the bodies went by distance alone, the view going black when nothing was there to take it over.
  it("keeps the disc and the bodies while the whole cosmos cannot take the view: its program not compiled yet, or no world to draw", async () => {
    const waiting = made();
    waiting.renderer.compileAsync.mockImplementation((group: Object3D) =>
      group.name === "web" ? new Promise<Object3D>(() => undefined) : Promise.resolve(group),
    );
    await shown(waiting, linked(90));
    const empty = made();
    await shown(empty, []);
    for (const scene of [waiting, empty]) {
      await at(scene, out(900));
      expect(scene.cosmos.stats().web?.share ?? 0).toBe(0);
      for (const fade of fades(scene)) expect(fade).toBe(1);
      expect(earthShown(scene)).toBe(true);
      expect(shownWith(scene, "aCircle")).toHaveLength(0);
    }
  });

  // F4153, finding 1: a look ran each 4 units the eye went, nearly every frame of a wheel out there. It runs each hundredth of the way
  // to what the eye looks at, near as before.
  it("looks again as often as the distance asks: each 4 units near, each hundredth of the way far", async () => {
    const scene = made();
    await shown(scene, linked(90));
    const looksAfter = async (from: Point, by: number) => {
      await at(scene, from);
      const { looks } = scene.cosmos.stats();
      scene.cosmos.tick({ ...from, z: from.z + by }, 0);
      await settled();
      return scene.cosmos.stats().looks - looks;
    };
    // The generated worlds' maps come after their bodies are asked (7b5), each a look of its own: the near place is seen once first.
    await at(scene, { ...out(0), z: out(0).z + 5 });
    expect(await looksAfter(out(0), 5)).toBe(1);
    expect(await looksAfter(out(900), 5)).toBe(0);
    expect(await looksAfter(out(900), 12)).toBe(1);
  });

  it("hides the whole cosmos with the page, after it showed", async () => {
    const scene = made();
    await shown(scene, linked(90));
    await at(scene, out(900));
    expect(shownWith(scene, "aCircle")).toHaveLength(1);
    scene.cosmos.show(undefined);
    expect(shownWith(scene, "aCircle")).toHaveLength(0);
  });

  it("gives the whole cosmos the screen's pixels, set before its chunk came", async () => {
    const scene = made();
    scene.cosmos.resize(HEIGHT, 2);
    await shown(scene, linked(90));
    await at(scene, out(900));
    expect(webLook(scene).material.uniforms["uRatio"]?.value).toBe(2);
  });

  it("draws the whole cosmos once its chunk comes, the eye standing still", async () => {
    const scene = made();
    await shown(scene, linked(90));
    const eye = out(900);
    scene.cosmos.tick(eye, 0);
    await settled();
    await vi.dynamicImportSettled();
    for (let frame = 0; frame < 4; frame += 1) {
      scene.cosmos.tick(eye, 0);
      await settled();
    }
    const sizes = webLook(scene).geometry.getAttribute("aSoft");
    expect(Array.from({ length: 90 }, (_, index) => sizes.getX(index)).every((size) => size >= 0.75)).toBe(true);
  });

  it("gives the whole cosmos the file's time: gold for a world called in the last run only", async () => {
    const scene = made();
    const list = linked(30).map((world, index) =>
      index === 0 ? { ...world, realms: [{ ...world.realms[0], callers: null, calls: 40, lastHeight: 9000 }] } : world,
    );
    scene.cosmos.show(list, new Date(Date.now()).toISOString());
    await at(scene, out(900));
    expect(scene.cosmos.stats().web?.gold).toBe(1);
    scene.cosmos.show(list, "2000-01-01T00:00:00Z");
    await at(scene, out(901));
    expect(scene.cosmos.stats().web?.gold).toBe(0);
  });

  // The review of 7d5's merge (2): each world's soft point is sized from the eye the cosmos stands, in focus at the Earth, which it looks at.
  it("sizes each world's soft point from the placed eye, in focus where it looks", async () => {
    const scene = made();
    const list = linked(90);
    await shown(scene, list);
    await at(scene, out(900));
    const { eye } = scene.cosmos.stats();
    const mapEye = { x: 0, y: 0, z: 0 };
    toMap(eye, mapEye);
    const [focus, focal] = [distanceOf(eye, earth), focalOf(scene.camera, HEIGHT)];
    const systems = held(list);
    const soft = { size: 0, light: 0 };
    // The whole cosmos sizes a world by its use, as webHeld.ts does, not by the ladder's capped radius (the red pass, 1).
    const expected = list.map((world) => {
      const place = systemOf(systems, world.id)?.place ?? EARTH_PLACE;
      softPoint(worldSize(usageOf(world)), { distance: distanceOf(place, mapEye), focus, focal }, soft);
      return soft.size;
    });
    const sizes = webLook(scene).geometry.getAttribute("aSoft");
    expect(new Set(expected).size).toBeGreaterThan(5);
    for (const [index, size] of expected.entries()) expect(sizes.getX(index)).toBeCloseTo(size, 3);
  });

  // The home's dive (7d7; Alexis, 2026-11-02): it opens on the whole cosmos and comes down to the view at rest in a few seconds, the Earth
  // at the centre; under reduced motion the whole cosmos stands still, then dissolves into the view at rest, and no camera moves.
  describe("the dive (7d7)", () => {
    // The home asks for the dive, then shows Onyx; the clock stands at 0 until its chunks are in and the whole cosmos is compiled.
    const diving = async (still = false, width = WIDTH, height = HEIGHT) => {
      const scene = made(width, height);
      scene.cosmos.dive(still);
      scene.cosmos.show(ONYX);
      for (let step = 0; step < 3; step += 1) {
        scene.cosmos.tick(HOME, 0, 0);
        await settled();
      }
      return scene;
    };
    // A frame `clock` seconds into the dive: with motion on the eye's own clock runs with it, under reduced motion it stands.
    const frame = async (scene: ReturnType<typeof made>, clock: number, still = false) => {
      scene.cosmos.tick(HOME, still ? 0 : clock, clock);
      await settled();
      return scene.cosmos.stats();
    };
    const atRest = async (width = WIDTH, height = HEIGHT) => {
      const plain = made(width, height);
      await shown(plain, ONYX);
      return plain;
    };
    const spotKey = ({ x, y, z }: Point) => [x, y, z].map((value) => value.toFixed(6)).join(",");
    // What the renderer does once a frame is drawn: the page's real one copies what it drew.
    const drawn = (scene: ReturnType<typeof made>, gl: WebGLRenderer) => {
      scene.stage.onAfterRender(gl, scene.stage, scene.camera, new BufferGeometry(), new ShaderMaterial(), new Group());
    };
    const fakeGl = () => {
      const copy = vi.fn();
      const gl = {
        getDrawingBufferSize: (out: Vector2) => out.set(WIDTH * 2, HEIGHT * 2),
        copyFramebufferToTexture: copy,
      } as unknown as WebGLRenderer;
      return { gl, copy };
    };

    it("opens on the whole cosmos: its points whole, no body, sun or nebula, the Earth ahead at the centre", async () => {
      const scene = await diving();
      const start = distanceOf((await frame(scene, 0)).eye, earth);
      const rest = distanceOf((await atRest()).cosmos.stats().eye, earth);
      const first = await frame(scene, DIVE.fade);
      expect(first.web?.share).toBe(1);
      expect(Math.log(start / distanceOf(first.eye, earth)) / Math.log(start / rest)).toBeLessThan(0.1);
      expect(wholeShare(distanceOf(first.eye, earth))).toBe(1);
      expect(earthShown(scene)).toBe(false);
      for (const fade of fades(scene)) expect(fade).toBe(0);
      expect(first.sky.share).toBe(0);
      expect(first.screen.earth?.x).toBeCloseTo(WIDTH / 2, 1);
      expect(first.screen.earth?.y).toBeCloseTo(HEIGHT / 2, 1);
    });

    it("fades the whole cosmos in at its start, from nothing", async () => {
      const scene = await diving();
      const shares = [];
      for (const clock of [0, DIVE.fade / 3, (2 * DIVE.fade) / 3, DIVE.fade])
        shares.push((await frame(scene, clock)).web?.share);
      expect(shares[0]).toBe(0);
      expect(shares[1]).toBeGreaterThan(0);
      expect(shares[2]).toBeGreaterThan(shares[1] ?? Infinity);
      expect(shares[3]).toBe(1);
    });

    it.each([
      [1728, 1080],
      [1920, 1080],
    ])("ends on the view at rest's framing, within a pixel, at %i by %i", async (width, height) => {
      const scene = await diving(false, width, height);
      const plain = await atRest(width, height);
      for (let step = 1; step < 30; step += 1) await frame(scene, (step / 30) * DIVE.seconds);
      for (const clock of [DIVE.seconds - 1 / 60, DIVE.seconds, DIVE.seconds + 2]) {
        const dived = await frame(scene, clock);
        const rest = await frame(plain, clock);
        if (clock >= DIVE.seconds) expect(dived.dive.along).toBe(1);
        else expect(dived.dive.along).toBeLessThan(1);
        const pairs = [[dived.screen.earth, rest.screen.earth] as const];
        expect(rest.screen.bodies.length).toBeGreaterThan(2);
        expect(dived.screen.bodies.map(({ id }) => id).sort()).toEqual(rest.screen.bodies.map(({ id }) => id).sort());
        for (const body of rest.screen.bodies)
          pairs.push([dived.screen.bodies.find(({ id }) => id === body.id), body] as const);
        for (const [one, other] of pairs) {
          if (one === undefined || other === undefined) throw new Error("a body is missing");
          expect(Math.abs(one.x - other.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(one.y - other.y)).toBeLessThanOrEqual(1);
          expect(Math.abs(one.radius - other.radius)).toBeLessThanOrEqual(1);
        }
      }
    });

    it("comes down with no jump, the Earth at the centre in every frame, and asks each frame while it moves", async () => {
      const scene = await diving();
      const frames = Math.round(DIVE.seconds * 60);
      let before = scene.cosmos.stats().eye;
      const start = distanceOf(before, earth);
      for (let at_ = 1; at_ <= frames + 30; at_ += 1) {
        scene.moved.mockClear();
        scene.cosmos.tick(HOME, at_ / 60, at_ / 60);
        const { eye, screen } = scene.cosmos.stats();
        expect(distanceOf(before, eye)).toBeLessThanOrEqual(distanceOf(eye, earth) / 20);
        expect(screen.earth?.x).toBeCloseTo(WIDTH / 2, 1);
        expect(screen.earth?.y).toBeCloseTo(HEIGHT / 2, 1);
        if (at_ < frames) expect(scene.moved).toHaveBeenCalled();
        before = eye;
      }
      expect(start).toBeGreaterThan(20 * distanceOf(before, earth));
      scene.moved.mockClear();
      scene.cosmos.tick(HOME, frames / 60 + 5, frames / 60 + 5);
      expect(scene.moved).not.toHaveBeenCalled();
    });

    // F4152's "never both whole", and the review of 7d5's merge (1): the nebulae take their share from the placed eye's distance, as the
    // whole cosmos does, so each gives up what the other takes, at each step of the way down.
    it("never shows the points and the bodies both whole, nor the points and the nebulae: each follows the placed eye", async () => {
      const scene = await diving();
      const shares: number[] = [];
      const drawn: number[] = [];
      const drawables = () => seen(scene).filter((part) => part instanceof Mesh || part instanceof Points).length;
      for (let step = 0; step <= 44; step += 1) {
        const stats = await frame(scene, DIVE.fade + (step / 40) * DIVE.seconds);
        const [whole, distance] = [stats.web?.share ?? NaN, distanceOf(stats.eye, earth)];
        expect(whole).toBeCloseTo(wholeShare(distance), 9);
        expect(stats.sky.share).toBeCloseTo(nebulaShare(distance), 9);
        expect(whole + stats.sky.share).toBeLessThanOrEqual(1 + 1e-9);
        for (const fade of fades(scene)) expect(fade + whole).toBeLessThanOrEqual(1 + 1e-9);
        if (whole > 0) expect(earthShown(scene)).toBe(false);
        if (earthShown(scene)) expect(whole).toBe(0);
        if (whole >= 1) {
          expect(stats.bodies).toBe(0);
          expect(shownWith(scene, "aOrbit")).toHaveLength(0);
          expect(
            seen(scene).filter((part) => part instanceof Mesh && part.geometry instanceof InstancedBufferGeometry),
          ).toHaveLength(0);
        }
        shares.push(whole);
        drawn.push(drawables());
      }
      // What it costs to draw: at rest's draws and the whole cosmos's two at most, at every step (the red pass, 7).
      await frame(scene, DIVE.seconds + 1);
      expect(Math.max(...drawn)).toBeLessThanOrEqual(drawables() + 2);
      expect(shares[0]).toBe(1);
      expect(shares.at(-1)).toBe(0);
      expect(shares.some((share) => share > 0.1 && share < 0.9)).toBe(true);
      expect(earthShown(scene)).toBe(true);
    });

    // The review of 7d5's merge (1), settled: the nebulae are scenery, so they stand round the scenery's eye, the scene's and the sky's
    // cruise, while the worlds' placed eye dives; their share alone reads the placed eye.
    it("keeps the nebulae round the scenery's eye while the placed eye dives", async () => {
      const scene = await diving();
      const [drift, glide] = [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ];
      for (const clock of [DIVE.seconds / 3, (2 * DIVE.seconds) / 3]) {
        const { sky, eye } = await frame(scene, clock);
        driftAt(drift, clock);
        glideAt(glide, clock);
        expect(sky.eye.x).toBeCloseTo(HOME.x + drift.x - glide.x, 6);
        expect(sky.eye.y).toBeCloseTo(HOME.y + drift.y - glide.y, 6);
        expect(sky.eye.z).toBeCloseTo(HOME.z + drift.z - glide.z, 6);
        expect(distanceOf(eye, earth)).toBeGreaterThan(30);
      }
    });

    // The red pass (2): its clock starts when the whole cosmos can take the view, however late within the wait.
    it("starts when the whole cosmos is ready, however late in the wait, at its start and from nothing", async () => {
      for (const late of [3, DIVE.wait - 0.1]) {
        const scene = made();
        let release = (): void => undefined;
        scene.renderer.compileAsync.mockImplementation((group: Object3D) =>
          group.name === "web"
            ? new Promise<Object3D>((done) => {
                release = () => {
                  done(group);
                };
              })
            : Promise.resolve(group),
        );
        scene.cosmos.dive(false);
        scene.cosmos.show(ONYX);
        for (const clock of [0, 0, 1, late]) await frame(scene, clock);
        release();
        await settled();
        const first = await frame(scene, late + 0.01);
        expect(first.web?.share ?? NaN).toBeLessThan(0.05);
        expect(first.dive.along).toBeLessThan(0.01);
        expect(earthShown(scene)).toBe(false);
        expect((await frame(scene, late + 0.01 + DIVE.seconds / 2)).dive.along).toBeCloseTo(0.5, 6);
        expect((await frame(scene, late + 0.02 + DIVE.seconds)).dive.along).toBe(1);
      }
    });

    // The design review of 7d7: at its opening a row of stars at like steps showed, a ray of the systems' seats seen from its side. Four
    // stars in a chain, each step within 12% of the others and 15% of a step off where the chain leads, a tenth off a line: a row laid out
    // for show. Random points as many give none or one; Onyx's opening must give none.
    const rowsOfFour = (spots: readonly { x: number; y: number }[]) => {
      const nearest = (to: { x: number; y: number }) =>
        spots.reduce((best, spot) =>
          Math.hypot(spot.x - to.x, spot.y - to.y) < Math.hypot(best.x - to.x, best.y - to.y) ? spot : best,
        );
      const step = (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const ahead = { x: 2 * to.x - from.x, y: 2 * to.y - from.y };
        const next = nearest(ahead);
        const off = Math.hypot(next.x - ahead.x, next.y - ahead.y);
        return next === to || next === from || off > 0.15 * Math.hypot(to.x - from.x, to.y - from.y) ? undefined : next;
      };
      const gapsOf = (chain: readonly { x: number; y: number }[]) =>
        chain.slice(1).map((one, at_) => Math.hypot(one.x - (chain[at_]?.x ?? NaN), one.y - (chain[at_]?.y ?? NaN)));
      return spots.flatMap((a) =>
        [...spots]
          .filter((b) => b !== a)
          .sort((one, two) => Math.hypot(one.x - a.x, one.y - a.y) - Math.hypot(two.x - a.x, two.y - a.y))
          .slice(0, 4)
          .flatMap((b) => {
            const c = step(a, b);
            const d = c === undefined ? undefined : step(b, c);
            if (c === undefined || d === undefined) return [];
            const gaps = gapsOf([a, b, c, d]);
            return Math.max(...gaps) / Math.min(...gaps) <= 1.12 && offLine([a, b, c, d]) <= 0.1 ? [[a, b, c, d]] : [];
          }),
      );
    };

    it.each([
      [1728, 1080],
      [1920, 1080],
    ])("opens on no row of four stars at like steps, at %i by %i", async (width, height) => {
      const scene = await diving(false, width, height);
      const { eye } = await frame(scene, DIVE.fade);
      const at = new Vector3();
      const spots = held(ONYX).flatMap(({ place }) => {
        toScene(place, at);
        const seen = at.set(at.x - eye.x, at.y - eye.y, at.z - eye.z).project(scene.camera);
        return seen.z < 1 ? [{ x: ((seen.x + 1) * width) / 2, y: ((1 - seen.y) * height) / 2 }] : [];
      });
      expect(spots.length).toBeGreaterThan(80);
      expect(rowsOfFour(spots)).toEqual([]);
    });

    // The home's first show is the fixed places alone, before its file (worldsFeed.ts): the dive waits for a world to dive to.
    it("waits through the fixed places' empty list for the file, and opens on it", async () => {
      const scene = made();
      scene.cosmos.dive(false);
      scene.cosmos.show([]);
      for (const clock of [0, 0.5, 1]) {
        await frame(scene, clock);
        expect(seen(scene).filter((part) => part instanceof Mesh || part instanceof Points)).toHaveLength(0);
      }
      scene.cosmos.show(ONYX);
      for (const clock of [1.1, 1.1, 1.1]) await frame(scene, clock);
      const open = await frame(scene, 1.1 + DIVE.fade);
      expect(open.web?.share).toBe(1);
      expect((await frame(scene, 1.3 + DIVE.seconds)).dive.along).toBe(1);
      expect(earthShown(scene)).toBe(true);
    });

    // 7d6's review (F4264): the view at rest's bodies hold where the eye comes to rest, so none stands then goes as it lands.
    it("draws only the view at rest's bodies on the way down, each staying once it came, so none comes and goes as it lands", async () => {
      const scene = await diving();
      const plain = await atRest();
      const rest = new Set(plain.cosmos.stats().list.map(({ id }) => id));
      let before = new Set<string>();
      let whole = 0;
      for (let step = 0; step <= 30; step += 1) {
        const { list, dive } = await frame(scene, (step / 30) * (DIVE.seconds + 1));
        const ids = new Set(list.map(({ id }) => id));
        for (const id of ids) expect(rest.has(id)).toBe(true);
        for (const id of before) expect(ids.has(id)).toBe(true);
        if (ids.size === rest.size && dive.along < 0.95) whole += 1;
        before = ids;
      }
      expect(whole).toBeGreaterThan(0);
      expect(before).toEqual(rest);
    });

    // 7d9: half way down the close world came from nothing, 9 pixels across, its system showing no point at rest. Wherever the disc has
    // a share of the view (its fade, from the whole cosmos and the dive) and the ladder lights its system's points, however dimly (within
    // the middle distance), it is a point of its size, then its body, where it holds.
    it("draws the close world from afar as a point of its size, then as its body, on every frame it is lit and the disc has a share", async () => {
      const scene = await diving();
      const { system, world } = onyxClose();
      const kinds = new Set<string>();
      const eye = nowhere();
      for (let step = 0; step <= 120; step += 1) {
        const clock = (step / 120) * (DIVE.seconds + 0.5);
        await frame(scene, clock);
        const seen = drawnOf(scene, [system, world], clock);
        const [points] = dots(scene);
        toMap(scene.cosmos.stats().eye, eye);
        const lit = dotLight(distanceOf(eye, system.place)) > 0;
        if (Number(points?.material.uniforms["uFade"]?.value ?? 0) === 0 || !lit || !seen.onScreen) continue;
        kinds.add(drawnOnce(seen, `at ${clock.toFixed(2)} s`).kind);
      }
      expect([...kinds].sort()).toEqual(["body", "point"]);
    });

    // The chief, 2026-11-03, on the design review of 7d9: on the home's dive the hero's room shrank the close world as it passed its
    // corner, to 0.43 of its size, then let it swell 3.8 times where its distance gave 1.8. On the way down the bodies pass behind the
    // text, as frame 1's do behind the hero's number: the close world at its true size on every frame.
    it("lets the close world pass behind the hero's text on the way down, at its true size on every frame", async () => {
      const scene = await diving();
      scene.cosmos.keepClear({ left: 0, top: HERO_ZONE.top * HEIGHT, right: HERO_ZONE.right * WIDTH, bottom: HEIGHT });
      const { system, world } = onyxClose();
      let near = 0;
      for (let step = 0; step <= 120; step += 1) {
        const clock = (step / 120) * DIVE.seconds;
        const { dive } = await frame(scene, clock);
        const { asBody, radius, onScreen } = drawnOf(scene, [system, world], clock);
        if (dive.along >= 1 || asBody === undefined || !onScreen) continue;
        near += Number(radius > 20);
        expect(asBody.size / radius, `at ${clock.toFixed(2)} s`).toBeGreaterThan(0.99);
      }
      expect(near).toBeGreaterThan(5);
    });

    // The review of 7d9 (its medium 1): the worlds turned by the page's clock, so a dive that starts later than its first second (a wait
    // for the whole cosmos, or the home reached from another page) came down past postcards the search had not judged there. The worlds'
    // clock counts from the arrival: a dive that starts 30 s into the page lands as one that starts at once.
    it("turns the worlds from the arrival: a dive that starts 30 s into the page lands as one that starts at once", async () => {
      const landing = async (late: number) => {
        const scene = made();
        scene.cosmos.dive(false);
        scene.cosmos.show(ONYX);
        for (let step = 0; step < 3; step += 1) {
          scene.cosmos.tick(HOME, late, 0);
          await settled();
        }
        for (let step = 0; step <= 30; step += 1) {
          const clock = (step / 30) * (DIVE.seconds + 1);
          scene.cosmos.tick(HOME, late + clock, clock);
          await settled();
        }
        const at = DIVE.seconds + 1;
        scene.cosmos.tick(HOME, late + at, at);
        const { eye, list } = scene.cosmos.stats();
        return {
          eye,
          places: new Map(list.map(({ id, at: from }) => [id, from.clone().add(new Vector3(eye.x, eye.y, eye.z))])),
        };
      };
      const [soon, late] = [await landing(0), await landing(30)];
      expect(distanceOf(late.eye, soon.eye)).toBeLessThan(1e-6);
      expect([...late.places.keys()].sort()).toEqual([...soon.places.keys()].sort());
      for (const [id, place] of soon.places) expect(late.places.get(id)?.distanceTo(place)).toBeLessThan(1e-6);
    });

    // The red pass (H1): its body's programs compiling, the close world stays a point and its body hides; compiled, its body shows and
    // the point goes, never both on one frame.
    it("keeps the close world a point while its body compiles, then draws its body alone", async () => {
      const scene = await diving();
      const waiting: (() => void)[] = [];
      scene.renderer.compileAsync.mockImplementation(
        () =>
          new Promise((done) => {
            waiting.push(() => {
              done(scene.stage);
            });
          }),
      );
      const { system, world } = onyxClose();
      let [compiling, clock] = [0, 0];
      for (let step = 0; step <= 120 && compiling < 3; step += 1) {
        clock = (step / 120) * DIVE.seconds;
        await frame(scene, clock);
        if (!scene.cosmos.stats().list.some(({ id }) => id === world.id)) continue;
        compiling += 1;
        const seen = drawnOf(scene, [system, world], clock);
        expect(seen.asBody).toBeUndefined();
        expect(seen.asPoint).toBeDefined();
      }
      expect(compiling).toBe(3);
      for (const go of waiting) go();
      await settled();
      await frame(scene, clock + 1 / 60);
      const seen = drawnOf(scene, [system, world], clock + 1 / 60);
      expect(seen.asBody).toBeDefined();
      expect(seen.asPoint).toBeUndefined();
    });

    // Alexis, 2026-11-02: depth everywhere, and not a planetarium. Each frame of the way down that shows four bodies or more slides the
    // near ones more than the far and stands no three at like gaps; within the twenty eyes' distances, 60 units, their bar too: sizes 1.9
    // times apart, off a line. Farther, all stand 100 units off or more, their sizes as their distances, 1.65 times apart at 115 units.
    it("reads in depth on the way down, and shows no row at like gaps", async () => {
      const scene = await diving();
      let qualified = 0;
      for (let step = 0; step <= 60; step += 1) {
        const { screen, eye } = await frame(scene, (step / 60) * DIVE.seconds);
        if (screen.earth === undefined || !earthShown(scene)) continue;
        const bodies = screen.bodies.filter(
          ({ x, y, radius }) => x + radius > 0 && x - radius < WIDTH && y + radius > 0 && y - radius < HEIGHT,
        );
        const marks = [{ ...screen.earth, away: distanceOf(eye, earth) }, ...bodies].map(({ x, y, radius, away }) => ({
          x,
          y,
          radius,
          away,
          depth: away,
          left: x - radius,
          right: x + radius,
          top: y - radius,
          bottom: y + radius,
        }));
        expect(evenRow(marks)).toBe(false);
        if (bodies.length < 4) continue;
        const slid = slides(scene);
        expect(slid[0]?.by ?? 0).toBeGreaterThan(slid.at(-1)?.by ?? Infinity);
        if (distanceOf(eye, earth) > EYES_FARTHEST) continue;
        qualified += 1;
        const sizes = [screen.earth.radius, ...bodies.map(({ radius }) => radius)];
        expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThanOrEqual(SIZES_APART);
        expect(offLine([screen.earth, ...bodies])).toBeGreaterThan(0.1);
      }
      expect(qualified).toBeGreaterThanOrEqual(3);
    });

    // Each frame of a dissolve, 80 of them to `end`: the eye, the veil, and what shows of the points and of the bodies.
    const dissolving = async (scene: ReturnType<typeof made>, end: number) => {
      const { gl, copy } = fakeGl();
      // The red pass (4): the frame copied is the whole cosmos still, whole, after the hold, with no picture over it yet.
      let clock = 0;
      const copied: { clock: number; share: number | undefined; veil: number }[] = [];
      copy.mockImplementation(() => {
        const { web, dive } = scene.cosmos.stats();
        copied.push({ clock, share: web?.share, veil: dive.veil });
      });
      const frames = [];
      for (let step = 0; step <= 80; step += 1) {
        clock = (step / 80) * end;
        const before = scene.cosmos.stats().dive;
        scene.moved.mockClear();
        const stats = await frame(scene, clock, true);
        drawn(scene, gl);
        // A frame asked each tick until it has landed, the one that takes its picture away among them (the red pass, 5); what shows of
        // the points, the whole cosmos drawn or the picture of it the dissolve holds, and of the bodies, what it lets through.
        frames.push({
          landed: before.along === 1 && before.veil === 0,
          asked: scene.moved.mock.calls.length > 0,
          eye: spotKey(stats.eye),
          veil: stats.dive.veil,
          strength: Math.max(stats.web?.share ?? 0, stats.dive.veil) + (earthShown(scene) ? 1 - stats.dive.veil : 0),
        });
      }
      return { frames, copied, copy };
    };

    it("moves no camera under reduced motion: the whole cosmos still, then a dissolve into the view at rest", async () => {
      const scene = await diving(true);
      const plain = await atRest();
      const end = DIVE.hold + DIVE.dissolve + 0.5;
      const { frames, copied, copy } = await dissolving(scene, end);
      for (const { landed, asked, strength } of frames) {
        if (!landed) expect(asked).toBe(true);
        expect(strength).toBeLessThanOrEqual(1 + 1e-9);
      }
      const [eyes, veils] = [new Set(frames.map(({ eye }) => eye)), frames.map(({ veil }) => veil)];
      expect(eyes.size).toBe(2);
      expect(eyes.has(spotKey(plain.cosmos.stats().eye))).toBe(true);
      expect(copy).toHaveBeenCalledTimes(1);
      expect(copied[0]?.clock).toBeGreaterThanOrEqual(DIVE.hold);
      expect(copied[0]).toMatchObject({ share: 1, veil: 0 });
      expect(veils[Math.round((80 * DIVE.hold) / 2 / end)]).toBe(0);
      const going = veils.slice(veils.indexOf(Math.max(...veils)));
      expect(Math.max(...veils)).toBe(1);
      for (let at_ = 1; at_ < going.length; at_ += 1)
        expect(going[at_] ?? NaN).toBeLessThanOrEqual(going[at_ - 1] ?? NaN);
      expect(going.some((veil) => veil > 0.1 && veil < 0.9)).toBe(true);
      expect(veils.at(-1)).toBe(0);
      expect(earthShown(scene)).toBe(true);
      expect(scene.stage.getObjectByName("dissolve")).toBeUndefined();
    });

    // The picture laid over the stage while it dissolves: on every pixel, over everything, as much of it as the veil says.
    const laidOver = (scene: ReturnType<typeof made>, veil: number) => {
      const over = scene.stage.getObjectByName("dissolve") as Mesh<BufferGeometry, ShaderMaterial> | undefined;
      if (over === undefined) throw new Error("no picture laid over");
      expect(over.visible).toBe(true);
      expect(over.material.depthTest).toBe(false);
      expect(over.material.uniforms["uVeil"]?.value).toBeCloseTo(veil, 9);
      let highest = -Infinity;
      scene.stage.traverse((part) => {
        if (part !== over) highest = Math.max(highest, part.renderOrder);
      });
      expect(over.renderOrder).toBeGreaterThan(highest);
      over.geometry.computeBoundingBox();
      const { min, max } = over.geometry.boundingBox ?? new Box3();
      expect(Math.max(min.x, min.y)).toBeLessThanOrEqual(-1);
      expect(Math.min(max.x, max.y)).toBeGreaterThanOrEqual(3);
    };

    it("lays the copied frame over the whole screen, on top, as much of it as the veil says, at the drawing buffer's size", async () => {
      const scene = await diving(true);
      const { gl, copy } = fakeGl();
      let checked = 0;
      for (let step = 0; step <= 60; step += 1) {
        const { dive } = await frame(scene, (step / 60) * (DIVE.hold + DIVE.dissolve), true);
        drawn(scene, gl);
        if (dive.veil <= 0 || dive.veil >= 1) continue;
        checked += 1;
        laidOver(scene, dive.veil);
      }
      expect(checked).toBeGreaterThan(5);
      const [picture] = (copy.mock.calls[0] ?? []) as [FramebufferTexture?];
      expect(picture).toBeInstanceOf(FramebufferTexture);
      expect(picture?.image).toMatchObject({ width: 2 * WIDTH, height: 2 * HEIGHT });
    });

    // The security review of 7d7: a dissolve that goes before its frame was copied gives the stage its hook back, and copies nothing.
    it("gives the stage its own hook back when the cosmos goes before the frame was copied", async () => {
      const scene = await diving(true);
      for (const clock of [0, DIVE.hold / 2, DIVE.hold]) await frame(scene, clock, true);
      // Armed: the stage holds a hook of its own, the dissolve's.
      expect(Object.hasOwn(scene.stage, "onAfterRender")).toBe(true);
      scene.owner.dispose();
      const { gl, copy } = fakeGl();
      drawn(scene, gl);
      expect(copy).not.toHaveBeenCalled();
      expect(scene.stage.getObjectByName("dissolve")).toBeUndefined();
    });

    // The review of 7d7 (1): a reader who left the home during the dissolve left its picture on the stage every page draws on.
    it("ends the dive when the home goes: nothing of it stays on the stage, and the home comes back at rest", async () => {
      const scene = await diving(true);
      const { gl } = fakeGl();
      for (const clock of [0, DIVE.hold, DIVE.hold + 0.01, DIVE.hold + DIVE.dissolve / 2]) {
        await frame(scene, clock, true);
        drawn(scene, gl);
      }
      expect(scene.cosmos.stats().dive.veil).toBeGreaterThan(0);
      scene.cosmos.show(undefined);
      await frame(scene, DIVE.hold + DIVE.dissolve, true);
      expect(scene.stage.getObjectByName("dissolve")).toBeUndefined();
      scene.cosmos.show(ONYX);
      expect((await frame(scene, DIVE.hold + DIVE.dissolve + 1, true)).dive).toEqual({ along: 1, veil: 0 });
    });

    it("frees the copied frame when the cosmos goes in the middle of its dissolve", async () => {
      const scene = await diving(true);
      const { gl } = fakeGl();
      const disposed = vi.spyOn(FramebufferTexture.prototype, "dispose");
      for (const clock of [0, DIVE.hold, DIVE.hold + 0.01, DIVE.hold + DIVE.dissolve / 2]) {
        await frame(scene, clock, true);
        drawn(scene, gl);
      }
      expect(scene.cosmos.stats().dive.veil).toBeGreaterThan(0);
      scene.owner.dispose();
      expect(disposed).toHaveBeenCalledTimes(1);
      disposed.mockRestore();
    });

    it("frees the dissolve's picture once it is done, and copies none with motion on", async () => {
      const scene = await diving(true);
      const { gl, copy } = fakeGl();
      const disposed = vi.spyOn(FramebufferTexture.prototype, "dispose");
      for (let step = 0; step <= 40; step += 1) {
        await frame(scene, (step / 40) * (DIVE.hold + DIVE.dissolve + 0.5), true);
        drawn(scene, gl);
      }
      expect(copy).toHaveBeenCalledTimes(1);
      expect(disposed).toHaveBeenCalledTimes(1);
      const moving = await diving();
      const other = fakeGl();
      for (let step = 0; step <= 40; step += 1) {
        await frame(moving, (step / 40) * (DIVE.seconds + 1));
        drawn(moving, other.gl);
      }
      expect(other.copy).not.toHaveBeenCalled();
      disposed.mockRestore();
    });

    it("shows nothing of the cosmos while it waits for the whole cosmos, and gives the dive up for the view at rest after a while", async () => {
      const scene = made();
      scene.renderer.compileAsync.mockImplementation((group: Object3D) =>
        group.name === "web" ? new Promise<Object3D>(() => undefined) : Promise.resolve(group),
      );
      scene.cosmos.dive(false);
      scene.cosmos.show(ONYX);
      for (const clock of [0, 0, 1, DIVE.wait - 0.1]) {
        const stats = await frame(scene, clock);
        expect(seen(scene).filter((part) => part instanceof Mesh || part instanceof Points)).toHaveLength(0);
        expect(stats.sky.share).toBe(0);
      }
      const late = await frame(scene, DIVE.wait + 0.1);
      // The worlds arrive as it gives up, and turn from then (7d9): it lands on the view at rest as that stands at its own arrival.
      const rest = await frame(await atRest(), 0);
      expect(late.dive.along).toBe(1);
      expect(spotKey(late.eye)).toBe(spotKey(rest.eye));
      await frame(scene, DIVE.wait + 0.2);
      expect(earthShown(scene)).toBe(true);
    });

    it("gives the dive up for the fixed places when no world comes within the wait: the great star and the Earth", async () => {
      const scene = made();
      scene.cosmos.dive(false);
      scene.cosmos.show([]);
      // The wait counts from its first frame once its code is here, a few milliseconds after it was asked.
      await frame(scene, 0);
      await frame(scene, 0);
      expect((await frame(scene, DIVE.wait - 0.1)).dive.along).toBe(0);
      await frame(scene, DIVE.wait + 0.1);
      const { dive, stars } = await frame(scene, DIVE.wait + 0.2);
      expect(dive.along).toBe(1);
      expect(stars).toBe(1);
      expect(earthShown(scene)).toBe(true);
    });

    // The red pass (3): the feed reads its file once, but a new list after the landing moves the eye once, as 7d6's view does, and dives
    // no more.
    it("dives no more once landed: a new list moves the eye once to its own view", async () => {
      const scene = await diving();
      await frame(scene, DIVE.seconds + 0.5);
      const other = worlds(30);
      const plain = made();
      await shown(plain, other);
      scene.cosmos.show(other);
      for (const clock of [DIVE.seconds + 0.6, DIVE.seconds + 0.7]) await frame(scene, clock);
      const [moved, rest] = [await frame(scene, DIVE.seconds + 1), await frame(plain, DIVE.seconds + 1)];
      expect(moved.dive).toEqual({ along: 1, veil: 0 });
      expect(moved.web?.share ?? 0).toBe(0);
      expect(spotKey(moved.eye)).toBe(spotKey(rest.eye));
      expect(spotKey(rest.eye)).not.toBe(spotKey((await frame(await atRest(), DIVE.seconds + 1)).eye));
    });

    it("dives only when asked: a cosmos shown without it stands at rest at once", async () => {
      const plain = await atRest();
      expect(plain.cosmos.stats().dive).toEqual({ along: 1, veil: 0 });
      expect(earthShown(plain)).toBe(true);
    });
  });
});

describe("a system's arrival (7d3)", () => {
  // Comes to system `id`: the scene's eye the cosmos asks for, given back to it as the scene's frame would.
  const arrived = async (scene: ReturnType<typeof made>, id: string | undefined) => {
    const go = vi.fn<(eye: Point) => void>();
    scene.cosmos.arrive(id, go);
    await settled();
    const to = go.mock.lastCall?.[0];
    if (to === undefined) throw new Error("no arrival");
    scene.cosmos.tick(to, 0);
    await settled();
    scene.cosmos.tick(to, 0);
    await settled();
    return { to, go };
  };
  const onStage = (at: Point) => {
    const out = { x: NaN, y: NaN, z: NaN };
    toScene(at, out);
    return new Vector3(out.x, out.y, out.z);
  };
  const named = (systems: readonly StarSystem[], id: string) => {
    const found = systems.find((system) => system.id === id);
    if (found === undefined) throw new Error(`no system ${id}`);
    return found;
  };
  // Onyx's gnoswap: sixteen worlds and a far belt, 90 units from the Earth.
  const GNOSWAP = "gnoswap";
  const atGnoswap = async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const system = named(systems, GNOSWAP);
    await arrived(scene, GNOSWAP);
    return { scene, systems, system, arrival: arrivalOf(system, systems) };
  };
  // The farthest belted system of a large file, past a cluster's distance from the Earth.
  const farthest = (systems: readonly StarSystem[]) => {
    const [far] = systems
      .filter(({ belt, worlds: list }) => belt && list.length > 0)
      .sort((a, b) => distanceOf(b.place, EARTH_PLACE) - distanceOf(a.place, EARTH_PLACE));
    if (far === undefined) throw new Error("no belted system");
    return far;
  };
  const sunsOf = (scene: ReturnType<typeof made>) => {
    const [mesh] = glows(scene);
    if (mesh === undefined) throw new Error("no suns");
    const [at, sun, halo] = ["aAt", "aSun", "aHalo"].map((name) => mesh.geometry.getAttribute(name));
    const indexOf = (place: Point) =>
      Array.from({ length: mesh.geometry.instanceCount }, (_, index) => index).find(
        (index) =>
          Math.hypot(
            (at?.getX(index) ?? NaN) - place.x,
            (at?.getY(index) ?? NaN) - place.y,
            (at?.getZ(index) ?? NaN) - place.z,
          ) < 1e-4,
      ) ?? -1;
    return { mesh, sun, halo, indexOf };
  };

  it("stands the eye at the system's arrival", async () => {
    const { scene, arrival } = await atGnoswap();
    expect(new Vector3().copy(scene.cosmos.stats().eye).distanceTo(onStage(arrival.eye))).toBeLessThan(1e-6);
  });

  it("stands its postcard's worlds as the bodies, and no other", async () => {
    const { scene, arrival } = await atGnoswap();
    const ids = scene.cosmos.stats().list.map(({ id }) => id);
    expect(ids.sort()).toEqual(arrival.postcard.worlds.map(({ id }) => id).sort());
  });

  it("turns the camera to what the arrival looks at, the map's up kept up", async () => {
    const { scene, arrival } = await atGnoswap();
    const eye = new Vector3().copy(scene.cosmos.stats().eye);
    const ahead = new Vector3(0, 0, -1).applyQuaternion(scene.camera.quaternion);
    expect(ahead.angleTo(onStage(arrival.look).sub(eye))).toBeLessThan(1e-6);
    // No roll: the camera's right lies flat on the map.
    const right = new Vector3(1, 0, 0).applyQuaternion(scene.camera.quaternion);
    expect(right.dot(onStage({ x: 0, y: 1, z: 0 }).sub(onStage({ x: 0, y: 0, z: 0 })))).toBeCloseTo(0, 9);
  });

  it("lights each body from its own star", async () => {
    const { scene, system } = await atGnoswap();
    const eye = new Vector3().copy(scene.cosmos.stats().eye);
    const { list } = scene.cosmos.stats();
    expect(list.length).toBeGreaterThan(0);
    for (const body of list) expect(body.star.distanceTo(onStage(system.place).sub(eye))).toBeLessThan(1e-6);
  });

  it("makes its star the main light: a whole halo, the widest on the screen, the great star half its size at most", async () => {
    const { scene, systems, system, arrival } = await atGnoswap();
    const { sun, halo, indexOf } = sunsOf(scene);
    const size = (place: Point) => {
      const index = indexOf(place);
      return index < 0 ? 0 : (sun?.getX(index) ?? NaN) / distanceOf(place, arrival.eye);
    };
    expect(halo?.getX(indexOf(system.place))).toBe(1);
    const own = size(system.place);
    expect(own).toBeGreaterThan(0);
    // Read from a Float32 attribute, as the GPU holds it: to a float's precision.
    for (const other of systems)
      if (other !== system) expect(size(other.place)).toBeLessThanOrEqual((own / 2) * (1 + 1e-6));
  });

  it("lays its far belt clear of its worlds: every rock half a unit or more off every world it draws, at any turn", async () => {
    const { scene, systems, system, arrival } = await atGnoswap();
    expect(system.belt).toBe(true);
    const drawnOf = (found: StarSystem) =>
      found === system
        ? { system: arrival.postcard.system, worlds: [...arrival.postcard.worlds, ...system.worlds] }
        : { system: found, worlds: found.worlds };
    const own = rocksOf(scene, scene.cosmos.stats().rocks).filter(
      ({ star }) => star.distanceTo(new Vector3().copy(system.place)) < 1e-4,
    );
    expect(own.length).toBeGreaterThan(0);
    expect(debrisClear(scene, systems, drawnOf)).toBeGreaterThan(0);
  });

  it("looks around the system it came to, however far from the Earth: its belt laid, the disc whole, no whole cosmos asked", async () => {
    const scene = made();
    const list = worlds(3000, 3);
    await shown(scene, list);
    const systems = held(list);
    const far = farthest(systems);
    expect(distanceOf(far.place, EARTH_PLACE)).toBeGreaterThan(MOOD_SCALE);
    await arrived(scene, far.id);
    expect(scene.cosmos.stats().web).toBeUndefined();
    expect(sunsOf(scene).mesh.material.uniforms["uFade"]?.value).toBe(1);
    const own = rocksOf(scene, scene.cosmos.stats().rocks).filter(
      ({ star }) => star.distanceTo(new Vector3().copy(far.place)) < 1e-4,
    );
    expect(own.length).toBeGreaterThan(0);
    expect(scene.cosmos.stats().list.length).toBe(arrivalOf(far, systems).postcard.worlds.length);
  });

  it("goes back to the view at rest when asked no system: the scene's eye at home, the view's own bodies", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const home = new Set(scene.cosmos.stats().list.map(({ id }) => id));
    await arrived(scene, GNOSWAP);
    const { to } = await arrived(scene, undefined);
    expect(to).toEqual(HOME);
    expect(new Set(scene.cosmos.stats().list.map(({ id }) => id))).toEqual(home);
    const { earth } = scene.cosmos.stats().screen;
    expect(earth?.x).toBeCloseTo(WIDTH / 2, 1);
  });

  // 7d3's review: the arrival's own star the one light; the great star keeps the halo its distance leaves it, the others a quarter.
  it("leaves the great star at an arrival no more halo than its distance leaves it, and every other sun a quarter of the arrival star's size", async () => {
    const { scene, systems, system, arrival } = await atGnoswap();
    const { sun, halo, indexOf } = sunsOf(scene);
    const great = indexOf({ x: 0, y: 0, z: 0 });
    expect(great).toBeGreaterThanOrEqual(0);
    // Not forced whole: at most what its distance leaves it, and nothing if six nearer suns took the halos.
    expect(halo?.getX(great)).toBeLessThanOrEqual(haloAt(distanceOf({ x: 0, y: 0, z: 0 }, arrival.eye)) + 1e-9);
    expect(halo?.getX(great)).toBeLessThan(1);
    const size = (place: Point) => (sun?.getX(indexOf(place)) ?? NaN) / distanceOf(place, arrival.eye);
    const own = size(system.place);
    for (const other of systems)
      if (other !== system && indexOf(other.place) >= 0) expect(size(other.place)).toBeLessThanOrEqual(own / 4 + 1e-9);
  });

  it("keeps the arrival's star the main light when the eye leans away from it, past the view's reach", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const system = named(systems, GNOSWAP);
    const { to } = await arrived(scene, GNOSWAP);
    scene.cosmos.tick({ x: to.x + 12, y: to.y + 6, z: to.z }, 0);
    await settled();
    const { halo, indexOf } = sunsOf(scene);
    expect(halo?.getX(indexOf(system.place))).toBe(1);
  });

  it("lights an arrival's bodies as up close: each world its own angle from the eye", async () => {
    const { scene } = await atGnoswap();
    const { list } = scene.cosmos.stats();
    expect(list.length).toBeGreaterThan(0);
    for (const { id, at, sun } of list) {
      const toEye = at.clone().negate().normalize();
      expect(sun.angleTo(toEye)).toBeCloseTo(fromEyeOf(planetSeed(asciiBytes(`gno.land/r/${id}`))), 6);
    }
  });

  // The points the disc writes: each one's star, its orbit and phase, and its size in pixels.
  const pointsOf = (scene: ReturnType<typeof made>) => {
    const [points] = dots(scene);
    if (points === undefined) return [];
    const read = (name: string, at: number, axis: "getX" | "getY" | "getZ") =>
      points.geometry.getAttribute(name)[axis](at);
    return Array.from({ length: scene.cosmos.stats().dots }, (_, at) => ({
      star: { x: read("position", at, "getX"), y: read("position", at, "getY"), z: read("position", at, "getZ") },
      orbit: read("aOrbit", at, "getX"),
      phase: read("aOrbit", at, "getY"),
      size: read("aSize", at, "getX"),
    }));
  };
  // Two worlds' distance in their system's plane, from their orbits and phases.
  const inPlane = (a: { orbit: number; phase: number }, b: { orbit: number; phase: number }) =>
    Math.hypot(
      a.orbit * Math.cos(a.phase) - b.orbit * Math.cos(b.phase),
      a.orbit * Math.sin(a.phase) - b.orbit * Math.sin(b.phase),
    );

  it("draws its other worlds as whole points, none on a body's ground", async () => {
    const { scene, system, arrival } = await atGnoswap();
    const own = pointsOf(scene).filter(({ star }) => distanceOf(star, system.place) < 1e-4);
    expect(own.length).toBeGreaterThan(0);
    for (const point of own) {
      const world = system.worlds.find(
        (each) => Math.abs(each.orbit - point.orbit) < 1e-4 && Math.abs(each.phase - point.phase) < 1e-4,
      );
      if (world !== undefined && world.radius >= GRAIN) expect(point.size).toBeGreaterThanOrEqual(2);
      for (const body of arrival.postcard.worlds)
        expect(inPlane(point, body) - body.radius).toBeGreaterThanOrEqual(0.5);
    }
  });

  // Alexis, 2026-11-03 (reports/alexis-0816-postcard.png): pebbles round agents on the home's lower postcard, g1magld5's 124 grains on
  // orbits from 1.61 to 3.28, agents widened to 3.25 among them.
  it("keeps g1magld5's grain a body's width off agents and streak in Onyx's view at rest", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const system = systems.find(({ id }) => id.startsWith("g1magld5"));
    if (system === undefined) throw new Error("no g1magld5");
    const { worlds: bodies } = postcardOf(system, restView(systems).eye);
    expect(bodies.map(({ id }) => id.split("/").at(-1))).toEqual(["agents", "streak"]);
    const own = pointsOf(scene).filter(({ star }) => distanceOf(star, system.place) < 1e-4);
    expect(own.length).toBeGreaterThan(40);
    for (const point of own)
      for (const body of bodies) expect(inPlane(point, body) - body.radius).toBeGreaterThanOrEqual(body.radius);
  });

  // Alexis, 2026-11-03 (reports/alexis-1213-same-level.png): the lower postcard's agents and streak stood 1.17 times apart, 92 pixels apart
  // in height. Option B: the nearer drawn larger, 1.5 times its neighbour or more, never at one height; the view keeps its framing
  // (decisions of 2026-11-02): the close world, two postcards of two bodies and one, the Earth at the centre.
  it("draws Onyx's postcards in depth at rest, the nearer larger and at another height, in the view it framed", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const { screen } = scene.cosmos.stats();
    const bodies = new Map(screen.bodies.map((body) => [body.id.split("/").at(-1), body]));
    for (const framed of ["agents", "gnoslinger", "minichess", "streak"]) expect(bodies.has(framed)).toBe(true);
    const [agents, streak] = [bodies.get("agents"), bodies.get("streak")];
    if (agents === undefined || streak === undefined) throw new Error("no postcard pair");
    const [near, far] = agents.away < streak.away ? [agents, streak] : [streak, agents];
    expect(near.radius / far.radius).toBeGreaterThanOrEqual(1.5);
    const [across, up] = [Math.abs(agents.x - streak.x), Math.abs(agents.y - streak.y)];
    expect(up >= 0.1 * HEIGHT || up >= Math.tan((40 * Math.PI) / 180) * across).toBe(true);
    expect(screen.earth?.x).toBeCloseTo(WIDTH / 2, 0);
    expect(screen.earth?.y).toBeCloseTo(HEIGHT / 2, 0);
  });

  // Alexis, 2026-11-03 ("la perspective doit être partout"): the frame's sizes span about ten times, where they spanned 7.5 (149 px for the
  // close world to gnoslinger's 20). Onyx draws no depth body under the review's rules: its disc, seen low, stands its candidates' stars on
  // one band, and each would row with them, stand on the great star's glow or twin a neighbour (the chief's option A, 2026-11-03).
  it("draws Onyx's view at rest in depth, its sizes spanning eight times or more, and each depth body the core finds", async () => {
    const scene = made();
    await shown(scene, ONYX);
    const systems = held(ONYX);
    const view = restView(systems);
    const deep = deepOf(systems, view, judgeOf(systems, view, LENT)).map(
      ({ system, world }) => systems[system]?.worlds[world]?.id,
    );
    const { screen } = scene.cosmos.stats();
    const ids = screen.bodies.map(({ id }) => id);
    for (const id of deep) expect(ids).toContain(id);
    const earth = screen.earth?.radius ?? NaN;
    const radii = [earth, ...screen.bodies.map(({ radius }) => radius)];
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThanOrEqual(8);
    const close = screen.bodies.find(({ id }) => id.endsWith("/minichess"));
    for (const { id, away } of screen.bodies.filter((body) => deep.includes(body.id)))
      expect(away, id).toBeGreaterThan(2 * (close?.away ?? NaN));
  });

  // Alexis, 2026-11-03 ("roches d'ambiance", through the chief): a few rocks at the home's view at rest, decor laid in space, which the
  // labels' chunk draws from what each look leaves (7p); a system's arrival has none.
  it("lays a few rocks at Onyx's home for the labels' chunk to draw, and none at a system's arrival", async () => {
    const scene = made();
    const look = vi.fn<NonNullable<typeof scene.cosmos.labels>["look"]>();
    scene.cosmos.labels = { list: vi.fn(), look, tick: vi.fn() };
    await shown(scene, ONYX);
    const rocks = () => look.mock.lastCall?.[1].rocks ?? [];
    expect(rocks().length).toBeGreaterThanOrEqual(3);
    expect(rocks().length).toBeLessThanOrEqual(7);
    await arrived(scene, GNOSWAP);
    expect(rocks()).toEqual([]);
  });

  it("sways along the arrival's own axes, across and up its view of what it looks at", async () => {
    const { scene, arrival } = await atGnoswap();
    const { to } = await arrived(scene, GNOSWAP);
    const look = onStage(arrival.look);
    for (const seconds of [2.25, 4.5]) {
      scene.cosmos.tick(to, seconds);
      const eye = new Vector3().copy(scene.cosmos.stats().eye);
      const offset = eye.clone().sub(onStage(arrival.eye));
      expect(offset.length()).toBeGreaterThan(0.01);
      expect(offset.dot(look.clone().sub(onStage(arrival.eye)).normalize())).toBeCloseTo(0, 6);
    }
  });

  it("leans half as far at an arrival as at home: the eye nearer what it looks at", async () => {
    const { scene, arrival } = await atGnoswap();
    const { to } = await arrived(scene, GNOSWAP);
    scene.cosmos.tick({ x: to.x + LEAN, y: to.y + LEAN, z: to.z }, 0);
    const moved = new Vector3().copy(scene.cosmos.stats().eye).sub(onStage(arrival.eye));
    expect(moved.x).toBeCloseTo(ARRIVAL_LEAN, 6);
    expect(moved.y).toBeCloseTo(ARRIVAL_LEAN, 6);
    expect(moved.z).toBeCloseTo(0, 6);
  });

  it.each(["", "no/such", "__proto__", "constructor", "x".repeat(10_000)])(
    "goes back to the view at rest for a system the file does not hold: %#",
    async (id) => {
      const scene = made();
      await shown(scene, ONYX);
      const home = new Set(scene.cosmos.stats().list.map(({ id: world }) => world));
      const { to, go } = await arrived(scene, id);
      expect(go).toHaveBeenCalledTimes(1);
      expect(to).toEqual(HOME);
      expect(new Set(scene.cosmos.stats().list.map(({ id: world }) => world))).toEqual(home);
    },
  );

  it("keeps an arrival asked before the file came, and comes once it does", async () => {
    const scene = made();
    const go = vi.fn<(eye: Point) => void>();
    scene.cosmos.arrive(GNOSWAP, go);
    await settled();
    expect(go).not.toHaveBeenCalled();
    await shown(scene, ONYX);
    expect(go).toHaveBeenCalledTimes(1);
    const arrival = arrivalOf(named(held(ONYX), GNOSWAP), held(ONYX));
    scene.cosmos.tick(go.mock.lastCall?.[0] ?? HOME, 0);
    expect(new Vector3().copy(scene.cosmos.stats().eye).distanceTo(onStage(arrival.eye))).toBeLessThan(1e-6);
  });

  it("comes to the last system asked: one asked before it, its chunk still on its way, never moves the eye", async () => {
    const scene = made();
    const [first, last] = [vi.fn<(eye: Point) => void>(), vi.fn<(eye: Point) => void>()];
    scene.cosmos.show(ONYX);
    scene.cosmos.arrive(GNOSWAP, first);
    scene.cosmos.arrive("gnoland", last);
    await settled();
    await vi.dynamicImportSettled();
    await settled();
    expect(first).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledTimes(1);
  });

  it("moves no eye once it is gone, though the arrival was asked before its chunk came", async () => {
    const scene = made();
    const go = vi.fn<(eye: Point) => void>();
    scene.cosmos.show(ONYX);
    scene.cosmos.arrive(GNOSWAP, go);
    scene.owner.dispose();
    await vi.dynamicImportSettled();
    await settled();
    expect(go).not.toHaveBeenCalled();
  });

  it("holds the eye where it is when the same file comes again: the same arrival, no move", async () => {
    const { scene } = await atGnoswap();
    const go = vi.fn<(eye: Point) => void>();
    scene.cosmos.arrive(GNOSWAP, go);
    await settled();
    expect(go).toHaveBeenCalledTimes(1);
    scene.cosmos.show([...ONYX]);
    await vi.dynamicImportSettled();
    await settled();
    expect(go).toHaveBeenCalledTimes(1);
  });
});

describe("the sun's beat (7d3)", () => {
  const WRITTEN = "2026-11-03T06:00:00.000Z";
  const written = Date.parse(WRITTEN);
  const beat = (scene: ReturnType<typeof made>) => {
    const [mesh] = glows(scene);
    return Number(mesh?.material.uniforms["uBeat"]?.value);
  };
  // A frame at `now`, the wall's time, the scene's clock at `seconds`: the beat follows the chain's time, and moves only while the clock runs.
  const frameAt = (
    scene: ReturnType<typeof made>,
    now: number,
    { seconds, eye = HOME }: { seconds: number; eye?: Point },
  ) => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    scene.cosmos.tick(eye, seconds);
  };
  // The file shown with its time, as the home's feed hands it, read ten minutes after its writing.
  const READ = written + 600_000;
  const timed = async (scene: ReturnType<typeof made>, list: readonly CosmosWorld[], read = READ) => {
    vi.spyOn(Date, "now").mockReturnValue(read);
    scene.cosmos.show(list, WRITTEN);
    await vi.dynamicImportSettled();
    scene.cosmos.tick(HOME, 0);
    await settled();
    scene.cosmos.tick(HOME, 0);
    await settled();
  };
  // The beat's top in a block forty blocks on, read in the test that runs: a mutant of the beat moves it.
  const peakOf = () =>
    Array.from({ length: 400 }, (_, at) => written + 40 * BLOCK_MS + at * 10).reduce((best, now) =>
      beatAt(written, now, READ) > beatAt(written, best, READ) ? now : best,
    );
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lifts the great star's light once a block from the file's time, a fifth at most, and rests between", async () => {
    const scene = made();
    await timed(scene, worlds(30));
    const lifts: number[] = [];
    for (let step = 0; step < 80; step += 1) {
      const now = written + 8000 + step * 50;
      frameAt(scene, now, { seconds: 1 + step / 30 });
      const expected = beatAt(written, now, READ);
      if (expected === 0) expect(beat(scene)).toBe(0);
      else lifts.push(beat(scene) / expected);
    }
    expect(lifts.length).toBeGreaterThan(5);
    for (const lift of lifts) expect(lift).toBeCloseTo(lifts[0] ?? NaN, 9);
    expect(lifts[0]).toBeGreaterThan(0.1);
    expect(lifts[0]).toBeLessThanOrEqual(0.2);
  });

  it("beats nothing while the scene's clock stands still, as under reduced motion: no orbit turns, no sun swells", async () => {
    const scene = made();
    await timed(scene, worlds(30));
    const peak = peakOf();
    frameAt(scene, peak, { seconds: 0 });
    expect(beat(scene)).toBe(0);
    frameAt(scene, peak, { seconds: 0.5 });
    expect(beat(scene)).toBeGreaterThan(0);
    frameAt(scene, peak, { seconds: 0.5 });
    expect(beat(scene)).toBe(0);
  });

  it("gives none from a file shown more than an hour after its writing, and beats on hours later from one shown fresh", async () => {
    const stale = made();
    await timed(stale, worlds(30), written + 2 * 3_600_000);
    frameAt(stale, peakOf() + 2 * 3_600_000, { seconds: 1 });
    expect(beat(stale)).toBe(0);
    const fresh = made();
    await timed(fresh, worlds(30));
    frameAt(fresh, peakOf() + 5 * 3_600_000, { seconds: 1 });
    expect(beat(fresh)).toBeGreaterThan(0.1);
  });

  it("asks no frame of its own: it rides the frames the scene draws for its orbits", async () => {
    const scene = made();
    await timed(scene, worlds(30));
    const asked = scene.moved.mock.calls.length;
    for (let step = 0; step < 40; step += 1) frameAt(scene, written + 8000 + step * 100, { seconds: 1 + step / 30 });
    expect(scene.moved.mock.calls.length).toBe(asked);
  });

  // The suns' shader lifts the one at the map's very centre: the great star, and no other.
  const atTheCentre = (scene: ReturnType<typeof made>) => {
    const [mesh] = glows(scene);
    const at = mesh?.geometry.getAttribute("aAt");
    return Array.from({ length: mesh?.geometry.instanceCount ?? 0 }, (_, index) => index).filter(
      (index) => at?.getX(index) === 0 && at.getY(index) === 0 && at.getZ(index) === 0,
    );
  };

  it("stands the great star alone at the map's centre among the suns: the one its beat lifts", async () => {
    const scene = made();
    await shown(scene, worlds(30));
    expect(atTheCentre(scene)).toHaveLength(1);
    expect(held(worlds(30)).filter(({ place: { x, y, z } }) => x === 0 && y === 0 && z === 0)).toHaveLength(1);
  });

  it("gives no beat from a file with no time: no time, no chain to beat for", async () => {
    const scene = made();
    await shown(scene, worlds(30));
    for (const [step, into] of [0, 100, 250, 900].entries()) {
      frameAt(scene, written + into, { seconds: 1 + step });
      expect(beat(scene)).toBe(0);
    }
  });

  it("lifts no sun where the great star is not drawn: none stands at the map's centre", async () => {
    const scene = made();
    const list = worlds(3000, 3);
    await timed(scene, list);
    const systems = held(list);
    const [far] = [...systems].sort((a, b) => distanceOf(b.place, EARTH_PLACE) - distanceOf(a.place, EARTH_PLACE));
    if (far === undefined) throw new Error("no system");
    const go = vi.fn<(eye: Point) => void>();
    scene.cosmos.arrive(far.id, go);
    await settled();
    const to = go.mock.lastCall?.[0] ?? HOME;
    scene.cosmos.tick(to, 0);
    await settled();
    frameAt(scene, peakOf(), { seconds: 1, eye: to });
    expect(atTheCentre(scene)).toHaveLength(0);
  });
});
