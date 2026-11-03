// What a flight reads of the cosmos (7g), handed to the scene's eye once the view at rest's chunk has come, with or without a file: the
// flights' chunk takes the cosmos's own ways between the map and the stage rather than import them, which would split them out of the
// cosmos's chunk into one both share; made here, the cosmos's chunk pays only for the call.
import { MIDDLE, onPlane, toMap, toScene, type Point, type StarSystem } from "@gnoworld/core";
import type { EarthDevice } from "../earth/device.ts";
import type { CosmosSight } from "../flight/goal.ts";

/** The cosmos as a flight reads it: `systems`, what it holds; `eye`, the eye it places, and what the view at rest `looked` at, on the
 * stage: the Earth, or a system's arrival's look. */
const sightOf = (systems: readonly StarSystem[], { eye, looked }: { eye: Point; looked: Point }): CosmosSight => ({
  systems: () => systems,
  eye,
  earth: looked,
  lit: MIDDLE,
  toScene,
  toMap,
  onPlane,
});

/** Hands `device`'s eye the cosmos as a flight reads it: `systems`, and the eye `rest` places and what it looks at, on the stage. */
export function handSight(
  device: Pick<EarthDevice, "eye">,
  systems: readonly StarSystem[],
  rest: { eye: Point; looked: Point },
): void {
  if (device.eye !== undefined) device.eye.sight = sightOf(systems, rest);
}
