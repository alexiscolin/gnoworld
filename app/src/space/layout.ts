// The universe from the worlds' file (D401, D454): each namespace a system, a sun on its own tilted plane, in a saucer thick at its heart and
// flat at its rim, the home at the heart and the heaviest nearest it; each world a planet on its own orbit; the Earth in the home system,
// still. Every number comes from a hash of the ids, so the same file always gives the same universe.
import { EARTH } from "@gnoworld/core";
import { byNamespace, type CosmosWorld } from "./cosmosWorld.ts";
import { HOME_NAMESPACES } from "../cosmosAt.ts";
import { hashOf } from "./hash.ts";
import { HEART, placesOf } from "./saucer.ts";

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface System {
  readonly index: number;
  readonly id: string;
  readonly home: boolean;
  readonly place: Vec;
  /** Its orbital plane: the normal and two units across it. */
  readonly normal: Vec;
  readonly across: Vec;
  readonly along: Vec;
  readonly sun: readonly [number, number, number];
  readonly core: number;
  readonly use: number;
  readonly planets: Planet[];
  /** How far its outer orbit reaches, and a margin. */
  reach: number;
}

export interface Planet {
  readonly index: number;
  readonly id: string;
  readonly system: System;
  readonly orbit: number;
  readonly phase: number;
  /** Radians a second; none for the Earth. */
  readonly speed: number;
  readonly radius: number;
  readonly use: number;
}

export interface Universe {
  /** How much wider than the demo's its disc is: the view of it all stands that much farther. */
  readonly scale: number;
  readonly systems: readonly System[];
  readonly planets: readonly Planet[];
  readonly home: System;
  readonly earth: Planet;
  readonly byId: ReadonlyMap<string, Planet>;
  readonly bySystem: ReadonlyMap<string, System>;
}

/** The disc's radius at the demo's scale: a universe's is this times its `scale`. */
export const DISC = 2900;
// raw: a disc this many spacings wide by the root of its count holds them with room to spare
const ROOM = 0.9;
const SPACING = 150;
const FIRST_ORBIT = 7;
const SUN_SIZE = 0.6;
// Every body, its suns, planets and so their moons, a little larger (D13003, on trial): its orbits widen with it.
const GROW = 1.25;
// And the room between them a little wider (D13003): the gaps between orbits, not the bodies, which GROW holds.
const SPREAD = 1.15;
// A sun at least this many times its largest planet's radius (D13004).
const SUN_OVER = 2;
// The home system: the Earth with gno.land's own namespaces, the realms the site was born round (Alexis: "les planètes du système
// qu'on connaissait").

/** `v` made a unit, as a new vector. */
export const unit = (v: Vec): Vec => {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};
/** The cross product of `a` and `b`. */
export const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

// A plane tilted by up to 0.45 rad from the disc's, the way the hash of `id` says.
function planeOf(id: string, home: boolean) {
  const [tilt, turn] = [home ? 0.06 : hashOf(id, 1) * 0.45, hashOf(id, 2) * Math.PI * 2];
  const normal = unit({ x: Math.cos(turn) * Math.sin(tilt), y: Math.cos(tilt), z: Math.sin(turn) * Math.sin(tilt) });
  const across = unit(cross(normal, { x: 0.3, y: 0.1, z: 1 }));
  return { normal, across, along: unit(cross(normal, across)) };
}

/** The disc's radius for `count` systems: the demo's, wider past what it holds, so each keeps its room however many come. */
const discOf = (count: number): number => Math.max(DISC, SPACING * Math.sqrt(count) * ROOM);

function sunOf(id: string, home: boolean): readonly [number, number, number] {
  const warm = home ? 0 : hashOf(id, 3);
  if (warm < 0.7) return [1, 0.78 + hashOf(id, 4) * 0.15, 0.5 + hashOf(id, 5) * 0.25];
  return warm < 0.9 ? [1, 0.95, 0.9] : [0.72, 0.82, 1];
}

