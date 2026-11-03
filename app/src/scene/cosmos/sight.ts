// What a flight reads of the cosmos (7g), handed to the scene's eye once the view at rest's chunk has come, with or without a file: the
// flights' chunk takes the cosmos's own ways between the map and the stage rather than import them, which would split them out of the
// cosmos's chunk into one both share; made here, the cosmos's chunk pays only for the call.
import { onPlane, toMap, toScene, type Point, type StarSystem } from "@gnoworld/core";
import type { EarthDevice } from "../earth/device.ts";
import type { CosmosSight } from "../flight/goal.ts";

/** The cosmos as a flight reads it: `systems`, what it holds; `eye`, the eye it places, and `earth`, on the stage. */
const sightOf = (systems: readonly StarSystem[], { eye, earth }: { eye: Point; earth: Point }): CosmosSight => ({
  systems: () => systems,
  eye,
  earth,
  toScene,
  toMap,
  onPlane,
});

/** Hands `device`'s eye the cosmos as a flight reads it: `systems`, and the eye and the Earth `rest` places on the stage. */
export function handSight(
  device: Pick<EarthDevice, "eye">,
  systems: readonly StarSystem[],
  rest: { eye: Point; earth: Point },
): void {
  if (device.eye !== undefined) device.eye.sight = sightOf(systems, rest);
}
