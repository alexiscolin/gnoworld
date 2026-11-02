// The realism page's four views. Each builds what it shows and frees it all, so the memory a view reports is what it takes. A view loads only
// its own maps: the gallery shows the whole set, the others two or three.
import { ANCHORS, planetLook, planetSeed, type PlanetLook } from "@gnoworld/core";
import {
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from "three";
import { sideLight } from "../src/scene/planet/light.ts";
import { loadMap, mapUrl } from "../src/scene/planet/maps.ts";
import { createPlanet, LIMB_LIGHT, type MapSet, type Planet } from "../src/scene/planet/planet.ts";
import { earthView } from "./earthView.ts";
import { layoutOf, type Layout } from "./layouts.ts";
import { computedNebula, imageNebula, type Nebula } from "./nebula.ts";
import { starField, starSprite } from "./sky.ts";

export type ViewName = "gallery" | "close" | "eclipse" | "nebula" | "earth";
export type Method = "computed" | "image";

export interface Choice {
  readonly view: ViewName;
  readonly world: number;
  readonly seed: number;
  readonly method: Method;
}

export interface Device {
  readonly renderer: WebGLRenderer;
  /** Where the site is served from. */
  readonly base: string;
  readonly ratio: number;
}

export interface View {
  readonly stage: Scene;
  readonly camera: PerspectiveCamera;
  readonly worlds: readonly Planet[];
  readonly textures: readonly Texture[];
  readonly images: number;
  readonly targetBytes: number;
  /** Where the eye is, -1 to 1 each way, and the screen's shape. */
  look(eyeX: number, eyeY: number, aspect: number): void;
  tick(seconds: number): void;
  dispose(): void;
}

const NAMES = [
  "atlas",
  "harbor",
  "ember",
  "tide",
  "glacier",
  "forge",
  "bubble",
  "kelvin",
  "veil",
  "dusk",
  "soot",
  "shard",
];
const SPHERE_WIDTH = 160;
const SPHERE_HEIGHT = 120;
const ANISOTROPY = 8;
const PAN = 0.14;

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (character) => character.charCodeAt(0));

/** The path of a world on the page: another seed, another world of the same anchor. */
export const pathOf = (world: number, seed: number): string =>
  `gno.land/r/${NAMES[world] ?? "atlas"}${seed === 0 ? "" : String(seed)}/home`;

/** The look of the page's `world`th anchor. */
const lookAt = (world: number, seed: number): PlanetLook =>
  planetLook(ascii(pathOf(world, seed)), ANCHORS[world] ?? "rocky");

/** The looks a choice shows. */
export const looksOf = ({ view, world, seed }: Choice): PlanetLook[] =>
  view === "gallery" ? ANCHORS.map((_, index) => lookAt(index, seed)) : [lookAt(world, seed)];

async function mapsFor(looks: readonly PlanetLook[], base: string, anisotropy: number) {
  const names = [...new Set(looks.flatMap((look) => [look.map, look.second]))];
  const loaded = new Map(
    await Promise.all(
      names.map(async (name) => [name, await loadMap(mapUrl(name, base), { kind: "colour", anisotropy })] as const),
    ),
  );
  const [clouds, ring] = await Promise.all([
    loadMap(mapUrl("clouds", base), { kind: "data", anisotropy }),
    loadMap(mapUrl("ring", base), { kind: "data", anisotropy }),
  ]);
  const set: MapSet = {
    map: (name) => {
      const texture = loaded.get(name);
      if (texture === undefined) throw new Error(`no map ${name}`);
      return texture;
    },
    clouds,
    ring,
  };
  return { set, textures: [...loaded.values(), clouds, ring] };
}

async function nebulaOf(choice: Choice, { renderer, base }: Device): Promise<Nebula | undefined> {
  if (choice.view !== "nebula") return undefined;
  if (choice.method === "computed") return computedNebula(renderer);
  return imageNebula(await loadMap(mapUrl("carina", base), { kind: "colour", anisotropy: ANISOTROPY }));
}

// A stage holding `worlds` under one star, with the sky behind them.
function staged(worlds: readonly Planet[], layout: Layout, sky: Object3D) {
  const stage = new Scene();
  stage.add(sky);
  for (const world of worlds) {
    stage.add(world.group);
    if (layout.sun !== undefined) world.setSun(layout.sun);
  }
  return stage;
}

// The Earth's light for each world: its own star from its path's seed, and the bright limb of its air where it has one.
function lightWorlds(worlds: readonly Planet[], choice: Choice): void {
  for (const [index, world] of worlds.entries()) {
    const at = choice.view === "gallery" ? index : choice.world;
    world.setSun(sideLight(planetSeed(ascii(pathOf(at, choice.seed))), new Vector3()));
    if (world.look.rim !== null) world.setLimb(LIMB_LIGHT);
  }
}

// The one star's sprite, for the view that looks into it.
const spriteOf = (choice: Choice, { camera, sun }: Layout) =>
  choice.view === "eclipse" && sun !== undefined ? starSprite(camera, sun) : undefined;

/** Builds a view: its maps first, then its worlds. */
export async function buildView(choice: Choice, device: Device): Promise<View> {
  if (choice.view === "earth") return earthView(device);
  const { renderer, base, ratio } = device;
  const looks = looksOf(choice);
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), ANISOTROPY);
  const { set, textures } = await mapsFor(looks, base, anisotropy);
  const nebula = await nebulaOf(choice, device);
  const layout = layoutOf(choice.view);
  const sphere: BufferGeometry = new SphereGeometry(1, SPHERE_WIDTH, SPHERE_HEIGHT);
  const worlds = looks.map((look) => createPlanet(look, set, sphere));
  const stars = starField(ratio);
  const stage = staged(worlds, layout, stars);
  if (layout.sun === undefined) lightWorlds(worlds, choice);
  if (nebula !== undefined) stage.add(nebula.mesh);
  const sprite = spriteOf(choice, layout);
  if (sprite !== undefined) stage.add(sprite);
  const image = nebula?.texture;
  const all = image === undefined ? textures : [...textures, image];
  return {
    stage,
    camera: layout.camera,
    worlds,
    textures: all,
    images: image === undefined ? 0 : 1,
    targetBytes: nebula?.targetBytes ?? 0,
    look(eyeX, eyeY, aspect) {
      layout.camera.aspect = aspect;
      layout.camera.position.x = eyeX * PAN;
      layout.camera.position.y = eyeY * PAN;
      layout.camera.updateProjectionMatrix();
      for (const [index, world] of worlds.entries()) layout.place(world, index, aspect);
      nebula?.look(eyeX, eyeY, aspect);
    },
    tick(seconds) {
      for (const world of worlds) world.setTime(seconds);
    },
    dispose() {
      for (const world of worlds) world.dispose();
      for (const texture of all) texture.dispose();
      nebula?.dispose();
      sphere.dispose();
      stars.geometry.dispose();
      stars.material.dispose();
      sprite?.geometry.dispose();
      sprite?.material.dispose();
    },
  };
}
