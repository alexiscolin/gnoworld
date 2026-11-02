// The disc on the stage and a world on its orbit: what the scene's frame asks of the map (ADR-0002 §10). Plain numbers into what the caller
// keeps, for a frame reaches them.
import type { Orbiter, StarSystem } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { HOME } from "../space/drift.ts";

/** How far the disc leans from facing the eye's way, in radians: seen from 60 degrees above it. */
export const DISC_TILT = 1.0471975511965976;
/** Where the map's centre stands on the stage: 36 units ahead of the eye at rest, the great sun where frame 4 has it. */
export const CENTRE: Point = { x: HOME.x - 0.06, y: HOME.y + 0.155, z: HOME.z - 36 };

// The tilt's cosine and sine, as numbers: a call at a module's top stays in every chunk that imports core.
const COS = 0.5;
const SIN = 0.8660254037844386;

/** Where a world stands `seconds` on, on the map, into `out`. */
export function orbitPlace(
  { system, world }: { readonly system: StarSystem; readonly world: Orbiter },
  seconds: number,
  out: { x: number; y: number; z: number },
): void {
  const { place, spin } = system;
  const angle = world.phase + spin * seconds;
  out.x = place.x + world.orbit * Math.cos(angle);
  out.y = place.y;
  out.z = place.z + world.orbit * Math.sin(angle);
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
