// A flight's hand-over at a system's arrival (7g2), for the view at rest's eye: the arrival a flight is bound for, drawn as the eye comes;
// the scene's eye taken over in the frame it lands, or kept where it stands as it leaves one, its way carrying it; and the step left between
// the way's last eye and the arrival's glided out, as the mouse's lean shrinks to the arrival's and the sway turns to its axes.
import { smootherstep, toScene, type Point, type StarSystem } from "@gnoworld/core";
import type { EarthDevice } from "../earth/device.ts";
import type { Bound } from "../flight/goal.ts";
import type { Landing } from "./restArrival.ts";

/** A system's arrival is looked for in a chunk of its own, asked the first time a system is or a flight is bound for one. */
export const loadArrival = () => import("./restArrival.ts");

// The step glides out over this many seconds of the worlds' clock.
const CARRY = 1;

export class Hand {
  /** The arrival a flight is bound for, drawn as the eye comes, before it lands there. */
  bound: Landing | undefined;
  #binding = 0;
  // Whether the next arrival hands a flight's eye over, and whether it leaves an arrival, the eye kept; whether the next eye placed carries
  // the step from the last.
  #handing = false;
  #leaving = false;
  #carried = false;
  readonly #last = { x: NaN, y: NaN, z: NaN };
  readonly #carry = { x: 0, y: 0, z: 0, from: NaN };
  readonly #device: Pick<EarthDevice, "eye">;

  constructor(device: Pick<EarthDevice, "eye">) {
    this.#device = device;
  }

  /** Bound for the system `id` of `systems`, or for none: its arrival, and its eye and look on the stage. A later bind wins; a chunk that
   * does not come binds none. */
  bind(systems: readonly StarSystem[], id: string | undefined): Promise<Bound | undefined> {
    this.#binding += 1;
    const binding = this.#binding;
    this.bound = undefined;
    if (id === undefined) return Promise.resolve(undefined);
    return loadArrival().then(
      ({ landingAt }) => {
        const landing = binding === this.#binding ? landingAt(systems, id) : undefined;
        if (landing === undefined) return undefined;
        this.bound = landing;
        const [eye, look] = [
          { x: NaN, y: NaN, z: NaN },
          { x: NaN, y: NaN, z: NaN },
        ];
        toScene(landing.view.eye, eye);
        toScene(landing.look, look);
        return { eye, look };
      },
      () => undefined,
    );
  }

  /** The next arrival hands a flight's eye over. */
  handOver(): void {
    this.#handing = true;
  }

  /** The next way back to the view at rest leaves the eye where it stands, and hands it over. */
  leave(): void {
    this.#leaving = true;
    this.#handing = true;
  }

  /** An arrival comes to `landing`, or to the view at rest with none: whether it keeps the eye where it stands, a flight leaving one. The
   * eye is handed over at the arrival the flight was bound for, or on its way back. */
  comes(landing: Landing | undefined): boolean {
    const keep = this.#leaving && landing === undefined;
    this.#carried = this.#handing && (keep || (landing !== undefined && landing === this.bound));
    [this.#handing, this.#leaving] = [false, false];
    return keep;
  }

  /** The scene's eye rests at `to` from now on: a flight's way off where it rested is spent, or, where `keep`, carries it from `from`, where
   * it rested, looking at `looked` as it did there. */
  moved(to: Point, { keep, from, looked }: { keep: boolean; from: Point; looked: Point }): void {
    const eye = this.#device.eye;
    if (eye === undefined) return;
    const at = keep ? from : to;
    eye.travel.x = at.x - to.x;
    eye.travel.y = at.y - to.y;
    eye.travel.z = at.z - to.z;
    eye.look = keep ? looked : undefined;
  }

  /** The eye placed `out` at `seconds` on the worlds' clock, with what is left of a hand-over's step, gliding out. */
  carry(seconds: number, out: { x: number; y: number; z: number }): void {
    const [carry, last] = [this.#carry, this.#last];
    if (this.#carried && Number.isFinite(last.x + last.y + last.z))
      Object.assign(carry, { x: last.x - out.x, y: last.y - out.y, z: last.z - out.z, from: seconds });
    this.#carried = false;
    const left = 1 - smootherstep(Math.min(Math.max((seconds - carry.from) / CARRY, 0), 1));
    if (left > 0) {
      out.x += carry.x * left;
      out.y += carry.y * left;
      out.z += carry.z * left;
    }
    Object.assign(last, out);
  }
}
