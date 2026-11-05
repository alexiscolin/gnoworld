// A system's dynamic view's rocks (7v), in a chunk of their own the view at rest's asks once an arrival came: decor laid in front of
// everything, on the stage for the chunk that draws them. It reads the view with the functions the view at rest's chunk lends, so nothing
// is split out. The home's Earth view has none (Alexis, 2026-11-04, "Le retirer").
import { rocksAt, toScene, type Arrival, type Lent, type Rock } from "@gnoworld/core";

/** A system's dynamic view's rocks, on the stage, each lit by the system's own star. */
export function rocksOfView(arrival: Arrival, lent: Lent): Rock[] {
  const star = { x: 0, y: 0, z: 0 };
  toScene(arrival.look, star);
  return rocksAt(arrival, lent).map(({ place, ...rock }) => {
    const at = { x: 0, y: 0, z: 0 };
    toScene(place, at);
    const [x, y, z] = [star.x - at.x, star.y - at.y, star.z - at.z];
    const length = Math.hypot(x, y, z);
    return { ...rock, place: at, toStar: { x: x / length, y: y / length, z: z / length } };
  });
}
