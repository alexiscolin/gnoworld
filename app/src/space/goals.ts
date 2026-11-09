// Where each place puts the camera (D401, the demo's poses): the whole universe from above; a system from above its own plane,
// keeping the heading the camera has (the shortest turn); a planet at the distance that fills the page's circle, its night side
// toward the plate and its sun on the right, or lit at three quarters toward the plate where the page frames it close (D458), met where its
// orbit has it each frame.
import type { Space } from "./scene.ts";
import type { Goal } from "./rig/flight.ts";
import { copySpot, type Pose } from "./rig/pose.ts";
import { compose, featuredPool, latch, lightOf, normalise, quarterOf, rollOf, type Frame, type View } from "./vista.ts";
import { unit, type Planet, type System, type Vec } from "./layout.ts";

/** The page's circle, in the page's pixels, and the screen. */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly width: number;
  readonly height: number;
  /** The room the plate and the dock leave free between them, in x: where the Map centres a system. */
  readonly free?: { readonly left: number; readonly right: number } | undefined;
  /** The planet framed close, larger than the window, and lit at three quarters (D458, D459). */
  readonly close?: boolean | undefined;
}

const FOV = 50;
// In front of the heart and right of it: the saucer, larger near than far, stands in the middle of what the rail leaves free.
const UNIVERSE_LOOK: Vec = { x: 300, y: 0, z: 700 };
// The Map's, from above, as it was.
const UNIVERSE_PLAN_LOOK: Vec = { x: -260, y: 0, z: 120 };
const UNIVERSE_AWAY = 6200;
// The 3D view's own, nearer (D496): the disc fills more of the window, the wheel takes the eye out to the far reach (9000).
const UNIVERSE_NEAR = 4700;
// raw: the page's room round a system: the rail's width and its step at the right (kept at the left too), the header and the crumb above
const SIDE_ROOM = 230;
const TOP_ROOM = 150;
const MIN_ROOM = 120;
// raw: a step of room past the outer orbit, and the near side of a lowered disc, which perspective draws larger
// The Map fits a system large (D505, D507): its outer orbit a little past the room, its worlds spread wide; the wheel takes it out.
const FIT_MARGIN = 0.68;
const FIT_MARGIN_3D = 0.42;
// 28° above the disc, low enough that the saucer reads in perspective, its thickness and depth seen (Alexis, 2026-11-09).
const UNIVERSE_WAY = { x: 0, y: Math.sin((28 * Math.PI) / 180), z: Math.cos((28 * Math.PI) / 180) };
// The Map's way over the universe, as the plan's over a system (0.17 across, 0.985 above), and how much farther the whole disc stands in it.
const UNIVERSE_PLAN_WAY = { x: 0, y: 0.985, z: 0.17 };
const UNIVERSE_PLAN_AWAY = 1.3;
// raw: a world's page: the system's outer orbit fills this many radii of the page's circle, which the plate and the chat leave free
const PAGE_ROOM = 1.05;
const UP: Vec = { x: 0, y: 1, z: 0 };

/** A screen's size, in the page's pixels. */
interface Screen {
  readonly width: number;
  readonly height: number;
}

// The pose that looks at `look` from `way`, upright, the lens's field; its distance set by the caller.
const set = (out: Pose, look: Vec, way: Vec): Pose => {
  copySpot(look, out.look);
  copySpot(way, out.way);
  copySpot(UP, out.up);
  out.fov = FOV;
  return out;
};

// Till the page lays its circle out, the one a plate's page has: right of the middle, a fifth of the screen high.
export const middleOf = ({ width, height }: Screen): Circle => ({
  x: width * 0.56,
  y: height * 0.5,
  radius: height * 0.2,
  width,
  height,
});

/** The screen as the loop last measured it (`seen`), or before its first frame the page's circle's, else the window's: a goal asked at once fits it. */
export const screenOf = (seen: Screen, circle: Circle | undefined): Screen =>
  seen.width > 1 ? seen : (circle ?? { width: innerWidth, height: innerHeight });

/** The lens shift, in pixels, that brings the screen's middle onto `circle`'s. */
export const shiftOf = (circle: Circle) => ({ x: circle.width / 2 - circle.x, y: circle.height / 2 - circle.y });

