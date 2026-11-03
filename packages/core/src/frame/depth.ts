// A postcard's plane at display (part 7p): its normal, and a plane from a normal, its upward side kept up.
import type { StarSystem } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";

/** The normal of `system`'s plane, as `onPlane` stands it. */
export const normalOf = ({ tilt, node }: Pick<StarSystem, "tilt" | "node">): Point => ({
  x: -Math.sin(node) * Math.sin(tilt),
  y: Math.cos(tilt),
  z: Math.cos(node) * Math.sin(tilt),
});

/** `system` with the plane whose normal is `normal`, its upward side kept up. */
export function withNormal(system: StarSystem, { x, y, z }: Point): StarSystem {
  const sign = y < 0 ? -1 : 1;
  return { ...system, tilt: Math.atan2(Math.hypot(x, z), Math.abs(y)), node: Math.atan2(-sign * x, sign * z) };
}
