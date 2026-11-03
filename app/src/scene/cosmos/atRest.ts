// The view at rest in the cosmos (slice 7d6): its search, its eye and what it draws come in a chunk of their own once a file does, with a
// system's arrival and the sun's beat (7d3, `Resting`); this holds what is asked before they come. Until a view has come the eye rests
// where the scene's does, which looks at the Earth straight ahead, and no world stands, as a body or as a point.
import { EARTH_PLACE, toScene, type Drawn, type Point, type StarSystem } from "@gnoworld/core";
import type { PerspectiveCamera } from "three";
import type { Asking } from "./restArrival.ts";

const loadSearch = () => import("./restSearch.ts");
type Resting = InstanceType<Awaited<ReturnType<typeof loadSearch>>["Resting"]>;
// Until the view has come, no world stands, and the great star's halo alone is needed: it is the first of the systems.
const WAITING: ReturnType<Resting["drawn"]> = {
  bodies: new Map(),
  close: undefined,
  pointShare: () => 0,
  needsHalo: (system: number) => system === 0,
  planeOf: () => undefined,
  main: 0,
  hidden: new Set(),
  near: false,
};

export class AtRest {
  /** The worlds' file's time, which sets the sun's beat (none, no beat). */
  written: string | undefined;
  readonly #earth = { x: NaN, y: NaN, z: NaN };
  readonly #found: () => void;
  #rest: Resting | undefined;
  #asked = 0;
  #asking: Asking | undefined;

  /** `found` is told once a file's view has come, or a system's arrival. */
  constructor(found: () => void) {
    this.#found = found;
    toScene(EARTH_PLACE, this.#earth);
  }

  /** Comes to system `id`, or back to the view at rest with none or one the file does not hold: once its view is known, `go` is told the
   * scene's eye that stands the eye there, and again only if a new file moves it. A later ask wins. */
  arrive(id: string | undefined, go: (eye: Point) => void): void {
    this.#asking = { id, go };
    this.#rest?.arrive(this.#asking);
  }

  /** Gone: nothing on its way moves the eye. */
  stop(): void {
    this.#asked += 1;
    this.#asking = undefined;
    this.#rest?.arrive(undefined);
  }

  /** Looks for `systems`' view; a later search wins. The eye stays where it rests till the view has come, so it moves once (7d6's
   * review: it went back to the plain view first); a list with no world is no view. A chunk that does not come leaves no body. */
  search(systems: readonly StarSystem[]): void {
    this.#rest?.clear(systems);
    this.#asked += 1;
    const asked = this.#asked;
    if (!systems.some(({ worlds }) => worlds.length > 0)) return;
    loadSearch().then(
      ({ Resting }) => {
        if (asked !== this.#asked) return;
        (this.#rest ??= new Resting(this.#found)).rest(systems, this.#asking);
      },
      () => undefined,
    );
  }

  /** The eye `seconds` on, from the scene's `eye`, into `out`. */
  place(eye: Point, seconds: number, out: { x: number; y: number; z: number }): void {
    if (this.#rest !== undefined) this.#rest.place(eye, seconds, out);
    else {
      out.x = eye.x;
      out.y = eye.y;
      out.z = eye.z;
    }
  }

  /** How much the great star lifts its light on the sun's beat, a frame `seconds` on the worlds' clock (7d3). */
  lift(seconds: number): number {
    return this.#rest?.lift(this.written, seconds) ?? 0;
  }

  /** Turns `camera` from `eye` to what it looks at; the scene's own turn stands until the view has come. */
  aim(camera: PerspectiveCamera, eye: Point): void {
    this.#rest?.aim(camera, eye);
  }

  /** What the eye looks at, on the stage: the Earth, or what a system's arrival looks at. */
  get looked(): Point {
    return this.#rest?.looked ?? this.#earth;
  }

  /** The same on the map, around which the ladder stands bodies. */
  get focus(): Point {
    return this.#rest?.focus ?? EARTH_PLACE;
  }

  /** What is drawn from `sight`: the view at rest's, or the arrival's, where the eye rests at it, the ladder's `drawn` anywhere else. */
  drawn(systems: readonly StarSystem[], sight: { eye: Point; focal: number; resting: Point }, drawn: Drawn) {
    return this.#rest?.drawn(systems, sight, drawn) ?? WAITING;
  }
}
