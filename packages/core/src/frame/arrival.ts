// A system's arrival (slice 7d3; ADR-0002 §10, "A system is a postcard"): where the eye rests when it comes to a system, and what it looks
// at. Built on the view at rest's rules (7d6): `postcardWorlds`' worlds, judged on the screens that view is composed for by `composed`. The
// address orders the angles tried, so the same address gives the same postcard and two systems are seldom seen alike; the star stands a
// third of the way in, never centred for the camera, and the eye near enough that the system's near side reads larger than its far side.
import { ROOM, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import { nextState, textHash, unitOf, type Point } from "../space/cell.ts";
import { SWAY_CORNERS } from "../space/drift.ts";
import { composed } from "./composition.ts";
import { onPlane } from "./disc.ts";
import { postcardFrom, postcardWorlds, type Postcard } from "./postcard.ts";
import { instantsOf, spotsOf } from "./restCards.ts";
import {
  along,
  away,
  cameraTowards,
  DEGREE,
  focalOf,
  looksFrom,
  STAR_HEART,
  swayed,
  type Camera,
  type Look,
  type Seen,
} from "./restLook.ts";

/** Where the eye rests when it comes to a system, what it looks at, both on the map, and the system as drawn there. */
export interface Arrival {
  readonly eye: Point;
  readonly look: Point;
  readonly postcard: Postcard;
}

// Slants over the system's plane, in degrees: seen at a slant, never face on (rings round the star), never edge on (a row).
const SLANTS = [32, 40, 48, 56];
const TURNS = 16;
// The share of the screen's height its ball takes, and how far its star stands off the middle and up or down, in heights.
const FILL = [0.45, 0.6] as const;
const ASIDE = [0.24, 0.3] as const;
const LIFT = 0.06;
// The view looks no steeper than this up or down the map: its up stays up.
const STEEP = Math.sin(60 * DEGREE);
const MARGIN = 24;
// A system of grain alone is framed by its star.
const LEAST_REACH = 2.5;
// What the arrival reads of its set: another system's room round the eye, and a star near enough to keep a halo of its own (halos.ts: whole
// to 40 units, a point by 120), which on the postcard would be a second sun. The eye stands 29 units off at most, so nothing past 100 counts.
const OUTSIDE = ROOM + 1;
const HALOED = 60;
const NEAR = 100;

/** What an address picks: how much of the screen its system takes, where its star stands, where the angles tried start. */
interface Chosen {
  readonly fill: number;
  readonly aside: number;
  readonly lift: number;
  readonly first: number;
  readonly slant: number;
}

function chosenOf(id: string): Chosen {
  let state = textHash(`arrival ${id}`);
  const next = () => {
    state = nextState(state);
    return unitOf(state);
  };
  const side = next() < 0.5 ? -1 : 1;
  return {
    fill: FILL[0] + (FILL[1] - FILL[0]) * next(),
    aside: side * (ASIDE[0] + (ASIDE[1] - ASIDE[0]) * next()),
    lift: LIFT * (2 * next() - 1),
    first: next(),
    slant: Math.floor(next() * SLANTS.length),
  };
}

/** A system as one camera is judged on it: its star, the ball its worlds and belt fill, its card, the instants of its turn, what stands near. */
interface Held {
  readonly place: Point;
  readonly reach: number;
  readonly card: Pick<Postcard, "system" | "worlds">;
  readonly instants: readonly number[];
  readonly near: readonly StarSystem[];
}

const apart = (a: Seen, b: Seen) => Math.hypot(a.x - b.x, a.y - b.y);

// On one screen from one eye: the ball whole under the header, the Earth and every haloed star off it, no world on the star's heart.
function sees(look: Look, { place, reach, card, near }: Held): boolean {
  const ball = look.ball(place, reach);
  const { earth } = look;
  if (!look.whole(ball, MARGIN) || (earth.depth > 0 && apart(earth, ball) < earth.radius + ball.radius)) return false;
  const star = look.seen(place);
  const lit = near.every((other) => {
    const seen = look.seen(other.place);
    return seen.depth <= 0 || seen.away > HALOED || apart(seen, ball) >= ball.radius;
  });
  return lit && spotsOf(look, [card], {}).every((spot) => apart(spot, star) - spot.radius >= STAR_HEART);
}

// As the view at rest's rules read it: the first picture with its star, the worlds alone through their turn, for a world, its star and
// another line up as they turn (composition.ts).
function reads(look: Look, { place, card, instants }: Held): boolean {
  const star = look.seen(place);
  const judged = (seconds: number, lights: readonly Seen[]) => {
    const [first, ...rest] = spotsOf(look, [card], { seconds });
    return (
      first === undefined || composed(rest, first, { deep: false, lights, width: look.width, height: look.height })
    );
  };
  return judged(0, [star]) && instants.every((seconds) => judged(seconds, []));
}

const holds = (camera: Camera, look: Point, held: Held): boolean =>
  held.near.every((other) => away(other.place, camera.eye) >= OUTSIDE) &&
  looksFrom(camera).every((each) => sees(each, held) && reads(each, held)) &&
  SWAY_CORNERS.every((sway) => looksFrom(swayed(camera, sway, look)).every((each) => sees(each, held)));

// The eye `slant` over the system's plane and `turn` round its normal, framing a ball `reach` round the star, and what it looks at: beside
// the star, so the star stands `aside` of the middle.
function tryOf(
  system: StarSystem,
  [slant, turn]: readonly [number, number],
  { reach, pick }: { reach: number; pick: Chosen },
) {
  const way = { x: NaN, y: NaN, z: NaN };
  const across = Math.cos(slant);
  onPlane(
    { place: { x: 0, y: 0, z: 0 }, tilt: system.tilt, node: system.node },
    { along: across * Math.cos(turn), across: across * Math.sin(turn), up: Math.sin(slant) },
    way,
  );
  const focal = focalOf(1);
  const distance = reach * (1 + (2 * focal) / pick.fill);
  const eye = along(system.place, way, distance);
  const straight = cameraTowards(eye, system.place);
  const shift = distance / focal;
  const look = along(along(system.place, straight.right, -pick.aside * shift), straight.up, -pick.lift * shift);
  return { camera: cameraTowards(eye, look), look };
}

const reachOf = (system: StarSystem, worlds: readonly Orbiter[]) =>
  Math.max(system.belt ? ROOM : 0, ...worlds.map(({ orbit, radius }) => orbit + radius)) || LEAST_REACH;

// The first angle, in the address's order, from which `worlds` read as the rules ask; none if no angle holds.
function firstHolding(
  system: StarSystem,
  worlds: readonly Orbiter[],
  { pick, near }: { pick: Chosen; near: readonly StarSystem[] },
) {
  const reach = reachOf(system, worlds);
  const instants = instantsOf([system.spin]);
  for (let slant = 0; slant < SLANTS.length; slant += 1)
    for (let turn = 0; turn < TURNS; turn += 1) {
      const angle = [
        (SLANTS[(pick.slant + slant) % SLANTS.length] ?? 0) * DEGREE,
        2 * Math.PI * (pick.first + turn / TURNS),
      ] as const;
      const { camera, look } = tryOf(system, angle, { reach, pick });
      const card = { system: postcardFrom(system, worlds, camera.eye).system, worlds };
      const held = { place: system.place, reach, card, instants, near };
      if (Math.abs(camera.ahead.y) <= STEEP && holds(camera, look, held))
        return { eye: camera.eye, look, postcard: postcardFrom(system, worlds, camera.eye) };
    }
  return undefined;
}

/** `system`'s arrival among `systems`: the most of its postcard's worlds, the largest first, that some angle reads well, from the first such
 * angle its address gives. A system none reads well with stands by its star alone, from its address's first angle. */
export function arrivalOf(system: StarSystem, systems: readonly StarSystem[]): Arrival {
  const pick = chosenOf(system.id);
  // ponytail: one pass over the set an arrival, asked once a system and off the frame: 20,000 distances.
  const near = systems.filter((other) => other.id !== system.id && away(other.place, system.place) <= NEAR);
  const all = postcardWorlds(system);
  for (let count = all.length; count >= 0; count -= 1) {
    const found = firstHolding(system, all.slice(0, count), { pick, near });
    if (found !== undefined) return found;
  }
  const { camera, look } = tryOf(system, [(SLANTS[pick.slant] ?? 0) * DEGREE, 2 * Math.PI * pick.first], {
    reach: LEAST_REACH,
    pick,
  });
  return { eye: camera.eye, look, postcard: postcardFrom(system, [], camera.eye) };
}
