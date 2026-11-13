// The galaxy's arrival (Alexis, 2026-11-10, option F): once per visit, when the view first stands from its URL. The camera leans in from the
// disc's rim over INTRO.total seconds; the seven heaviest systems light first, the others from the core outward; each world fades and grows
// over INTRO.each seconds on the GPU (uIntro, aDelay), its name following it. It starts as the scene comes in from black (one clock).
import { DISC, type Universe } from "./layout.ts";
import type { Space } from "./scene.ts";
import { eyeOf } from "./rig/pose.ts";

export const INTRO = { total: 2.4, each: 0.7, first: 7, gap: 0.06, arms: 0.3 } as const;
/** What the sequence's time reads once it is over, or never ran: every world whole. */
export const DONE = 1e3;
const SPAN = INTRO.total - INTRO.each;
// raw: the camera's start, from the demo's page: the disc's tilt a fifth of the resting one, the view 1.61 times as far
const START = { tilt: 0.12 / 0.58, near: 0.62 };

const easeOutQuart = (p: number): number => 1 - (1 - p) ** 4;

/** When a system's worlds start: the heaviest `first` (the universe lists them so, the home first) 0.06 s apart; the others at 0.3 s plus
 * their distance from the heart over the disc's radius (the layout has no arm parameter) of the time left. */
export function delayOf(index: number, share: number): number {
  if (index < INTRO.first) return index * INTRO.gap;
  return INTRO.arms + Math.min(1, Math.max(0, share)) * (SPAN - INTRO.arms);
}

/** Each system's delay, by its index. */
const delaysOf = ({ systems, scale }: Universe): number[] =>
  systems.map(({ index, place }) => delayOf(index, Math.hypot(place.x, place.y, place.z) / (DISC * scale)));

/** Whether `canvas` is in sight: not held out while its page's planet comes (features/universe/firstLook.ts). */
const shown = ({ dataset }: Pick<HTMLCanvasElement, "dataset">): boolean =>
  dataset["first"] === undefined || dataset["sharp"] !== undefined;

// Once per visit: a scene made later (the page left and back) never plays it again.
let played = false;

/** What the sequence reads of the scene each frame. */
interface Watched {
  readonly rig: { readonly placed: boolean; readonly flying: boolean };
  readonly options: {
    readonly still: () => boolean;
    readonly inChat?: boolean | undefined;
    readonly canvas: Pick<HTMLCanvasElement, "dataset">;
  };
  readonly place: { readonly kind: string } | undefined;
  readonly universe: object | undefined;
}

type Held = { readonly index: number } | { readonly system: { readonly index: number } };

export class Intro {
  #state: "idle" | "armed" | "running" | "done" = "idle";
  #seconds = 0;
  #delays: readonly number[] = [];
  readonly #was = { x: 0, y: 0, z: 0, distance: 0 };
  readonly #clock: { value: number };

  /** Reads and writes the frame's `uIntro`. */
  constructor(clock: { value: number }) {
    this.#clock = clock;
  }

  /** The universe whose delays the worlds and the names follow. */
  stand(universe: Universe): readonly number[] {
    this.#delays = delaysOf(universe);
    return this.#delays;
  }

  /** Whether the names of `item`'s world may show: its world stands. */
  ready = (item: Held | undefined): boolean => {
    if (this.#state === "idle" || this.#state === "done" || item === undefined) return true;
    const index = "system" in item ? item.system.index : item.index;
    return this.#seconds >= (this.#delays[index] ?? 0) + INTRO.each;
  };

  /** A frame `delta` ms on. The first one that finds the galaxy placed at once (its URL, never a flight; not the chat's own view, nor under
   * reduced motion) arms the sequence, which runs once the scene (`canvas`) shows; the clock then ends it. */
  tick(delta: number, space: Watched): void {
    this.#arm(space);
    if (this.#state === "armed" && shown(space.options.canvas)) this.#state = "running";
    if (this.#state !== "running") return;
    this.#seconds += delta / 1000;
    const over = this.#seconds >= INTRO.total;
    this.#clock.value = over ? DONE : this.#seconds;
    if (over) this.#state = "done";
  }

  // The first frame that finds the universe placed decides, once, whether the sequence is to play.
  #arm({ rig, options, place, universe }: Watched): void {
    if (this.#state !== "idle" || played || universe === undefined || !rig.placed) return;
    played = true;
    if (place?.kind !== "universe" || rig.flying || options.still() || options.inChat === true) return;
    this.#state = "armed";
    this.#clock.value = 0;
  }

  /** The camera aimed, leaned toward the rim and away while the sequence runs, the pose given back after. */
  aim({ rig, camera, see }: Pick<Space, "rig" | "camera" | "see">): void {
    const { pose, eye } = rig;
    const { way } = pose;
    if (this.#state === "running") {
      const share = easeOutQuart(this.#seconds / INTRO.total);
      Object.assign(this.#was, way, { distance: pose.distance });
      const y = way.y * (START.tilt + (1 - START.tilt) * share);
      const length = Math.hypot(way.x, y, way.z) || 1;
      [way.x, way.y, way.z] = [way.x / length, y / length, way.z / length];
      pose.distance /= START.near + (1 - START.near) * share;
      eyeOf(pose, eye);
    }
    rig.aim(camera, see.screen);
    if (this.#state !== "running") return;
    [way.x, way.y, way.z, pose.distance] = [this.#was.x, this.#was.y, this.#was.z, this.#was.distance];
    eyeOf(pose, eye);
  }
}
