// A system's arrival on the stage (slice 7d3), its dynamic view (7v), in a chunk of its own the view at rest's eye asks the first time a system
// is: core's arrival as the view at rest's parts read a view, so its postcard stands, its points glint whole and its star keeps its halo as a
// postcard does.
import {
  arrivalOf,
  type Arrival,
  type Planned,
  type Point,
  type Postcard,
  type RestView,
  type StarSystem,
} from "@gnoworld/core";

/** A system asked for, in its Plan or not (7v), and who moves the scene's eye to it, and through which lens: the home's where none. */
export interface Asking {
  readonly id: string | undefined;
  readonly go: (eye: Point, lens?: number) => void;
  readonly plan: boolean;
}

/** A system come to: its index, its arrival as a view of one postcard, what it looks at, the postcard by index; and its Plan where it is one
 * (7v), which the labels' chunk draws, seen through its own lens with its plane's up, core's (7v's design review, F4470). */
export interface Landing {
  readonly index: number;
  readonly view: RestView;
  readonly look: Point;
  readonly postcards: ReadonlyMap<number, Postcard>;
  readonly plan?: Planned;
  readonly lens?: number | undefined;
  readonly up?: Point | undefined;
  readonly lean?: number | undefined;
  readonly room?: Arrival["room"];
}

/** The arrival at the system of `systems` named `id`; none for a name the file does not hold. */
export function landingAt(systems: readonly StarSystem[], id: string): Landing | undefined {
  const index = systems.findIndex((system) => system.id === id);
  const system = systems[index];
  if (system === undefined) return undefined;
  const { eye, look, postcard, room } = arrivalOf(system, systems);
  return {
    index,
    view: { eye, postcards: [index], close: undefined },
    look,
    postcards: new Map([[index, postcard]]),
    room,
  };
}