// A sun smaller than the demo's, so its planets keep the room round it (Alexis, 2026-11-08); a namespace of many worlds a larger one,
// a step each time its worlds double (D454); never smaller than its largest planet (D13004), its first orbit past it.
const coreOf = (home: boolean, { worlds, asked = [] }: Kept): number =>
  Math.max(
    (home ? 3.4 : Math.min(2 + 0.7 * Math.log2(1 + worlds.length), 6)) * SUN_SIZE * GROW,
    SUN_OVER * Math.max(0, ...[...worlds, ...asked].map(radiusOf)),
  );

function systemOf(index: number, id: string, { place, use, home, kept }: Sun): System {
  const core = coreOf(home, kept);
  return { index, id, home, place, ...planeOf(id, home), sun: sunOf(id, home), core, use, planets: [], reach: 0 };
}

// A planet's radius by its use (P1): the smallest an unused world's, a step more each time its use doubles, the largest past that, far
// enough that busy worlds still differ (D508); the Earth's own, as its hand-made look was sized.
const SIZE = { smallest: 0.5, perDoubling: 0.36, largest: 3.2, earth: 2.2 } as const;
const sizeOf = (use: number) => Math.min(SIZE.smallest + SIZE.perDoubling * Math.log2(1 + use), SIZE.largest);

type Held = readonly { id: string; use: number }[];
interface Sun {
  readonly place: Vec;
  readonly use: number;
  readonly home: boolean;
  /** Its planets: the file's worlds, then the asked ones (its sun's size). */
  readonly kept: Kept;
}
interface Kept {
  readonly worlds: Held;
  readonly asked?: Held;
}

// The orbits round a system `id` of the file's `worlds` and the `asked` ones past them, each one's and the reach past the last, which its
// place keeps clear of the others'.
function orbitsOf(id: string, home: boolean, { worlds, asked = [] }: Kept): { orbits: number[]; reach: number } {
  const [first] = [...worlds, ...asked];
  // The first planet's inner edge: its orbit as before, but never inside three of its sun's radii, out of its glare (D13005).
  let edge = Math.max(
    (FIRST_ORBIT + hashOf(id, 10) * 3 + (home ? 5 : 0)) * SPREAD - (first === undefined ? 0 : radiusOf(first)),
    3 * coreOf(home, { worlds, asked }),
  );
  // A namespace of many worlds packs its gaps closer: past two dozen, its reach stays a large system's, not a galaxy's.
  const packed = Math.max(Math.min(1, 24 / Math.max(worlds.length, 1)), 0.25);
  // Each planet past the last one's outer edge, both radii counted, so none touch; the gaps uneven, some close, some wide (D13005).
  const orbits = [...worlds, ...asked].map((world) => {
    const radius = radiusOf(world);
    const at = edge + radius;
    edge = at + radius + (1.5 + hashOf(world.id, 15) * 6) * SPREAD * packed;
    return at;
  });
  return { orbits, reach: edge + 6 };
}

// A planet's radius by its use (P1), on a log scale: an unused world small, the busiest the largest, each a fifth larger or smaller by its
// id so no two stand alike (D508); the Earth as it always was.
const radiusOf = (world: Held[number]) =>
  GROW * (world.id === EARTH ? SIZE.earth : sizeOf(world.use) * (0.8 + 0.4 * hashOf(world.id, 16)));

// The planets of `system`: the file's `worlds`, then the `asked` ones the file lacks, on orbits past them.
function addPlanets(system: System, kept: Kept, planets: Planet[]): void {
  const { orbits, reach } = orbitsOf(system.id, system.home, kept);
  for (const [at, world] of [...kept.worlds, ...(kept.asked ?? [])].entries()) {
    const still = world.id === EARTH;
    const orbit = orbits[at] ?? FIRST_ORBIT;
    const planet: Planet = {
      index: planets.length,
      id: world.id,
      system,
      orbit,
      phase: still ? 2.2 : hashOf(world.id, 13) * Math.PI * 2,
      // Near ones fast, far ones slow, all seen to move (D506): a turn in about 2 minutes close in, 10 to 15 far out; the Earth's own
      // system at a third of that, so the home's first screen keeps its worlds in view (D509).
      speed: still ? 0 : (0.42 / orbit) * (0.6 + hashOf(world.id, 14) * 0.6) * (system.home ? 0.35 : 1),
      radius: radiusOf(world),
      use: world.use,
    };
    planets.push(planet);
    system.planets.push(planet);
  }
  system.reach = reach;
}

