// The reader's hand on the pose (D401): a drag turns the view round what it looks at, a wheel brings it nearer what the pointer is
// over, both with the demo's inertia (0.32 s for a turn, 0.18 s for a zoom); still for 4 s, the view turns slowly on its own.
import { Quaternion, Vector3 } from "three";
import type { Pose, Spot } from "./pose.ts";

// A screen's height of drag turns the view once round.
const TURN = 2 * Math.PI;
const TURN_TAU = 0.32;
const ZOOM_TAU = 0.18;
// A wheel's pixel, in the log of the distance per second of the zoom's speed: a mouse's notch (100) brings it about 1.24 times nearer.
const ZOOM_PER_PIXEL = 0.012;
const ZOOM_MOST = 6;
// The slow turn once still, in radians a second and after how many seconds, reached over 3 s: near a system the prototype's 0.18 of
// OrbitControls after 4 s; the galaxy turning as the artifact's did, a turn in 52 s, after a second (Alexis, 2026-11-09); none.
export const WANDER = {
  near: { speed: 0.019, after: 4 },
  galaxy: { speed: 0.12, after: 1 },
  none: { speed: 0, after: 0 },
} as const;
const IDLE_RISE = 3;
// How near the view's up the way may turn, and how far under: the cosmos is seen from above it.
const TOP = 0.985;
const UNDER = -0.6;
const DONE = 1e-4;

/** How near and how far the eye may stand from what it looks at. */
export interface Reach {
  readonly near: number;
  readonly far: number;
}

export class Free {
  #yaw = 0;
  #pitch = 0;
  #zoom = 0;
  #idle = 0;
  #held = false;
  /** Where the zoom goes, on the stage; none, what the view looks at. */
  readonly anchor: Spot = { x: NaN, y: NaN, z: NaN };
  /** The slow turn once still (WANDER): none on a page, none under reduced motion. */
  wander: { readonly speed: number; readonly after: number } = WANDER.near;
  /** Whether a drag turns the view round its up alone, never tilting it: a system seen from above. */
  level = false;
  /** Whether a wheel brings the view nearer what the pointer is over (far out over the universe), or nearer its middle (a system). */
  pointed = false;
  readonly #axis = new Vector3();
  readonly #way = new Vector3();
  readonly #right = new Vector3();
  readonly #tilt = new Vector3();
  readonly #turn = new Quaternion();
  readonly #pending = { yaw: 0, pitch: 0 };

  /** A drag of `dx`, `dy` pixels on a screen `height` high, `seconds` since the last move: it turns at once and keeps its speed. */
  drag({ dx, dy, height, seconds }: { dx: number; dy: number; height: number; seconds: number }): void {
    // The view turns as if the hand held what it looks at: its surface follows the pointer, across and up or down alike.
    const [yaw, pitch] = [(-TURN * dx) / height, (TURN * dy) / height];
    this.#held = true;
    this.#idle = 0;
    const tilt = this.level ? 0 : pitch;
    this.#yaw = yaw / Math.max(seconds, 1 / 240);
    this.#pitch = tilt / Math.max(seconds, 1 / 240);
    this.#pending.yaw += yaw;
    this.#pending.pitch += tilt;
  }

  /** The drag let go: what speed it had carries on, unless it stood still before letting go. */
  release(stood: boolean): void {
    this.#held = false;
    if (stood) this.#yaw = this.#pitch = 0;
  }

  /** A wheel of `pixels` (in, negative), towards `anchor` if it is told. */
  wheel(pixels: number): void {
    this.#idle = 0;
    this.#zoom = Math.max(-ZOOM_MOST, Math.min(ZOOM_MOST, this.#zoom + pixels * ZOOM_PER_PIXEL));
  }

  /** Stops what the hand set going: a flight takes the pose. */
  stop(): void {
    this.#yaw = this.#pitch = this.#zoom = 0;
    this.#pending.yaw = this.#pending.pitch = 0;
    this.#idle = 0;
  }

  /** Whether the wheel brings the view nearer, now. */
  get inward(): boolean {
    return this.#zoom < -DONE;
  }

  /** Whether the hand still moves the pose. */
  get moving(): boolean {
    return Math.abs(this.#yaw) + Math.abs(this.#pitch) + Math.abs(this.#zoom) > DONE || this.#pending.yaw !== 0;
  }

  /** `delta` ms on, `still` under reduced motion, on `pose`, within `reach`. */
  advance(delta: number, still: boolean, { pose, reach }: { readonly pose: Pose; readonly reach: Reach }): void {
    const dt = Math.min(delta, 50) / 1000;
    this.#idle += dt;
    if (this.#held) this.#turnBy(this.#pending.yaw, this.#pending.pitch, pose);
    else {
      const decay = Math.exp(-dt / TURN_TAU);
      this.#turnBy(this.#yaw * dt, this.#pitch * dt, pose);
      this.#yaw *= decay;
      this.#pitch *= decay;
    }
    this.#pending.yaw = this.#pending.pitch = 0;
    const { speed, after } = this.wander;
    if (speed > 0 && !still && this.#idle > after)
      this.#turnBy(speed * dt * Math.min(1, (this.#idle - after) / IDLE_RISE), 0, pose);
    if (Math.abs(this.#zoom) > DONE) this.#zoomBy(dt, pose, reach);
  }

  #zoomBy(dt: number, pose: Pose, reach: Reach): void {
    const distance = Math.max(reach.near, Math.min(reach.far, pose.distance * Math.exp(this.#zoom * dt)));
    const share = 1 - distance / pose.distance;
    if (!Number.isNaN(this.anchor.x)) {
      pose.look.x += (this.anchor.x - pose.look.x) * share;
      pose.look.y += (this.anchor.y - pose.look.y) * share;
      pose.look.z += (this.anchor.z - pose.look.z) * share;
    }
    pose.distance = distance;
    this.#zoom *= Math.exp(-dt / ZOOM_TAU);
  }

  // Turns the way round the view's up by `yaw`, then round its right by `pitch`, within the room above and under.
  #turnBy(yaw: number, pitch: number, pose: Pose): void {
    if (yaw === 0 && pitch === 0) return;
    const { way, up } = pose;
    const axis = this.#axis.set(up.x, up.y, up.z);
    const next = this.#way.set(way.x, way.y, way.z).applyQuaternion(this.#turn.setFromAxisAngle(axis, yaw));
    const right = this.#right.crossVectors(axis, next).normalize();
    const tilted = this.#tilt.copy(next).applyQuaternion(this.#turn.setFromAxisAngle(right, -pitch));
    const height = tilted.dot(axis);
    if (height < TOP && height > UNDER) next.copy(tilted);
    way.x = next.x;
    way.y = next.y;
    way.z = next.z;
  }
}
