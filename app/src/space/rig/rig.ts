// The camera's rig (D401, docs/plans/dive.md): it alone moves the view. A flight or the reader's hand change its pose; the lens
// shift slides a page's planet into the page's circle (sine.inOut 1.7 s in, 0.8 s out); it stands the camera at the eye.
import { Vector3, type PerspectiveCamera } from "three";
import { Flight, type Goal } from "./flight.ts";
import { Free, type Reach } from "./free.ts";
import { blankPose, copySpot, eyeOf, spot } from "./pose.ts";

export type { Goal } from "./flight.ts";

/** The screen, in the page's pixels. */
interface Screen {
  readonly width: number;
  readonly height: number;
}

const SHIFT_IN_S = 1.7;
const SHIFT_OUT_S = 0.8;
const sineInOut = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
const LONGEST_STEP_MS = 50;
/** How near and how far the eye may stand from what it looks at, for the demo's universe. */
export const REACH: Reach = { near: 0.2, far: 9000 };

export class Rig {
  /** Where the camera is: what it looks at, how far, from where. */
  readonly pose = blankPose();
  /** The eye on the stage, this frame. */
  readonly eye = spot();
  readonly free = new Free();
  /** How near and far the hand may bring the eye. */
  reach: Reach = REACH;
  /** How fast the stage seems to move: the eye's way over its distance to what it looks at, a second. */
  speed = 0;
  /** The flights' length, the reader's tuning (1, the demo's). */
  /** Whether a page's body is what the view looks at: the wheel leaves it be. */
  page = false;
  readonly #ray = new Vector3();
  #flight: Flight | undefined;
  #placed = false;
  readonly #was = spot();
  // The lens shift: in pixels, the share of it shown, and its glide.
  readonly #shift = { x: 0, y: 0 };
  #share = 0;
  #shareFrom = 0;
  #shareTo = 0;
  #shareTime = 1;
  #shareSeconds = 1;
  // Where the flight the slide rides was when it was asked; -1, none.
  #rideFrom = -1;

  /** Whether a pose was ever given: none till the first view comes. */
  get placed(): boolean {
    return this.#placed;
  }

  /** Whether a flight runs. */
  get flying(): boolean {
    return this.#flight !== undefined;
  }

  /** How far the flight that runs has gone, eased, 0 to 1; 1 with none. */
  get along(): number {
    return this.#flight?.along ?? 1;
  }

  /** Whether the view moves by a flight, the hand or the lens: owes a frame each frame. The slow turn at rest does not: it runs at the
   * loop's own rate for scenery. */

