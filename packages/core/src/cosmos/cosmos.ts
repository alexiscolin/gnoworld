// core/cosmos (slice 7, 7c and 7d1; ADR-0002 §3 and §10; F3520): where each system sits. Systems take cells in rings by their rank in the
// set (`rings.ts`): the rank and the ray come from a hash of the id, so they mean nothing on chain. A curated ecosystem's namespaces take
// consecutive ranks and near rays, one blob. Height comes from a smooth field of position, so no list of clusters. An arrival moves others
// outward, a little, and what moved drifts there over a season. Only the sines differ between engines, in a last bit no cell depends on.
import { cellHash, nextState, textHash, unitOf } from "../space/cell.ts";
import { heightField } from "../space/mood.ts";
import { lerp, smoothstep } from "../space/smooth.ts";
import { seatInRings, type Seat } from "./rings.ts";

/** The unit of spacing, in scene units: two systems are never closer. */
export const CELL = 10;
/** A system sits within this distance above or below the field. */
export const DISC_HALF_THICKNESS = 2;

const TURN = 2 * Math.PI;
// Rings stand this far apart, and with 6 cells for each ring's number a ring's chord is never shorter.
const PITCH = 2 * CELL;
// How far a system strays from its cell's centre: the lattice never shows, and with this two systems stay over a cell apart.
const STRAY = 0.45 * CELL;
const RINGS = 1;
// A star's radius from what it holds: two at their closest never touch, for the largest is half a cell.
const STAR_LEAST = CELL / 10;
const STAR_MOST = CELL / 2;
const STAR_RUNGS = 10;

/** The stations' cells (ADR-0002 §1, the team's and outside the rank): beside each other, up and left of the centre on arrival. */
export const STATION_SEATS: readonly Seat[] = [
  { ring: 2, cell: 6 },
  { ring: 2, cell: 7 },
  { ring: 2, cell: 8 },
];

export interface SystemPlace {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A system to place: its id and, if curated, its ecosystem. */
export interface SystemRef {
  readonly id: string;
  readonly ecosystem?: string;
}

interface Ranked {
  readonly id: string;
  // What it is ranked with: an ecosystem, or itself.
  readonly group: string;
  readonly groupHash: number;
  readonly seed: number;
}

const inUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const byRank = (a: Ranked, b: Ranked): number =>
  a.groupHash - b.groupHash || inUnits(a.group, b.group) || a.seed - b.seed || inUnits(a.id, b.id);

function ranked(set: readonly SystemRef[]): Ranked[] {
  const systems = new Map<string, string | undefined>();
  for (const { id, ecosystem } of set) systems.set(id, ecosystem);
  const entries = [...systems].map(([id, ecosystem]) => {
    const group = ecosystem === undefined ? `system ${id}` : `ecosystem ${ecosystem}`;
    return { id, group, groupHash: textHash(group), seed: textHash(`system ${id}`) };
  });
  return entries.sort(byRank);
}

// The power of two that holds `count`: a wedge only changes when this does, so its rays stay put between rungs.
export function stepOf(count: number): number {
  let step = 1;
  while (step < count) step *= 2;
  return step;
}

// How wide an ecosystem's rays spread, in turns: about the square root of its size in cells, on the ring its rank reaches.
const wedgeOf = (size: number, first: number): number =>
  size === 1 ? 0 : Math.min(1, Math.sqrt(stepOf(size) / (12 * stepOf(first))));

// Each system's ray, by rank.
function raysOf(systems: readonly Ranked[]): number[] {
  const sizes = new Map<string, number>();
  const firsts = new Map<string, number>();
  systems.forEach(({ group }, rank) => {
    sizes.set(group, (sizes.get(group) ?? 0) + 1);
    if (!firsts.has(group)) firsts.set(group, rank);
  });
  return systems.map(({ group, groupHash, seed }) => {
    const wedge = wedgeOf(sizes.get(group) ?? 1, firsts.get(group) ?? 0);
    return (unitOf(groupHash) + (unitOf(nextState(seed)) - 0.5) * wedge + 1) % 1;
  });
}

function placeOf(seed: number, { ring, cell }: Seat): SystemPlace {
  const twist = unitOf(cellHash(RINGS, { x: ring, y: 0, z: 0 }));
  const angle = (TURN * (cell + twist)) / (6 * ring);
  // The stream's first number is the system's place in its wedge.
  let state = nextState(seed);
  const unit = (): number => {
    state = nextState(state);
    return unitOf(state);
  };
  const away = TURN * unit();
  const reach = STRAY * Math.sqrt(unit());
  const lift = (unit() * 2 - 1) * DISC_HALF_THICKNESS;
  const x = ring * PITCH * Math.cos(angle) + reach * Math.cos(away);
  const z = ring * PITCH * Math.sin(angle) + reach * Math.sin(away);
  return { x, y: heightField(x, z) + lift, z };
}

/** The places of a set of systems, by id: the same set, in any order, gives the same map. A repeated id counts once. */
export function placeSystems(set: readonly SystemRef[]): Map<string, SystemPlace> {
  const systems = ranked(set);
  const seats = seatInRings(raysOf(systems), STATION_SEATS);
  const places = new Map<string, SystemPlace>();
  systems.forEach(({ id, seed }, rank) => {
    const seat = seats[rank];
    if (seat !== undefined) places.set(id, placeOf(seed, seat));
  });
  return places;
}

/** Where systems stand `progress` through a season, 0 to 1 and eased, from last season's map to this one's (ADR-0002 §3). An arrival
 * stands at its place at once, for it has no other. On the way two may pass closer than a cell: the spacing is each map's (F3556). */
export function driftedPlaces(
  from: ReadonlyMap<string, SystemPlace>,
  to: ReadonlyMap<string, SystemPlace>,
  progress: number,
): Map<string, SystemPlace> {
  if (Number.isNaN(progress)) throw new RangeError("cosmos: a season's progress is a number");
  const by = smoothstep(0, 1, progress);
  const places = new Map<string, SystemPlace>();
  for (const [id, place] of to) {
    const before = from.get(id) ?? place;
    places.set(id, {
      x: lerp(before.x, place.x, by),
      y: lerp(before.y, place.y, by),
      z: lerp(before.z, place.z, by),
    });
  }
  return places;
}

/** A star's radius, from the worlds its namespace holds: on a ladder of powers of two, read in a line between rungs, so one world more
 * never makes it jump, and capped, so no star crowds its cell. */
export function starSize(worlds: number): number {
  if (!Number.isSafeInteger(worlds) || worlds < 1)
    throw new RangeError("cosmos: a star holds a whole number of worlds, 1 or more");
  const held = Math.min(worlds, 1 << STAR_RUNGS);
  const rung = 31 - Math.clz32(held);
  return lerp(STAR_LEAST, STAR_MOST, (rung + held / (1 << rung) - 1) / STAR_RUNGS);
}
