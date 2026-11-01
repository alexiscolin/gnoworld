// What the Earth is given of the scene.
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";

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
}
