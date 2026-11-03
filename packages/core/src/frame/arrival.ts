// A system's dynamic view (part 7v; Alexis, 2026-11-03, "exactement cette idée"), the view a system shows by default: its star at the
// screen's centre, its worlds round it at many depths, the nearest cut by the frame and the largest, the others whole, each 1.5 times the
// next farther; no orbit is drawn. Its worlds hold still, so the near one stays cut as the view at rest's close world does. The address
// picks the slant and the turn the angles are tried in, so the same address gives the same view. Built on 7d3's postcards (7p's depth).
import { ROOM, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import { nextState, textHash, unitOf, type Point } from "../space/cell.ts";
import { ARRIVAL_LEAN, SWAY_CORNERS } from "../space/drift.ts";
import { composed } from "./composition.ts";
import { CENTRE, onPlane, toMap } from "./disc.ts";
import { HALO_FAR, haloAt } from "./halo.ts";
import { drawnOf, postcardFrom, postcardWorlds, shapeOf, type Postcard } from "./postcard.ts";
import {
  along,
  away,
  cameraTowards,
  DEGREE,
  focalOf,
  looksFrom,
  placeOf,
  STAR_HEART,
  swayed,
  type Camera,
  type Look,
  type Seen,
} from "./restLook.ts";

/** Where the eye rests when it comes to a system, what it looks at (its star), both on the map, and the system as drawn there. */
export interface Arrival {
  readonly eye: Point;
  readonly look: Point;
  readonly postcard: Postcard;
}

// The lean lives beside the mouse's, where the view at rest's eye reads it without this module.
export { ARRIVAL_LEAN } from "../space/drift.ts";

// Slants over the system's plane, in degrees: a postcard's plane is seen 30 degrees open at the least (postcard.ts), never face on.
const SLANT_LEAST = 32;
const SLANT_SPAN = 22;
const SLANT_TRIES = 4;
const TURNS = 36;
const STRIDE = 11;
// How far the eye stands from the star, in the reach of its worlds: near, so its near side reads far larger than its far side.
const DISTANCES = [1.1, 1.25, 1.45, 1.7, 2];
// Where no angle cuts it, the view stands back to hold its nearest world whole as well.
const WHOLE_DISTANCES = [2.2, 2.7, 3.3, 4];
// The near world shows this share of itself each way at rest and swayed, 1.5 times every other's size or more (the depth's own, depth.ts),
// half the height across at most.
const SHOWN_AT_REST = 0.3;
const SHOWN_SWAYED = 0.25;
const NEAR_OVER = 1.5;
const NEAR_MOST = 0.5;
const MARGIN = 24;
const HEADER = 0.09;
// The view looks no steeper than this up or down the map: its up stays up.
const STEEP = Math.sin(60 * DEGREE);
// A system of grain alone is framed by its star; one no angle holds stands its ball 60% of the screen's height.
const LEAST_REACH = 2.5;
const FILL = 0.6;
// What the view reads of its set: another system's room round the eye, and any star that keeps three quarters of its halo or more, which
// would read as a second sun; the eye stands within twice a system's room of its star, so nothing past a halo's reach counts.
const OUTSIDE = ROOM + 1;
const SECOND_SUN = 0.75;
const NEAR = HALO_FAR + 2 * ROOM;
// A mouse's lean on the map: the eight edges of the stage's across and up, at an arrival's lean.
const LEANS: readonly Point[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
].map(([across = 0, up = 0]) => {
  const out = { x: 0, y: 0, z: 0 };
  toMap({ x: CENTRE.x + across * ARRIVAL_LEAN, y: CENTRE.y + up * ARRIVAL_LEAN, z: CENTRE.z }, out);
  return out;
});

/** What an address picks: the slant and the turn the angles start from. */
interface Chosen {
  readonly first: number;
  readonly slant: number;
}

function chosenOf(id: string): Chosen {
  const state = textHash(`arrival ${id}`);
  return { first: unitOf(nextState(state)), slant: unitOf(nextState(nextState(state))) };
}

type Card = Pick<Postcard, "system" | "worlds" | "depth">;

/** A system's worlds as one camera sees them, at their drawn size: the nearest first; and its star. */
function seenOf(look: Look, card: Card): { star: Seen; worlds: Seen[] } {
  const worlds = drawnOf(card).map((world) => look.seen(placeOf(card.system, world, 0), world.radius));
  return { star: look.seen(card.system.place), worlds: worlds.sort((a, b) => a.away - b.away) };
}

// Whether a body there is cut by the frame's sides or its foot, never its head, which the header holds: `least` of it shown each way.
function cutByFrame(look: Look, at: Seen, least: number): boolean {
  const { width, height } = look;
  const [wide, high] = [at.right - at.left, at.bottom - at.top];
  const shown = (Math.min(at.right, width) - Math.max(at.left, 0)) / wide;
  const up = (Math.min(at.bottom, height) - at.top) / high;
  const cut = at.left < 0 || at.right > width || at.bottom > height;
  return at.depth > 0 && cut && at.top >= HEADER * height && shown >= least && up >= least;
}

const offHeart = (spot: Seen, star: Seen) => Math.hypot(spot.x - star.x, spot.y - star.y) - spot.radius >= STAR_HEART;

// On one screen: the nearest world cut by the frame, half the height across at most, 1.5 times every other's size or more, or where `cut`
// is not asked whole as the others; off the star's heart; the others whole under the header and off it; at rest, in no crowd, pile or row
// (7d6's rules).
function frames(look: Look, card: Card, how: { atRest: boolean; cut: boolean }): boolean {
  const { star, worlds } = seenOf(look, card);
  const [near, ...others] = worlds;
  if (near === undefined || !leads(look, [near, others], how)) return false;
  if (!offHeart(near, star) || !others.every((spot) => look.whole(spot, MARGIN) && offHeart(spot, star))) return false;
  const { atRest } = how;
  const frame = { deep: false, lights: [star], width: look.width, height: look.height };
  return !atRest || others.length === 0 || composed(others, near, frame);
}

// The nearest world as the view asks it: cut by the frame and the largest, or whole as the others.
function leads(
  look: Look,
  [near, others]: readonly [Seen, readonly Seen[]],
  { atRest, cut }: { atRest: boolean; cut: boolean },
) {
  if (!cut) return look.whole(near, MARGIN);
  return (
    cutByFrame(look, near, atRest ? SHOWN_AT_REST : SHOWN_SWAYED) &&
    near.radius <= NEAR_MOST * look.height &&
    others.every(({ radius }) => near.radius >= NEAR_OVER * radius)
  );
}

// The round its star and whole worlds take on the screen: the near world, cut by the frame, reaches its edge, and is no part of it.
function roundOf(look: Look, card: Card): Seen {
  const { star, worlds } = seenOf(look, card);
  const reach = Math.max(
    STAR_HEART,
    ...worlds.slice(1).map((spot) => Math.hypot(spot.x - star.x, spot.y - star.y) + spot.radius),
  );
  return { ...star, radius: reach };
}

// From the eye at rest: the Earth off the system's round, and every star that keeps a good share of its halo off it.
function alone(look: Look, card: Card, near: readonly StarSystem[]): boolean {
  const ball = roundOf(look, card);
  const { earth } = look;
  const apart = (a: Seen, b: Seen) => Math.hypot(a.x - b.x, a.y - b.y);
  if (earth.depth > 0 && apart(earth, ball) < earth.radius + ball.radius) return false;
  return near.every((other) => {
    const seen = look.seen(other.place);
    return seen.depth <= 0 || haloAt(seen.away) < SECOND_SUN || apart(seen, ball) >= ball.radius;
  });
}

interface Asked {
  readonly pick: Chosen;
  readonly around: readonly StarSystem[];
  readonly leaning: boolean;
  readonly cut: boolean;
}

// The eye outside every other room; at rest alone and framed; framed through the sway, and through a mouse's lean where `leaning`.
function holds(camera: Camera, card: Card, { around, leaning, cut }: Asked) {
  const { system } = card;
  const looked = (moved: Camera, atRest: boolean) =>
    looksFrom(moved).every((look) => frames(look, card, { atRest, cut }));
  return (
    around.every((other) => away(other.place, camera.eye) >= OUTSIDE) &&
    looksFrom(camera).every((look) => alone(look, card, around)) &&
    looked(camera, true) &&
    SWAY_CORNERS.every((sway) => looked(swayed(camera, sway, system.place), false)) &&
    (!leaning || LEANS.every((lean) => looked(cameraTowards(along(camera.eye, lean, 1), system.place), false)))
  );
}

const reachOf = (system: StarSystem, worlds: readonly Orbiter[]) =>
  Math.max(system.belt ? ROOM : 0, ...worlds.map(({ orbit, radius }) => orbit + radius)) || LEAST_REACH;

// The eye `slant` over the system's plane, `turn` round its normal, `distance` from its star, looking at it.
function cameraOf(system: StarSystem, [slant, turn]: readonly [number, number], distance: number): Camera {
  const way = { x: NaN, y: NaN, z: NaN };
  const across = Math.cos(slant);
  onPlane(
    { place: { x: 0, y: 0, z: 0 }, tilt: system.tilt, node: system.node },
    { along: across * Math.cos(turn), across: across * Math.sin(turn), up: Math.sin(slant) },
    way,
  );
  return cameraTowards(along(system.place, way, distance), system.place);
}

// The angles in the address's order: its slants a fourth of the span apart, each all round from its turn, a stride of turns apart, so the
// first that holds is seldom the same for two addresses whose systems are alike.
function anglesOf(pick: Chosen): (readonly [number, number])[] {
  return Array.from({ length: SLANT_TRIES * TURNS }, (_, at) => {
    const slant =
      SLANT_LEAST + ((pick.slant * SLANT_SPAN + (Math.floor(at / TURNS) * SLANT_SPAN) / SLANT_TRIES) % SLANT_SPAN);
    return [slant * DEGREE, 2 * Math.PI * (pick.first + ((at * STRIDE) % TURNS) / TURNS)] as const;
  });
}

// The first angle and distance, in the address's order, from which `worlds`, held still, read as the view asks; none if none does.
function firstHolding(system: StarSystem, worlds: readonly Orbiter[], asked: Asked) {
  const still = { ...system, spin: 0 };
  const reach = reachOf(system, worlds);
  for (const angle of anglesOf(asked.pick))
    for (const distance of asked.cut ? DISTANCES : WHOLE_DISTANCES) {
      const camera = cameraOf(still, angle, reach * distance);
      const shape = shapeOf(still, worlds, camera);
      if (shape.worlds.length !== worlds.length || Math.abs(camera.ahead.y) > STEEP) continue;
      if (holds(camera, shape, asked))
        return { eye: camera.eye, look: system.place, postcard: postcardFrom(still, worlds, camera) };
    }
  return undefined;
}

// The counts and ways tried, in order: the most worlds with the nearest cut by the frame, down to two; the most whole, down to two; one, cut,
// then whole. Two worlds whole read deeper than one cut alone.
function triesOf(most: number): (readonly [count: number, cut: boolean])[] {
  const down = (cut: boolean) => Array.from({ length: Math.max(most - 1, 0) }, (_, at) => [most - at, cut] as const);
  return [...down(true), ...down(false), [1, true], [1, false]];
}

/** `system`'s dynamic view among `systems`: the most of its postcard's worlds an angle reads as the view asks, its nearest cut where one
 * allows (`triesOf`), from the first angle its address gives that holds through a mouse's lean, else at rest and through the sway; a system
 * none reads well with, by its star and far belt alone, from its first angle that does not look down the map. */
export function arrivalOf(system: StarSystem, systems: readonly StarSystem[]): Arrival {
  const pick = chosenOf(system.id);
  // ponytail: one pass over the set an arrival, asked once a system and off the frame: 20,000 distances.
  const around = systems.filter((other) => other.id !== system.id && away(other.place, system.place) <= NEAR);
  const most = postcardWorlds(system).length;
  for (const [count, cut] of most === 0 ? [] : triesOf(most))
    for (const leaning of [true, false]) {
      const found = firstHolding(system, postcardWorlds(system, count), { pick, around, leaning, cut });
      if (found !== undefined) return found;
    }
  // Framed whole by its star and far belt, as 7d3 framed it: the ball's height a share of the screen's.
  const still = { ...system, spin: 0 };
  const reach = reachOf(system, []);
  const cameras = anglesOf(pick).map((angle) => cameraOf(still, angle, reach * (1 + (2 * focalOf(1)) / FILL)));
  const camera =
    cameras.find(
      (one) =>
        Math.abs(one.ahead.y) <= STEEP &&
        around.every((other) => away(other.place, one.eye) >= OUTSIDE) &&
        looksFrom(one).every((look) => alone(look, { system: still, worlds: [], depth: [] }, around)),
    ) ??
    cameras.find((one) => Math.abs(one.ahead.y) <= STEEP) ??
    cameraOf(still, [SLANT_LEAST * DEGREE, 0], reach * 2);
  return { eye: camera.eye, look: system.place, postcard: postcardFrom(still, [], camera.eye) };
}
