// The planets near enough to be seen as themselves (D401): the few largest on screen, once a few pixels across, are drawn as the
// generated planets they are (the Earth as the hand-made one), at the same place and size, lit by their sun; their quad is hidden
// meanwhile. A planet stands only once its maps came, went to the GPU one a frame, and its shaders compiled, so it never waits on screen
// and never stalls the frame it comes in.
import {
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from "three";
import { EARTH } from "@gnoworld/core";
import { earthPlanet } from "../earth/earth.ts";
import { scaleOf } from "../boosts.ts";
import { placeOf, type Planet, type Universe, type Vec } from "../layout.ts";
import { createWorld, mapNamesOf, worldOf } from "../planet/generated.ts";
import type { Planet as Drawn } from "../planet/planet.ts";
import type { PlateMask } from "../planet/plateMask.ts";
import type { Maps } from "./maps.ts";
import type { Planets } from "./planets.ts";

// A planet this many pixels across, or more, is drawn as itself; at most this many at once; kept made this many more.
const FROM_PX = 6;
const MOST = 10;
const KEPT = 24;

interface Held {
  readonly drawn: Drawn;
  /** Its maps not yet on the GPU. */
  readonly uploads: Texture[];
  compiled: boolean;
  shown: boolean;
}

// The maps `group` draws with: sent to the GPU before it shows, as its first draw would send them all in one frame.
export function mapsOf(group: Object3D): Texture[] {
  const found = new Set<Texture>();
  const take = (value: unknown) => {
    if (value instanceof Texture) found.add(value as Texture);
  };
  group.traverse((part) => {
    const materials = part instanceof Mesh ? [part.material].flat() : [];
    for (const material of materials)
      if (material instanceof ShaderMaterial) for (const { value } of Object.values(material.uniforms)) take(value);
  });
  return [...found];
}

export interface NearDevice {
  readonly stage: Scene;
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly maps: Maps;
  readonly planets: Planets;
  /** The page's plate, which a world's glare keeps off (D490). */
  readonly plate: PlateMask;
  /** How far a lens dims what it does not light, 0 to 1, eased by the frame (D425). */
  readonly lens: { readonly value: number };
}

export class Near {
  readonly #device: NearDevice;
  readonly #sphere = new SphereGeometry(1, 128, 96);
  readonly #held = new Map<number, Held>();
  readonly #at: Vec = { x: 0, y: 0, z: 0 };
  readonly #sun = new Vector3();
  // The planets drawn as themselves, largest first, and how many pixels across each is.
  readonly #wanted: Planet[] = [];
  readonly #sizes: number[] = [];
  readonly #wantedIndex = new Set<number>();

  // The frame's time, the page's planet and the one it frames close (-1 none), for the callbacks a frame runs.
  #seconds = 0;
  #alone = -1;
  #lit: ReadonlySet<string> | undefined;
  #close = -1;

  /** The worlds a lens lights, by their ids: the others stay quads, which dim (D425); none, every one may be drawn as itself. */
  only: ReadonlySet<string> | undefined;
  // The world whose ground is turned past its own spin, and by how many seconds of it, so a bubble stands clear of the dock (D488, D565).
  #ahead = { id: EARTH as string, seconds: 0 };

  constructor(device: NearDevice) {
    this.#device = device;
  }

  /** Turns the ground of the world `id` on `seconds` past its own spin; its clouds keep time. */
  lead(id: string, seconds: number): void {
    this.#ahead = { id, seconds };
  }

  /** Chooses which planets are drawn as themselves, seen from `eye` with `pxK` world units a pixel at distance 1: called a few
   * times a second, not every frame. */
  choose(universe: Universe, eye: Vec, { pxK, seconds }: { pxK: number; seconds: number }): void {
    this.#wanted.length = 0;
    this.#sizes.length = 0;
    for (const system of universe.systems) {
      const off = Math.hypot(system.place.x - eye.x, system.place.y - eye.y, system.place.z - eye.z);
      if (off > system.reach * 40) continue;
      for (const planet of system.planets) {
        placeOf(planet, seconds, this.#at);
        const px = (2 * planet.radius) / (Math.hypot(this.#at.x - eye.x, this.#at.y - eye.y, this.#at.z - eye.z) * pxK);
        if (px >= FROM_PX) this.#keep(planet, px);
      }
    }
    this.#wantedIndex.clear();
    for (const planet of this.#wanted) {
      this.#wantedIndex.add(planet.index);
      this.#make(planet);
    }
    this.#forget();
  }

  // Keeps `planet`, `px` across, among the MOST largest, largest first, in the same two lists each time.
  #keep(planet: Planet, px: number): void {
    const [wanted, sizes] = [this.#wanted, this.#sizes];
    let at = wanted.length;
    while (at > 0 && (sizes[at - 1] ?? Infinity) < px) at -= 1;
    if (at >= MOST) return;
    if (wanted.length < MOST) {
      wanted.push(planet);
      sizes.push(px);
    }
    wanted.copyWithin(at + 1, at, wanted.length - 1);
    sizes.copyWithin(at + 1, at, sizes.length - 1);
    wanted[at] = planet;
    sizes[at] = px;
  }

  /** A frame `seconds` on: the planets drawn as themselves stand where their quads would; with `alone` (a page's planet's index),
   * that one alone; `close`, the planet a page frames close, its air's lit limb pushed (D458). */
  tick(seconds: number, alone = -1, close?: Planet): void {
    this.#seconds = seconds;
    this.#alone = alone;
    this.#close = close?.index ?? -1;
    this.#wanted.some(this.#uploadOne);
    this.#held.forEach(this.#showOne);
    this.#wanted.forEach(this.#placeOne);
  }

  // Planet `index` shown as itself or as its quad: made once, called on frames.
  readonly #showOne = (held: Held, index: number): void => {
    const shown = this.#shows(index, held, this.#alone);
    if (shown === held.shown) return;
    held.shown = shown;
    held.drawn.group.visible = shown;
    this.#device.planets.show(index, !shown);
  };

  // A wanted planet shown as itself stands where its quad would: made once, called on frames.
  readonly #placeOne = (planet: Planet): void => {
    const held = this.#held.get(planet.index);
    if (held?.shown === true) this.#place(planet, held.drawn, this.#seconds);
  };

  // Whether the planet `index` shows as itself: made whole, wanted, and the page's own when a page shows one.
  #shows(index: number, held: Held, alone: number): boolean {
    return held.compiled && held.uploads.length === 0 && this.#wantedIndex.has(index) && (alone < 0 || alone === index);
  }

  // One map a frame goes to the GPU, the planets wanted first: true once one went.
  readonly #uploadOne = (planet: Planet): boolean => {
    const map = this.#held.get(planet.index)?.uploads.pop();
    if (map === undefined) return false;
    this.#device.renderer.initTexture(map);
    return true;
  };

  #place(planet: Planet, drawn: Drawn, seconds: number): void {
    placeOf(planet, seconds, this.#at);
    drawn.group.position.set(this.#at.x, this.#at.y, this.#at.z);
    // As large as its quad (shaders/planets.ts): a home world drawn larger shrinks with it, never at once (D548).
    drawn.group.scale.setScalar(planet.radius * scaleOf(planet.index));
    const { place } = planet.system;
    drawn.setSun(this.#sun.set(place.x - this.#at.x, place.y - this.#at.y, place.z - this.#at.z).normalize());
    drawn.setTime(planet.id === this.#ahead.id ? seconds + this.#ahead.seconds : seconds, seconds);
    // A world a lens leaves unlit stays itself, darkened as the lens comes, never a flat quad (D502); the last lens's while it goes.
    if (this.only !== undefined) this.#lit = this.only;
    drawn.setFar(this.#lit?.has(planet.id) === false ? this.#device.lens.value : 0);
    drawn.setClose(planet.index === this.#close ? 1 : 0);
  }

  #make(planet: Planet): void {
    if (this.#held.has(planet.index)) return;
    const drawn = planet.id === EARTH ? this.#earth() : this.#world(planet.id);
    if (drawn === undefined) return;
    drawn.setPlate(this.#device.plate);
    const held: Held = { drawn, uploads: mapsOf(drawn.group), compiled: false, shown: false };
    drawn.group.visible = false;
    this.#held.set(planet.index, held);
    const { stage, renderer, camera } = this.#device;
    stage.add(drawn.group);
    renderer.compileAsync(drawn.group, camera, stage).then(
      () => {
        held.compiled = true;
      },
      () => undefined,
    );
  }

  #world(id: string): Drawn | undefined {
    const world = worldOf(id);
    const maps = this.#device.maps.setOf(mapNamesOf(world));
    return maps === undefined ? undefined : createWorld(world, maps, this.#sphere);
  }

  #earth(): Drawn | undefined {
    const maps = this.#device.maps.earth();
    return maps === undefined ? undefined : earthPlanet(maps, this.#sphere);
  }

  // Past the kept number, the planets not wanted go, least recently made first.
  #forget(): void {
    for (const [index, held] of this.#held) {
      if (this.#held.size <= KEPT) return;
      if (this.#wantedIndex.has(index)) continue;
      this.#drop(index, held);
    }
  }

  #drop(index: number, held: Held): void {
    this.#device.stage.remove(held.drawn.group);
    held.drawn.dispose();
    this.#device.planets.show(index, true);
    this.#held.delete(index);
  }

  dispose(): void {
    for (const [index, held] of this.#held) this.#drop(index, held);
    this.#sphere.dispose();
  }
}
