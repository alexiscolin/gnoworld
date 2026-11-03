// What the Earth is given of the scene.
import type { Point } from "@gnoworld/core";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { Dissolve } from "../dissolve.ts";
import type { CosmosSight } from "../flight/goal.ts";
import type { PlateGround } from "./ground.ts";

/** "loading", "drawn" and "failed" while a page shows the Earth; "gone" once it left. */
export type EarthState = "loading" | "drawn" | "failed" | "gone";

/** In the page's pixels, with the plate beside it, where the page fixes one. */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly plate?: PlateGround;
}

export interface EarthDevice {
  readonly renderer: {
    readonly capabilities: Pick<WebGLRenderer["capabilities"], "getMaxAnisotropy">;
    compileAsync: WebGLRenderer["compileAsync"];
    initTexture: WebGLRenderer["initTexture"];
  };
  readonly stage: Scene;
  readonly camera: PerspectiveCamera;
  /** Whether memory is short, asked at each load: the probe may have decided since. */
  readonly halved: () => boolean;
  /** Where the site is served from. */
  readonly base: string;
  /** A frame is owed. */
  readonly moved: () => void;
  /** The globe came on the stage. */
  readonly stood: () => void;
  /** How far a page's body stands as a flight brings it, a share of where it stands at rest: 1 once it landed (7g). */
  readonly arrival?: { readonly approach: number };
  /** The scene's eye as a flight leaves it: what it looks at, none as at rest; and the cosmos as a flight reads it, which the view at
   * rest's eye hands it (7g). */
  readonly eye?: { readonly look: Point | undefined; sight?: CosmosSight | undefined };
  /** A frame copied and laid over the stage, lent by the flights' chunk, which holds it (7g): the dive's under reduced motion. */
  veil?: (stage: Scene) => Dissolve;
}
