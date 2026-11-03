// A system's Plan and the Earth's (part 7v), in a chunk of their own the view at rest's eye asks the first time the Plan is: core's Plans as
// the view at rest's parts read a view, one postcard, still; and what the labels' chunk draws of it, its worlds' names and, for the Earth's,
// where each hand-made project's name goes.
import {
  earthLinksOf,
  earthPlanOf,
  earthSystemOf,
  labelName,
  planOf,
  plannedOf,
  type Arrival,
  type StarSystem,
} from "@gnoworld/core";
import projects from "../../../data/earthOrbit.json" with { type: "json" };
import type { Landing } from "./restArrival.ts";

// A Plan as a landing, its worlds named and linked as given, their places and orbits laid for the labels' chunk to draw as they are: the
// Earth's stands by no system of the file, its index none of theirs.
const landingOf = (
  { eye, look, postcard, lens, up }: Arrival,
  index: number,
  { names, links }: { names: ReadonlyMap<string, string>; links: ReadonlyMap<string, string> },
): Landing => ({
  index,
  view: { eye, postcards: [index], close: undefined },
  look,
  postcards: new Map([[index, postcard]]),
  plan: plannedOf(postcard, { names, links }),
  lens,
  up,
});

/** The Plan of the system of `systems` named `id`, or the Earth's with none; none for a name the file does not hold. */
export function planAt(systems: readonly StarSystem[], id: string | undefined): Landing | undefined {
  if (id === undefined) {
    // A project's name as the file writes it, which may hold a slash a world's id would split.
    const names = new Map(
      earthSystemOf(projects).worlds.map(({ id: world }, at) => [world, projects[at]?.name ?? world]),
    );
    return landingOf(earthPlanOf(projects), -1, { names, links: earthLinksOf(projects) });
  }
  const index = systems.findIndex((system) => system.id === id);
  const system = systems[index];
  if (system === undefined) return undefined;
  const plan = planOf(system);
  const names = new Map(plan.postcard.worlds.map(({ id: world }) => [world, labelName(world) ?? world]));
  return landingOf(plan, index, { names, links: new Map() });
}
