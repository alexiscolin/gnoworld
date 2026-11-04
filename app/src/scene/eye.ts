// Where the view is, in doubles (slice-7 §5): the camera stays at the origin, and the world comes to it. The arrival's drift, its slow
// look about and a mouse's lean add to where it rests; under reduced motion none moves, and whatever they had stays, so nothing jumps back.
// The worlds' arrival is the cosmos's own dive (7d7): they take the lean alone. A flight's way adds to both (7g).
import { driftAt, HOME, LEAN, turnAt, type Point } from "@gnoworld/core";
import type { CosmosSight } from "./flight/goal.ts";

const LEAN_MS = 900;

export class Eye {
  readonly at = { x: HOME.x, y: HOME.y, z: HOME.z };
  /** Where the worlds are seen from: where it rests and a mouse's lean, not the sky's drift, which would leave them behind. */
  readonly worlds = { x: HOME.x, y: HOME.y, z: HOME.z };
  readonly turn = { yaw: 0, pitch: 0 };
  /** The way flights have taken it from where it rests, which they alone write (7g). */
  readonly travel = { x: 0, y: 0, z: 0 };
  /** What a flight in the cosmos looks at, on the stage; none, and the view aims as it does at rest. */
  look: Point | undefined;
  /** The cosmos as a flight reads it, once a file's view at rest has come. */
  sight: CosmosSight | undefined;
  readonly #rest = { x: HOME.x, y: HOME.y, z: HOME.z };
  readonly #drift = { x: 0, y: 0, z: 0 };
  #seconds = 0;
  #aimX = 0;
  #aimY = 0;
  #leanX = 0;
  #leanY = 0;

  /** Its time on the way, frozen with it. */
  get seconds(): number {
    return this.#seconds;
  }

  /** Where it stands, how it looks about and its clock, copied, as the scene's stats say them. */
  said() {
    return { eye: { ...this.at }, turn: { ...this.turn }, seconds: this.#seconds };
  }

  /** One frame on, `delta` ms after the last; `still` stops the clock where it stands. */
  advance(delta: number, still: boolean): void {
    if (!still) {
      this.#seconds += delta / 1000;
      driftAt(this.#drift, this.#seconds);
      turnAt(this.turn, this.#seconds);
      const eased = 1 - Math.exp(-delta / LEAN_MS);
      this.#leanX += (this.#aimX - this.#leanX) * eased;
      this.#leanY += (this.#aimY - this.#leanY) * eased;
    }
    const { travel } = this;
    this.at.x = this.#rest.x + this.#drift.x + this.#leanX * LEAN + travel.x;
    this.at.y = this.#rest.y + this.#drift.y + this.#leanY * LEAN + travel.y;
    this.at.z = this.#rest.z + this.#drift.z + travel.z;
    this.worlds.x = this.#rest.x + this.#leanX * LEAN + travel.x;
    this.worlds.y = this.#rest.y + this.#leanY * LEAN + travel.y;
    this.worlds.z = this.#rest.z + travel.z;
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

  /** Holds the lean where it is, as though the mouse aimed there. */
  readonly hold = (): void => {
    this.#aimX = this.#leanX;
    this.#aimY = this.#leanY;
  };
}
