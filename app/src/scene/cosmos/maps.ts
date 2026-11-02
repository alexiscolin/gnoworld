// The small set of real maps the bodies share (ADR-0002 §3), the nebulae's images, and the generated worlds' code, a chunk of its own:
// each asked once, a map at a body's width and uploaded before it shows, the maps freed together. A map or the code that does not come
// leaves its worlds as points, and an image its nebulae unshown; the rest stand.
import type { Texture } from "three";
import type { EarthDevice } from "../earth/device.ts";
import { freeMap, loadMap, mapUrl } from "../planet/maps.ts";
import type { World } from "../planet/generated.ts";
import type { MapSet } from "../planet/planet.ts";

type Kit = typeof import("../planet/generated.ts");

const ANISOTROPY = 8;
// A body of a few dozen pixels: the close view's 4096 waits for the close view.
const BODY_WIDTH = 2048;

export class BodyMaps {
  readonly #device: EarthDevice;
  readonly #arrived: () => void;
  readonly #maps = new Map<string, Texture>();
  readonly #asked = new Set<string>();
  #loading = new AbortController();
  #kit: Kit | undefined;
  #askedKit = false;

  constructor(device: EarthDevice, arrived: () => void) {
    this.#device = device;
    this.#arrived = arrived;
  }

  get size(): number {
    return this.#maps.size;
  }

  /** The code that draws a generated world, asked if it was not: until it came, none. */
  kit(): Kit | undefined {
    if (!this.#askedKit) {
      this.#askedKit = true;
      import("../planet/generated.ts").then(
        (kit) => {
          this.#kit = kit;
          this.#arrived();
        },
        () => undefined,
      );
    }
    return this.#kit;
  }

  /** What `world` needs, if it is all here; what is not is asked for. */
  setFor({ look, recipe }: World): MapSet | undefined {
    const names = [look.map, recipe.minorMap, "clouds", "ring"];
    for (const name of names) this.#fetch(name);
    const [clouds, ring] = [this.#maps.get("clouds"), this.#maps.get("ring")];
    if (clouds === undefined || ring === undefined || names.some((name) => !this.#maps.has(name))) return undefined;
    return { map: (name) => this.#maps.get(name) ?? clouds, clouds, ring };
  }

  /** A map by its name, asked if it was not: until it came, none. */
  named(name: string): Texture | undefined {
    this.#fetch(name);
    return this.#maps.get(name);
  }

  #fetch(name: string): void {
    if (this.#asked.has(name)) return;
    this.#asked.add(name);
    const { renderer, base, halved } = this.#device;
    const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), ANISOTROPY);
    const kind = name === "clouds" || name === "ring" ? "data" : "colour";
    const sized = name === "ring" ? {} : { width: halved() ? BODY_WIDTH / 2 : BODY_WIDTH };
    const { signal } = this.#loading;
    loadMap(mapUrl(name, base), { kind, anisotropy, signal, ...sized }).then(
      (map) => {
        if (signal.aborted) {
          freeMap(map);
          return;
        }
        renderer.initTexture(map);
        this.#maps.set(name, map);
        this.#arrived();
      },
      () => undefined,
    );
  }

  /** Frees them all, and what is on its way. They may be asked again. */
  free(): void {
    this.#loading.abort();
    this.#loading = new AbortController();
    for (const map of this.#maps.values()) freeMap(map);
    this.#maps.clear();
    this.#asked.clear();
  }
}
