// The generated worlds' maps, shared by every world that names them and kept once loaded (a world's look names a few of a small
// library), and the Earth's own. A map that fails is asked again after two seconds.
import type { Texture } from "three";
import type { MapSet } from "../planet/planet.ts";
import { loadMap, mapUrl, type MapLoad } from "../planet/maps.ts";
import { loadEarthMaps, type EarthMaps } from "../earth/maps.ts";

const WIDTH = 2048;
const ANISOTROPY = 8;
const AGAIN_MS = 2000;

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
  readonly #asked = new Set<string>();
  readonly #leaving = new AbortController();
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
    if (page || this.#pageLeft === 0) for (const name of [...names, "clouds", "ring"]) this.#ask(name, page);
    return mapSetOf(names, this.#held);
  }

  /** The Earth's maps, once they came. */
  earth(page = true): EarthMaps | undefined {
    if (!this.#earthAsked && (page || this.#pageLeft === 0)) {
      this.#earthAsked = true;
      const { signal } = this.#leaving;
      const loading = loadEarthMaps(this.#base, {
        anisotropy: ANISOTROPY,
        halved: false,
        signal,
      });
      this.#count(page, loading);
      loading.then(
        (maps) => {
          this.#earth = maps;
        },
        () => undefined,
      );
    }
    return this.#earth;
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

  #ask(name: string, page: boolean): void {
    if (this.#asked.has(name)) return;
    const { signal } = this.#leaving;
    const loading = loadMap(mapUrl(name, this.#base, WIDTH), { ...namedLoad(name), anisotropy: ANISOTROPY, signal });
    this.#asked.add(name);
    this.#count(page, loading);
    loading.then(
      (texture) => {
        this.#held.set(name, texture);
      },
      () => {
        if (!signal.aborted) setTimeout(() => this.#asked.delete(name), AGAIN_MS);
      },
    );
  }

  dispose(): void {
    this.#leaving.abort();
    for (const texture of this.#held.values()) texture.dispose();
    for (const texture of Object.values(this.#earth ?? {})) (texture as Texture).dispose();
  }
}
