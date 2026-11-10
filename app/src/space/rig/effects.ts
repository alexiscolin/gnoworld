// The demo's effects on the scene (D401), drawn by one owner: speed (blur and dust) and the arrival's scan.
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { Disposer } from "../disposer.ts";
import type { Rig } from "./rig.ts";
import type { Vec } from "../layout.ts";
import { Scan } from "./scan.ts";
import { Speed } from "./speed.ts";

export class Effects {
  readonly scan: Scan;
  readonly #speed: Speed;

  /** On `stage`, owned by `owner`; `still` under reduced motion. */
  constructor(stage: Scene, owner: Disposer, still: () => boolean) {
    this.scan = new Scan(stage, owner, still);
    this.#speed = new Speed(stage, owner);
  }

  /** A frame of `rig`'s, `delta` ms on; `at`, the page's planet, where the scan stands. */
  tick(rig: Rig, delta: number, at: Vec): void {
    this.#speed.tick(rig, delta);
    this.scan.tick(rig, delta, at);
  }

  /** Lets go of the blur's target in GPU memory; the next fast flight makes it again. */
  free(): void {
    this.#speed.free();
  }

  /** Whether an effect is on: the blur, the dust or the scan; each frame differs while it is. */
  get busy(): boolean {
    return this.#speed.busy || this.scan.playing;
  }

  /** Whether the frame goes through the flight's blur pass. */
  get through(): boolean {
    return this.#speed.through;
  }

  /** Draws `stage` through `camera`, blurred while fast: false where the caller draws it as it does. */
  draw(renderer: WebGLRenderer, stage: Scene, camera: PerspectiveCamera): boolean {
    return this.#speed.draw(renderer, stage, camera);
  }
}
