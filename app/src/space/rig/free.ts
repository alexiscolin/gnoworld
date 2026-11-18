// The reader's hand on the pose: a drag turns the view round what it looks at, a wheel brings it nearer what the pointer is
// over, both with the demo's inertia (0.32 s for a turn, 0.18 s for a zoom); 4 s after the hand let go, the view turns slowly on its own,
// and stops after a minute with no input.
import { damp, smoothstep } from "@gnoworld/core";
import { Quaternion, Vector3 } from "three";
import type { Pose, Spot } from "./pose.ts";

// A screen's height of drag turns the view once round.
const TURN = 2 * Math.PI;
const TURN_TAU = 0.32;
// A hand's move reaches the view with a lag of twice the time since the move before it, between these (in seconds): a drag's turn is made over
// the frames the moves are apart, never all in the frame of one, and the view trails the hand by about a move.
const HAND_TAU_MIN = 0.03;
const HAND_TAU_MAX = 0.08;
const ZOOM_TAU = 0.18;
// How fast the anchor's pull comes in and out where a view hands the wheel over (a system's middle, the pointer): never in one frame.
const PULL_TAU = 0.4;
// A wheel's pixel, in the log of the distance per second of the zoom's speed: a mouse's notch (100) brings it about 1.24 times nearer.
const ZOOM_PER_PIXEL = 0.012;
const ZOOM_MOST = 6;
// The slow turn once still, in radians a second and after how many seconds, reached over 3 s: near a system the prototype's 0.18 of
// OrbitControls after 4 s; the galaxy turning as the artifact's did, a turn in 52 s, after a second; none.
export const WANDER = {
  near: { speed: 0.019, after: 4 },
  galaxy: { speed: 0.12, after: 1 },
  none: { speed: 0, after: 0 },
} as const;
const IDLE_RISE = 3;
// With no input for a minute the view's own turn and the scene's clock (planets' spin, clouds, orbits) ease to a stop over 3 s; the next
// input starts them again, the clock easing back up over RATE_RISE seconds.
const QUIET_AFTER = 60;
const QUIET_FALL = 3;
const RATE_RISE = 3;
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
  // Since the hand last took the view (a drag, the wheel, a press, a key, a touch): the slow turn waits its `after` past it.
  #idle = 0;
  // Since any input, a pointer's move included: the minute of rest.
  #quiet = 0;
  // The slow turn's share of its speed: it rises with its ramp and falls with a turn's inertia, never in one frame.
  #wandering = 0;
  #rate = 1;
  #pull = 0;
  #held = false;
  /** Where the zoom goes, on the stage; none, what the view looks at. */
  readonly anchor: Spot = { x: NaN, y: NaN, z: NaN };
  /** The point a turn goes round, on the stage (the galaxy's core in its own view); none, what the view looks at. */
  readonly pivot: Spot = { x: NaN, y: NaN, z: NaN };
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
  readonly #yawed = new Quaternion();
  readonly #offset = new Vector3();
  readonly #pending = { yaw: 0, pitch: 0 };
  // The lag of the pending turn, in seconds.
  #handTau = HAND_TAU_MIN;

  /** A drag of `dx`, `dy` pixels on a screen `height` high, `seconds` since the last move: it turns at once and keeps its speed. */
  drag({ dx, dy, height, seconds }: { dx: number; dy: number; height: number; seconds: number }): void {
    // The view turns as if the hand held what it looks at: its surface follows the pointer, across and up or down alike.
    const [yaw, pitch] = [(-TURN * dx) / height, (TURN * dy) / height];
    this.#held = true;
    this.#take();
    // The hand has the view: the slow turn, which runs the other way as often as not, never reverses a frame the hand's move is not in.
    this.#wandering = 0;
    const tilt = this.level ? 0 : pitch;
    this.#yaw = yaw / Math.max(seconds, 1 / 240);
    this.#pitch = tilt / Math.max(seconds, 1 / 240);
    this.#pending.yaw += yaw;
    this.#pending.pitch += tilt;
    this.#handTau = Math.min(Math.max(2 * seconds, HAND_TAU_MIN), HAND_TAU_MAX);
  }

  /** The drag let go: what speed it had carries on, unless it stood still before letting go. */
  release(stood: boolean): void {
    this.#held = false;
    if (stood) this.#yaw = this.#pitch = 0;
  }

  /** A wheel of `pixels` (in, negative), towards `anchor` if it is told. */
  wheel(pixels: number): void {
    this.#take();
    // A zoom begun from rest pulls to its anchor whole; one running when the anchor comes eases it in (#zoomBy).
    if (Math.abs(this.#zoom) <= DONE) this.#pull = 1;
    this.#zoom = Math.max(-ZOOM_MOST, Math.min(ZOOM_MOST, this.#zoom + pixels * ZOOM_PER_PIXEL));
  }

  /** Stops what the hand set going: a flight takes the pose. */
  stop(): void {
    this.#yaw = this.#pitch = this.#zoom = 0;
    this.#pending.yaw = this.#pending.pitch = 0;
    this.#take();
    this.#wandering = 0;
  }

  /** Whether the wheel brings the view nearer, now. */
  get inward(): boolean {
    return this.#zoom < -DONE;
  }

  /** Whether the hand still moves the pose. */
  get moving(): boolean {
    return (
      Math.abs(this.#yaw) + Math.abs(this.#pitch) + Math.abs(this.#zoom) > DONE ||
      this.#pending.yaw !== 0 ||
      this.#pending.pitch !== 0
    );
  }

  /** Whether the slow turn runs on its own now: each frame differs a little, so the loop does not sleep. */
  get turning(): boolean {
    return this.#wandering > 0;
  }

  /** The share of real time the scene's clock runs at: 1, eased to 0 after a minute with no input, back up at the next; 0 under reduced motion. */
  get rate(): number {
    return this.#rate;
  }

  /** Any input at all (a pointer's move, a resize): the minute of rest starts over, and the slow turn goes on; with `taken`, the hand
   * takes the view (a press, the wheel, a key, a touch): the slow turn eases out, and waits its `after` again. */
  rouse(taken = false): void {
    this.#quiet = 0;
    if (taken) this.#idle = 0;
  }

  #take(): void {
    this.#idle = this.#quiet = 0;
  }

  /** `delta` ms on, `still` under reduced motion, on `pose`, within `reach`. */
  advance(
    delta: number,
    still: boolean,
    { pose, reach, real = delta }: { readonly pose: Pose; readonly reach: Reach; readonly real?: number },
  ): void {
    const dt = Math.min(delta, 50) / 1000;
    // The rest is counted in real time: a slow machine's capped steps would stretch the minute.
    this.#idle += real / 1000;
    this.#quiet += real / 1000;
    this.#rate = still ? 0 : Math.min(this.#hush(), this.#rate + dt / RATE_RISE);
    // The hand's turn not yet made, a share of it each frame: the moves come when they come, the view turns each frame.
    const pending = this.#pending;
    const hand = damp(dt, this.#handTau);
    const yaw = pending.yaw * hand;
    const pitch = pending.pitch * hand;
    pending.yaw -= yaw;
    pending.pitch -= pitch;
    if (Math.abs(pending.yaw) + Math.abs(pending.pitch) < DONE) pending.yaw = pending.pitch = 0;
    if (this.#held) this.#turnBy(yaw, pitch, pose);
    else {
      const decay = Math.exp(-dt / TURN_TAU);
      // The turn the decaying speed makes over the frame, whole: the same distance at any frame rate (the speed times dt over-runs it).
      const run = TURN_TAU * (1 - decay);
      this.#turnBy(this.#yaw * run + yaw, this.#pitch * run + pitch, pose);
      this.#yaw *= decay;
      this.#pitch *= decay;
    }
    this.#wanderBy(dt, still);
    if (this.#wandering > 0) this.#turnBy(this.wander.speed * dt * this.#wandering, 0, pose);
    if (Math.abs(this.#zoom) > DONE) this.#zoomBy(dt, pose, reach);
  }

  // The slow turn's share, never changed in one frame (v0.1.6 cut it as the mouse moved): held by the hand, it falls with a turn's inertia;
  // past its wait it rises by its ramp, from wherever it stands (a minute of rest started over), and falls with the minute's own smoothstep.
  #wanderBy(dt: number, still: boolean): void {
    const { speed, after } = this.wander;
    if (still || speed === 0) this.#wandering = 0;
    else if (this.#idle <= after) {
      const eased = this.#wandering * Math.exp(-dt / TURN_TAU);
      this.#wandering = eased < DONE ? 0 : eased;
    } else {
      const target = Math.min(1, (this.#idle - after) / IDLE_RISE) * this.#hush();
      this.#wandering = Math.min(target, this.#wandering + dt / IDLE_RISE);
    }
  }

  // The share of the slow turn left: all of it, then none once a minute of rest and the ease out are past.
  #hush(): number {
    return 1 - smoothstep(QUIET_AFTER, QUIET_AFTER + QUIET_FALL, this.#quiet);
  }

  #zoomBy(dt: number, pose: Pose, reach: Reach): void {
    const decay = Math.exp(-dt / ZOOM_TAU);
    const distance = Math.max(
      reach.near,
      Math.min(reach.far, pose.distance * Math.exp(this.#zoom * ZOOM_TAU * (1 - decay))),
    );
    const anchored = !Number.isNaN(this.anchor.x);
    this.#pull += ((anchored ? 1 : 0) - this.#pull) * damp(dt, PULL_TAU);
    const share = (1 - distance / pose.distance) * this.#pull;
    if (anchored) {
      pose.look.x += (this.anchor.x - pose.look.x) * share;
      pose.look.y += (this.anchor.y - pose.look.y) * share;
      pose.look.z += (this.anchor.z - pose.look.z) * share;
    }
    pose.distance = distance;
    this.#zoom *= decay;
  }

  // Turns the way round the view's up by `yaw`, then round its right by `pitch`, within the room above and under.
  #turnBy(yaw: number, pitch: number, pose: Pose): void {
    if (yaw === 0 && pitch === 0) return;
    const { way, up } = pose;
    const axis = this.#axis.set(up.x, up.y, up.z);
    const yawed = this.#yawed.setFromAxisAngle(axis, yaw);
    const next = this.#way.set(way.x, way.y, way.z).applyQuaternion(yawed);
    const right = this.#right.crossVectors(axis, next).normalize();
    const turn = this.#turn.setFromAxisAngle(right, -pitch);
    const tilted = this.#tilt.copy(next).applyQuaternion(turn);
    const height = tilted.dot(axis);
    const fits = height < TOP && height > UNDER;
    if (fits) next.copy(tilted);
    // Round a pivot that is not what the view looks at, the look goes round it as the way does: the pivot stays where it is on the screen.
    // Only as far as the eye stands off it: close to a star far from the pivot, a turn would swing the look across the galaxy.
    const { look } = pose;
    if (!Number.isNaN(this.pivot.x)) {
      const offset = this.#offset.set(look.x - this.pivot.x, look.y - this.pivot.y, look.z - this.pivot.z);
      const share = Math.min(1, pose.distance / Math.max(offset.length(), 1e-6));
      const [x, y, z] = [offset.x, offset.y, offset.z];
      offset.applyQuaternion(yawed);
      if (fits) offset.applyQuaternion(turn);
      look.x += (offset.x - x) * share;
      look.y += (offset.y - y) * share;
      look.z += (offset.z - z) * share;
    }
    way.x = next.x;
    way.y = next.y;
    way.z = next.z;
  }
}
