// The disc on the stage and a world on its orbit: what the scene's frame asks of the map (ADR-0002 §10). Plain numbers into what the caller
// keeps, for a frame reaches them.
import type { Orbiter, StarSystem } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { HOME } from "../space/drift.ts";

/** How far the eye rests from the Earth, in world units (7d6). */
export const REST_DISTANCE = 30;
/** How far the disc leans from facing the eye's way, in radians: seen from 15 degrees above it, the rest's plain slant. */
export const DISC_TILT = 0.2617993877991494;
// The tilt's cosine and sine, as numbers: a call at a module's top stays in every chunk that imports core.
const COS = 0.9659258262890683;
const SIN = 0.25881904510252074;
/** Where the map's centre stands on the stage: the Earth (-6.73, 0, 0.18) straight ahead of the eye at rest, `REST_DISTANCE` away. */
export const CENTRE: Point = { x: HOME.x + 6.73, y: HOME.y + 0.18 * SIN, z: HOME.z - REST_DISTANCE - 0.18 * COS };

/** How far from a system's star, in its own plane: `along` its line of nodes, `across` it in the plane, `up` off it. */
export interface InPlane {
  along: number;
  across: number;
  up: number;
}

/** A place in `system`'s own plane, `offset` from its star, on the map, into `out`. */
export function onPlane(
  { place, tilt, node }: Pick<StarSystem, "place" | "tilt" | "node">,
  { along, across, up }: InPlane,
  out: { x: number; y: number; z: number },
): void {
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  out.x = place.x + along * cosNode - across * sinNode * cosTilt - up * sinNode * sinTilt;
  out.y = place.y - across * sinTilt + up * cosTilt;
  out.z = place.z + along * sinNode + across * cosNode * cosTilt + up * cosNode * sinTilt;
}

// What a frame writes the orbit's offset into: nothing is made on a frame.
const onOrbit: InPlane = { along: 0, across: 0, up: 0 };

/** Where a world stands `seconds` on, on the map, into `out`: on its circle in its system's plane. */
export function orbitPlace(
  { system, world }: { readonly system: StarSystem; readonly world: Orbiter },
  seconds: number,
  out: { x: number; y: number; z: number },
): void {
  const angle = world.phase + system.spin * seconds;
  onOrbit.along = world.orbit * Math.cos(angle);
  onOrbit.across = world.orbit * Math.sin(angle);
  onPlane(system, onOrbit, out);
}

/** A place on the map, on the stage, into `out`: the map's far side up the view, its near side towards the eye. */
export function toScene({ x, y, z }: Point, out: { x: number; y: number; z: number }): void {
  out.x = CENTRE.x + x;
  out.y = CENTRE.y + y * COS - z * SIN;
  out.z = CENTRE.z + y * SIN + z * COS;
}

/** A place on the stage, on the map, into `out`. */
export function toMap({ x, y, z }: Point, out: { x: number; y: number; z: number }): void {
  const dy = y - CENTRE.y;
  const dz = z - CENTRE.z;
  out.x = x - CENTRE.x;
  out.y = dy * COS + dz * SIN;
  out.z = dz * COS - dy * SIN;
}

/** Where the view's axis, straight ahead, meets the disc: what the eye looks at. An eye under the disc looks at the place under it. */
export function focusOf({ x, y, z }: Point, out: { x: number; y: number; z: number }): void {
  out.x = x;
  out.y = 0;
  out.z = y > 0 ? z - (y * COS) / SIN : z;
}

/** How far the eye stands from what it looks at, `focusOf`'s place, in world units: along the view's axis, or straight down under the disc. */
export function focusDistance({ y, z }: Point): number {
  const height = (y - CENTRE.y) * COS + (z - CENTRE.z) * SIN;
  return height > 0 ? height / SIN : -height;
}
