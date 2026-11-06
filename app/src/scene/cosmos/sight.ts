// What a flight reads of the cosmos (7g), handed to the scene's eye once the view at rest's chunk has come, with or without a file: the
// flights' chunk takes the cosmos's own ways between the map and the stage rather than import them, which would split them out of the
// cosmos's chunk into one both share; made here, the cosmos's chunk pays only for the call. A star's arrival is bound here (7g2): with no
// world in the file there is no view at rest to hand the eye to, so a flight lands on the arrival's eye and stays there.
import { EARTH_PLACE, MIDDLE, toMap, toScene, type Point, type StarSystem } from "@gnoworld/core";
import type { EarthDevice } from "../earth/device.ts";
import type { CosmosSight } from "../flight/goal.ts";
import { Hand } from "./restHand.ts";

/** The cosmos as a flight reads it: `systems`, what it holds; `eye`, the eye it places on the stage; the Earth there; and its arrivals, till
 * a file's view at rest takes them over. */
function sightOf(device: Pick<EarthDevice, "eye">, systems: readonly StarSystem[], eye: Point): CosmosSight {
  const earth = { x: NaN, y: NaN, z: NaN };
  toScene(EARTH_PLACE, earth);
  const hand = new Hand(device);
  const arrival = {
    bind: (id: string | undefined) => hand.bind(systems, id),
    handOver: () => undefined,
    leave: () => undefined,
    at: false,
    looked: earth,
  };
  return { systems: () => systems, eye, earth, lit: MIDDLE, toScene, toMap, arrival };
}

/** Hands `device`'s eye the cosmos as a flight reads it: `systems`, and the eye `rest` places on the stage. */
export function handSight(
  device: Pick<EarthDevice, "eye">,
  systems: readonly StarSystem[],
  rest: { eye: Point },
): void {
  if (device.eye !== undefined) device.eye.sight = sightOf(device, systems, rest.eye);
}
