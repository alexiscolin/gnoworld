// A system's arrival (slice 7d3; ADR-0002 §10, "A system is a postcard"): where the eye rests when it comes to a system, and what it looks
// at. Built on the view at rest's rules (7d6): `postcardWorlds`' worlds, judged on the screens that view is composed for by `composed`. The
// address picks the slant, the side and the height the star stands at and the order the angles are tried in, so the same address gives the
// same postcard and two systems are seldom seen alike; the eye stands near enough that the system's near side reads larger than its far.
import { ROOM, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import { nextState, textHash, unitOf, type Point } from "../space/cell.ts";
import { ARRIVAL_LEAN, SWAY_CORNERS } from "../space/drift.ts";
import { composed } from "./composition.ts";
import { CENTRE, onPlane, toMap } from "./disc.ts";
import { HALO_FAR, haloAt } from "./halo.ts";
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

// The lean lives beside the mouse's, where the view at rest's eye reads it without this module.
export { ARRIVAL_LEAN } from "../space/drift.ts";

// Slants over the system's plane, in degrees, from the least, over a span, tried a fourth of it apart: never face on (rings round the
// star), never edge on (a row).
const SLANT_LEAST = 32;
const SLANT_SPAN = 24;
const SLANT_TRIES = 4;
const TURNS = 16;
// The share of the screen's height its ball takes, and how far its star stands off the middle and up or down, in heights.
const FILL = [0.45, 0.6] as const;
const ASIDE = [0.27, 0.36] as const;
const LIFT = 0.16;
// The view looks no steeper than this up or down the map: its up stays up.
const STEEP = Math.sin(60 * DEGREE);
const MARGIN = 24;
// A system of grain alone is framed by its star.
const LEAST_REACH = 2.5;
// What the arrival reads of its set: another system's room round the eye, and any star that keeps three quarters of its halo or more (64
// units off or nearer), which on the postcard would read as a second sun. The eye stands 29 units off at most, so nothing farther than that
// past a halo's reach counts.
const OUTSIDE = ROOM + 1;
const SECOND_SUN = 0.75;
const NEAR = HALO_FAR + 30;
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

/** What an address picks: how much of the screen its system takes, where its star stands, the slant and turn the angles start from. */
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
    slant: SLANT_SPAN * next(),
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

// On one screen from one eye: the ball whole under the header, no world on the star's heart.
function sees(look: Look, { place, reach, card }: Held): boolean {
  const star = look.seen(place);
  return (
    look.whole(look.ball(place, reach), MARGIN) &&
    spotsOf(look, [card], {}).every((spot) => apart(spot, star) - spot.radius >= STAR_HEART)
  );
}

// From the eye at rest: the Earth and every star that keeps a good share of its halo off the ball.
function alone(look: Look, { place, reach, near }: Held): boolean {
  const ball = look.ball(place, reach);
  const { earth } = look;
  if (earth.depth > 0 && apart(earth, ball) < earth.radius + ball.radius) return false;
  return near.every((other) => {
    const seen = look.seen(other.place);
    return seen.depth <= 0 || haloAt(seen.away) < SECOND_SUN || apart(seen, ball) >= ball.radius;
  });
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

// The eye outside every other room; at rest alone with its star, read well, whole and clear; whole and clear through the sway, and
// through a mouse's lean where `leaning`.
const holds = (camera: Camera, look: Point, held: Held & { readonly leaning: boolean }): boolean =>
  held.near.every((other) => away(other.place, camera.eye) >= OUTSIDE) &&
  looksFrom(camera).every((each) => alone(each, held) && sees(each, held) && reads(each, held)) &&
  SWAY_CORNERS.every((sway) => looksFrom(swayed(camera, sway, look)).every((each) => sees(each, held))) &&
  (!held.leaning ||
    LEANS.every((lean) =>
      looksFrom(cameraTowards(along(camera.eye, lean, 1), look)).every((each) => sees(each, held)),
    ));

// The eye `slant` over the system's plane and `turn` round its normal, framing a ball `reach` round the star, and what it looks at: beside
// the star, so the star stands `aside` of the middle and `lift` above or below it.
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

// The angles in the address's order: its slants a fourth of the span apart, each all round from its turn.
function anglesOf(pick: Chosen): (readonly [number, number])[] {
  return Array.from({ length: SLANT_TRIES * TURNS }, (_, at) => {
    const slant = SLANT_LEAST + ((pick.slant + (Math.floor(at / TURNS) * SLANT_SPAN) / SLANT_TRIES) % SLANT_SPAN);
    return [slant * DEGREE, 2 * Math.PI * (pick.first + (at % TURNS) / TURNS)] as const;
  });
}

interface Asked {
  readonly pick: Chosen;
  readonly near: readonly StarSystem[];
  readonly leaning: boolean;
}

// The first angle, in the address's order, from which `worlds` read as the rules ask; none if no angle holds.
function firstHolding(system: StarSystem, worlds: readonly Orbiter[], { pick, near, leaning }: Asked) {
  const reach = reachOf(system, worlds);
  const instants = instantsOf([system.spin]);
  for (const angle of anglesOf(pick)) {
    const { camera, look } = tryOf(system, angle, { reach, pick });
    const card = { system: postcardFrom(system, worlds, camera.eye).system, worlds };
    const held = { place: system.place, reach, card, instants, near, leaning };
    if (Math.abs(camera.ahead.y) <= STEEP && holds(camera, look, held))
      return { eye: camera.eye, look, postcard: postcardFrom(system, worlds, camera.eye) };
  }
  return undefined;
}

/** `system`'s arrival among `systems`: the most of its postcard's worlds that some angle reads well, chosen again at each count, from the
 * first such angle its address gives; one that holds through a mouse's lean first, else one that holds at rest and through the sway. A
 * system none reads well with stands by its star and its far belt alone, from its first angle that does not look down the map. */
export function arrivalOf(system: StarSystem, systems: readonly StarSystem[]): Arrival {
  const pick = chosenOf(system.id);
  // ponytail: one pass over the set an arrival, asked once a system and off the frame: 20,000 distances.
  const near = systems.filter((other) => other.id !== system.id && away(other.place, system.place) <= NEAR);
  for (let count = postcardWorlds(system).length; count >= 0; count -= 1)
    for (const leaning of [true, false]) {
      const found = firstHolding(system, postcardWorlds(system, count), { pick, near, leaning });
      if (found !== undefined) return found;
    }
  const reach = reachOf(system, []);
  const tries = anglesOf(pick).map((angle) => tryOf(system, angle, { reach, pick }));
  const [first] = tries;
  const { camera, look } =
    tries.find((tried) => Math.abs(tried.camera.ahead.y) <= STEEP) ?? first ?? tryOf(system, [0, 0], { reach, pick });
  return { eye: camera.eye, look, postcard: postcardFrom(system, [], camera.eye) };
}
