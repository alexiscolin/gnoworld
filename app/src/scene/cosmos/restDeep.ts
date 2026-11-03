// The view at rest in depth across its frame (7p), in a chunk of its own the view at rest's asks once a file's view came: the real worlds of
// other nearby systems it draws as bodies, and the home's rocks, decor laid in front of everything, on the stage for the chunk that draws
// them, which imports nothing of core's. It reads the view with the functions the view at rest's chunk lends, so nothing is split out of it.
import {
  CENTRE,
  deepOf,
  judgeOf,
  rocksAt,
  rocksOf,
  toScene,
  type Arrival,
  type Lent,
  type Point,
  type RestView,
  type Rock,
  type StarSystem,
} from "@gnoworld/core";

type Laid = ReturnType<typeof rocksOf>[number];

// Rocks laid on the map, on the stage, each lit from `star` on the stage.
const staged = (laid: readonly Laid[], star: Point): Rock[] =>
  laid.map(({ place, ...rock }) => {
    const at = { x: 0, y: 0, z: 0 };
    toScene(place, at);
    const [x, y, z] = [star.x - at.x, star.y - at.y, star.z - at.z];
    const length = Math.hypot(x, y, z);
    return { ...rock, place: at, toStar: { x: x / length, y: y / length, z: z / length } };
  });

/** `view`'s depth over `systems`, read with the view at rest's `lent` functions: its bodies, by their system's index and their own, and its
 * rocks on the stage, each lit by the great star. */
export function inDepth(systems: readonly StarSystem[], view: RestView, lent: Lent) {
  const judge = judgeOf(systems, view, lent);
  return { bodies: deepOf(systems, view, judge), rocks: staged(rocksOf(view, judge), CENTRE) };
}

/** A system's dynamic view's rocks (7v), on the stage, each lit by the system's own star. */
export function rocksOfView(arrival: Arrival, lent: Lent): Rock[] {
  const star = { x: 0, y: 0, z: 0 };
  toScene(arrival.look, star);
  return staged(rocksAt(arrival, lent), star);
}
