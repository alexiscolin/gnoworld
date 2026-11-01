/// <reference types="vite/client" />
// Whether this GPU may have the scene, read on a canvas of its own whose context goes back at once. The gate's browsers have a software
// GPU: a test build lets `?test-gpu` pass it and shows the journeys the scene; a production build holds neither (dataFiles.test.ts),
// for each is written on the variable itself, which the build replaces, so what it guards goes with it.
import { isWeakGpu } from "@gnoworld/core";
import type { Scene } from "../../scene/scene.ts";

declare global {
  interface ImportMetaEnv {
    readonly VITE_GNOWORLD_TEST_GPU?: string;
  }
}

const RENDERER = "WEBGL_debug_renderer_info";

function gpuName(context: WebGL2RenderingContext): string {
  const debug = context.getExtension(RENDERER);
  const name: unknown = debug === null ? "" : context.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  return typeof name === "string" ? name : "";
}

/** Whether the device has WebGL2 and a GPU that is not known to be weak. */
export function gpuCanDraw(): boolean {
  if (import.meta.env.VITE_GNOWORLD_TEST_GPU === "1" && new URLSearchParams(location.search).has("test-gpu"))
    return true;
  const context = document.createElement("canvas").getContext("webgl2");
  if (context === null) return false;
  const name = gpuName(context);
  context.getExtension("WEBGL_lose_context")?.loseContext();
  return !isWeakGpu(name);
}

/** Hands the journeys the running scene, in a test build. */
export function showJourneys(scene: Scene): void {
  if (import.meta.env.VITE_GNOWORLD_TEST_GPU === "1") Reflect.set(globalThis, "__gnoworldScene", scene);
}