  /** Stands the camera at `goal` at once (its first view, or under reduced motion). */
  jump(goal: Goal): void {
    if (!goal.pose(this.pose)) return;
    this.#flight = undefined;
    this.#placed = true;
    eyeOf(this.pose, this.#was);
    goal.near?.();
    goal.landed?.();
  }

  /** Flies to `goal` from where the camera is, at speed if it already moves; at once where it never stood. */
  fly(goal: Goal): void {
    if (!this.#placed) {
      this.jump(goal);
      return;
    }
    const moving = this.#flight !== undefined || this.free.moving;
    this.free.stop();
    this.#flight = new Flight(this.pose, goal, { moving });
  }

  /** The lens shift that puts the screen's middle on a page's circle, `shift` pixels, sliding in; none, sliding out. While a flight runs
   * the slide rides it, ending as it lands, never after; with none it slides over a moment, or at once where `still`. */
  lens(shift: { readonly x: number; readonly y: number } | undefined, still = false): void {
    if (shift !== undefined) Object.assign(this.#shift, shift);
    const to = shift === undefined ? 0 : 1;
    if (to !== this.#shareTo) this.#slideTo(to, still);
  }

  // Starts the lens's slide to `to`: riding the flight that runs, at once where `still`, else over its moment.
  #slideTo(to: number, still: boolean): void {
    const along = still ? undefined : this.#flight?.along;
    this.#shareFrom = this.#share;
    this.#shareTo = to;
    this.#rideFrom = along ?? -1;
    this.#shareTime = along === undefined && !still ? 0 : 1;
    this.#shareSeconds = to === 1 ? SHIFT_IN_S : SHIFT_OUT_S;
    if (still) this.#share = to;
  }

  /** `delta` ms on, `still` under reduced motion. */
  advance(delta: number, still: boolean, real = delta): void {
    const step = Math.min(delta, LONGEST_STEP_MS);
    const flight = this.#flight;
    if (flight?.advance(step, still, this.pose) === true) {
      this.#flight = undefined;
      flight.goal.landed?.();
    } else if (flight === undefined) this.free.advance(step, still, { pose: this.pose, reach: this.reach, real });
    this.#slide(step);
    eyeOf(this.pose, this.eye);
    const moved = Math.hypot(this.eye.x - this.#was.x, this.eye.y - this.#was.y, this.eye.z - this.#was.z);
    this.speed = step > 0 ? moved / (step / 1000) / Math.max(this.pose.distance, 1e-6) : 0;
    copySpot(this.eye, this.#was);
  }

  // The lens's slide a step on: with the flight it rides, from where the flight was when it was asked to its landing; else by its time.
  #slide(step: number): void {
    if (this.#rideFrom >= 0) {
      const flight = this.#flight;
      const t = flight === undefined ? 1 : (flight.along - this.#rideFrom) / Math.max(1 - this.#rideFrom, 1e-6);
      this.#share = this.#shareFrom + (this.#shareTo - this.#shareFrom) * Math.min(1, Math.max(0, t));
      if (flight === undefined) this.#rideFrom = -1;
    } else if (this.#shareTime < 1) {
      this.#shareTime = Math.min(1, this.#shareTime + step / 1000 / this.#shareSeconds);
      this.#share = this.#shareFrom + (this.#shareTo - this.#shareFrom) * sineInOut(this.#shareTime);
    }
  }

  /** Sets the free hand's zoom anchor to the point under the screen's `x`, `y` on the plane through what the view looks at, square to
   * it: a wheel brings the view nearer what the pointer is over. */
  anchorAt(
    x: number,
    y: number,
    { camera, screen: { width, height } }: { camera: PerspectiveCamera; screen: Screen },
  ): void {
    const { anchor } = this.free;
    if (!this.free.pointed) {
      anchor.x = NaN;
      return;
    }
    // The ray from the eye through the pointer: the unprojected point less the eye, a unit.
    const ray = this.#ray
      .set((x / width) * 2 - 1, -(y / height) * 2 + 1, 0.5)
      .unproject(camera)
      .sub(camera.position)
      .normalize();
    const { look, way } = this.pose;
    const ahead = (look.x - this.eye.x) * way.x + (look.y - this.eye.y) * way.y + (look.z - this.eye.z) * way.z;
    const along = ahead / (ray.x * way.x + ray.y * way.y + ray.z * way.z);
    anchor.x = along > 0 ? this.eye.x + ray.x * along : NaN;
    anchor.y = this.eye.y + ray.y * along;
    anchor.z = this.eye.z + ray.z * along;
  }

  /** Stands `camera` at the eye, turned to what the pose looks at, with its field of view (kept upright on a tall screen) and lens shift. */
  aim(camera: PerspectiveCamera, { width, height }: Screen): void {
    const { up, way, fov } = this.pose;
    camera.position.set(this.eye.x, this.eye.y, this.eye.z);
    camera.up.set(up.x, up.y, up.z);
    camera.lookAt(this.eye.x - way.x, this.eye.y - way.y, this.eye.z - way.z);
    const aspect = width > 0 && height > 0 ? width / height : 1;
    camera.fov = aspect >= 1 ? fov : (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) / aspect);
    if (this.#share > 0)
      camera.setViewOffset(width, height, this.#shift.x * this.#share, this.#shift.y * this.#share, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
}
