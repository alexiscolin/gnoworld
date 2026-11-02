// A group's programs compiled before it shows (docs/design/three.md, section 11): a first compile on a frame stalls the arrival. Once, off
// the frame; refused or not, it may show after, for a shader that fails says so through the renderer.
import type { Object3D } from "three";
import type { EarthDevice } from "../earth/device.ts";

export class Ahead {
  readonly #device: EarthDevice;
  readonly #group: Object3D;
  readonly #ready: () => void;
  #asked = false;
  /** Its programs are compiled: it may show. */
  done = false;

  constructor(device: EarthDevice, group: Object3D, ready: () => void) {
    this.#device = device;
    this.#group = group;
    this.#ready = ready;
  }

  /** Compiles it, the first time only, and calls `ready` once done. */
  ask(): void {
    if (this.#asked) return;
    this.#asked = true;
    const { renderer, camera, stage } = this.#device;
    const ready = () => {
      this.done = true;
      this.#ready();
    };
    renderer.compileAsync(this.#group, camera, stage).then(ready, ready);
  }
}
