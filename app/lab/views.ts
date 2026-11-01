// The realism page's four views. Each builds what it shows and frees it all, so the memory a view reports is what it takes. A view loads only
// its own maps: the gallery shows the whole set, the others two or three.
import { ANCHORS, planetLook, type PlanetLook } from "@gnoworld/core";
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
import { loadMap, mapUrl } from "../src/scene/planet/maps.ts";
import { createPlanet, type MapSet, type Planet } from "../src/scene/planet/planet.ts";
import { computedNebula, imageNebula, type Nebula } from "./nebula.ts";
import { starField, starSprite } from "./sky.ts";

export type ViewName = "gallery" | "close" | "eclipse" | "nebula";
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
const GALLERY = { fov: 20, distance: 30, columns: 4, rows: 3, fill: 0.74 };
const CLOSE = { fov: 30, distance: 5.75 };
const FAR_PLANE = 4000;
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
      names.map(async (name) => [name, await loadMap(mapUrl(name, base), "colour", anisotropy)] as const),
    ),
  );
  const [clouds, ring] = await Promise.all([
    loadMap(mapUrl("clouds", base), "data", anisotropy),
    loadMap(mapUrl("ring", base), "data", anisotropy),
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

interface Layout {
  readonly camera: PerspectiveCamera;
  readonly sun: Vector3;
  place(planet: Planet, index: number, aspect: number): void;
}

function galleryLayout(): Layout {
  const camera = new PerspectiveCamera(GALLERY.fov, 1.6, 1, FAR_PLANE);
  camera.position.z = GALLERY.distance;
  const height = 2 * GALLERY.distance * Math.tan((GALLERY.fov * Math.PI) / 360);
  return {
    camera,
    sun: new Vector3(-0.66, 0.34, 0.67).normalize(),
    place(planet, index, aspect) {
      const width = height * aspect;
      const column = index % GALLERY.columns;
      const row = Math.floor(index / GALLERY.columns);
      const cellWidth = width / GALLERY.columns;
      const cellHeight = height / GALLERY.rows;
      planet.group.position.set((column + 0.5) * cellWidth - width / 2, height / 2 - (row + 0.5) * cellHeight, 0);
      planet.group.scale.setScalar((Math.min(cellWidth, cellHeight) / 2) * GALLERY.fill);
    },
  };
}

function closeLayout(sun: Vector3): Layout {
  const camera = new PerspectiveCamera(CLOSE.fov, 1.6, 0.5, FAR_PLANE);
  camera.position.z = CLOSE.distance;
  return { camera, sun: sun.normalize(), place: () => undefined };
}

function nebulaLayout(): Layout {
  const camera = new PerspectiveCamera(CLOSE.fov, 1.6, 0.5, FAR_PLANE);
  camera.position.z = 22;
  return {
    camera,
    sun: new Vector3(-0.8, 0.3, 0.52).normalize(),
    place(planet, _, aspect) {
      planet.group.position.set(3.2 * aspect, -2.3, 0);
    },
  };
}

function layoutOf(view: ViewName): Layout {
  if (view === "gallery") return galleryLayout();
  if (view === "close") return closeLayout(new Vector3(0.72, 0.3, 0.62));
  if (view === "eclipse") return closeLayout(new Vector3(0.178, 0.1, -1));
  return nebulaLayout();
}

async function nebulaOf(choice: Choice, { renderer, base }: Device): Promise<Nebula | undefined> {
  if (choice.view !== "nebula") return undefined;
  if (choice.method === "computed") return computedNebula(renderer);
  return imageNebula(await loadMap(mapUrl("carina", base), "colour", ANISOTROPY));
}

// A stage holding `worlds` under one star, with the sky behind them.
function staged(worlds: readonly Planet[], layout: Layout, sky: Object3D) {
  const stage = new Scene();
  stage.add(sky);
  for (const world of worlds) {
    world.setSun(layout.sun);
    stage.add(world.group);
  }
  return stage;
}

/** Builds a view: its maps first, then its worlds. */
export async function buildView(choice: Choice, device: Device): Promise<View> {
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
  if (nebula !== undefined) stage.add(nebula.mesh);
  const sprite = choice.view === "eclipse" ? starSprite(layout.camera, layout.sun) : undefined;
  if (sprite !== undefined) stage.add(sprite);
  const all = nebula?.texture === undefined ? textures : [...textures, nebula.texture];
  return {
    stage,
    camera: layout.camera,
    worlds,
    textures: all,
    images: nebula?.texture === undefined ? 0 : 1,
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
