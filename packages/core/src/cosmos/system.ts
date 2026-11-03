// A namespace's worlds around its star (ADR-0002 §3, §10). Places come from the set alone, so the same file is the same picture. Each world
// holds a slot of a sunflower's lattice: its hash picks the slot, so an arrival moves only a world it meets, and the lattice keeps any
// number of worlds apart in the room a cell leaves. A system turns as one, so none ever crosses another. The disc lies tilted on the stage.
import { cellHash, nextState, textHash, unitOf, type Point } from "../space/cell.ts";
import { lerp } from "../space/smooth.ts";
import { CELL, placeSystems, starSize, stepOf, type SystemPlace } from "./cosmos.ts";

/** gno.land's star, at the centre: a slug holds no dot, so no namespace is it. */
export const GNO_LAND = "gno.land";
/** How far a system reaches from its star: two systems stand a cell apart at the least. */
export const ROOM = CELL / 2;
/** Where a far belt's room starts: no world goes past it, a postcard's widened ones included (7d3). */
export const BELT_INNER = 0.84 * ROOM;
/** Where its rocks start: half a unit past it, so no rock stands near a world's ground, for dust is a sign (ADR-0002 §10). */
export const ROCKS_FROM = BELT_INNER + 0.5;
/** A fixed place, beside the great star, and its size: frame 4's Earth, 47 pixels of radius at the rest's 30 units, 1,080 high. */
export const EARTH_PLACE: Point = { x: -6.73, y: 0, z: 0.18 };
export const EARTH_RADIUS = 1.2176;

const WORLD_LEAST = 1.05;
const WORLD_MOST = 1.7;
const STAR_MOST = 1024;
const GOLDEN = 2.399963229728653;
// A lattice's closest two stand this many times sqrt(its area / pi / its count) apart, measured from 4 to 2,048 slots; a world takes under half of that.
const PACKING = (0.49 * 1.65) ** 2;
/** Under this radius a world is grain: dust round its star, never a body. */
export const GRAIN = 0.3;

// A crowd reads as a few clear bodies over fine grain: its worlds well under what the lattice allows.
const CROWD_SLOTS = 32;
const CROWD = 0.55;
const CLEAR_BODIES = 3;
const CLEAR_RADIUS = 0.85;
const CLEAR_ROOM = 0.49;
const LOOSE = 1.1;
const LOOSE_ORBIT = 0.14;
const CLUMP = 0.62;
const BELTS = 1 / 3;
const SPIN_LEAST = 0.05;
const SPIN_SPAN = 0.1;
// A plane leans 15 to 45 degrees off the disc's: none lies in it, and none stands face on to the rest's 15-degree slant (7d6).
const TILT_LEAST = Math.PI / 12;
const TILT_SPAN = Math.PI / 6;
const SALT = 2;

export { WORLD_MOST };

/** A world of the file: its id, its namespace, and how much it is used. */
export interface WorldHeld {
  readonly id: string;
  readonly namespace: string;
  readonly use: number;
}

export interface Orbiter {
  readonly id: string;
  readonly radius: number;
  readonly orbit: number;
  readonly phase: number;
}

export interface StarSystem {
  readonly id: string;
  readonly place: SystemPlace;
  /** Where its worlds' light comes from, when not from its own place: the Earth's projects are lit by the great star (7v). */
  readonly litBy?: Point;
  readonly star: number;
  /** From red to white, 0 to 1. */
  readonly warmth: number;
  /** In radians a second. */
  readonly spin: number;
  /** Its orbits' plane: leaning `tilt` radians off the disc's, about a line of nodes `node` radians round from the map's x. */
  readonly tilt: number;
  readonly node: number;
  readonly belt: boolean;
  /** The most used first: the first is its landmark. */
  readonly worlds: readonly Orbiter[];
}

/** A world's radius from its use, before any crowd's room: a world seen from afar is as large as its use says. */
export const worldSize = (use: number): number =>
  lerp(WORLD_LEAST, WORLD_MOST, (starSize(Math.min(Math.max(use, 1), STAR_MOST)) - 1) / 4);

// By a world's own hash, then the next slot free, so an arrival moves only the world it meets. A power of two over 1.5 times the count keeps probes short.
function slotsOf(worlds: readonly WorldHeld[], slots: number): Map<string, number> {
  const taken = new Set<number>();
  const found = new Map<string, number>();
  for (const { id } of [...worlds].sort((a, b) => textHash(a.id) - textHash(b.id) || (a.id < b.id ? -1 : 1))) {
    let slot = textHash(id) % slots;
    while (taken.has(slot)) slot = (slot + 1) % slots;
    taken.add(slot);
    found.set(id, slot);
  }
  return found;
}

// The largest world `slots` can hold between `inner` and `edge`, its own edge at `edge`: the root of r^2 = a((B - r)^2 - i^2).
function largest(slots: number, inner: number, edge: number): number {
  const a = PACKING / slots;
  const reach = a * edge;
  return (Math.sqrt(reach * reach + (1 - a) * a * (edge ** 2 - inner ** 2)) - reach) / (1 - a);
}

