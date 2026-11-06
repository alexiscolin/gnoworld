// A postcard's worlds at display (slice 7d6; the chief, 2026-11-02, on postcards clumped round their star, then on a ring "pas naturel"):
// each world keeps its own phase and size, its orbit widened as its system's others are, till no two meet as the system turns, all at its one
// spin, with a third of the smaller one's width between them; never past its own cell, and never a regular figure. A plane seen near its
// edge is opened towards the eye, at display only.
import { CELL } from "../cosmos/cosmos.ts";
import { BELT_INNER, EARTH_PLACE, GRAIN, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { depthOf, levelled, normalOf, withNormal } from "./depth.ts";
import { cameraTowards, type Camera } from "./restLook.ts";

// Frame 4's densest group is four bodies, a postcard's at the home; a view may ask more (a system's dynamic view, 7v), chosen among its
// eight largest.
const POSTCARD_BODIES = 4;
const CHOICE = 8;
// Between two neighbours, a third of the smaller one's width; a little more for the near side, larger on screen than the middle.
const AIR = 1 / 3;
const NEAR_SIDE = 1.15;
const ROOM = CELL / 2;
// A plane is seen at least this open at display, 30 degrees from its edge: its worlds read round their star, not on a line.
const OPEN_LEAST = 0.5;
const OFF_STAR = 3;
// A world widened to its room's very edge lands a rounding past it.
const ROUNDING = 1e-9;
// Of three bodies or more, no two gaps alike within this share: a regular figure reads as drawn on purpose.
const ALIKE = 0.15;
// A speck at its own orbit while the bodies are widened: within a body's width of its ground, half a unit at the least, it reads as that
// world's debris (Alexis's pebbles, 2026-11-03); nor does grain stand on a body's path, its drawn width each side of its orbit, which the
// planet cleared ("Poussière fine", F3594). The system turns as one, so what stands clear at rest stays clear.
const SPECK_CLEAR = 0.5;

/** A postcard as drawn: its system, its plane opened towards the eye if need be and turned about the eye's line so no two neighbours stand
 * at one height, the worlds it draws as bodies, the share of its size each is drawn at by its nearness (7p), and those of its specks it
 * leaves out, for they would stand on a body's ground (7d3). */
export interface Postcard {
  readonly system: StarSystem;
  readonly worlds: readonly Orbiter[];
  readonly depth: readonly number[];
  readonly hidden: ReadonlySet<string>;
}

// `system`'s plane, opened towards `eye` till it is seen `OPEN_LEAST` open: its normal turned towards the eye's line, the nearer way.
function opened(system: StarSystem, eye: Point): StarSystem {
  const { place } = system;
  const length = Math.hypot(place.x - eye.x, place.y - eye.y, place.z - eye.z);
  const view = [(place.x - eye.x) / length, (place.y - eye.y) / length, (place.z - eye.z) / length] as const;
  const { x: nx, y: ny, z: nz } = normalOf(system);
  const normal = [nx, ny, nz] as const;
  const along = normal[0] * view[0] + normal[1] * view[1] + normal[2] * view[2];
  if (Math.abs(along) >= OPEN_LEAST) return system;
  // The normal's part across the line, and the line itself the side the normal leans: the opened normal is made of the two.
  const side = along < 0 ? -1 : 1;
  const across = normal.map((value, at) => value - along * (view[at] ?? 0));
  const width = Math.hypot(...across);
  const keep = Math.sqrt(1 - OPEN_LEAST ** 2);
  const [x = 0, y = 1, z = 0] = across.map((value, at) => (value / width) * keep + side * OPEN_LEAST * (view[at] ?? 0));
  return withNormal(system, { x, y, z });
}

const placeIn = ({ orbit, phase }: Pick<Orbiter, "orbit" | "phase">, spread: number) => ({
  x: spread * orbit * Math.cos(phase),
  y: spread * orbit * Math.sin(phase),
});

// How much `worlds` widen their orbits so no two meet, seen at the least open: their places in the plane, apart enough when foreshortened,
// or, held `still` (a system's dynamic view, 7v), apart in space, a near one free to cover a far one; and each off its star, its centre
// `OFF_STAR` of its radii from it (f0004's worlds stand 3 to 4 of theirs from their star), or as far as its `room` lets it.
function spreadOf(worlds: readonly Orbiter[], room: number, still: boolean): number {
  const off = ({ orbit, radius }: Orbiter) => Math.min(OFF_STAR * radius, room - radius) / Math.max(orbit, 1e-9);
  let spread = Math.max(1, ...worlds.map(off));
  for (const [at, one] of worlds.entries())
    for (const other of worlds.slice(at + 1)) {
      const [a, b] = [placeIn(one, 1), placeIn(other, 1)];
      const need =
        (one.radius + other.radius + 2 * AIR * Math.min(one.radius, other.radius)) *
        (still ? 1 : NEAR_SIDE / OPEN_LEAST);
      spread = Math.max(spread, need / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1e-9));
    }
  return spread;
}

// Whether `worlds`, widened by `spread`, read as no figure: of three or more, no two gaps between neighbours round the star alike.
function natural(worlds: readonly Orbiter[], spread: number): boolean {
  if (worlds.length < 3) return true;
  const round = [...worlds].sort((a, b) => (a.phase % (2 * Math.PI)) - (b.phase % (2 * Math.PI)));
  const gaps = round.map((world, step) => {
    const next = round[(step + 1) % round.length] ?? world;
    const [a, b] = [placeIn(world, spread), placeIn(next, spread)];
    return Math.hypot(a.x - b.x, a.y - b.y) - world.radius - next.radius;
  });
  return gaps.every((gap, step) =>
    gaps.slice(step + 1).every((other) => Math.abs(gap - other) > ALIKE * Math.max(gap, other)),
  );
}

