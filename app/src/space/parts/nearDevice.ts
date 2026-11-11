// What a Near needs of the device it draws on (near.ts).
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { PlateMask } from "../planet/plateMask.ts";
import type { Maps } from "./maps.ts";
import type { Planets } from "./planets.ts";

export interface NearDevice {
  readonly stage: Scene;
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly maps: Maps;
  readonly planets: Planets;
  /** The page's plate, which a world's glare keeps off (D490). */
  readonly plate: PlateMask;
  /** How far a lens dims what it does not light, 0 to 1, eased by the frame (D425). */
  readonly lens: { readonly value: number };
}
