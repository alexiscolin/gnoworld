// A system's Plan and the Earth's top view (part 7v; 7x2), in a chunk of their own the view at rest's eye asks the first time one is: core's
// Plan as the view at rest's parts read a view, one postcard, still, and what the labels' chunk draws of it, its worlds' names; the Earth's
// from above, its stations, their orbits and their names drawn by the Earth's view's chunk (station/earthView.ts), no postcard here.
import { EARTH_PLACE, earthTopEye, labelName, LEAN, planOf, plannedOf, type StarSystem } from "@gnoworld/core";
import type { Landing } from "./restArrival.ts";

/** The Plan of the system of `systems` named `id`, or the Earth's top view with none; none for a name the file does not hold. */
export function planAt(systems: readonly StarSystem[], id: string | undefined): Landing | undefined {
  // The Earth's top view keeps the great star its light, as the view at rest does: the first of the systems is its main one.
  if (id === undefined)
    return {
      index: 0,
      view: { eye: earthTopEye(), postcards: [] },
      look: EARTH_PLACE,
      postcards: new Map(),
      lean: LEAN,
    };
  const index = systems.findIndex((system) => system.id === id);
  const system = systems[index];
  if (system === undefined) return undefined;
  const { eye, look, postcard, lens, up, lean } = planOf(system);
  const names = new Map(postcard.worlds.map(({ id: world }) => [world, labelName(world) ?? world]));
  return {
    index,
    view: { eye, postcards: [index] },
    look,
    postcards: new Map([[index, postcard]]),
    plan: plannedOf(postcard, { names, links: new Map() }),
    lens,
    up,
    lean,
  };
}
