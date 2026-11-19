// A flight: one move from the pose the camera has to the pose asked, along van Wijk and Nuij's path (core), so it goes
// straight and never comes back; the way and the up turn together, as one frame, by one slerp the short way, never faster than 180° a second;
// the field of view opens 5° mid-way (not on a turn). The goal is read each frame. Eased power2.inOut from rest, out when moving.
import { glideAt, zoomPath, zoomSeconds, ZOOM_RHO, type ZoomPath, type ZoomStep } from "@gnoworld/core";
import { Matrix4, Quaternion, Vector3 } from "three";
import { approach, keepOf } from "./lag.ts";
import { blankPose, copyPose, eyeOf, type Pose } from "./pose.ts";

/** Where a flight goes: the pose asked, read each frame (false while it cannot be told yet), and what it says on its way. */
export interface Goal {
  readonly pose: (out: Pose) => boolean;
  /** At 68 % of the way: the page's text starts entering. */
  readonly near?: (() => void) | undefined;
  readonly landed?: (() => void) | undefined;
  /** A turn round what the eye looks at, as far off: the field of view stays, so it never seems to step back. */
  readonly turn?: boolean;
  /** Whether what it lands on is drawn (none: always): asked once, as the flight starts slowing; not yet, it lands more gently. */
  readonly ready?: () => boolean;
}

const NEAR = 0.68;
// A moment, in seconds, over which the flight's own speed at its start is read.
const MOMENT_S = 1e-3;
const FOV_BUMP = 5;
// The longest a goal is waited for before the flight lands where it is.
const WAIT_S = 2;
const inOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// The ease's steepest slope is 3 (both eases), and the camera turns at most this fast, in radians a second.
const EASE_PEAK = 3;
const TURN_RATE = Math.PI;
const outOnly = (t: number): number => 1 - (1 - t) ** 3;
// Where the flight starts slowing, as a share of it, and the most a landing on a place not ready yet is drawn out, in seconds (Alexis).
const SLOWING = 0.5;
const SLACK_S = 1;

/** A flight drawn out from its share `from`, its `rest` seconds left, by `extra` seconds. */
interface Slack {
  readonly from: number;
  readonly rest: number;
  readonly extra: number;
}

/** The share `t` of a flight drawn out from `from` by `extra` seconds over its `rest` seconds left: the same speed where it starts, slowing
 * more gently, never back (`extra` at most twice `rest`), whole at the end. `u` is the share of the drawn-out rest flown. */
function drawnOut(u: number, { from, rest, extra }: Slack): number {
  const more = extra / rest;
  return from + (1 - from) * (u + more * u * (1 - u) ** 2);
}

export class Flight {
  readonly goal: Goal;
  readonly #from = blankPose();
  readonly #to = blankPose();
  // The goal as read this frame: the end the flight flies to, `#to`, goes over to it (lag.ts).
  readonly #now = blankPose();
  readonly #apart = new Vector3();
  readonly #step: ZoomStep = { along: 0, width: 0 };
  readonly #a = new Vector3();
  readonly #b = new Vector3();
  readonly #up = new Vector3();
  readonly #basis = new Matrix4();
  readonly #frameFrom = new Quaternion();
  readonly #frameTo = new Quaternion();
  readonly #turn = new Quaternion();
  readonly #part = new Quaternion();
  readonly #none = new Quaternion();
  readonly #speed: number;
  readonly #rho: number;
  // The share of a full-speed start the flight takes: 1 where the camera flies as fast as the flight, 0 where it is at rest.
  #weight = 0;
  #path: ZoomPath | undefined;
  #seconds = 1;
  #time = 0;
  #waited = 0;
  #near = false;
  // Drawn out, from where it started slowing, by how much: decided once (undefined: not yet; false: kept as it was).
  #slack: Slack | false | undefined;
  /** How far along, eased, 0 to 1. */
  along = 0;

