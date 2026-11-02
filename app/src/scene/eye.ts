// Where the view is, in doubles (slice-7 §5): the camera stays at the origin, and the world comes to it. The arrival's drift, its slow
// look about and a mouse's lean add to where it rests; under reduced motion none moves, and whatever they had stays, so nothing jumps back.
import { driftAt, glideAt, HOME, turnAt, type Point } from "@gnoworld/core";

// How far a mouse at the window's edge leans the view, in world units: enough to part the motes from the stars.
const LEAN = 3;
const LEAN_MS = 900;

export class Eye {
  readonly at = { x: HOME.x, y: HOME.y, z: HOME.z };
  /** Where the worlds are seen from: the same, less the sky's endless cruise, which would leave them behind. */
  readonly worlds = { x: HOME.x, y: HOME.y, z: HOME.z };
  /** Where the view rests, a mouse's lean with it but not the arrival's glide: the view at rest holds within it. */
  readonly resting = { x: HOME.x, y: HOME.y, z: HOME.z };
  readonly turn = { yaw: 0, pitch: 0 };
  readonly #rest = { x: HOME.x, y: HOME.y, z: HOME.z };
  readonly #drift = { x: 0, y: 0, z: 0 };
  readonly #glide = { x: 0, y: 0, z: 0 };
  #seconds = 0;
  #aimX = 0;
  #aimY = 0;
  #leanX = 0;
  #leanY = 0;

  /** Its time on the way, frozen with it. */
  get seconds(): number {
    return this.#seconds;
  }

  /** One frame on, `delta` ms after the last; `still` stops the clock where it stands. */
  advance(delta: number, still: boolean): void {
    if (!still) {
      this.#seconds += delta / 1000;
      driftAt(this.#drift, this.#seconds);
      glideAt(this.#glide, this.#seconds);
      turnAt(this.turn, this.#seconds);
      const eased = 1 - Math.exp(-delta / LEAN_MS);
      this.#leanX += (this.#aimX - this.#leanX) * eased;
      this.#leanY += (this.#aimY - this.#leanY) * eased;
    }
    this.at.x = this.#rest.x + this.#drift.x + this.#leanX * LEAN;
    this.at.y = this.#rest.y + this.#drift.y + this.#leanY * LEAN;
    this.at.z = this.#rest.z + this.#drift.z;
    this.worlds.x = this.#rest.x + this.#glide.x + this.#leanX * LEAN;
    this.worlds.y = this.#rest.y + this.#glide.y + this.#leanY * LEAN;
    this.worlds.z = this.#rest.z + this.#glide.z;
    this.resting.x = this.#rest.x + this.#leanX * LEAN;
    this.resting.y = this.#rest.y + this.#leanY * LEAN;
    this.resting.z = this.#rest.z;
  }

  /** Where the view rests from now on. */
  moveTo(to: Point): void {
    this.#rest.x = to.x;
    this.#rest.y = to.y;
    this.#rest.z = to.z;
  }

  /** A mouse's place, -1 to 1 across the window. */
  readonly aim = (x: number, y: number): void => {
    this.#aimX = x;
    this.#aimY = y;
  };
}
