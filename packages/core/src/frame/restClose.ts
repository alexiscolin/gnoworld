// The world that passes close to the eye at rest (slice 7d6): the eyes that would stand a nearby world at a side of the screen, and the
// rules it keeps there, at rest and at the corners of the eye's sway.
import { EARTH_PLACE, EARTH_RADIUS, type Orbiter } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { SWAY_CORNERS } from "../space/drift.ts";
import {
  away,
  cameraOf,
  DEGREE,
  DISTANCES,
  dot,
  focalOf,
  looksFrom,
  minus,
  placeOf,
  REST_SCREENS,
  swayed,
  within,
  type Camera,
  type Candidate,
  type Close,
  type Held,
  type Look,
} from "./restLook.ts";

// Pixels of room round it: what the sway leaves for it to stay clear.
const CLOSE_MARGIN = 24;
// It shows this share of itself at rest and at the sway's corners, and stands this share of the height across at most.
const SHOWN_AT_REST = 0.3;
const SHOWN_SWAYED = 0.25;
const CLOSE_MOST = 0.5;
// The eyes that stand a world at a side: so many degrees off the view's axis, round a circle in this many steps.
const SIDE_ANGLES = [28, 30, 32, 34, 36, 38, 40, 42, 44];
const AROUND = 120;

// The rest of a close world's system shows nothing.
const restOff = (look: Look, { system, bodies }: Held, world: Orbiter) =>
  look.off(look.seen(system.place)) &&
  bodies.every((other) => other === world || look.off(look.seen(placeOf(system, other, 0), other.radius)));

// A close world, as one camera sees it: twice the Earth's size or more and not past a share of the height, cut by a side, covering nothing.
// It holds its place at rest (the scene stops its turn): so near the eye, its orbit would sweep it across the view in a minute.
function closeHolds(look: Look, { held, world }: Close, atRest: boolean): boolean {
  const at = look.seen(placeOf(held.system, world, 0), world.radius);
  const sized = at.radius >= 2 * look.earth.radius && at.radius <= CLOSE_MOST * look.height;
  return (
    sized &&
    look.cutBySide(at, atRest ? SHOWN_AT_REST : SHOWN_SWAYED) &&
    restOff(look, held, world) &&
    look.clear(at, CLOSE_MARGIN)
  );
}

/** Whether a close world keeps its rules from `camera`, at rest and at each corner of the eye's sway. */
export const closeFits = (camera: Camera, close: Close): boolean =>
  looksFrom(camera).every((look) => closeHolds(look, close, true)) &&
  SWAY_CORNERS.every((sway) => looksFrom(swayed(camera, sway)).every((look) => closeHolds(look, close, false)));

/** Whether a ball `reach` round `place` stands clear of the close world from `camera`, at rest and at each corner of the sway: no postcard
 * world behind it. */
export function clearOfClose(camera: Camera, close: Close, { place, reach }: { place: Point; reach: number }): boolean {
  const cameras = [camera, ...SWAY_CORNERS.map((sway) => swayed(camera, sway))];
  const near = placeOf(close.held.system, close.world, 0);
  return cameras.every((one) =>
    looksFrom(one).every((look) => {
      const [ball, world] = [look.ball(place, reach), look.seen(near, close.world.radius)];
      return Math.hypot(ball.x - world.x, ball.y - world.y) >= ball.radius + world.radius;
    }),
  );
}

// The eyes `distance` from the Earth and `near` from `at`, round the circle they make, those whose slant and turn the view allows.
function eyesAround(at: Point, distance: number, near: number): Candidate[] {
  const toWorld = minus(at, EARTH_PLACE);
  const reach = Math.hypot(toWorld.x, toWorld.y, toWorld.z);
  const cosine = (distance ** 2 + reach ** 2 - near ** 2) / (2 * distance * reach);
  if (Math.abs(cosine) >= 1) return [];
  const axis = { x: toWorld.x / reach, y: toWorld.y / reach, z: toWorld.z / reach };
  const flat = Math.hypot(axis.x, axis.z);
  const beside = flat > 1e-6 ? { x: -axis.z / flat, y: 0, z: axis.x / flat } : { x: 1, y: 0, z: 0 };
  const other = {
    x: axis.y * beside.z - axis.z * beside.y,
    y: axis.z * beside.x - axis.x * beside.z,
    z: axis.x * beside.y - axis.y * beside.x,
  };
  const sine = Math.sqrt(1 - cosine ** 2);
  return Array.from({ length: AROUND }, (_, step) => {
    const [a, b] = [sine * Math.cos((step * 2 * Math.PI) / AROUND), sine * Math.sin((step * 2 * Math.PI) / AROUND)];
    const y = cosine * axis.y + a * beside.y + b * other.y;
    const [x, z] = [cosine * axis.x + a * beside.x + b * other.x, cosine * axis.z + a * beside.z + b * other.z];
    return { distance, slant: Math.asin(y), turn: Math.atan2(x, z) };
  }).filter(within);
}

// Whether `world`, at `at`, stands cut by a side of both screens, its share shown, from the eye `candidate` gives: the screens share a height.
function atSide(candidate: Candidate, at: Point, radius: number): boolean {
  const { eye, ahead, right } = cameraOf(candidate);
  const from = minus(at, eye);
  const depth = dot(from, ahead);
  const scale = focalOf(REST_SCREENS[0].height) / depth;
  const [across, size] = [dot(from, right) * scale, radius * scale];
  const cut = (width: number) => {
    const shown = Math.min(width / 2 + across + size, width) - Math.max(width / 2 + across - size, 0);
    return (
      Math.abs(across) + size > width / 2 && Math.abs(across) - size < width / 2 && shown >= SHOWN_AT_REST * 2 * size
    );
  };
  return depth > 2 * radius && REST_SCREENS.every(({ width }) => cut(width));
}

// The views that could stand `world` close to the eye: at each side's angle off the view's axis, near enough to be twice the Earth's size.
export function closeViews({ system }: Held, world: Orbiter): Candidate[] {
  const at = placeOf(system, world, 0);
  const reach = away(at, EARTH_PLACE);
  return DISTANCES.flatMap((distance) =>
    SIDE_ANGLES.flatMap((angle) => {
      const [cosine, sine] = [Math.cos(angle * DEGREE), Math.sin(angle * DEGREE)];
      const left = reach ** 2 - (distance * sine) ** 2;
      const near = distance * cosine - Math.sqrt(Math.max(left, 0));
      const big = (world.radius * distance) / (2 * EARTH_RADIUS * cosine);
      return left < 0 || near <= 2 * world.radius || near > big ? [] : eyesAround(at, distance, near);
    }),
  ).filter((candidate) => atSide(candidate, at, world.radius));
}
