/// <reference types="vite/client" />
// Whether this GPU may have space, read on a canvas of its own whose context goes back at once (ADR-0002 §8). The gate's browsers have a
// software GPU: a test build or the dev server lets `?test-gpu` pass it; a production build holds no trace of it, the build replacing both.
import { isWeakGpu } from "@gnoworld/core";

declare global {
  interface ImportMetaEnv {
    readonly VITE_GNOWORLD_TEST_GPU?: string;
  }
}

const RENDERER = "WEBGL_debug_renderer_info";

// The name the driver gives its GPU, or nothing where it is masked.
function gpuName(context: WebGL2RenderingContext): string {
  const debug = context.getExtension(RENDERER);
  const name: unknown = debug === null ? "" : context.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  return typeof name === "string" ? name : "";
}

/** Whether the device has WebGL2 and a GPU that is not known to be weak. */
export function gpuCanDraw(): boolean {
  if (
    (import.meta.env.MODE === "development" || import.meta.env.VITE_GNOWORLD_TEST_GPU === "1") &&
    new URLSearchParams(location.search).has("test-gpu")
  )
    return true;
  const context = document.createElement("canvas").getContext("webgl2");
  if (context === null) return false;
  const name = gpuName(context);
  context.getExtension("WEBGL_lose_context")?.loseContext();
  return !isWeakGpu(name);
}
