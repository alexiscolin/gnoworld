// The flights' chunk (7g), with camera-controls: the scene's door asks for it as the scene starts, and gets the flights made on its device.
import { Dissolve } from "../dissolve.ts";
import { MOTION } from "../watch.ts";
import { Flights } from "./flight.ts";
import type { CosmosSight, FlightScene } from "./goal.ts";

export { Flights };
export type { CosmosSight, FlightDevice, FlightGoal, FlightSaid, FlightScene } from "./goal.ts";

/** The flights on the scene's device, the cosmos as the scene holds it: reduced motion, the panel's ear and a frame owed wired here, in
 * this chunk, so the scene's carries only their door; the approach the views read, which only a flight changes; and the dissolve, which
 * this chunk holds, lent to the dive. */
export function flightsOn(scene: FlightScene, cosmos: { readonly sight: CosmosSight | undefined }): Flights {
  const motion = matchMedia(MOTION);
  const arrival = { approach: 1, aside: 0 };
  scene.arrival = arrival;
  scene.veil = (stage) => new Dissolve(stage);
  const { renderer, stage, camera, eye, said, moved } = scene;
  return new Flights({
    renderer,
    stage,
    camera,
    eye,
    arrival,
    said: said ?? (() => undefined),
    moved,
    still: () => motion.matches,
    cosmos: () => cosmos.sight,
  });
}
