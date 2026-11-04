// The view at rest once its chunk and a file came (7d6), in that chunk: the Earth's view, its eye fixed (part 7x2; Alexis, 2026-11-04),
// the eye that rests and sways at it, what it draws, a system's arrival in its place and the sun's beat (7d3). The cosmos's AtRest holds
// only what was asked before it came, and the home's dive. The Earth's stations and scenery are drawn by a chunk of their own (earthView).
import {
  earthEye,
  HOME,
  LENT,
  toMap,
  type Drawn,
  type Rock,
  type Point,
  type Postcard,
  type RestView,
  type StarSystem,
} from "@gnoworld/core";
import type { PerspectiveCamera } from "three";
import type { EarthDevice } from "../earth/device.ts";
import type { Asking } from "./restArrival.ts";
import { Beat } from "./restBeat.ts";
import { drawnFrom } from "./restBodies.ts";
import { RestEye } from "./restEye.ts";

// A system's dynamic view's rocks (7v) are laid in a chunk of their own once it has come.
const loadRocks = () => import("./restRocks.ts");
// The Earth's view: no postcard, the eye fixed.
const EARTH_VIEW: RestView = { eye: earthEye(), postcards: [] };
const NONE: ReadonlyMap<number, Postcard> = new Map();

export class Resting {
  readonly #found: () => void;
  readonly #eye: RestEye;
  readonly #beat = new Beat();
  // Where the eye rests, neither swayed nor diving, on the stage and on the map: what says the view's bodies stand.
  readonly #resting = { x: NaN, y: NaN, z: NaN };
  readonly #restingMap = { x: NaN, y: NaN, z: NaN };
  /** The view at rest: the scene's own at its home till a file came, then the Earth's. */
  view: RestView;
  #systems: readonly StarSystem[] = [];
  #asking: Asking | undefined;
  // A system's dynamic view's rocks (7v), once the depth's chunk laid them for the landing it came to.
  #viewRocks: readonly Rock[] = [];

  /** `found` is told once a file's view has come, or a system's arrival; `device`'s eye is the one a flight turns (7g). Till then the view is
   * the scene's own, at its home. */
  constructor(found: () => void, device: Pick<EarthDevice, "eye">) {
    this.#found = found;
    this.#eye = new RestEye(device);
    const eye = { x: NaN, y: NaN, z: NaN };
    toMap(HOME, eye);
    this.view = { eye, postcards: [] };
  }

  /** Takes the Earth's view over `systems`, then comes to what `asking` names, if anything. */
  rest(systems: readonly StarSystem[], asking: Asking | undefined): void {
    this.view = EARTH_VIEW;
    this.#systems = systems;
    this.#eye.rest(this.view);
    this.#found();
    this.arrive(asking);
  }

  /** A new file is looked for: an arrival is looked for among `systems`. */
  clear(systems: readonly StarSystem[]): void {
    this.#systems = systems;
  }

  /** Comes to what `asking` names, or nowhere once the cosmos is gone: a later ask wins. */
  arrive(asking: Asking | undefined): void {
    this.#asking = asking;
    if (asking !== undefined) this.#eye.arrive(this.#systems, asking, this.#came);
  }

  // The eye moved to `asking`'s arrival: the scene is told, unless it was asked again since, or the cosmos is gone; a dynamic view's rocks
  // are laid once the depth's chunk comes, a Plan has none.
  readonly #came = (asking: Asking, to: Point): void => {
    if (asking !== this.#asking) return;
    const landing = this.#eye.landing;
    asking.go(to, landing?.lens, this.#eye.gliding);
    this.#found();
    this.#viewRocks = [];
    const postcard = landing?.postcards.get(landing.index);
    if (landing === undefined || landing.plan !== undefined || postcard === undefined) return;
    loadRocks().then(
      ({ rocksOfView }) => {
        if (this.#eye.landing !== landing) return;
        this.#viewRocks = rocksOfView({ eye: landing.view.eye, look: landing.look, postcard }, LENT);
        this.#found();
      },
      () => undefined,
    );
  };

  /** What the eye looks at, on the stage and on the map: the Earth, or what a system's arrival looks at. */
  get looked(): Point {
    return this.#eye.looked;
  }

  get focus(): Point {
    return this.#eye.focus;
  }

  /** The eye `seconds` on, from the scene's `eye`, into `out`, and where it rests. */
  place(eye: Point, seconds: number, out: { x: number; y: number; z: number }): void {
    this.#eye.place(eye, seconds, out);
    this.#eye.place(eye, 0, this.#resting);
  }

  /** Turns `camera` from `eye` to what it looks at. */
  aim(camera: PerspectiveCamera, eye: Point): void {
    this.#eye.aim(camera, eye);
  }

  /** How much the great star lifts its light on the sun's beat, a frame `seconds` on the worlds' clock, from a file written at `written`. */
  lift(written: string | undefined, seconds: number): number {
    return this.#beat.lift(written, seconds);
  }

  /** What is drawn from `sight`: the view at rest's, or the arrival's, where the eye rests at it, the ladder's `drawn` anywhere else. */
  drawn(systems: readonly StarSystem[], sight: { eye: Point; focal: number }, drawn: Drawn) {
    toMap(this.#resting, this.#restingMap);
    const landing = this.#eye.landing;
    const shown =
      landing === undefined ? { view: this.view, postcards: NONE, index: 0 } : { ...landing, rocks: this.#viewRocks };
    return drawnFrom(systems, { shown, drawn }, { ...sight, resting: this.#restingMap });
  }
}
