// The view at rest once its chunk and a file's view came (7d6), in that chunk: the view the core found, its postcards, the eye that rests and
// sways at it, what it draws, a system's arrival in its place and the sun's beat (7d3). The cosmos's AtRest holds only what was asked before
// it came.
import {
  HOME,
  restView,
  toMap,
  type Drawn,
  type Point,
  type Postcard,
  type RestView,
  type StarSystem,
} from "@gnoworld/core";
import type { PerspectiveCamera } from "three";
import type { Asking } from "./restArrival.ts";
import { Beat } from "./restBeat.ts";
import { drawnFrom, postcardsOf } from "./restBodies.ts";
import { RestEye } from "./restEye.ts";

export class Resting {
  readonly #found: () => void;
  readonly #eye = new RestEye();
  readonly #beat = new Beat();
  #view: RestView;
  #postcards: ReadonlyMap<number, Postcard> = new Map();
  #systems: readonly StarSystem[] = [];
  #asking: Asking | undefined;

  /** `found` is told once a file's view has come, or a system's arrival. Till then the view is the scene's own, at its home. */
  constructor(found: () => void) {
    this.#found = found;
    const eye = { x: NaN, y: NaN, z: NaN };
    toMap(HOME, eye);
    this.#view = { eye, postcards: [], close: undefined };
  }

  /** Takes `systems`' view, then comes to what `asking` names, if anything. */
  rest(systems: readonly StarSystem[], asking: Asking | undefined): void {
    this.#view = restView(systems);
    this.#postcards = postcardsOf(systems, this.#view);
    this.#systems = systems;
    this.#eye.rest(this.#view);
    this.#found();
    this.arrive(asking);
  }

  /** A new file is looked for: no postcard stands till its view comes, and an arrival is looked for among `systems`. */
  clear(systems: readonly StarSystem[]): void {
    this.#view = { ...this.#view, postcards: [], close: undefined };
    this.#postcards = new Map();
    this.#systems = systems;
  }

  /** Comes to what `asking` names, or nowhere once the cosmos is gone: a later ask wins. */
  arrive(asking: Asking | undefined): void {
    this.#asking = asking;
    if (asking !== undefined) this.#eye.arrive(this.#systems, asking, this.#came);
  }

  // The eye moved to `asking`'s arrival: the scene is told, unless it was asked again since, or the cosmos is gone.
  readonly #came = (asking: Asking, to: Point): void => {
    if (asking !== this.#asking) return;
    asking.go(to);
    this.#found();
  };

  /** What the eye looks at, on the stage and on the map: the Earth, or what a system's arrival looks at. */
  get looked(): Point {
    return this.#eye.looked;
  }

  get focus(): Point {
    return this.#eye.focus;
  }

  /** The eye `seconds` on, from the scene's `eye`, into `out`. */
  place(eye: Point, seconds: number, out: { x: number; y: number; z: number }): void {
    this.#eye.place(eye, seconds, out);
  }

  /** Turns `camera` from `eye` to what it looks at. */
  aim(camera: PerspectiveCamera, eye: Point): void {
    this.#eye.aim(camera, eye);
  }

  /** How much the great star lifts its light on the sun's beat, a frame `seconds` on the worlds' clock, from a file written at `written`. */
  lift(written: string | undefined, seconds: number): number {
    return this.#beat.lift(written, seconds);
  }

  /** What is drawn from `sight`: the view at rest's, or the arrival's, where the eye rests at it (`resting`, on the map, the eye less the
   * arrival's glide and the sway), the ladder's `drawn` anywhere else. */
  drawn(systems: readonly StarSystem[], sight: { eye: Point; focal: number; resting: Point }, drawn: Drawn) {
    const shown = this.#eye.landing ?? { view: this.#view, postcards: this.#postcards, index: 0 };
    return drawnFrom(systems, { shown, drawn }, sight);
  }
}
