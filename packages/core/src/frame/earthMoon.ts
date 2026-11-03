// The small Earth's Moon as the view at rest's judge reads it (7v's design review, F4471): on the ring the globe draws round the small Earth,
// in the camera's frame, for the small globe turns with the camera; where the Moon rests on it, frame 4's and the first screen's.
import type { Look, Seen } from "./restLook.ts";

/** The small Earth's ring as the globe draws it: its reach in Earth radii, its lean and roll in radians, its Moon's radius in Earth radii,
 * and the angle round the ring where the Moon rests. */
export interface MoonRing {
  readonly reach: number;
  readonly tilt: number;
  readonly roll: number;
  readonly moon: number;
  readonly rest: number;
}

/** Whether each of `spots` on `look` stands off the small Earth's Moon where it rests on `ring`, a third of the Moon's width away, as a
 * postcard's neighbours: the ring turned as three turns the globe's, lean then roll, flat round the Earth's spot, for the Earth is small.
 * Its whole path would leave Onyx's view no place; it passes by a project in its four-minute turn, as a near body covers a far one. */
export function offMoon({ earth }: Pick<Look, "earth">, spots: readonly Seen[], ring: MoonRing): boolean {
  const [x, z] = [ring.reach * Math.cos(ring.rest), ring.reach * Math.sin(ring.rest)];
  const across = Math.cos(ring.roll) * x + Math.sin(ring.roll) * Math.sin(ring.tilt) * z;
  const up = Math.sin(ring.roll) * x - Math.cos(ring.roll) * Math.sin(ring.tilt) * z;
  const moon = ring.moon * earth.radius;
  return spots.every(
    (spot) =>
      Math.hypot(spot.x - earth.x - across * earth.radius, spot.y - earth.y + up * earth.radius) - spot.radius - moon >=
      (2 * moon) / 3,
  );
}
