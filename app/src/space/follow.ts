// The home's first screen follows its featured world (D520): the worlds orbit, so every couple of seconds the view is searched again near
// where it stands, and the eye eased round the Earth's light cone toward it, slow and never at a jump; a reader's drag or wheel wins and
// the follow waits out a pause; none under reduced motion. The Earth keeps its place and its light.
import { damp } from "@gnoworld/core";
import type { Space } from "./scene.ts";
import type { Circle } from "./goals.ts";
import { copySpot } from "./rig/pose.ts";
import { shapeBoosts } from "./shape.ts";
import {
  featuredPool,
  latch,
  lightOf,
  normalise,
  quarterOf,
  rollOf,
  turnOf,
  type Eye,
  type Featured,
  type View,
} from "./vista.ts";
import type { Planet, Vec } from "./layout.ts";

// raw: seconds between two searches, the pause after the reader's hand, and the eased share's time constants (the view's, the pose's)
const EVERY = 2;
const PAUSE = 6;
// raw: seconds between two searches over every turn, what a wider search must beat the near one by, and the roll allowed, in degrees
const WIDE = 10;
const BETTER = 2;
const ROLL = 45;
const TAU = { view: 3, pose: 1.2, back: 3 } as const;

const none = (): Vec => ({ x: 0, y: 0, z: 0 });
// An angle in degrees `from` eased toward `to` by `share`, by the shorter way round.
const toward = (from: number, to: number, share: number): number => from + (((to - from + 540) % 360) - 180) * share;

// The near search, the wide one, or both with the wide one kept where it is much better (the world lost from the middle).
function chosen(
  others: readonly Planet[],
  eye: Eye,
  {
    seconds,
    view,
    mode,
    fixed,
  }: { seconds: number; view: View; mode: "near" | "wide" | "both"; fixed?: readonly Featured[] | undefined },
): View & { featured: readonly Featured[] } {
  const near = mode === "wide" ? undefined : turnOf(others, eye, { seconds, around: view, roll: ROLL, fixed });
  const far = mode === "near" ? undefined : turnOf(others, eye, { seconds, roll: ROLL, fixed });
  if (near === undefined) return far ?? { ...view, featured: latch.featured };
  return far !== undefined && far.score > near.score + BETTER ? far : near;
}

class Follow {
  #next = 0;
  #until = 0;
  // Set while the hand's pause stands: the view is chosen anew when it ends, and the pose eases to it the slow way.
  #back = false;
  #slow = 0;
  #wide = 0;
  #target: View | undefined;
  readonly #set: Vec = none();
  readonly #frame = { at: none(), toSun: none(), side: none() };
  readonly #way = none();

  // Whether the reader's hand moved the pose since the last frame, or the follow waits out its pause after it.
  #waiting({ rig, seconds }: Space): boolean {
    const { way } = rig.pose;
    // The first screen has just landed: no pause before its view and its featured worlds are chosen, once (D551).
    if (!latch.frozen) {
      copySpot(way, this.#set);
      [this.#until, this.#wide] = [0, seconds + WIDE];
    }
    const moved = Math.hypot(way.x - this.#set.x, way.y - this.#set.y, way.z - this.#set.z) > 1e-4;
    if (moved || rig.free.moving) [this.#until, this.#back] = [seconds + PAUSE, true];
    if (seconds < this.#until) copySpot(way, this.#set);
    return seconds < this.#until;
  }

  // Which search is due: over every turn at once after the hand's pause, near and over every turn every WIDE seconds, else near.
  #modeAt(seconds: number): "near" | "wide" | "both" {
    if (this.#back) return "wide";
    return seconds >= this.#wide ? "both" : "near";
  }

  // The view searched: near `view` every EVERY seconds, and over every turn every WIDE seconds, kept if it is much better (the world lost
  // from the middle), or at once the hand's pause over, the pose then easing the slow way. Rolled 45° at most, so the Earth's light stays.
  #search(space: Space, view: View, circle: Circle): View {
    const { seconds, universe, rig } = space;
    if (universe === undefined || (seconds < this.#next && !this.#back)) return this.#target ?? view;
    const { at, toSun } = this.#frame;
    const frame = { ...this.#frame, n: universe.earth.system.normal };
    const eye = {
      earth: at,
      toSun,
      circle,
      distance: rig.pose.distance,
      wayAt: (t: number) => quarterOf(this.#way, frame, t),
    };
    const mode = this.#modeAt(seconds);
    if (mode === "wide") this.#slow = seconds + 5;
    if (mode !== "near") this.#wide = seconds + WIDE;
    [this.#back, this.#next] = [false, seconds + EVERY];
    const fixed = latch.frozen ? latch.featured : undefined;
    const target = chosen(featuredPool(universe), eye, { seconds, view, mode, fixed });
    [latch.featured, latch.frozen] = [fixed ?? target.featured, true];
    this.#target = target;
    return target;
  }

  /** A frame `delta` ms on: the view at rest on the home's first screen follows its featured world. */
  update(space: Space, delta: number): void {
    const { place, seconds, circle, universe } = space;
    if (place?.kind !== "home") [latch.view, latch.frozen] = [undefined, false];
    const view = latch.view;
    if (view === undefined || universe === undefined || circle === undefined || !this.#at(space)) return;
    lightOf(universe.earth, seconds, this.#frame);
    const target = this.#search(space, view, circle);
    const share = damp(delta / 1000, TAU.view);
    const next = { turn: toward(view.turn, target.turn, share), roll: toward(view.roll, target.roll, share) };
    latch.view = next;
    this.#steer(space, next, damp(delta / 1000, seconds < this.#slow ? TAU.back : TAU.pose));
  }

  // Whether the view follows now: at rest on the first screen, motion allowed, the hand not moving it.
  #at(space: Space): boolean {
    return space.arrival && !space.rig.flying && !space.options.still() && !this.#waiting(space);
  }

  // The pose's way eased `k` toward the view's, its up rolled to it.
  #steer({ rig, universe }: Space, view: View, k: number): void {
    if (universe === undefined) return;
    const { way, up } = rig.pose;
    const { toSun, side } = this.#frame;
    const goal = quarterOf(this.#way, { toSun, side, n: universe.earth.system.normal }, view.turn);
    way.x += (goal.x - way.x) * k;
    way.y += (goal.y - way.y) * k;
    way.z += (goal.z - way.z) * k;
    normalise(way);
    rollOf(up, { way, toSun }, view.roll);
    copySpot(way, this.#set);
  }
}

const follow = new Follow();

/** One frame of the home's first screen's follow of its featured worlds (D520): one first screen at a time. */
export const followHome = (space: Space, delta: number): void => {
  shapeBoosts(space);
  follow.update(space, delta);
};
