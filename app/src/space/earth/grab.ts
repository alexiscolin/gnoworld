// The reader's hand on a generated world (D13011): a drag turns the planet about its middle, round the screen's up and right, the camera and the
// sun staying. The turn is a layer on top of the planet's own spin, which never stops: it is kept, never eased back. It follows the pointer
// one to one (a surface's point moves as far as the pointer), and carries on after the release with the view's inertia (rig/free.ts).
import { Quaternion, Vector3 } from "three";

// Seconds a turn's speed takes to fall by its e-th: as the camera's turn (rig/free.ts).
const TAU = 0.32;
const SHORTEST_S = 1 / 240;
const DONE = 1e-4;
// A step longer than this (a slow machine's frame) turns as if it were this long, as the camera's does.
const LONGEST_S = 0.05;
const [RIGHT, UP] = [new Vector3(1, 0, 0), new Vector3(0, 1, 0)];

export class Grab {
  /** The turn the hand gave the planet, a turn of the world. */
  readonly at = new Quaternion();
  // About the view's up (x) and right (y), in radians: what the pointer asked since the last frame, and the speed it left, a second.
  readonly #asked = { x: 0, y: 0 };
  readonly #speed = { x: 0, y: 0 };
  readonly #axis = new Vector3();
  readonly #step = new Quaternion();
  #held = false;

  /** A drag of `dx`, `dy` pixels on a planet `radius` pixels across its half, `seconds` since the last move: it turns at once. */
  drag({ dx, dy, radius, seconds }: { dx: number; dy: number; radius: number; seconds: number }): void {
    const [x, y] = [dx / radius, dy / radius];
    const over = Math.max(seconds, SHORTEST_S);
    this.#held = true;
    this.#asked.x += x;
    this.#asked.y += y;
    this.#speed.x = x / over;
    this.#speed.y = y / over;
  }

  /** The drag let go: its speed carries on, unless it stood still before letting go. */
  release(stood: boolean): void {
    this.#held = false;
    if (stood) this.#speed.x = this.#speed.y = 0;
  }

  /** Stops what the hand set going; the turn it gave stays. */
  stop(): void {
    this.#held = false;
    this.#asked.x = this.#asked.y = this.#speed.x = this.#speed.y = 0;
  }

  /** Whether the hand still turns the planet. */
  get moving(): boolean {
    return (
      this.#held ||
      Math.abs(this.#speed.x) + Math.abs(this.#speed.y) > DONE ||
      this.#asked.x !== 0 ||
      this.#asked.y !== 0
    );
  }

  /** `step` seconds on, the view turned as `view`; `still` (reduced motion) has no inertia. */
  advance(seconds: number, view: Quaternion, still: boolean): void {
    const step = Math.min(seconds, LONGEST_S);
    let [x, y] = [this.#asked.x, this.#asked.y];
    this.#asked.x = this.#asked.y = 0;
    if (!this.#held) {
      if (still) this.#speed.x = this.#speed.y = 0;
      const decay = Math.exp(-step / TAU);
      // The distance the decaying speed covers over the step, whole: the same at any frame rate.
      const run = TAU * (1 - decay);
      [x, y] = [x + this.#speed.x * run, y + this.#speed.y * run];
      this.#speed.x *= decay;
      this.#speed.y *= decay;
    }
    if (x !== 0) this.at.premultiply(this.#step.setFromAxisAngle(this.#axis.copy(UP).applyQuaternion(view), x));
    if (y !== 0) this.at.premultiply(this.#step.setFromAxisAngle(this.#axis.copy(RIGHT).applyQuaternion(view), y));
  }
}
