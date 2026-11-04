// The chosen clump's line of light (web.ts; 7u): a thin horizontal band across the view through its most used world, with a glow where
// they cross, in the palette's tone; where it stands is written at a look, how much it shows at each frame.
import { Mesh, PlaneGeometry, type Color } from "three";
import { lineLook } from "./webLook.ts";

const HALF_PX = 48;
const LIGHT = 1.4;

export class WebLine {
  readonly #uniforms = {
    uAt: { value: { x: 0, y: 0 } },
    uHalf: { value: 0 },
    uLight: { value: 0 },
    uPixels: { value: { x: 1, y: 1 } },
  };
  readonly mesh: Mesh<PlaneGeometry, ReturnType<typeof lineLook>>;

  /** In `tone`, the palette's, which it shares. */
  constructor(tone: { value: Color }) {
    this.mesh = new Mesh(new PlaneGeometry(2, 2), lineLook({ ...this.#uniforms, uTone: tone }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Through the view's point `x`, `y` (-1 to 1), on a screen `width` by `height` pixels. */
  stand(x: number, y: number, { width, height }: { readonly width: number; readonly height: number }): void {
    Object.assign(this.#uniforms.uAt.value, { x, y });
    this.#uniforms.uHalf.value = (2 * HALF_PX) / height;
    Object.assign(this.#uniforms.uPixels.value, { x: width / 2, y: HALF_PX });
  }

  /** How much of it shows: the whole cosmos's share, none with no chosen clump. */
  light(share: number): void {
    this.#uniforms.uLight.value = LIGHT * share;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
