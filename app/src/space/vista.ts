// The home's first screen has depth (D510): the Earth stays close at the bottom right, lit at three quarters, but the eye is swung round
// the Earth's light cone, which keeps the light, to the side that shows most of the home system's other worlds as round spheres of
// different sizes in the free part of the screen. Chosen once, as the first screen is framed; read as a pose's way and roll.
import type { Circle } from "./goals.ts";
import { HORIZON, layersOf, type Candidate, type Featured } from "./layers.ts";
import { cross, placeOf, type Planet, type Universe, type Vec } from "./layout.ts";

const FOV_HALF = Math.tan((50 * Math.PI) / 360);
const STEP = 4;
// The rolls tried, in degrees, round the sun's 140° on the screen; the Earth's light turns with them, so never far.
const ROLLS = [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60];
/** The frame's boost once the first screen has landed: the gate (this less 1) of each featured world's own boost, eased in (D541, D549). */
export const HOME_BOOST = 2;
// The sun's way on the screen, up and to the left, in degrees: the roll of the eye.
const SUN_ANGLE = 140;

// `v` made a unit, in place: what a frame computes, making nothing.
export function normalise(v: Vec): Vec {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= length;
  v.y /= length;
  v.z /= length;
  return v;
}

// At three quarters (D458): 99° from the sun (cos -0.15) in its plane, whatever the sun's place, so of the disc the plate and the dock leave
// in sight some 60 % stands in the light, the terminator across it; the eye rolled so the sun stands up and to the left, the night down to the right.
const QUARTER = { sun: -0.15, aside: -0.989 } as const;

/** A planet's light frame: the way to its sun, its plane's normal, and the plane's way across both. */
export interface Frame {
  readonly toSun: Vec;
  readonly n: Vec;
  readonly side: Vec;
}

// The way, `turn` degrees round the light cone from the plane's side: the light stays, the view swings (D510, vista.ts).
export function quarterOf(out: Vec, { toSun, n, side }: Frame, turn: number): Vec {
  const [across, up] = [
    Math.cos((turn * Math.PI) / 180) * QUARTER.aside,
    Math.sin((turn * Math.PI) / 180) * QUARTER.aside,
  ];
  out.x = toSun.x * QUARTER.sun + side.x * across + n.x * up;
  out.y = toSun.y * QUARTER.sun + side.y * across + n.y * up;
  out.z = toSun.z * QUARTER.sun + side.z * across + n.z * up;
  return normalise(out);
}

const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The eye's up when it looks along `way`'s opposite with `toSun` standing up and to the left of the screen, `roll` degrees round: into `out`. */
export function rollOf(out: Vec, { way, toSun }: { way: Vec; toSun: Vec }, roll = 0): Vec {
  const [sin, cos] = [Math.sin(((SUN_ANGLE + roll) * Math.PI) / 180), Math.cos(((SUN_ANGLE + roll) * Math.PI) / 180)];
  const look = { x: -way.x, y: -way.y, z: -way.z };
  const across = dot(toSun, look);
  const sun = { x: toSun.x - look.x * across, y: toSun.y - look.y * across, z: toSun.z - look.z * across };
  const length = Math.hypot(sun.x, sun.y, sun.z) || 1;
  const side = cross(look, sun);
  out.x = (sin * sun.x) / length - (cos * side.x) / length;
  out.y = (sin * sun.y) / length - (cos * side.y) / length;
  out.z = (sin * sun.z) / length - (cos * side.z) / length;
  return out;
}

/** What the eye sees from the Earth at `earth`: the way it stands at for a turn, how far, and the page's circle. */
export interface Eye {
  readonly earth: Vec;
  readonly toSun: Vec;
  readonly distance: number;
  readonly circle: Circle;
  readonly wayAt: (turn: number) => Vec;
}

/** The view chosen: its turn round the light cone and its roll, in degrees. */
export interface View {
  readonly turn: number;
  readonly roll: number;
}

/** A view tried at a time, its featured worlds held to `fixed` where told. */
interface ViewAt extends View {
  readonly seconds: number;
  readonly fixed?: readonly Featured[] | undefined;
}