  /** From `from`, the camera flying at `speed` (the eye's over its distance, a second), to `goal`. */
  constructor(from: Pose, goal: Goal, { rho = ZOOM_RHO, speed = 0 }: { rho?: number; speed?: number } = {}) {
    this.goal = goal;
    copyPose(from, this.#from);
    this.#speed = speed;
    this.#rho = rho;
  }

  // Once the goal can be told: the path from where the camera was to where it is asked.
  #start(): boolean {
    if (this.#path !== undefined) return true;
    if (!this.goal.pose(this.#to)) return false;
    const { look } = this.#from;
    this.#apart.set(look.x - this.#to.look.x, look.y - this.#to.look.y, look.z - this.#to.look.z);
    this.#path = zoomPath(this.#apart.length(), { from: this.#from.distance, to: this.#to.distance }, this.#rho);
    this.#turnOf();
    this.#seconds = Math.max(zoomSeconds(this.#path.length), (EASE_PEAK * this.#turn.angleTo(this.#none)) / TURN_RATE);
    this.#weight = this.#speed > 0 ? this.#startWeight() : 0;
    return true;
  }

  // The frame (way, up) of `pose` as a rotation, into `out`: its up made square to its way.
  #frame(pose: Pose, out: Quaternion): Quaternion {
    const z = this.#a.set(pose.way.x, pose.way.y, pose.way.z);
    const x = this.#b.set(pose.up.x, pose.up.y, pose.up.z).cross(z);
    // An up along the way has no side: the world's up stands in.
    if (x.lengthSq() < 1e-12) x.set(1, 0, 0);
    x.normalize();
    const y = this.#up.crossVectors(z, x);
    return out.setFromRotationMatrix(this.#basis.makeBasis(x, y, z));
  }

  // The turn from the frame the camera has to the frame asked, the short way, into `#turn`.
  #turnOf(): void {
    this.#frame(this.#from, this.#frameFrom);
    this.#frame(this.#to, this.#frameTo);
    this.#turn.copy(this.#frameTo).multiply(this.#frameFrom.invert());
    if (this.#turn.w < 0) this.#turn.set(-this.#turn.x, -this.#turn.y, -this.#turn.z, -this.#turn.w);
  }

  /** `delta` ms on, `still` under reduced motion (it lands at once), into `out`: whether it landed. */
  advance(delta: number, still: boolean, out: Pose): boolean {
    if (!this.#start()) {
      this.#waited += delta / 1000;
      copyPose(this.#from, out);
      return this.#waited > WAIT_S;
    }
    const t = this.#share(still ? Infinity : this.#time + delta / 1000);
    this.along = (1 - this.#weight) * inOut(t) + this.#weight * outOnly(t);
    if (this.goal.pose(this.#now)) approach(this.#to, this.#now, keepOf(delta / 1000, this.along));
    this.#pose(t, out);
    if (!this.#near && this.along >= NEAR) {
      this.#near = true;
      this.goal.near?.();
    }
    return t >= 1;
  }

  // A camera flying slower than the flight's own full-speed start (one all but landed: its next flight began at full speed, a step and a turn
  // in its first frame) starts it in proportion: the speed of both read over a moment of the flight, the eye's over its distance.
  #startWeight(): number {
    const along = this.along;
    const moment = MOMENT_S / this.#seconds;
    this.along = outOnly(moment);
    this.#pose(moment, this.#now);
    this.along = along;
    const at = eyeOf(this.#from, this.#a);
    const then = eyeOf(this.#now, this.#b);
    const own =
      Math.hypot(then.x - at.x, then.y - at.y, then.z - at.z) / MOMENT_S / Math.max(this.#from.distance, 1e-6);
    return Math.min(1, this.#speed / Math.max(own, 1e-9));
  }

  // Decided once, as the flight starts slowing: its rest drawn out by up to SLACK_S where the place is not ready, else kept.
  #slackOf(): Slack | false {
    const from = Math.min(1, this.#time / this.#seconds);
    const rest = (1 - from) * this.#seconds;
    return this.goal.ready?.() === false && rest > 0 ? { from, rest, extra: Math.min(SLACK_S, 2 * rest) } : false;
  }

  // The flight's share at `time` seconds in, 0 to 1.
  #share(time: number): number {
    if (this.#slack === undefined && time / this.#seconds >= SLOWING) this.#slack = this.#slackOf();
    const slack = this.#slack === false ? undefined : this.#slack;
    const end = this.#seconds + (slack?.extra ?? 0);
    this.#time = Math.min(end, time);
    // Whole at its end exactly: the drawn-out curve's rounding fell one part in 2^52 short, and the flight never landed.
    if (this.#time >= end) return 1;
    if (slack === undefined) return this.#time / this.#seconds;
    return drawnOut((this.#time - slack.from * this.#seconds) / (slack.rest + slack.extra), slack);
  }

  #pose(t: number, out: Pose): void {
    const to = this.#to;
    const from = this.#from;
    const path = this.#path;
    if (path === undefined) return;
    glideAt(path, this.along, this.#step);
    const left = 1 - this.#step.along;
    out.look.x = to.look.x + this.#apart.x * left;
    out.look.y = to.look.y + this.#apart.y * left;
    out.look.z = to.look.z + this.#apart.z * left;
    // The goal's distance may change on the way (a page's circle laid out late): the path's end follows it, by the share flown.
    out.distance = this.#step.width * (1 + (to.distance / path.to - 1) * this.along);
    this.#turnOf();
    this.#part.slerpQuaternions(this.#none, this.#turn, this.along);
    this.#rotate(from.way, to.way, out.way);
    this.#rotate(from.up, to.up, out.up);
    const bump = this.goal.turn === true ? 0 : FOV_BUMP * Math.sin(Math.PI * t);
    out.fov = from.fov + (to.fov - from.fov) * this.along + bump;
  }

  // `from` turned by `#part`, into `out`; at the end exactly `to`.
  #rotate(from: Pose["way"], to: Pose["way"], out: Pose["way"]): void {
    this.#a.set(from.x, from.y, from.z).applyQuaternion(this.#part);
    const done = this.along >= 1;
    out.x = done ? to.x : this.#a.x;
    out.y = done ? to.y : this.#a.y;
    out.z = done ? to.z : this.#a.z;
  }

  /** Whether it went past its 68 %. */
  get near(): boolean {
    return this.#near;
  }
}