/** The whole universe, its disc `scale` times the demo's; from above (the Map) where `plan`. */
export const universeGoal = (scale: number, said: Pick<Goal, "near" | "landed"> = {}, plan = false): Goal => {
  const at = plan ? UNIVERSE_PLAN_LOOK : UNIVERSE_LOOK;
  const look = { x: at.x * scale, y: at.y * scale, z: at.z * scale };
  return {
    ...said,
    pose: (out) => {
      if (plan) set(out, look, UNIVERSE_PLAN_WAY).distance = UNIVERSE_AWAY * UNIVERSE_PLAN_AWAY * scale;
      else set(out, look, UNIVERSE_WAY).distance = UNIVERSE_NEAR * scale;
      return true;
    },
  };
};

/** `system` from above its plane, from the heading `way` the camera has; the home system looks at the Earth. On a world's page (`circle`
 * told) the system is fitted to the page's circle, which the lens shift brings under the sun. */
export function systemGoal(
  system: System,
  way: Vec,
  {
    plan = false,
    screen,
    circle,
    ...said
  }: { plan?: boolean; screen: () => Screen; circle?: () => Circle } & Pick<Goal, "near" | "landed">,
): Goal {
  const n = system.normal;
  const level = way.x * n.x + way.y * n.y + way.z * n.z;
  const flat = unit({ x: way.x - n.x * level, y: way.y - n.y * level, z: way.z - n.z * level });
  // From above its plane, a little tilted (the plan); or low over it, about 12°, near and large, the sun in the middle and the near worlds
  // big in front (D483, Alexis's capture 16.56.37).
  const [across, above] = plan ? [0.17, 0.985] : [0.978, 0.208];
  const from = unit({
    x: flat.x * across + n.x * above,
    y: flat.y * across + n.y * above,
    z: flat.z * across + n.z * above,
  });
  return {
    ...said,
    pose: (out) => {
      const page = circle?.();
      set(out, system.place, from).distance = fitOf(system.reach, above, { screen: screen(), page });
      // Upright on its own plane: a drag turns it round its axis.
      copySpot(n, out.up);
      if (page?.free !== undefined) centre(out, page);
      return true;
    },
  };
}

// The look moved so that what it looks at (the sun) stands at the middle of the page's free room, not of its circle: the lens brings the
// look to the circle, and the camera's right, across the pose's way and up, carries the rest. Moved in the world, it flies with the pose.
function centre(out: Pose, page: Circle): void {
  const { way, up, look } = out;
  if (page.free === undefined) return;
  const [x, y, z] = [up.y * way.z - up.z * way.y, up.z * way.x - up.x * way.z, up.x * way.y - up.y * way.x];
  const across = (page.free.left + page.free.right) / 2 - page.x;
  const step =
    (across * 2 * Math.tan((FOV * Math.PI) / 360) * out.distance) / (page.height * (Math.hypot(x, y, z) || 1));
  look.x -= x * step;
  look.y -= y * step;
  look.z -= z * step;
}

// How far a system is seen so its outer orbit, `reach`, fills the room the page leaves it (the header and the crumb above, the rail at the
// right, kept as wide on the left so it stays in the middle), whatever its size (Alexis, 2026-11-08: "tenir au plus large dans la
// fenêtre"): seen `above` its plane, its disc is a circle from over it and flattens as the view lowers, so it may then reach higher.
function fitOf(
  reach: number,
  above: number,
  { screen: { width, height }, page }: { screen: Screen; page?: Circle | undefined },
): number {
  // From above the orbits drawn fill it; in 3D the camera stands well inside that, the outer orbits past the window's edges and the near
  // planets large in front (Alexis, 2026-11-08, his reference: "beaucoup plus proche").
  const margin = above > 0.9 ? FIT_MARGIN : FIT_MARGIN_3D;
  const aspect = width / Math.max(height, 1);
  // The lens's half height at a distance of 1, as the rig widens it on a tall screen.
  const tall = Math.tan((FOV * Math.PI) / 360) / Math.min(aspect, 1);
  const free = Math.max(MIN_ROOM, Math.min(width / 2 - SIDE_ROOM, (height / 2 - TOP_ROOM) / Math.max(above, 0.2)));
  const room = page === undefined ? free : roomOf(page, height);
  return (reach * margin * (height / 2)) / (tall * room);
}