// The groups of `count` among `choice`, the larger first.
const groupsOf = (choice: readonly Orbiter[], count: number): Orbiter[][] =>
  count === 0
    ? [[]]
    : choice.flatMap((world, at) => groupsOf(choice.slice(at + 1), count - 1).map((rest) => [world, ...rest]));

/** The worlds a postcard of `system` draws as bodies, `most` at most, the home's four unless said, widened round its star: the most, then the
 * largest, that stand apart in its cell, inside its far belt if it has one (7d3: never among its rocks), and read as no figure; held
 * `still`, each at its own size, its largest at its crowd's cap. Its others are specks. */
export function postcardWorlds(system: StarSystem, most = POSTCARD_BODIES, still = false): Orbiter[] {
  const bodies = system.worlds.filter(({ radius }) => radius >= GRAIN);
  // A crowd's cap as one scale on its worlds' own sizes, not a clamp: gnoswap's 16 stood at one size (7v's design review, F4468).
  const scale =
    Math.max(...bodies.map(({ radius }) => radius)) / Math.max(...bodies.map(({ radius, own }) => own ?? radius));
  const choice = bodies
    .map(({ own, ...world }) => (still ? { ...world, radius: (own ?? world.radius) * scale } : world))
    .filter(({ radius }) => radius >= GRAIN)
    .sort((a, b) => b.radius - a.radius)
    .slice(0, CHOICE);
  const room = system.belt ? BELT_INNER : ROOM;
  for (let count = Math.min(most, choice.length); count > 0; count -= 1)
    for (const worlds of groupsOf(choice, count)) {
      const spread = spreadOf(worlds, room, still);
      const fits = worlds.every(({ orbit, radius }) => spread * orbit + radius <= room + ROUNDING);
      if (fits && natural(worlds, spread)) return worlds.map((world) => ({ ...world, orbit: spread * world.orbit }));
    }
  return [];
}

// The specks of `system` that would stand within a body's width, `SPECK_CLEAR` at the least, of the ground of one of `worlds`, in its plane,
// or, grain, on its path: within its radius as drawn, `depth` its share, of its orbit.
function hiddenOf(system: StarSystem, worlds: readonly Orbiter[], depth: readonly number[]): Set<string> {
  const bodies = new Set(worlds.map(({ id }) => id));
  const near = ({ orbit, phase, radius }: Orbiter) =>
    worlds.some((body, at) => {
      const [a, b] = [placeIn({ orbit, phase }, 1), placeIn(body, 1)];
      const ground = Math.hypot(a.x - b.x, a.y - b.y) - body.radius < Math.max(SPECK_CLEAR, body.radius);
      return ground || (radius < GRAIN && Math.abs(orbit - body.orbit) < body.radius * (depth[at] ?? 1));
    });
  return new Set(system.worlds.filter((world) => !bodies.has(world.id) && near(world)).map(({ id }) => id));
}

/** `worlds`, as `postcardWorlds` gives them, as a postcard's shape from `sight`, the eye at rest looking at the Earth or a camera, on the
 * video's screen: its plane opened if need be and turned till no two neighbours stand at one height, each world drawn at its share; none
 * if no turn stands them apart, which refuses the postcard to that eye. */
export function shapeOf(
  system: StarSystem,
  worlds: readonly Orbiter[],
  sight: Point | Camera,
): Omit<Postcard, "hidden"> {
  const camera = "ahead" in sight ? sight : cameraTowards(sight, EARTH_PLACE);
  const open = opened(system, camera.eye);
  const plane = levelled(open, worlds, camera);
  return plane === undefined
    ? { system: open, worlds: [], depth: [] }
    : { system: plane, worlds, depth: depthOf(plane, worlds, camera) };
}

/** `worlds` as a postcard from `sight`: its shape, and the specks it leaves out. */
export function postcardFrom(system: StarSystem, worlds: readonly Orbiter[], sight: Point | Camera): Postcard {
  const shape = shapeOf(system, worlds, sight);
  return { ...shape, hidden: hiddenOf(system, shape.worlds, shape.depth) };
}

/** `postcard`'s worlds at their drawn size; with `least` 1, at their own size at the least, as a view is judged, so what held at their own
 * size still holds. */
export const drawnOf = ({ worlds, depth }: Pick<Postcard, "worlds" | "depth">, least = 0): Orbiter[] =>
  worlds.map((world, at) => ({ ...world, radius: world.radius * Math.max(least, depth[at] ?? 1) }));

/** `postcard`, drawn from `own`, eased `share` of the way back to it: its plane's normal and each world's share of its size, so the view at
 * rest's drawing turns into the ladder's as the eye leaves it (7p's review). */
export function easedOf(postcard: Postcard, own: StarSystem, share: number): Postcard {
  const [from, to] = [normalOf(postcard.system), normalOf(own)];
  const normal = {
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
    z: from.z + (to.z - from.z) * share,
  };
  return {
    ...postcard,
    system: withNormal(postcard.system, normal),
    depth: postcard.depth.map((one) => one + (1 - one) * share),
  };
}

/** A postcard as drawn from the eye at rest `eye`. */
export const postcardOf = (system: StarSystem, eye: Point): Postcard =>
  postcardFrom(system, postcardWorlds(system), eye);
