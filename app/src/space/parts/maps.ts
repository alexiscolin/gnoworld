// The generated worlds' maps, shared by every world that names them and kept once loaded (a world's look names a few of a small
// library), and the Earth's own. A map that fails is asked again after two seconds.
import type { Texture, WebGLRenderer } from "three";
import { afterLoad } from "../../later.ts";
import { fastLink, savesData } from "../../lib/saveData.ts";
import type { MapSet, Planet } from "../planet/planet.ts";
import { freeMap, loadMap, mapUrl, type MapLoad } from "../planet/maps.ts";
import {
  loadEarthMaps,
  loadFullEarth,
  loadReliefMaps,
  type EarthMaps,
  type FullEarth,
  type ReliefMaps,
} from "../earth/maps.ts";
import { lowQuality } from "../quality.ts";

/** What a load's answer needs no more of: its failure is handled where it is made (#load). */
const noop = (): undefined => undefined;

const WIDTH = 2048;
const ANISOTROPY = 8;
const AGAIN_MS = 2000;

/** What is asked late: once the Earth's first maps are in, in the browser's idle time, and never under Low or Save-Data. */
interface Late<T> {
  asked: boolean;
  value?: T;
}

/** How map `name` loads: the ring and the clouds as data, the rest as colour, `width` wide. */
export const namedLoad = (name: string, width = WIDTH): Pick<MapLoad, "kind" | "width"> =>
  name === "ring" ? { kind: "data" } : { kind: name === "clouds" ? "data" : "colour", width };

/** The set of `names` among `held`, once all are: a missing name reads the clouds. */
export function mapSetOf(names: readonly string[], held: ReadonlyMap<string, Texture>): MapSet | undefined {
  const [clouds, ring] = [held.get("clouds"), held.get("ring")];
  if (clouds === undefined || ring === undefined || names.some((name) => !held.has(name))) return undefined;
  return { map: (name) => held.get(name) ?? clouds, clouds, ring };
}

export class Maps {
  readonly #base: string;
  readonly #held = new Map<string, Texture>();
  readonly #loading = new Map<string, Promise<Texture>>();
  readonly #leaving = new AbortController();
  readonly #sent = new WeakSet<Texture>();
  readonly #full: Late<FullEarth> = { asked: false };
  readonly #relief: Late<ReliefMaps> = { asked: false };
  #earth: EarthMaps | undefined;
  #earthAsked = false;
  // The page's own maps still on their way: the other worlds' wait for them, so they never share the link with them.
  #pageLeft = 0;

  /** For a site served at `base`. */
  constructor(base: string) {
    this.#base = base;
  }

  /** The set of `names`, once all came; asks those not yet asked. A world that is not `page`'s waits until the page's maps came. */
  setOf(names: readonly string[], page = true): MapSet | undefined {
    if (page || this.#pageLeft === 0)
      for (const name of [...names, "clouds", "ring"]) this.#load(name, page).then(noop, noop);
    return mapSetOf(names, this.#held);
  }

  /** The Earth's maps, once they came: built from the half-size files the page's HTML already asked for (the full ones swap in). */
  earth(page = true): EarthMaps | undefined {
    if (!this.#earthAsked && (page || this.#pageLeft === 0)) {
      this.#earthAsked = true;
      const { signal } = this.#leaving;
      const loading = Promise.all([
        loadEarthMaps(this.#base, { anisotropy: ANISOTROPY, signal }),
        this.#load("clouds", page),
      ]);
      this.#count(page, loading);
      loading.then(
        ([maps, clouds]) => {
          this.#earth = { ...maps, clouds };
        },
        () => undefined,
      );
    }
    return this.#earth;
  }

  /** The Earth's full-size maps, once they came. */
  fullEarth(): FullEarth | undefined {
    // What sharpens the Earth is asked on any link but a data saver's: a browser calling Wi-Fi "3g" must not keep it at half size.
    return this.#late(this.#full, loadFullEarth, savesData);
  }

  /** The Earth's and the Moon's height, once it came. */
  heights(): ReliefMaps | undefined {
    return this.#late(this.#relief, loadReliefMaps, () => !fastLink());
  }

  /** The full maps are on a planet: the half-size day and night go, and an Earth made again is made from the full ones. */
  settleFull(): void {
    const [earth, full] = [this.#earth, this.#full.value];
    if (earth === undefined || full === undefined || earth.day === full.day) return;
    freeMap(earth.day);
    freeMap(earth.night);
    this.#earth = { ...earth, day: full.day, night: full.night };
  }

  /** What a drawn planet takes from the settings and the late maps: whether the relief's shadows show (not under Low), and, the Earth's or
   * the Moon's, its real height once it came and went to the GPU (`renderer`). */
  dress(
    drawn: Pick<Planet, "setDepth" | "setHeight">,
    which: keyof ReliefMaps | undefined,
    renderer?: WebGLRenderer,
  ): void {
    drawn.setDepth(!lowQuality());
    const map = which === undefined ? undefined : this.heights()?.[which];
    if (map === undefined) return;
    // On the GPU a frame before it is used, so the frame it comes in does not pay for the upload.
    if (this.#sent.has(map) || renderer === undefined) drawn.setHeight(map);
    else {
      renderer.initTexture(map);
      this.#sent.add(map);
    }
  }

  // A late set: asked once the Earth's first maps are in, in the browser's idle time, and again after a failure.
  #late<T>(
    state: Late<T>,
    load: (base: string, how: Pick<MapLoad, "anisotropy" | "signal">) => Promise<T>,
    blocked: () => boolean,
  ): T | undefined {
    if (state.asked || this.#earth === undefined || lowQuality() || blocked()) return state.value;
    state.asked = true;
    const { signal } = this.#leaving;
    afterLoad(() => {
      load(this.#base, { anisotropy: ANISOTROPY, signal }).then(
        (value) => {
          state.value = value;
        },
        () => {
          if (!signal.aborted) setTimeout(() => (state.asked = false), AGAIN_MS);
        },
      );
    }, signal);
    return state.value;
  }

  // The page's own loads are counted while they go.
  #count(page: boolean, loading: Promise<unknown>): void {
    if (!page) return;
    this.#pageLeft += 1;
    const done = (): void => {
      this.#pageLeft -= 1;
    };
    loading.then(done, done);
  }

  // The map `name`, loaded once whoever asks: the clouds, which the Earth shares with every world, are one texture.
  #load(name: string, page: boolean): Promise<Texture> {
    const asked = this.#loading.get(name);
    if (asked !== undefined) return asked;
    const { signal } = this.#leaving;
    const loading = loadMap(mapUrl(name, this.#base, WIDTH), { ...namedLoad(name), anisotropy: ANISOTROPY, signal });
    this.#loading.set(name, loading);
    this.#count(page, loading);
    loading.then(
      (texture) => {
        this.#held.set(name, texture);
      },
      () => {
        if (!signal.aborted) setTimeout(() => this.#loading.delete(name), AGAIN_MS);
      },
    );
    return loading;
  }

  dispose(): void {
    this.#leaving.abort();
    for (const texture of this.#held.values()) texture.dispose();
    for (const texture of [this.#earth?.day, this.#earth?.night, this.#earth?.moon]) texture?.dispose();
    for (const maps of [this.#relief.value, this.#full.value])
      for (const texture of Object.values(maps ?? {})) (texture as Texture).dispose();
  }
}
