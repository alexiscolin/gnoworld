// A system's arrival on the stage (slice 7d3), in the view at rest's chunk: core's arrival as the view at rest's parts read a view, so its
// postcard stands, its points glint whole and its star keeps its halo as a view at rest's postcard does.
import { arrivalOf, type Point, type Postcard, type RestView, type StarSystem } from "@gnoworld/core";

/** A system asked for, and who moves the scene's eye to it. */
export interface Asking {
  readonly id: string | undefined;
  readonly go: (eye: Point) => void;
}

/** A system come to: its index, its arrival as a view of one postcard, what it looks at, and the postcard by index. */
export interface Landing {
  readonly index: number;
  readonly view: RestView;
  readonly look: Point;
  readonly postcards: ReadonlyMap<number, Postcard>;
}

/** The arrival at the system of `systems` named `id`; none for a name the file does not hold. */
export function landingAt(systems: readonly StarSystem[], id: string): Landing | undefined {
  const index = systems.findIndex((system) => system.id === id);
  const system = systems[index];
  if (system === undefined) return undefined;
  const { eye, look, postcard } = arrivalOf(system, systems);
  return {
    index,
    view: { eye, postcards: [index], close: undefined },
    look,
    postcards: new Map([[index, postcard]]),
  };
}
