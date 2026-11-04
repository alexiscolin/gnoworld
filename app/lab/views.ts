// The realism page's four views. Each builds what it shows and frees it all, so the memory a view reports is what it takes. A view loads only
// its own maps: the gallery shows the whole set, the others two or three.
import { planetSeed, type Stage, type WorldSigns } from "@gnoworld/core";
import {
  DataTexture,
  PerspectiveCamera,
  RedFormat,
  Scene,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from "three";
import { sideLight } from "../src/scene/planet/light.ts";
import { loadMap, mapUrl, prepareMap } from "../src/scene/planet/maps.ts";
import { createWorld } from "../src/scene/planet/generated.ts";
import { LIMB_LIGHT, type MapSet, type Planet } from "../src/scene/planet/planet.ts";
import { signsOf, worldsOf, type Choice, type Shown, type ViewName } from "./choice.ts";
import { earthSystem, type Asked } from "./earthSystem.ts";
import { stationSheet } from "./stationSheet.ts";
import { earthView } from "./earthView.ts";
import { layoutOf, type Layout } from "./layouts.ts";
import { starField, starSprite } from "./sky.ts";

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
  /** What each world was drawn from, in the order of `worlds`. */
  readonly drawn: readonly Shown[];
  readonly stages: readonly Stage[];
  readonly textures: readonly Texture[];
  /** Where the eye is, -1 to 1 each way, and the screen's shape. */
  look(eyeX: number, eyeY: number, aspect: number): void;
  tick(seconds: number): void;
  dispose(): void;
}

const SPHERE_WIDTH = 160;
const SPHERE_HEIGHT = 120;
// The most a surface seen at a slant is read with; a GPU gives what it has.
const ANISOTROPY = 16;
// A map is decoded at this width: a gallery of twelve at 2048, a world seen close at the files' own 4096.
const GALLERY_WIDTH = 2048;
const CLOSE_WIDTH = 4096;
const PAN = 0.14;

// One grey for every real map, as a map: what a world draws without its maps' detail.
const grey = (anisotropy: number) =>
  prepareMap(new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1), "colour", anisotropy);

async function mapsFor(
  worlds: readonly Shown[],
  base: string,
  { anisotropy, width, lit, flat }: { anisotropy: number; width: number; lit: boolean; flat: boolean },
) {
  const names = [...new Set(worlds.flatMap(({ look, recipe }) => [look.map, recipe.minorMap]))];
  const loaded = new Map(
    await Promise.all(
      names.map(
        async (name) =>
          [
            name,
            flat ? grey(anisotropy) : await loadMap(mapUrl(name, base), { kind: "colour", anisotropy, width }),
          ] as const,
      ),
    ),
  );
  const [clouds, ring] = await Promise.all([
    flat
      ? prepareMap(new DataTexture(new Uint8Array([128]), 1, 1, RedFormat), "data", anisotropy)
      : loadMap(mapUrl("clouds", base), { kind: "data", anisotropy, width }),
    loadMap(mapUrl("ring", base), { kind: "data", anisotropy }),
  ]);
  const lights = lit ? await loadMap(mapUrl("earth-night", base), { kind: "data", anisotropy, width }) : undefined;
  const set: MapSet = {
    map: (name) => {
      const texture = loaded.get(name);
      if (texture === undefined) throw new Error(`no map ${name}`);
      return texture;
    },
    clouds,
    ring,
    ...(lights === undefined ? {} : { lights }),
  };
  return { set, textures: [...loaded.values(), clouds, ring, ...(lights === undefined ? [] : [lights])] };
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
// Or, asked, every world lit from the eye: its whole face in the light, what the journeys count its land on.
function lightWorlds(worlds: readonly Planet[], shown: readonly Shown[], front: boolean): void {
  for (const [index, world] of worlds.entries()) {
    const sun = new Vector3(0, 0, 1);
    world.setSun(front ? sun : sideLight(planetSeed(shown[index]?.path ?? new Uint8Array()), sun));
    if (world.look.rim !== null) world.setLimb(LIMB_LIGHT);
  }
}

function showSigns(worlds: readonly Planet[], signs: readonly WorldSigns[]): void {
  for (const [index, world] of worlds.entries()) {
    const shown = signs[index];
    if (shown !== undefined) world.setSigns(shown);
  }
}

// The one star's sprite, for the view that looks into it.
const spriteOf = (choice: Choice, { camera, sun }: Layout) =>
  choice.view === "eclipse" && sun !== undefined ? starSprite(camera, sun) : undefined;

const widthOf = (view: ViewName) => (view === "close" || view === "eclipse" ? CLOSE_WIDTH : GALLERY_WIDTH);

// A map for lights is loaded only where a stage shows some: a view at rest pays for nothing.
const litIn = ({ view, stage }: Choice) => view === "stages" || stage !== "rest";

/** Builds a view: its maps first, then its worlds. */
export async function buildView(choice: Choice, device: Device): Promise<View> {
  if (choice.view === "earth") return earthView(device);
  if (choice.view === "stations") return stationSheet(device);
  if (choice.view === "earthsys" || choice.view === "earthtop")
    return earthSystem(device, systemAsked(choice.view === "earthtop"));
  const { renderer, base, ratio } = device;
  const shown = worldsOf(choice);
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), ANISOTROPY);
  const lit = litIn(choice);
  const { set, textures } = await mapsFor(shown, base, {
    anisotropy,
    width: widthOf(choice.view),
    lit,
    flat: choice.flat,
  });
  const signs = signsOf(choice, shown);
  const layout = layoutOf(
    choice.view,
    signs.map(({ size }) => size),
  );
  const sphere: BufferGeometry = new SphereGeometry(1, SPHERE_WIDTH, SPHERE_HEIGHT);
  const worlds = shown.map((world) => createWorld(world, set, sphere));
  const stars = starField(ratio);
  const stage = staged(worlds, layout, stars);
  if (layout.sun === undefined) lightWorlds(worlds, shown, choice.front);
  showSigns(worlds, signs);
  const sprite = spriteOf(choice, layout);
  if (sprite !== undefined) stage.add(sprite);
  return {
    stage,
    camera: layout.camera,
    worlds,
    drawn: shown,
    stages: signs.map(({ stage }) => stage),
    textures,
    look(eyeX, eyeY, aspect) {
      layout.camera.aspect = aspect;
      layout.camera.position.x = eyeX * PAN;
      layout.camera.position.y = eyeY * PAN;
      layout.camera.updateProjectionMatrix();
      for (const [index, world] of worlds.entries()) layout.place(world, index, aspect);
    },
    tick(seconds) {
      for (const world of worlds) world.setTime(seconds);
    },
    dispose() {
      for (const world of worlds) world.dispose();
      for (const texture of textures) texture.dispose();
      sphere.dispose();
      stars.geometry.dispose();
      stars.material.dispose();
      sprite?.geometry.dispose();
      sprite?.material.dispose();
    },
  };
}

// The Earth's system's study, as the page's address asks it: how many stations, and gnosh.ai's size.
function systemAsked(top: boolean): Asked {
  const query = new URLSearchParams(location.search);
  const count = Number(query.get("count") ?? "12");
  const size = Number(query.get("size") ?? "0.5");
  return {
    top,
    count: Number.isInteger(count) && count >= 0 ? Math.min(count, 5000) : 12,
    size: Number.isFinite(size) ? size : 0.5,
  };
}
