// What a near planet keeps while it is made, uploaded, compiled, warmed and shown (near.ts).
import type { PerspectiveCamera, Scene, Texture, WebGLRenderer } from "three";
import type { Planet } from "../layout.ts";
import type { Planet as Drawn } from "../planet/planet.ts";
import type { PlateMask } from "../planet/plateMask.ts";
import { inBlurPixel } from "../rig/blurred.ts";
import { mapsOf } from "./mapsOf.ts";
import type { Warming } from "./warmup.ts";

export interface Held extends Warming {
  readonly drawn: Drawn;
  /** The planet it draws, in the universe now laid out: a Near adopting it hands it the new one (adopt.ts), so a planet that leaves is placed still. */
  planet: Planet;
  /** Its maps not yet on the GPU. */
  readonly uploads: Texture[];
  shown: boolean;
  /** Not shown, its fade out still running: it stays drawn, its air with it, until it is gone, over the quad that took its place. */
  leaving: boolean;
  /** Its quad stays drawn beneath while it comes in over it, hidden once it is whole. */
  over: boolean;
  /** Just shown: its first frame stands at 0, whatever the frame before cost. */
  fresh: boolean;
  /** The full-size maps still to go to the GPU, and whether they were swapped in (the Earth's). */
  pending?: Texture[];
  upgraded: boolean;
  /** How far they have come into focus over the half-size ones, 0 to 1, while they come (upgrade.ts). */
  focus?: number;
  /** How far it has come in over its stand-in, 0 to 1. */
  arrive: number;
}

/** `drawn` made into a near planet's keep: its plate set, its maps listed, its group on the stage and its programs compiling, the blur's too. */
export function holdOf(
  drawn: Drawn,
  planet: Planet,
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
    planet,
    uploads: mapsOf(drawn.group),
    built: false,
    warmed: false,
    compiled: false,
    shown: false,
    leaving: false,
    fresh: false,
    over: false,
    upgraded: false,
    arrive: 0,
  };
  // Its programs as the blur draws them too: hidden till it shows, the warm-up at rest (rig/speed.ts) never draws it. Compiled while it
  // shows and before it joins the stage: three keys its programs by the lamps that show, the colony's own counted once so.
  inBlurPixel(renderer, () => {
    renderer.compile(drawn.group, camera, stage);
  });
  renderer.compileAsync(drawn.group, camera, stage).then(
    () => {
      held.built = true;
    },
    () => undefined,
  );
  drawn.group.visible = false;
  stage.add(drawn.group);
  return held;
}

/** The hull of the world `id` among `held`, drawn as itself: a colony's; none for a planet. */
export function hullIn(held: ReadonlyMap<number, Held>, id: string): Held["drawn"]["hull"] {
  for (const each of held.values()) if (each.planet.id === id) return each.drawn.hull;
  return undefined;
}