const ranked = (worlds: readonly WorldHeld[]): WorldHeld[] =>
  [...worlds].sort((a, b) => b.use - a.use || (a.id < b.id ? -1 : 1));

interface Scatter {
  readonly start: number;
  readonly outer: number;
}

// A lattice of many reads as printed rows: a crowd's grain leaves its slot by its own hash, then gathers in three loose clumps.
function scattered(id: string, { orbit, phase }: Pick<Orbiter, "orbit" | "phase">, { start, outer }: Scatter) {
  const hash = textHash(`grain ${id}`);
  const loose = phase + LOOSE * (unitOf(hash) - 0.5);
  return {
    orbit: Math.min(orbit * (1 - LOOSE_ORBIT + 2 * LOOSE_ORBIT * unitOf(nextState(hash))), outer),
    phase: loose + CLUMP * Math.sin(3 * loose + start),
  };
}

function latticeOf(
  worlds: readonly WorldHeld[],
  slots: number,
  { star, start, edge }: { readonly star: number; readonly start: number; readonly edge: number },
): Orbiter[] {
  const inner = 0.45 + 0.35 * star;
  const most = Math.min(largest(slots, inner, edge) * (slots > CROWD_SLOTS ? CROWD : 1), WORLD_MOST);
  const outer = edge - most;
  const places = slotsOf(worlds, slots);
  const crowd = slots > CROWD_SLOTS;
  return ranked(worlds).map(({ id, use }) => {
    const slot = places.get(id) ?? 0;
    const orbit = Math.sqrt(inner ** 2 + ((outer ** 2 - inner ** 2) * (slot + 0.5)) / slots);
    const placed = { orbit, phase: start + slot * GOLDEN };
    return {
      id,
      radius: Math.min(worldSize(use), most),
      ...(crowd ? scattered(id, placed, { start, outer }) : placed),
    };
  });
}

const gap = (a: Orbiter, b: Orbiter): number =>
  Math.sqrt(a.orbit ** 2 + b.orbit ** 2 - 2 * a.orbit * b.orbit * Math.cos(a.phase - b.phase));

// Activity never moves anything (ADR-0002 §3): every world keeps the place its name gives it, and use only says which of a crowd stand clear
// there, as large as the others of them leave room for.
function orbitersOf(worlds: readonly WorldHeld[], star: number, start: number): Orbiter[] {
  const slots = stepOf(worlds.length + (worlds.length >> 1));
  if (slots <= CROWD_SLOTS) return latticeOf(worlds, slots, { star, start, edge: BELT_INNER });
  const all = latticeOf(worlds, slots, { star, start, edge: BELT_INNER - CLEAR_RADIUS });
  const clear = all.slice(0, CLEAR_BODIES);
  return all.map((world, rank) => {
    if (rank >= CLEAR_BODIES) return world;
    const nearest = Math.min(...clear.filter((other) => other !== world).map((other) => gap(world, other)));
    return { ...world, radius: Math.min(CLEAR_RADIUS, nearest * CLEAR_ROOM) };
  });
}

function systemOf(id: string, place: SystemPlace, worlds: readonly WorldHeld[]): StarSystem {
  const star = starSize(worlds.length);
  const seed = textHash(`star ${id}`);
  const unit = (step: number) => unitOf(nextState(cellHash(SALT, { x: seed, y: step, z: 0 })));
  return {
    id,
    place,
    star,
    warmth: unit(0),
    spin: (SPIN_LEAST + SPIN_SPAN * unit(1)) * (unit(2) < 0.5 ? -1 : 1),
    tilt: TILT_LEAST + TILT_SPAN * unit(5),
    node: 2 * Math.PI * unit(6),
    belt: unit(3) < BELTS,
    worlds: orbitersOf(worlds, star, unit(4) * 2 * Math.PI),
  };
}

const greatStar = (): StarSystem => ({
  id: GNO_LAND,
  place: { x: 0, y: 0, z: 0 },
  star: starSize(STAR_MOST),
  warmth: 0.45,
  spin: SPIN_LEAST,
  tilt: 0,
  node: 0,
  belt: false,
  worlds: [],
});

/** The systems of a file, gno.land's first and the others by id: the same file gives the same list, in any order. A world named twice counts once. */
export function systemsOf(worlds: readonly WorldHeld[]): StarSystem[] {
  const byNamespace = new Map<string, Map<string, WorldHeld>>();
  for (const world of worlds) {
    const held = byNamespace.get(world.namespace) ?? new Map<string, WorldHeld>();
    held.set(world.id, world);
    byNamespace.set(world.namespace, held);
  }
  const ids = [...byNamespace.keys()].sort();
  const places = placeSystems(ids.map((id) => ({ id })));
  const held = (id: string) => [...(byNamespace.get(id)?.values() ?? [])];
  const stars = ids.flatMap((id) => {
    const place = places.get(id);
    return place === undefined ? [] : [systemOf(id, place, held(id))];
  });
  return [greatStar(), ...stars];
}
