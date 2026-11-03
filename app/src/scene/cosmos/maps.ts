// The small set of real maps the bodies share (ADR-0002 §3), the nebulae's images, and the generated worlds' code, a chunk of its own:
// each asked once, a map at a body's width and uploaded before it shows, the maps freed together. A map or the code that does not come
// leaves its worlds as points, and an image its nebulae unshown; the rest stand.
import type { Texture } from "three";
import type { EarthDevice } from "../earth/device.ts";
import { freeMap, loadMap, mapUrl, type MapLoad } from "../planet/maps.ts";
import type { World } from "../planet/generated.ts";
import type { MapSet } from "../planet/planet.ts";

/** The generated worlds' code, a chunk of its own. */
export type Kit = typeof import("../planet/generated.ts");
const kitCode = (): Promise<Kit> => import("../planet/generated.ts");

const ANISOTROPY = 8;
// A body of a few dozen pixels: the close view's 4096 waits for the close view.
const BODY_WIDTH = 2048;

interface BodyMapsOptions {
  /** A map's width at High; the close view takes the Earth's 4096. */
  readonly width?: number;
  /** A map did not come. */
  readonly failed?: () => void;
  /** The generated worlds' code; a test injects its own. */
  readonly code?: () => Promise<Kit>;
}

// How a map of the bodies' set loads at `width`: the clouds' and the rings' are data on one channel, the rings' at their own size.
function namedLoad(name: string, width: number): Pick<MapLoad, "kind" | "width"> {
  if (name === "ring") return { kind: "data" };
  return { kind: name === "clouds" ? "data" : "colour", width };
}

// The maps a generated world reads.
const mapNamesOf = ({ look, recipe }: World): string[] => [look.map, recipe.minorMap, "clouds", "ring"];

// A generated world's maps from those `held`, once all it reads are there; none till then.
function mapSetOf(world: World, held: ReadonlyMap<string, Texture>): MapSet | undefined {
  const [clouds, ring] = [held.get("clouds"), held.get("ring")];
  if (clouds === undefined || ring === undefined || mapNamesOf(world).some((name) => !held.has(name))) return undefined;
  return { map: (name) => held.get(name) ?? clouds, clouds, ring };
}

export class BodyMaps {
  readonly #device: EarthDevice;
  readonly #arrived: () => void;
  readonly #width: number;
  readonly #failed: () => void;
  readonly #maps = new Map<string, Texture>();
  readonly #asked = new Set<string>();
  #loading = new AbortController();
  readonly #code: () => Promise<Kit>;
  #kit: Kit | undefined;
  #askedKit = false;

  constructor(
    device: EarthDevice,
    arrived: () => void,
    { width = BODY_WIDTH, failed = () => undefined, code = kitCode }: BodyMapsOptions = {},
  ) {
    this.#device = device;
    this.#arrived = arrived;
    this.#width = width;
    this.#failed = failed;
    this.#code = code;
  }

  get size(): number {
    return this.#maps.size;
  }

  /** The code that draws a generated world, asked if it was not: until it came, none. One that failed says so and is asked again the next
   * time a world wants it, as the app's other chunks are (F1763); code that comes once its maps were freed is kept, told to no one. */
  kit(): Kit | undefined {
    if (!this.#askedKit) {
      this.#askedKit = true;
      const { signal } = this.#loading;
      this.#code().then(
        (kit) => {
          this.#kit = kit;
          if (!signal.aborted) this.#arrived();
        },
        () => {
          this.#askedKit = false;
          if (!signal.aborted) this.#failed();
        },
      );
    }
    return this.#kit;
  }

  /** What `world` needs, if it is all here; what is not is asked for. */
  setFor(world: World): MapSet | undefined {
    for (const name of mapNamesOf(world)) this.#fetch(name);
    return mapSetOf(world, this.#maps);
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
    const { signal } = this.#loading;
    loadMap(mapUrl(name, base), {
      ...namedLoad(name, halved() ? this.#width / 2 : this.#width),
      anisotropy,
      signal,
    }).then(
      (map) => {
        if (signal.aborted) {
          freeMap(map);
          return;
        }
        renderer.initTexture(map);
        this.#maps.set(name, map);
        this.#arrived();
      },
      () => {
        if (!signal.aborted) this.#failed();
      },
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
