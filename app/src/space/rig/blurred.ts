// The blur's target (speed.ts), and the warm-up of what draws into it. Drawn into a render target, three gives each material a second
// program (no tone mapping, a linear output) and the GPU each a second pipeline (half floats): made by the first blurred frame of a
// flight, they held the page there.
import { HalfFloatType, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";

/** The blur's target, `width` by `height` device pixels: half floats, with the canvas's own MSAA, none where it has none (a ratio of 2,
 * scene.ts). There 4 samples made a blurred frame cost 4.6 times one with none (Chromium, the galaxy at 2880 by 1800: 130 ms, 28 ms). */
export function blurTarget(
  renderer: Pick<WebGLRenderer, "getContext">,
  width: number,
  height: number,
): WebGLRenderTarget {
  const samples = renderer.getContext().getContextAttributes()?.antialias === true ? 4 : 0;
  return new WebGLRenderTarget(width, height, { type: HalfFloatType, samples });
}

/** Runs `draw` with a pixel of the blur's kind of target set, where nothing shows; the target set before is set back, the pixel freed. */
export function inBlurPixel(
  renderer: Pick<WebGLRenderer, "getContext" | "getRenderTarget" | "setRenderTarget">,
  draw: () => void,
): void {
  const [was, target] = [renderer.getRenderTarget(), blurTarget(renderer, 1, 1)];
  renderer.setRenderTarget(target);
  try {
    draw();
  } finally {
    renderer.setRenderTarget(was);
    target.dispose();
  }
}

/** Draws `scene` through `camera` once into a pixel of the blur's kind of target: what it shows gets its programs and pipelines then, as
 * a near planet does before it shows (warmup.ts). */
export function warmBlurred(
  renderer: Pick<WebGLRenderer, "getContext" | "getRenderTarget" | "setRenderTarget" | "render">,
  scene: Scene,
  camera: Camera,
): void {
  inBlurPixel(renderer, () => {
    renderer.render(scene, camera);
  });
}
