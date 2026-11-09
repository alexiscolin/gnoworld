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

  /** For a site served at `base`. */
  constructor(base: string) {
    this.#base = base;
  }

  /** The set of `names`, once all came; asks those not yet asked. */
  setOf(names: readonly string[]): MapSet | undefined {
    for (const name of [...names, "clouds", "ring"]) this.#ask(name);
    return mapSetOf(names, this.#held);
  }

  /** The Earth's maps, once they came. */
  earth(): EarthMaps | undefined {
    if (!this.#earthAsked) {
      this.#earthAsked = true;
      loadEarthMaps(this.#base, { anisotropy: ANISOTROPY, halved: false, signal: this.#leaving.signal }).then(
        (maps) => {
          this.#earth = maps;
        },
        () => undefined,
      );
    }
    return this.#earth;
  }

  #ask(name: string): void {
    if (this.#asked.has(name)) return;
    this.#asked.add(name);
    const { signal } = this.#leaving;
    loadMap(mapUrl(name, this.#base, WIDTH), { ...namedLoad(name), anisotropy: ANISOTROPY, signal }).then(
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
