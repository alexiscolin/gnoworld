// The view at rest in depth across its frame (7p), in a chunk of its own the view at rest's asks once a file's view came: the real worlds of
// other nearby systems it draws as bodies, and the home's rocks, decor laid in front of everything, on the stage for the chunk that draws
// them, which imports nothing of core's. It reads the view with the functions the view at rest's chunk lends, so nothing is split out of it.
import {
  CENTRE,
  deepOf,
  judgeOf,
  rocksOf,
  toScene,
  type Lent,
  type RestView,
  type Rock,
  type StarSystem,
} from "@gnoworld/core";

/** `view`'s depth over `systems`, read with the view at rest's `lent` functions: its bodies, by their system's index and their own, and its
 * rocks on the stage, each lit by the great star. */
export function inDepth(systems: readonly StarSystem[], view: RestView, lent: Lent) {
  const judge = judgeOf(systems, view, lent);
  const bodies = deepOf(systems, view, judge);
  const rocks = rocksOf(view, judge).map(({ place, ...rock }): Rock => {
    const at = { x: 0, y: 0, z: 0 };
    toScene(place, at);
    const [x, y, z] = [CENTRE.x - at.x, CENTRE.y - at.y, CENTRE.z - at.z];
    const length = Math.hypot(x, y, z);
    return { ...rock, place: at, toStar: { x: x / length, y: y / length, z: z / length } };
  });
  return { bodies, rocks };
}
