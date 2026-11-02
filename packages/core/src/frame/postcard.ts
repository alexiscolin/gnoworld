// A postcard's worlds at display (slice 7d6; the chief, 2026-11-02, on postcards clumped round their star, then on a ring "pas naturel"):
// each world keeps its own phase and size, its orbit widened as its system's others are, till no two meet as the system turns, all at its one
// spin, with a third of the smaller one's width between them; never past its own cell, and never a regular figure. A plane seen near its
// edge is opened towards the eye, at display only.
import { CELL } from "../cosmos/cosmos.ts";
import { BELT_INNER, GRAIN, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";

// Frame 4's densest group is four bodies; a postcard's are chosen among its eight largest.
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

/** A postcard as drawn: its system, its plane opened towards the eye if need be, and the worlds it draws as bodies. */
export interface Postcard {
  readonly system: StarSystem;
  readonly worlds: readonly Orbiter[];
}

// `system`'s plane, opened towards `eye` till it is seen `OPEN_LEAST` open: its normal turned towards the eye's line, the nearer way.
function opened(system: StarSystem, eye: Point): StarSystem {
  const { place, tilt, node } = system;
  const length = Math.hypot(place.x - eye.x, place.y - eye.y, place.z - eye.z);
  const view = [(place.x - eye.x) / length, (place.y - eye.y) / length, (place.z - eye.z) / length] as const;
  const normal = [-Math.sin(node) * Math.sin(tilt), Math.cos(tilt), Math.cos(node) * Math.sin(tilt)] as const;
  const along = normal[0] * view[0] + normal[1] * view[1] + normal[2] * view[2];
  if (Math.abs(along) >= OPEN_LEAST) return system;
  // The normal's part across the line, and the line itself the side the normal leans: the opened normal is made of the two.
  const side = along < 0 ? -1 : 1;
  const across = normal.map((value, at) => value - along * (view[at] ?? 0));
  const width = Math.hypot(...across);
  const keep = Math.sqrt(1 - OPEN_LEAST ** 2);
  const [x = 0, y = 1, z = 0] = across.map((value, at) => (value / width) * keep + side * OPEN_LEAST * (view[at] ?? 0));
  const sign = y < 0 ? -1 : 1;
  return { ...system, tilt: Math.atan2(Math.hypot(x, z), Math.abs(y)), node: Math.atan2(-sign * x, sign * z) };
}

const placeIn = ({ orbit, phase }: Orbiter, spread: number) => ({
  x: spread * orbit * Math.cos(phase),
  y: spread * orbit * Math.sin(phase),
});

// How much `worlds` widen their orbits so no two meet, seen at the least open: their places in the plane, apart enough when foreshortened;
// and each off its star, its centre `OFF_STAR` of its radii from it (f0004's worlds stand 3 to 4 of theirs from their star), or as far as
// its `room` lets it.
function spreadOf(worlds: readonly Orbiter[], room: number): number {
  const off = ({ orbit, radius }: Orbiter) => Math.min(OFF_STAR * radius, room - radius) / Math.max(orbit, 1e-9);
  let spread = Math.max(1, ...worlds.map(off));
  for (const [at, one] of worlds.entries())
    for (const other of worlds.slice(at + 1)) {
      const [a, b] = [placeIn(one, 1), placeIn(other, 1)];
      const need = (one.radius + other.radius + 2 * AIR * Math.min(one.radius, other.radius)) * NEAR_SIDE;
      spread = Math.max(spread, need / OPEN_LEAST / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1e-9));
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

/** The worlds a postcard of `system` draws as bodies, widened round its star: the most, then the largest, that stand apart in its cell, inside
 * its far belt if it has one (7d3: never among its rocks), and read as no figure. Its others are specks. */
export function postcardWorlds(system: StarSystem): Orbiter[] {
  const choice = system.worlds
    .filter(({ radius }) => radius >= GRAIN)
    .sort((a, b) => b.radius - a.radius)
    .slice(0, CHOICE);
  const room = system.belt ? BELT_INNER : ROOM;
  for (let count = Math.min(POSTCARD_BODIES, choice.length); count > 0; count -= 1)
    for (const worlds of groupsOf(choice, count)) {
      const spread = spreadOf(worlds, room);
      const fits = worlds.every(({ orbit, radius }) => spread * orbit + radius <= room + ROUNDING);
      if (fits && natural(worlds, spread)) return worlds.map((world) => ({ ...world, orbit: spread * world.orbit }));
    }
  return [];
}

/** `worlds`, as `postcardWorlds` gives them, as a postcard from the eye at rest `eye`: its plane opened if need be. */
export const postcardFrom = (system: StarSystem, worlds: readonly Orbiter[], eye: Point): Postcard => ({
  system: opened(system, eye),
  worlds,
});

/** A postcard as drawn from the eye at rest `eye`. */
export const postcardOf = (system: StarSystem, eye: Point): Postcard =>
  postcardFrom(system, postcardWorlds(system), eye);
