// The Earth's view and its scenery (part 7x; Alexis, 2026-11-04, "comme ça pas besoin de se faire chier avec la place des mondes, c'est
// statique et on a la profondeur"): the eye at rest, fixed, and the real Solar System's planets round the Earth, still, with no label and no
// click, drawn as their maps came. Set by hand where the video's screen shows them and how deep, never in the Sun's order, a row or equal
// gaps: Mars close to the eye and cut by the frame's foot, Venus in the middle distance, Jupiter, Saturn and its ring far, Neptune a speck.
import { EARTH_PLACE, EARTH_RADIUS } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { cameraTowards, DEGREE, eyeAt, focalOf, REST_SCREENS, type Camera } from "../frame/restLook.ts";

export interface Scenery {
  /** Its map, under public/textures. */
  readonly map: string;
  readonly place: Point;
  /** In world units: its real size in Earth radii. */
  readonly radius: number;
  /** How far its pole leans, in radians. */
  readonly tilt: number;
  /** Its ring's inner and outer reach, in its radii, where it has one. */
  readonly ring?: { readonly inner: number; readonly outer: number };
}

/** The Earth's view at rest: the eye 26 units from the Earth, 15 degrees over the disc, the great star at the Earth's right. */
export const earthEye = (): Point => eyeAt(26, 15 * DEGREE, 0);
export const earthCamera = (): Camera => cameraTowards(earthEye(), EARTH_PLACE);
/** The Earth's top view (Alexis, 2026-11-04): the eye 30 units from the Earth, 1.25 radians over the disc, on the view at rest's side, the
 * Earth, its Moon, the stations and their orbits in the frame, the scenery out of it. */
export const earthTopEye = (): Point => eyeAt(30, 1.25, 0);

/** How far `point`, on the map, stands from the way between the Earth's two eyes, at rest and from above, which the eye glides along. */
export function offEarthViews({ x, y, z }: Point): number {
  const [from, to] = [earthEye(), earthTopEye()];
  const way = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const along =
    ((x - from.x) * way.x + (y - from.y) * way.y + (z - from.z) * way.z) / (way.x ** 2 + way.y ** 2 + way.z ** 2);
  const share = Math.min(1, Math.max(0, along));
  return Math.hypot(x - from.x - way.x * share, y - from.y - way.y * share, z - from.z - way.z * share);
}

// Where a point stands on the map that the video's screen shows `across` and `down` pixels from its middle, `depth` units ahead.
function placeAt(camera: Camera, [across, down]: readonly [number, number], depth: number): Point {
  const [video] = REST_SCREENS;
  const per = depth / focalOf(video.height);
  const { eye, ahead, right, up } = camera;
  return {
    x: eye.x + ahead.x * depth + right.x * across * per - up.x * down * per,
    y: eye.y + ahead.y * depth + right.y * across * per - up.y * down * per,
    z: eye.z + ahead.z * depth + right.z * across * per - up.z * down * per,
  };
}

// Each planet: its map, where the video's screen shows it, its radius there in pixels, its real radius in Earth radii, its lean.
const SET = [
  { map: "far-mars", spot: [330, 470], pixels: 280, earths: 0.53, tilt: 0.44 },
  { map: "far-venus", spot: [-430, -240], pixels: 30, earths: 0.95, tilt: 0.05 },
  { map: "far-jupiter", spot: [-640, -300], pixels: 74, earths: 11.2, tilt: 0.05 },
  { map: "saturn", spot: [610, -90], pixels: 33, earths: 9.45, tilt: 0.47, ring: { inner: 1.24, outer: 2.27 } },
  { map: "far-neptune", spot: [-170, -395], pixels: 6, earths: 3.88, tilt: 0.49 },
] as const;

/** The scenery's planets, nearest the eye first. */
export function sceneryOf(): Scenery[] {
  const camera = earthCamera();
  const focal = focalOf(REST_SCREENS[0].height);
  return SET.map(({ map, spot, pixels, earths, tilt, ...rest }) => {
    const radius = earths * EARTH_RADIUS;
    return { map, place: placeAt(camera, spot, (radius * focal) / pixels), radius, tilt, ...rest };
  });
}
