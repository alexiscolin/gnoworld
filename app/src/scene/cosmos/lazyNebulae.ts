// The nebulae behind the cosmos (7d6): their code comes in a chunk of its own once the cosmos first shows. Their images wait for the worlds'
// and then fade in, two seconds and more after it, so the chunk is here before anything of them could be seen.
import type { Point } from "@gnoworld/core";
import { Group } from "three";
import type { Disposer } from "../disposer.ts";
import type { EarthDevice } from "../earth/device.ts";

const loadNebulae = () => import("./nebulae.ts");
type Nebulae = InstanceType<Awaited<ReturnType<typeof loadNebulae>>["Nebulae"]>;

export class LazyNebulae {
  /** Where the nebulae stand once they have come. */
  readonly group = new Group();
  readonly #device: EarthDevice;
  readonly #owner: Disposer;
  #nebulae: Nebulae | undefined;
  #asked = false;
  #shown = false;

  constructor(device: EarthDevice, owner: Disposer) {
    this.#device = device;
    this.#owner = owner;
    owner.add({ dispose: () => this.group.removeFromParent() });
  }

  /** Shows them or not; the first show asks for their chunk. A chunk that does not come leaves space without them. */
  show(shown: boolean): void {
    this.#shown = shown;
    this.#nebulae?.show(shown);
    if (!shown || this.#asked) return;
    this.#asked = true;
    loadNebulae().then(
      ({ Nebulae: Made }) => {
        if (this.#owner.signal.aborted) return;
        this.#nebulae = new Made(this.#device, this.#owner);
        this.group.add(this.#nebulae.group);
        this.#nebulae.show(this.#shown);
      },
      () => undefined,
    );
  }

  /** A frame, as the nebulae's own. */
  follow(eye: Point, seconds: number, distance: number): void {
    this.#nebulae?.follow(eye, seconds, distance);
  }

  /** The share they follow and where they stand: none, nowhere, till they came (7d7). */
  follows(): { share: number; eye: Point } {
    return this.#nebulae?.follows() ?? { share: 0, eye: { x: NaN, y: NaN, z: NaN } };
  }

  /** Frees their images, as the nebulae's own. */
  free(): void {
    this.#nebulae?.free();
  }

  /** What shows, for the journeys. */
  stats(): { sheets: number; images: number } {
    return this.#nebulae?.stats() ?? { sheets: 0, images: 0 };
  }
}
