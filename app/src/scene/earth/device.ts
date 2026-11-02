// What the Earth is given of the scene.
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
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
}