/** The universe of `worlds`, the file's, and of the worlds pages `asked` for that the file lacks (a realm too new, or a system's): each asked
 * one a planet past its namespace's, or in a system of its own past every other, so nothing the file lays out moves for them. */
export function layoutOf(worlds: readonly CosmosWorld[], asked: readonly CosmosWorld[] = []): Universe {
  const groups = byNamespace(worlds);
  const known = new Set(worlds.map(({ id }) => id));
  const extra = byNamespace(asked.filter(({ id }) => !known.has(id) && id !== EARTH));
  const homeId = HOME_NAMESPACES.find((namespace) => groups.has(namespace)) ?? "home";
  const homeOf = (from: typeof groups) => HOME_NAMESPACES.flatMap((namespace) => from.get(namespace) ?? []);
  const homeWorlds = [{ id: EARTH, use: 0 }, ...homeOf(groups)];
  const homeAsked = homeOf(extra);
  for (const namespace of HOME_NAMESPACES) [groups, extra].forEach((each) => each.delete(namespace));
  const others = [...groups].map(([id, list]) => ({ id, list, use: list.reduce((sum, world) => sum + world.rank, 0) }));
  // The heaviest nearest the heart: the most worlds and the most use (D454), then by name.
  others.sort((a, b) => b.list.length + b.use - (a.list.length + a.use) || (a.id < b.id ? -1 : 1));
  const fresh = [...extra].filter(([id]) => !groups.has(id)).map(([id, list]) => ({ id, list, use: 0 }));
  // The most used nearest its sun (P1), then by name; a system the file lists keeps the worlds pages asked of it past its own.
  const kept = [...others, ...fresh].map(({ id, list }, at): Kept => {
    const sorted = [...list].sort((a, b) => b.use - a.use || (a.id < b.id ? -1 : 1));
    return at < others.length ? { worlds: sorted, asked: extra.get(id) ?? [] } : { worlds: sorted };
  });
  const homeKept = { worlds: homeWorlds, asked: homeAsked };
  const ids = [...others, ...fresh].map(({ id }) => id);
  const disc = discOf(others.length);
  const room = { disc, count: others.length, heart: orbitsOf(homeId, true, homeKept).reach };
  const places = placesOf(
    ids,
    kept.map((each, at) => orbitsOf(ids[at] ?? "", false, each).reach),
    room,
  );
  const planets: Planet[] = [];
  const home = systemOf(0, homeId, { place: HEART, use: 0, home: true, kept: homeKept });
  addPlanets(home, homeKept, planets);
  const systems = [home];
  for (const [at, { id, use }] of [...others, ...fresh].entries()) {
    const held = kept[at] ?? { worlds: [] };
    const system = systemOf(systems.length, id, { place: places[at] ?? HEART, use, home: false, kept: held });
    addPlanets(system, held, planets);
    systems.push(system);
  }
  const [earth] = home.planets;
  if (earth === undefined) throw new Error("the home system has no Earth");
  return {
    systems,
    planets,
    home,
    earth,
    scale: disc / DISC,
    byId: new Map(planets.map((p) => [p.id, p])),
    // The Earth's system answers to each of its namespaces too, `gnoland` its address's (D501).
    bySystem: new Map([
      ...systems.map((s): [string, System] => [s.id, s]),
      ...HOME_NAMESPACES.map((ns): [string, System] => [ns, home]),
    ]),
  };
}

/** Where `planet` stands `seconds` on its orbit, into `out`: the shaders' formula too. */
export function placeOf(planet: Planet, seconds: number, out: Vec): Vec {
  const angle = planet.phase + planet.speed * seconds;
  const { place, across, along } = planet.system;
  out.x = place.x + (across.x * Math.cos(angle) + along.x * Math.sin(angle)) * planet.orbit;
  out.y = place.y + (across.y * Math.cos(angle) + along.y * Math.sin(angle)) * planet.orbit;
  out.z = place.z + (across.z * Math.cos(angle) + along.z * Math.sin(angle)) * planet.orbit;
  return out;
}
