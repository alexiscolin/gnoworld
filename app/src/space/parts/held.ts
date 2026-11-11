// What a near planet keeps while it is made, uploaded, compiled, warmed and shown (near.ts).
import type { PerspectiveCamera, Scene, Texture, WebGLRenderer } from "three";
import type { Planet as Drawn } from "../planet/planet.ts";
import type { PlateMask } from "../planet/plateMask.ts";
import { mapsOf } from "./mapsOf.ts";
import type { Warming } from "./warmup.ts";

export interface Held extends Warming {
  readonly drawn: Drawn;
  /** Its maps not yet on the GPU. */
  readonly uploads: Texture[];
  shown: boolean;
  /** Just shown: its first frame stands at 0, whatever the frame before cost. */
  fresh: boolean;
  /** The full-size maps still to go to the GPU, and whether they were swapped in (the Earth's). */
  pending?: Texture[];
  upgraded: boolean;
  /** How far it has come in from its skeleton, 0 to 1. */
  arrive: number;
}

/** `drawn` made into a near planet's keep: its plate set, its maps listed, its group on the stage and its programs compiling. */
export function holdOf(
  drawn: Drawn,
  {
    stage,
    renderer,
    camera,
    plate,
  }: { stage: Scene; renderer: WebGLRenderer; camera: PerspectiveCamera; plate: PlateMask },
): Held {
  drawn.setPlate(plate);
  const held: Held = {
    drawn,
    uploads: mapsOf(drawn.group),
    built: false,
    warmed: false,
    compiled: false,
    shown: false,
    fresh: false,
    upgraded: false,
    arrive: 0,
  };
  drawn.group.visible = false;
  stage.add(drawn.group);
  renderer.compileAsync(drawn.group, camera, stage).then(
    () => {
      held.built = true;
    },
    () => undefined,
  );
  return held;
}
