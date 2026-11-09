// A flight (D401): one move from the pose the camera has to the pose asked, along van Wijk and Nuij's path (core), so it goes
// straight and never comes back; the way and the up turn by a slerp, the field of view opens 5° mid-way (not on a turn). The goal is read each
// frame, so a moving body is met where it is. Eased power2.inOut from rest, power2.out when the camera already moves.
import { glideAt, zoomPath, zoomSeconds, ZOOM_RHO, type ZoomPath, type ZoomStep } from "@gnoworld/core";
import { Quaternion, Vector3 } from "three";
import { blankPose, copyPose, type Pose } from "./pose.ts";

/** Where a flight goes: the pose asked, read each frame (false while it cannot be told yet), and what it says on its way. */
export interface Goal {
  readonly pose: (out: Pose) => boolean;
  /** At 68 % of the way: the page's text starts entering (the video's frame 19). */
  readonly near?: (() => void) | undefined;
  readonly landed?: (() => void) | undefined;
  /** A turn round what the eye looks at, as far off: the field of view stays, so it never seems to step back. */
  readonly turn?: boolean;
}

const NEAR = 0.68;
const FOV_BUMP = 5;
// The longest a goal is waited for before the flight lands where it is.
const WAIT_S = 2;
const inOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outOnly = (t: number): number => 1 - (1 - t) ** 3;

export class Flight {
  readonly goal: Goal;
  readonly #from = blankPose();
  readonly #to = blankPose();
  readonly #apart = new Vector3();
  readonly #step: ZoomStep = { along: 0, width: 0 };
  readonly #a = new Vector3();
  readonly #b = new Vector3();
  readonly #turn = new Quaternion();
  readonly #part = new Quaternion();
  readonly #none = new Quaternion();
  readonly #moving: boolean;
  readonly #rho: number;
  #path: ZoomPath | undefined;
  #seconds = 1;
  #time = 0;
  #waited = 0;
  #near = false;
  /** How far along, eased, 0 to 1. */
  along = 0;

  /** From `from`, already `moving` or not, to `goal`. */
  constructor(from: Pose, goal: Goal, { moving = false, rho = ZOOM_RHO } = {}) {
    this.goal = goal;
    copyPose(from, this.#from);
    this.#moving = moving;
    this.#rho = rho;
  }

  // Once the goal can be told: the path from where the camera was to where it is asked.
  #start(): boolean {
    if (this.#path !== undefined) return true;
    if (!this.goal.pose(this.#to)) return false;
    const { look } = this.#from;
    this.#apart.set(look.x - this.#to.look.x, look.y - this.#to.look.y, look.z - this.#to.look.z);
    this.#path = zoomPath(this.#apart.length(), { from: this.#from.distance, to: this.#to.distance }, this.#rho);
    this.#seconds = zoomSeconds(this.#path.length);
    return true;
  }

  /** `delta` ms on, `still` under reduced motion (it lands at once), into `out`: whether it landed. */
  advance(delta: number, still: boolean, out: Pose): boolean {
    if (!this.#start()) {
      this.#waited += delta / 1000;
      copyPose(this.#from, out);
      return this.#waited > WAIT_S;
    }
    this.#time = still ? this.#seconds : Math.min(this.#seconds, this.#time + delta / 1000);
    const t = this.#time / this.#seconds;
    this.along = this.#moving ? outOnly(t) : inOut(t);
    this.#pose(t, out);
    if (!this.#near && this.along >= NEAR) {
      this.#near = true;
      this.goal.near?.();
    }
    return t >= 1;
  }

  #pose(t: number, out: Pose): void {
    const to = this.#to;
    const from = this.#from;
    const path = this.#path;
    if (path === undefined) return;
    this.goal.pose(to);
    glideAt(path, this.along, this.#step);
    const left = 1 - this.#step.along;
    out.look.x = to.look.x + this.#apart.x * left;
    out.look.y = to.look.y + this.#apart.y * left;
    out.look.z = to.look.z + this.#apart.z * left;
    // The goal's distance may change on the way (a page's circle laid out late): the path's end follows it, by the share flown.
    out.distance = this.#step.width * (1 + (to.distance / path.to - 1) * this.along);
    this.#slerp(from.way, to.way, out.way);
    this.#slerp(from.up, to.up, out.up);
    const bump = this.goal.turn === true ? 0 : FOV_BUMP * Math.sin(Math.PI * t);
    out.fov = from.fov + (to.fov - from.fov) * this.along + bump;
  }

  // `along` of the turn from unit `a` to unit `b`, into `out`.
  #slerp(a: Pose["way"], b: Pose["way"], out: Pose["way"]): void {
    this.#a.set(a.x, a.y, a.z);
    this.#turn.setFromUnitVectors(this.#a, this.#b.set(b.x, b.y, b.z));
    this.#part.slerpQuaternions(this.#none, this.#turn, this.along);
    this.#a.applyQuaternion(this.#part);
    out.x = this.#a.x;
    out.y = this.#a.y;
    out.z = this.#a.z;
  }

  /** Whether it went past its 68 %. */
  get near(): boolean {
    return this.#near;
  }
}
