// A world as it comes to the stage: its maps at the close view's width, its moons' small ones, the sphere they share, and, once every map is
// here, its body and its moons. It owns all of it, and frees it all at once.
import { planetSeed, worldLook, worldPath, type PlanetLook } from "@gnoworld/core";
import { Color, SphereGeometry, SRGBColorSpace } from "three";
import { BodyMaps } from "../cosmos/maps.ts";
import type { EarthDevice } from "../earth/device.ts";
import { WorldBody } from "./body.ts";
import { moonLookOf, OrbitingMoons } from "./orbiting.ts";

/** A world's maps' width at High, the Earth's. */
export const CLOSE_WIDTH = 4096;
const MOON_WIDTH = 512;
// The least a plate's tint is lit and coloured: the frames' plates take their world's hue at about this weight (design review, 2).
const TINT_LIGHTNESS = 0.6;
const TINT_SATURATION = 0.35;

export interface StandingCalls {
  /** A map came. */
  readonly arrived: () => void;
  /** A map of the world's did not. */
  readonly failed: () => void;
}

export class Standing {
  readonly id: string;
  readonly seed: Uint8Array;
  readonly look: PlanetLook;
  readonly #maps: BodyMaps;
  readonly #moonMaps: BodyMaps;
  readonly #sphere = new SphereGeometry(1, 160, 120);
  body: WorldBody | undefined;
  moons: OrbitingMoons | undefined;

  constructor(device: EarthDevice, id: string, { arrived, failed }: StandingCalls) {
    this.id = id;
    this.seed = planetSeed(worldPath(id));
    this.look = worldLook(id);
    this.#maps = new BodyMaps(device, arrived, { width: CLOSE_WIDTH, failed });
    this.#moonMaps = new BodyMaps(device, arrived, { width: MOON_WIDTH, failed });
  }

  /** The world's own colour, its palette's middle hue, at a lightness and a saturation that tint a plate: a dark palette would tint none. */
  get colour(): string {
    const [red, green, blue] = this.look.ramp[1];
    const hsl = new Color().setRGB(red, green, blue, SRGBColorSpace).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
    const tint = new Color().setHSL(
      hsl.h,
      Math.max(hsl.s, TINT_SATURATION),
      Math.max(hsl.l, TINT_LIGHTNESS),
      SRGBColorSpace,
    );
    return `#${tint.getHexString()}`;
  }

  /** The body, made once every map it needs is here; none before. */
  build(): WorldBody | undefined {
    if (this.body !== undefined) return this.body;
    const moonLook = moonLookOf(`#${this.id}`);
    const [world, moon] = [this.#maps.setFor(this.look), this.#moonMaps.setFor(moonLook)];
    if (world === undefined || moon === undefined) return undefined;
    this.body = new WorldBody({
      look: this.look,
      seed: this.seed,
      maps: { world, moon, moonLook },
      sphere: this.#sphere,
    });
    this.moons = new OrbitingMoons(this.#sphere, (each) => this.#moonMaps.setFor(each));
    this.body.sized.add(this.moons.group);
    return this.body;
  }

  dispose(): void {
    this.moons?.dispose();
    this.body?.dispose();
    this.#maps.free();
    this.#moonMaps.free();
    this.#sphere.dispose();
  }
}
