// Rooms as moons (ADR-0002 §1 and §3): a world's busiest rooms orbit it, four at most, and the room you are in is always one, in a slot of its
// own. Moons stay steady: past the arrival the set changes at most once a minute, and a room takes a moon's place only once it has stayed
// clearly busier than the quietest moon for several minutes. A room nobody is in is no moon, but yours. Time comes in as a parameter.
import { presenceOf } from "../planet/gauges.ts";

export const MOONS_MAX = 4;
export const MOON_SET_MS = 60_000;
export const MOON_HOLD_MS = 3 * 60_000;
/** A quiet room's moon, as a share of the largest. */
export const MOON_SMALLEST = 0.25;
// Clearly busier: a quarter more people than the quietest moon.
const CLEARLY = 1.25;

export interface RoomCount {
  readonly room: string;
  readonly people: number;
}

export interface Moons {
  readonly rooms: readonly string[];
  /** When the set last changed. */
  readonly changed: number;
  /** The rooms clearly busier than the quietest moon, each since when. */
  readonly rising: ReadonlyMap<string, number>;
}

type People = ReadonlyMap<string, number>;

const peopleOf = (counts: readonly RoomCount[]): People =>
  new Map(counts.map(({ room, people }) => [room, people > 0 ? people : 0]));

// The busiest first; rooms of equal counts by their name, so two readers see the same moons.
const busiestFirst = (people: People) => (one: string, other: string) =>
  (people.get(other) ?? 0) - (people.get(one) ?? 0) || (one < other ? -1 : 1);

const quietestOf = (rooms: readonly string[], current: string | undefined, people: People) =>
  rooms
    .filter((room) => room !== current)
    .sort(busiestFirst(people))
    .at(-1);

function arrival(people: People, current: string | undefined, now: number): Moons {
  const others = [...people.keys()]
    .filter((room) => room !== current && (people.get(room) ?? 0) > 0)
    .sort(busiestFirst(people));
  const yours = current !== undefined && people.has(current) ? [current] : [];
  return { rooms: [...yours, ...others].slice(0, MOONS_MAX), changed: now, rising: new Map() };
}

// The room you are in comes in at once, outside the minute's rule, the quietest other moon making room.
function withYours(rooms: readonly string[], current: string | undefined, people: People): readonly string[] {
  if (current === undefined || !people.has(current) || rooms.includes(current)) return rooms;
  const all = [current, ...rooms];
  const quietest = all.length > MOONS_MAX ? quietestOf(all, current, people) : undefined;
  return all.filter((room) => room !== quietest);
}

interface At {
  /** The room the reader is in, if any. */
  readonly current: string | undefined;
  readonly now: number;
}

interface Held {
  readonly rooms: readonly string[];
  readonly people: People;
}

// Clearly busier than the moon it would take the place of: the quietest but yours. A free place asks only that someone be there.
function risingOf(moons: Moons, { rooms, people }: Held, { current, now }: At): Map<string, number> {
  const quietest = quietestOf(rooms, current, people);
  const bar = rooms.length < MOONS_MAX || quietest === undefined ? 0 : (people.get(quietest) ?? 0) * CLEARLY;
  const rising = new Map<string, number>();
  for (const [room, count] of people)
    if (!rooms.includes(room) && count > bar) rising.set(room, moons.rising.get(room) ?? now);
  return rising;
}

// The one change a minute allows: a moon nobody is in leaves, and the busiest room due takes a free place or the quietest moon's. A free
// place asks for no hold: no moon leaves for it.
function changed({ rooms, people }: Held, current: string | undefined, due: readonly string[]) {
  const empty = rooms.find((room) => room !== current && (people.get(room) ?? 0) === 0);
  const [next] = [...due].sort(busiestFirst(people));
  if (empty === undefined && next === undefined) return undefined;
  const room = empty ?? (rooms.length < MOONS_MAX ? undefined : quietestOf(rooms, current, people));
  const left = rooms.filter((each) => each !== room);
  return next === undefined ? left : [...left, next];
}

/** The moons after `moons` for these rooms' counts, at `now`, the reader in `current`. */
export function nextMoons(moons: Moons | undefined, counts: readonly RoomCount[], { current, now }: At): Moons {
  const people = peopleOf(counts);
  // Nothing stands but yours, a first look before the list came: an arrival still, for no moon would leave.
  if (moons === undefined || moons.rooms.every((room) => room === current)) return arrival(people, current, now);
  const held = {
    rooms: withYours(
      moons.rooms.filter((room) => people.has(room)),
      current,
      people,
    ),
    people,
  };
  const rising = risingOf(moons, held, { current, now });
  const kept = { rooms: held.rooms, changed: moons.changed, rising };
  if (now - moons.changed < MOON_SET_MS) return kept;
  const free = held.rooms.length < MOONS_MAX;
  const due = [...rising].filter(([, since]) => free || now - since >= MOON_HOLD_MS).map(([room]) => room);
  const swapped = changed(held, current, due);
  return swapped === undefined ? kept : { rooms: swapped, changed: now, rising };
}

/** A moon's size for `people` against the busiest room's: a log scale from the smallest moon up, capped. */
export const moonSize = (people: number, busiest: number): number =>
  MOON_SMALLEST + (1 - MOON_SMALLEST) * presenceOf(people, busiest);