// How well the worlds fill the screen seen by `eye` at `view`: its layers' worth; a turn or a roll far from the plane's side or the sun's
// up-left costs a little.
function scoreOf(worlds: readonly Planet[], eye: Eye, { turn, roll, seconds, fixed }: ViewAt) {
  const { earth, toSun, distance, circle } = eye;
  const [f, at] = [circle.height / 2 / FOV_HALF, { x: 0, y: 0, z: 0 }];
  const way = eye.wayAt(turn);
  const [look, up] = [{ x: -way.x, y: -way.y, z: -way.z }, rollOf({ x: 0, y: 0, z: 0 }, { way, toSun }, roll)];
  const right = cross(look, up);
  const cam = { x: earth.x + way.x * distance, y: earth.y + way.y * distance, z: earth.z + way.z * distance };
  const candidates: Candidate[] = [];
  for (const world of worlds) {
    placeOf(world, seconds, at);
    const d = { x: at.x - cam.x, y: at.y - cam.y, z: at.z - cam.z };
    const z = dot(d, look);
    placeOf(world, seconds + HORIZON, at);
    const [d2, x, y] = [
      { x: at.x - cam.x, y: at.y - cam.y, z: at.z - cam.z },
      circle.x + (f * dot(d, right)) / z,
      circle.y - (f * dot(d, up)) / z,
    ];
    const z2 = dot(d2, look);
    if (z > 0 && z2 > 0) {
      const later = { x: circle.x + (f * dot(d2, right)) / z2, y: circle.y - (f * dot(d2, up)) / z2 };
      candidates.push({ world, x, y, z, natural: (world.radius * f) / z, later });
    }
  }
  const found = layersOf(candidates, circle, fixed);
  return { ...found, score: found.score - Math.min(turn, 360 - turn) / 720 - Math.abs(roll) / 400 };
}

/** The view the home's first screen stands at, once chosen and while it stands (follow.ts moves it); none till then. Its featured worlds are
 * chosen once, as it has landed, and then kept (`frozen`) till the view leaves the home (D551). */
export const latch: { view: View | undefined; featured: readonly Featured[]; frozen: boolean; at: number } = {
  at: 0,
  view: undefined,
  featured: [],
  frozen: false,
};

// The views tried: all of them within `most` degrees of roll, or those within 24° of a turn and 20° of a roll of `around`.
function viewsOf(around: View | undefined, most: number): View[] {
  const turns = Array.from({ length: 360 / STEP }, (_, at) => at * STEP);
  const views = turns.flatMap((turn) => ROLLS.filter((roll) => Math.abs(roll) <= most).map((roll) => ({ turn, roll })));
  if (around === undefined) return views;
  const apart = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);
  return views.filter((v) => apart(v.turn, around.turn) <= 24 && Math.abs(v.roll - around.roll) <= 20);
}

/** The view, a turn round the light cone and a roll, at which `worlds` fill the screen best, the featured ones in its middle, with its
 * score; near `around` where it is told, and rolled `roll` degrees at most (60 by default). */
export function turnOf(
  worlds: readonly Planet[],
  eye: Eye,
  when: { seconds: number; around?: View; roll?: number; fixed?: readonly Featured[] | undefined },
): View & { score: number; featured: readonly Featured[] } {
  let best: View & { score: number; featured: readonly Featured[] } = {
    turn: 0,
    roll: 0,
    score: -Infinity,
    featured: [],
  };
  for (const view of viewsOf(when.around, when.roll ?? 60)) {
    const found = scoreOf(worlds, eye, { ...view, seconds: when.seconds, fixed: when.fixed });
    if (found.score > best.score) best = { ...view, ...found };
  }
  return best;
}

/** The worlds the first screen may feature: the home system's but the Earth, and the planets of the nearest other system, for a far layer
 * where no home world can stand in the free room (D549). */
export function featuredPool({ home, earth, systems }: Universe): Planet[] {
  const apart = (system: Universe["home"]): number =>
    Math.hypot(system.place.x - home.place.x, system.place.y - home.place.y, system.place.z - home.place.z);
  const [nearest] = systems.filter((system) => system !== home).sort((a, b) => apart(a) - apart(b));
  return [...home.planets.filter((planet) => planet !== earth), ...(nearest?.planets ?? [])];
}

/** Where `planet` stands `seconds` on, into `at`, the way from it to its sun (`toSun`) and the plane's way across (`side`): its light's frame. */
export function lightOf(
  planet: Planet,
  seconds: number,
  { at, toSun, side }: { at: Vec; toSun: Vec; side: Vec },
): void {
  placeOf(planet, seconds, at);
  const { place, normal: n } = planet.system;
  toSun.x = place.x - at.x;
  toSun.y = place.y - at.y;
  toSun.z = place.z - at.z;
  normalise(toSun);
  side.x = toSun.y * n.z - toSun.z * n.y;
  side.y = toSun.z * n.x - toSun.x * n.z;
  side.z = toSun.x * n.y - toSun.y * n.x;
  normalise(side);
}

export type { Featured };

// raw: seconds ahead of now the first screen is composed for: about what a flight has left when its view is chosen
const LEAD = 6;

/** Till the first screen has landed its view is chosen again every second and a half, for where the worlds will stand as the flight ends, so
 * a long flight lands on a view the quick orbits have not left (D553). */
export function compose(worlds: readonly Planet[], eye: Eye, seconds: number): void {
  if (latch.frozen || (latch.view !== undefined && seconds < latch.at + 1.5)) return;
  const first = turnOf(worlds, eye, { seconds: seconds + LEAD });
  [latch.view, latch.featured, latch.at] = [first, first.featured, seconds];
}
