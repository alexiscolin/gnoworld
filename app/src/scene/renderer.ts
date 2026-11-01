// The one place the renderer is made (ADR-0002 §9: the low-power adapter, no stencil), and with it the image's one grade (ADR-0002 §10):
// a filmic curve holds the frames' deep black and rolls warm light off to white, before anything compiles, and for everything drawn.
import { ACESFilmicToneMapping, WebGLRenderer } from "three";

const EXPOSURE = 0.8;

/** A renderer on `canvas`. Throws where WebGL2 is refused. */
export function createRenderer(canvas: HTMLCanvasElement, antialias: boolean): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias, alpha: false, stencil: false, powerPreference: "low-power" });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  return renderer;
}
