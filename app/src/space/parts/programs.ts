// The programs every planet and moon draws with, made once right after the first screen (D13772): a generated world with air, glow and
// rings and the Earth, opaque and coming in, and both kinds of moon (moonLook.ts gives theirs a head of its own), on screen and in the
// blur (rig/blurred.ts), as three keys a program by these. Where the browser compiles none aside (Firefox), the frame it lands on compiles
// none then: with software GL its longest frame went 2134 to 1784 ms. It still makes no planet in a flight (view.ts): made there, they
// doubled the dive. Their materials are never disposed, so three keeps the programs; nothing else holds them.
// three keys a program by the lights that show too, for a material that reads none: so each is made with no lamp and with gnosh's colony's.
import {
  DirectionalLight,
  Group,
  Light,
  Texture,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from "three";
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

interface Device {
  renderer: Compiler;
  camera: Camera;
  stage: Scene;
}

// Runs `make` as the blur draws, in one pixel of its kind of target, then as the screen does.
function both({ renderer }: Device, make: () => void): void {
  inBlurPixel(renderer, make);
  make();
}

// Runs `make` with no lamp showing on the stage, then with one that casts a shadow: the stage's own if one shows (the colony's, while it
// is drawn as itself), which is left as it was; else one of its own, never drawn, which holds nothing to free.
// ceiling: one lamp, as one colony shows; a second would give its own keys, and its own pass here.
function byLamp({ stage }: Device, make: () => void): void {
  const shown: Object3D[] = [];
  stage.traverseVisible((part) => {
    if (part instanceof Light) shown.push(part);
  });
  const lamp = new DirectionalLight();
  lamp.castShadow = true;
  try {
    for (const lit of [false, true]) {
      for (const one of shown) one.visible = lit;
      if (lit && shown.length === 0) stage.add(lamp);
      make();
    }
  } finally {
    for (const one of shown) one.visible = true;
    stage.remove(lamp);
  }
}

const lit = (part: Object3D): boolean => part.getObjectsByProperty("isLight", true).length > 0;

// Makes the programs of all the stage holds, a part still hidden too (the scan, the plate, the orbits), which its first frame would link
// in a flight; but a part that carries its own lamp (the colony), whose programs read the lamps and are made as it is held (held.ts).
function stagePrograms(device: Device): void {
  const { renderer, camera, stage } = device;
  byLamp(device, () => {
    both(device, () => {
      for (const part of stage.children) if (!lit(part)) renderer.compile(part, camera, stage);
    });
  });
}

/** A universe laid again takes the stage's programs before the last one's parts go (stage.ts): three frees a program with its last
 * material. None where none was made yet (before the first rest, the chat's small view): the last parts hold none to keep. */
export function keepPrograms(device: Device): void {
  if (made.has(device.renderer)) stagePrograms(device);
}

/** Makes the programs on `renderer`, once, in this task: the planets' and the moons', then the stage's; `sky`'s, drawn over the frame
 * and never through the blur, on screen alone. */
export function warmPrograms({ sky, ...device }: Device & { sky?: Scene | undefined }): void {
  const { renderer, camera, stage } = device;
  if (made.has(renderer)) return;
  made.add(renderer);
  const blank = new Texture();
  const set = { map: () => blank, clouds: blank, ring: blank };
  const maps = { earth: () => ({ day: blank, night: blank, clouds: blank, moon: blank }), setOf: () => set };
  const planets = [createWorld(worldOf(FULL), set, SPHERE), earthPlanet(maps.earth(), SPHERE)];
  const moons = [EARTH_ROOM, FULL].flatMap((room) => moonOf(room, { maps, sphere: SPHERE }) ?? []);
  const group = new Group().add(...[...planets, ...moons].map(({ group: one }) => one));
  byLamp(device, () => {
    for (const share of [1, 0.5]) {
      for (const planet of planets) planet.setArrive(share);
      both(device, () => {
        renderer.compile(group, camera, stage);
      });
    }
  });
  stagePrograms(device);
  if (sky !== undefined) renderer.compile(sky, camera);
}

/** Called each frame once the first has drawn: at the first where nothing flies (the home's dive waits for its loader), the programs in the
 * next task, never inside a frame; none in the chat's small view, which shows one world and is made anew for the next. */
export function programsAtRest(space: {
  readonly disposed: boolean;
  readonly options: { readonly inChat?: boolean | undefined };
  readonly rig: { readonly flying: boolean };
  readonly renderer: Compiler;
  readonly camera: Camera;
  readonly stage: { readonly scene: Scene; readonly sky?: { readonly scene: Scene } | undefined };
}): void {
  if (asked.has(space) || space.rig.flying || space.options.inChat === true) return;
  asked.add(space);
  setTimeout(() => {
    if (space.disposed) return;
    const { scene: stage, sky } = space.stage;
    warmPrograms({ renderer: space.renderer, camera: space.camera, stage, sky: sky?.scene });
  }, 0);
}
