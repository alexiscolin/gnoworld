// The one place the renderer is made (ADR-0002 §9: the low-power adapter, no stencil).
import { WebGLRenderer } from "three";

/** A renderer on `canvas`. Throws where WebGL2 is refused. */
export function createRenderer(canvas: HTMLCanvasElement, antialias: boolean): WebGLRenderer {
  return new WebGLRenderer({ canvas, antialias, alpha: false, stencil: false, powerPreference: "low-power" });
}