// A page's room in pixels, from the middle to the nearest edge: the free room between the plate and the dock, else the circle's.
const roomOf = ({ free, radius }: Circle, height: number): number =>
  free === undefined ? radius * PAGE_ROOM : Math.min((free.right - free.left) / 2, height / 2 - TOP_ROOM);

/** The distance at which a sphere of `radius` fills `circle`. */
const fitDistance = (radius: number, circle: Circle): number =>
  radius / Math.sin(Math.atan(Math.tan((FOV * Math.PI) / 360) * ((2 * circle.radius) / circle.height)));

// The way the camera comes from: towards the sun a little, above the plane a little, mostly from the side `sign` says.
function wayOf(out: Vec, { toSun, n, side }: Frame, sign: number): Vec {
  out.x = toSun.x * 0.28 + n.x * 0.24 + side.x * 0.93 * sign;
  out.y = toSun.y * 0.28 + n.y * 0.24 + side.y * 0.93 * sign;
  out.z = toSun.z * 0.28 + n.z * 0.24 + side.z * 0.93 * sign;
  return normalise(out);
}

/** `planet`, met where its orbit has it, filling `circle()`; false while no circle is told. */
export function planetGoal(
  planet: Planet,
  {
    circle,
    seconds,
    others,
    ...said
  }: { circle: () => Circle | undefined; seconds: () => number; others?: readonly Planet[] } & Pick<
    Goal,
    "near" | "landed"
  >,
): Goal {
  const [at, toSun, side, way] = [spot0(), spot0(), spot0(), spot0()];
  const n = planet.system.normal;
  const frame = { toSun, n, side };
  let sign = 0;
  return {
    ...said,
    pose: (out) => {
      const told = circle();
      if (told === undefined) return false;
      lightOf(planet, seconds(), { at, toSun, side });
      if (told.close === true) {
        out.distance = fitDistance(planet.radius, told);
        const wayAt = (by: number): Vec => quarterOf(way, frame, by);
        // The first screen frames the view that shows most of the system's other worlds, once; the Earth being still, so is the light.
        const eye = { earth: at, toSun, circle: told, distance: out.distance, wayAt };
        if (others !== undefined) compose(others, eye, seconds());
        const view = others === undefined ? NO_TURN : (latch.view ?? NO_TURN);
        set(out, at, wayAt(view.turn));
        rollOf(out.up, { way, toSun }, view.roll);
      } else {
        if (sign === 0) sign = sunOnTheRight(wayOf(way, frame, 1), toSun) ? 1 : -1;
        set(out, at, wayOf(way, frame, sign));
      }
      out.distance = fitDistance(planet.radius, told);
      return true;
    },
  };
}

/** The home's goal (D459): the Earth close while its page frames it so, else `seen`, its system, as from above; read each frame, as the
 * page's circle comes. */
export function homeGoal(
  earth: Planet,
  seen: Goal,
  space: Pick<Space, "plan" | "circle" | "seconds" | "universe">,
): Goal {
  if (space.plan) return seen;
  const others = space.universe === undefined ? [] : featuredPool(space.universe);
  const framed = planetGoal(earth, { circle: () => space.circle, seconds: () => space.seconds, others });
  return { ...seen, pose: (out) => (space.circle?.close === true ? framed.pose(out) : seen.pose(out)) };
}

const NO_TURN: View = { turn: 0, roll: 0 };
const spot0 = (): Vec => ({ x: 0, y: 0, z: 0 });

// Whether, seen from `way`, the sun (`toSun`) stands on the screen's right: the camera's right is the way crossed with the up, negated.
function sunOnTheRight(way: Vec, toSun: Vec): boolean {
  const right = unit({
    x: -way.y * UP.z + way.z * UP.y,
    y: -way.z * UP.x + way.x * UP.z,
    z: -way.x * UP.y + way.y * UP.x,
  });
  return right.x * toSun.x + right.y * toSun.y + right.z * toSun.z > 0;
}
