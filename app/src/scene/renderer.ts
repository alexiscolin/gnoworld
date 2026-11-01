// The one place the renderer is made (ADR-0002 §9: the low-power adapter, no stencil).
import { WebGLRenderer } from "three";

// The frames' deep black, read from f0004, f0005 and f0017's far corners.
const DEEP_BLACK = 0x010101;

/** A renderer on `canvas`, cleared to the frames' black. Throws where WebGL2 is refused. */
export function createRenderer(canvas: HTMLCanvasElement, antialias: boolean): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias, alpha: false, stencil: false, powerPreference: "low-power" });
  renderer.setClearColor(DEEP_BLACK, 1);
  return renderer;
}
