// The home's dive on the stage (7d7): when it starts, how far along it is, how much of the cosmos it lets show and, under reduced motion,
// the dissolve that stands in for the move. Its path is core's, from the view at rest's eye; a frame adds its way off that eye to the
// placed one. It comes with the view at rest, in its chunk.
import { DIVE, diveAt, toScene, type Point } from "@gnoworld/core";
import type { Scene as Stage } from "three";
import { Dissolve } from "./dissolve.ts";

interface Spot {
  x: number;
  y: number;
  z: number;
}

export class Dive {
  /** How far along: 0 at its start, 1 at rest. */
  along = 0;
  /** How much of the cosmos shows: none while it waits for the whole cosmos, then fading in. */
  shown = 0;
  readonly #stage: Stage;
  readonly #still: boolean;
  readonly #on: Spot = { x: NaN, y: NaN, z: NaN };
  readonly #at: Spot = { x: NaN, y: NaN, z: NaN };
  readonly #rest: Spot = { x: NaN, y: NaN, z: NaN };
  #since = NaN;
  #start = NaN;
  #veiled = NaN;
  #dissolve: Dissolve | undefined;

  /** On `stage`; `still`, under reduced motion. */
  constructor(stage: Stage, still: boolean) {
    this.#stage = stage;
    this.#still = still;
  }

  /** Whether it waits still: neither started nor given up. */
  get waiting(): boolean {
    return Number.isNaN(this.#start) && this.along < 1;
  }

  /** How much of the dissolve's picture still shows. */
  get veil(): number {
    return this.#dissolve?.veil ?? 0;
  }

  /** A frame at `clock`, the view at rest and the whole cosmos `ready` or not: it starts at the first that is, or gives up waiting and
   * lands at once. */
  advance(clock: number, ready: boolean): void {
    if (Number.isNaN(this.#since)) this.#since = clock;
    if (Number.isNaN(this.#start) && ready) this.#start = clock;
    if (Number.isNaN(this.#start)) {
      if (clock - this.#since > DIVE.wait) this.#land();
      return;
    }
    const time = clock - this.#start;
    this.shown = Math.min(1, time / DIVE.fade);
    if (this.#still) this.#dissolveAt(clock, time);
    else this.along = Math.min(1, time / DIVE.seconds);
  }

  // Still for a while, then the frame drawn is copied once, the eye stands at rest under it, and it fades.
  #dissolveAt(clock: number, time: number): void {
    if (time < DIVE.hold) return;
    this.#dissolve ??= new Dissolve(this.#stage);
    if (!this.#dissolve.copied) return;
    if (Number.isNaN(this.#veiled)) this.#veiled = clock;
    this.along = 1;
    this.#dissolve.fade(1 - (clock - this.#veiled) / DIVE.dissolve);
    if (this.#dissolve.veil === 0) this.#dissolve.dispose();
  }

  #land(): void {
    this.along = 1;
    this.shown = 1;
  }

  /** Adds to `out` the eye's way off `rest`, the view at rest's eye on the map, this frame, on the stage. */
  dived(rest: Point, out: Spot): void {
    diveAt(rest, this.along, this.#on);
    toScene(this.#on, this.#at);
    toScene(rest, this.#rest);
    out.x += this.#at.x - this.#rest.x;
    out.y += this.#at.y - this.#rest.y;
    out.z += this.#at.z - this.#rest.z;
  }

  dispose(): void {
    this.#dissolve?.dispose();
  }
}
