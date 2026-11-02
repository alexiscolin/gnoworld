// A namespace's worlds around its star (ADR-0002 §3, §10). Places come from the set alone, so the same file is the same picture. Each world
// holds a slot of a sunflower's lattice: its hash picks the slot, so an arrival moves only a world it meets, and the lattice keeps any
// number of worlds apart in the room a cell leaves. A system turns as one, so none ever crosses another. The disc lies tilted on the stage.
import { cellHash, nextState, textHash, unitOf, type Point } from "../space/cell.ts";
import { HOME } from "../space/drift.ts";
import { lerp } from "../space/smooth.ts";
import { CELL, placeSystems, starSize, stepOf, type SystemPlace } from "./cosmos.ts";

/** gno.land's star, at the centre: a slug holds no dot, so no namespace is it. */
export const GNO_LAND = "gno.land";
/** How far a system reaches from its star: two systems stand a cell apart at the least. */
export const ROOM = CELL / 2;
/** Where a far belt starts: no world goes past it. */
export const BELT_INNER = 0.84 * ROOM;
/** How far the disc leans from facing the eye's way, in radians: seen from 60 degrees above it. */
export const DISC_TILT = 1.0471975511965976;
/** Where the map's centre stands on the stage: 36 units ahead of the eye at rest, the great sun where frame 4 has it. */
export const CENTRE: Point = { x: HOME.x - 0.06, y: HOME.y + 0.155, z: HOME.z - 36 };
/** A fixed place, beside the great star, and its size: frame 4's Earth. */
export const EARTH_PLACE: Point = { x: -6.73, y: 0, z: 0.18 };
export const EARTH_RADIUS = 1.457;

const WORLD_LEAST = 1.05;
const WORLD_MOST = 1.7;
const STAR_MOST = 1024;
const GOLDEN = 2.399963229728653;
// A lattice's closest two stand this many times sqrt(its area / pi / its count) apart, measured from 4 to 2,048 slots; a world takes under half of that.
const PACKING = (0.49 * 1.65) ** 2;
// A crowd reads as a few clear bodies on an outer ring, 120 degrees apart, over fine grain: its worlds well under what the lattice allows.
const CROWD_SLOTS = 32;
const CROWD = 0.55;
const CLEAR_BODIES = 3;
const CLEAR_RADIUS = 0.85;
const BELTS = 1 / 3;
const SPIN_LEAST = 0.05;
const SPIN_SPAN = 0.1;
const SALT = 2;
// The tilt's cosine and sine, as numbers: a call at a module's top stays in every chunk that imports core.
const COS = 0.5;
const SIN = 0.8660254037844386;

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
  readonly star: number;
  /** From red to white, 0 to 1. */
  readonly warmth: number;
  /** In radians a second. */
  readonly spin: number;
  readonly belt: boolean;
  /** The most used first: the first is its landmark. */
  readonly worlds: readonly Orbiter[];
}

const worldSize = (use: number): number =>
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

function latticeOf(
  worlds: readonly WorldHeld[],
  slots: number,
  { star, start, edge }: { readonly star: number; readonly start: number; readonly edge: number },
): Orbiter[] {
  const inner = 0.45 + 0.35 * star;
  const most = Math.min(largest(slots, inner, edge) * (slots > CROWD_SLOTS ? CROWD : 1), WORLD_MOST);
  const outer = edge - most;
  const places = slotsOf(worlds, slots);
  return ranked(worlds).map(({ id, use }) => {
    const slot = places.get(id) ?? 0;
    return {
      id,
      radius: Math.min(worldSize(use), most),
      orbit: Math.sqrt(inner ** 2 + ((outer ** 2 - inner ** 2) * (slot + 0.5)) / slots),
      phase: start + slot * GOLDEN,
    };
  });
}

function orbitersOf(worlds: readonly WorldHeld[], star: number, start: number): Orbiter[] {
  const slots = stepOf(worlds.length + (worlds.length >> 1));
  if (slots <= CROWD_SLOTS) return latticeOf(worlds, slots, { star, start, edge: BELT_INNER });
  const [clear, rest] = [ranked(worlds).slice(0, CLEAR_BODIES), ranked(worlds).slice(CLEAR_BODIES)];
  const bodies = clear.map(({ id, use }, at) => ({
    id,
    radius: Math.min(worldSize(use), CLEAR_RADIUS),
    orbit: BELT_INNER - CLEAR_RADIUS,
    phase: start + (at * 2 * Math.PI) / CLEAR_BODIES,
  }));
  return [...bodies, ...latticeOf(rest, slots, { star, start, edge: BELT_INNER - 2 * CLEAR_RADIUS })];
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

/** Where a world stands `seconds` on, on the map, into `out`. */
export function orbitPlace(
  { system, world }: { readonly system: StarSystem; readonly world: Orbiter },
  seconds: number,
  out: { x: number; y: number; z: number },
): void {
  const { place, spin } = system;
  const angle = world.phase + spin * seconds;
  out.x = place.x + world.orbit * Math.cos(angle);
  out.y = place.y;
  out.z = place.z + world.orbit * Math.sin(angle);
}

/** A place on the map, on the stage, into `out`: the map's far side up the view, its near side towards the eye. */
export function toScene({ x, y, z }: Point, out: { x: number; y: number; z: number }): void {
  out.x = CENTRE.x + x;
  out.y = CENTRE.y + y * COS - z * SIN;
  out.z = CENTRE.z + y * SIN + z * COS;
}

/** A place on the stage, on the map, into `out`. */
export function toMap({ x, y, z }: Point, out: { x: number; y: number; z: number }): void {
  const [dy, dz] = [y - CENTRE.y, z - CENTRE.z];
  out.x = x - CENTRE.x;
  out.y = dy * COS + dz * SIN;
  out.z = dz * COS - dy * SIN;
}

/** Where the view's axis, straight ahead, meets the disc: what the eye looks at. An eye under the disc looks at the place under it. */
export function focusOf({ x, y, z }: Point, out: { x: number; y: number; z: number }): void {
  out.x = x;
  out.y = 0;
  out.z = y > 0 ? z - (y * COS) / SIN : z;
}
