// The programs every planet and moon draws with, made once right after the first screen (D13772): a generated world with air, glow and
// rings and the Earth, opaque and coming in, and both kinds of moon (moonLook.ts gives theirs a head of its own), on screen and in the
// blur (rig/blurred.ts), as three keys a program by these. Where the browser compiles none aside (Firefox), the frame it lands on compiles
// none then: with software GL its longest frame went 2134 to 1784 ms. It still makes no planet in a flight (view.ts): made there, they
// doubled the dive. Their materials are never disposed, so three keeps the programs; nothing else holds them.
import { Group, Texture, type Camera, type Scene, type WebGLRenderer } from "three";
import { earthPlanet } from "../earth/earth.ts";
import { createWorld, worldOf } from "../planet/generated.ts";
import { inBlurPixel } from "../rig/blurred.ts";
import { SPHERE } from "./adopt.ts";
import { moonOf } from "./moonLook.ts";
import { EARTH_ROOM } from "./moonSlot.ts";

type Compiler = Pick<WebGLRenderer, "compile" | "getContext" | "getRenderTarget" | "setRenderTarget">;

// A world with air and rings: every part a generated planet may have (programs.test.ts counts their programs).
const FULL = "c";

const made = new WeakSet<object>();
const asked = new WeakSet<object>();

/** Makes the programs on `renderer`, once, in this task. */
export function warmPrograms({ renderer, camera, stage }: { renderer: Compiler; camera: Camera; stage: Scene }): void {
  if (made.has(renderer)) return;
  made.add(renderer);
  const blank = new Texture();
  const set = { map: () => blank, clouds: blank, ring: blank };
  const maps = { earth: () => ({ day: blank, night: blank, clouds: blank, moon: blank }), setOf: () => set };
  const planets = [createWorld(worldOf(FULL), set, SPHERE), earthPlanet(maps.earth(), SPHERE)];
  const moons = [EARTH_ROOM, FULL].flatMap((room) => moonOf(room, { maps, sphere: SPHERE }) ?? []);
  const group = new Group().add(...[...planets, ...moons].map(({ group: each }) => each));
  for (const share of [1, 0.5]) {
    for (const planet of planets) planet.setArrive(share);
    inBlurPixel(renderer, () => {
      renderer.compile(group, camera, stage);
    });
    renderer.compile(group, camera, stage);
  }
}

/** Called each frame once the first has drawn: at the first where nothing flies (the home's dive waits for its loader), the programs in the
 * next task, never inside a frame; none in the chat's small view, which shows one world and is made anew for the next. */
export function programsAtRest(space: {
  readonly disposed: boolean;
  readonly options: { readonly inChat?: boolean | undefined };
  readonly rig: { readonly flying: boolean };
  readonly renderer: Compiler;
  readonly camera: Camera;
  readonly stage: { readonly scene: Scene };
}): void {
  if (asked.has(space) || space.rig.flying || space.options.inChat === true) return;
  asked.add(space);
  setTimeout(() => {
    if (!space.disposed) warmPrograms({ renderer: space.renderer, camera: space.camera, stage: space.stage.scene });
  }, 0);
}
