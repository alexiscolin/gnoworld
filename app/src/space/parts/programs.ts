// The programs every planet draws with, made once right after the first screen (D13772): a world of the generator's with air, glow and
// rings, and the Earth, each surface opaque and coming in (transparent), on screen and as the blur draws it (rig/blurred.ts): three keys a
// program by all of these. A planet made later finds its programs made: where the browser compiles none aside (Firefox has no
// KHR_parallel_shader_compile), the frame it lands on no longer compiles them (measured with software GL: its longest frame 2133 to 1767
// ms, the home's first dive). Such a browser still makes no planet during a flight (view.ts, waitsToMake): made there, they doubled the
// dive. What made them stays alive, out of the stage: three drops a program its last material leaves.
import { Group, Texture, type Camera, type Scene, type WebGLRenderer } from "three";
import { afterLoad } from "../../afterLoad.ts";
import { earthPlanet } from "../earth/earth.ts";
import { createWorld, worldOf } from "../planet/generated.ts";
import type { Planet } from "../planet/planet.ts";
import { inBlurPixel } from "../rig/blurred.ts";
import { SPHERE } from "./adopt.ts";

type Compiler = Pick<WebGLRenderer, "compile" | "compileAsync" | "getContext" | "getRenderTarget" | "setRenderTarget">;

// A world with air and rings: every part a generated planet may have (programs.test.ts counts their programs).
const FULL = "c";

const made = new WeakMap<object, Promise<void>>();
const kept: Planet[] = [];

/** Makes the planets' programs on `renderer`, once. */
export function warmPrograms({
  renderer,
  camera,
  stage,
}: {
  renderer: Compiler;
  camera: Camera;
  stage: Scene;
}): Promise<void> {
  const before = made.get(renderer);
  if (before !== undefined) return before;
  const blank = new Texture();
  const planets = [
    createWorld(worldOf(FULL), { map: () => blank, clouds: blank, ring: blank }, SPHERE),
    earthPlanet({ day: blank, night: blank, clouds: blank }, SPHERE),
  ];
  const group = new Group().add(...planets.map((planet) => planet.group));
  const compile = async () => {
    inBlurPixel(renderer, () => {
      renderer.compile(group, camera, stage);
    });
    await renderer.compileAsync(group, camera, stage);
  };
  const making = compile()
    .then(() => {
      for (const planet of planets) planet.setArrive(0.5);
      return compile();
    })
    .then(() => {
      kept.push(...planets);
    });
  made.set(renderer, making);
  return making;
}

/** Makes them in the task after the first frame where nothing flies (the home's dive waits for its loader), else at the next moment of
 * rest: never in a flight, where a browser that compiles none aside would hold its frames. */
export function programsAtRest(
  space: { readonly rig: { readonly flying: boolean }; renderer: Compiler; camera: Camera; stage: { scene: Scene } },
  signal: AbortSignal,
): void {
  const now = (): void => {
    if (signal.aborted) return;
    if (space.rig.flying) afterLoad(now, signal);
    else warmPrograms({ renderer: space.renderer, camera: space.camera, stage: space.stage.scene }).catch(reportError);
  };
  setTimeout(now, 0);
}
