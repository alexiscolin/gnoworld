// The view at rest in the cosmos (slice 7d6): its search, its eye and what it draws come in a chunk of their own once a file does. Until
// then the eye rests where the scene's does, which looks at the Earth straight ahead, and no world stands, as a body or as a point. A
// system's arrival (7d3) is drawn the same way: its postcard in place of the view's, the camera on what the arrival looks at.
import {
  EARTH_PLACE,
  HOME,
  toMap,
  toScene,
  type Drawn,
  type Point,
  type Postcard,
  type RestView,
  type StarSystem,
} from "@gnoworld/core";
import type { PerspectiveCamera } from "three";
import type { Asking, Landing } from "./restArrival.ts";

const loadSearch = () => import("./restSearch.ts");
type Searched = Awaited<ReturnType<typeof loadSearch>>;
// Until the view has come, no world stands, and the great star's halo alone is needed: it is the first of the systems.
const WAITING: ReturnType<Searched["drawnFrom"]> = {
  bodies: new Map(),
  close: undefined,
  pointShare: () => 0,
  needsHalo: (system: number) => system === 0,
  planeOf: () => undefined,
  main: 0,
  hidden: new Set(),
  near: false,
};

function plainRest(): RestView {
  const eye = { x: NaN, y: NaN, z: NaN };
  toMap(HOME, eye);
  return { eye, postcards: [], close: undefined };
}

export class AtRest {
  /** What the eye looks at, on the stage: the Earth, or what a system's arrival looks at. */
  readonly looked = { x: NaN, y: NaN, z: NaN };
  /** The same on the map, around which the ladder stands bodies. */
  focus: Point = EARTH_PLACE;
  #written = Number.NaN;
  #read = Number.NaN;
  readonly #found: () => void;
  #view = plainRest();
  #postcards: ReadonlyMap<number, Postcard> = new Map();
  #searched: Searched | undefined;
  #eye: InstanceType<Searched["RestEye"]> | undefined;
  #beat: InstanceType<Searched["Beat"]> | undefined;
  #asked = 0;
  #systems: readonly StarSystem[] = [];
  #asking: Asking | undefined;
  #landing: Landing | undefined;

  /** `found` is told once a file's view has come, or a system's arrival. */
  constructor(found: () => void) {
    this.#found = found;
    toScene(EARTH_PLACE, this.looked);
  }

  /** Comes to system `id`, or back to the view at rest with none or one the file does not hold: once its view is known, `go` is told the
   * scene's eye that stands the eye there, and again only if a new file moves it. A later ask wins. */
  arrive(id: string | undefined, go: (eye: Point) => void): void {
    this.#asking = { id, go };
    this.#land();
  }

  #land(): void {
    const asking = this.#asking;
    const landed = asking === undefined ? undefined : this.#eye?.arrive(this.#systems, asking);
    if (landed === undefined) return;
    if (landed.landing === undefined) this.#asking = undefined;
    this.#landing = landed.landing;
    this.focus = landed.focus;
    toScene(this.focus, this.looked);
    if (landed.moved) this.#found();
  }

  /** Gone: nothing on its way moves the eye. */
  stop(): void {
    this.#asked += 1;
    this.#asking = undefined;
  }

  /** Looks for `systems`' view; a later search wins. The eye stays where it rests till the view has come, so it moves once (7d6's
   * review: it went back to the plain view first); a list with no world is no view. A chunk that does not come leaves no body. */
  search(systems: readonly StarSystem[]): void {
    this.#view = { ...this.#view, postcards: [], close: undefined };
    this.#postcards = new Map();
    this.#systems = systems;
    this.#asked += 1;
    const asked = this.#asked;
    if (!systems.some(({ worlds }) => worlds.length > 0)) return;
    loadSearch().then(
      (searched) => {
        if (asked !== this.#asked) return;
        const view = searched.restView(systems);
        this.#searched = searched;
        this.#eye ??= new searched.RestEye();
        this.#beat ??= new searched.Beat();
        this.#view = view;
        this.#postcards = searched.postcardsOf(systems, view);
        this.#eye.rest(view);
        this.#found();
        this.#land();
      },
      () => undefined,
    );
  }

  /** The eye `seconds` on, from the scene's `eye`, into `out`. */
  place(eye: Point, seconds: number, out: { x: number; y: number; z: number }): void {
    if (this.#eye !== undefined) this.#eye.place(eye, seconds, out);
    else {
      out.x = eye.x;
      out.y = eye.y;
      out.z = eye.z;
    }
  }

  /** The worlds' file's time, in milliseconds, which sets the sun's beat (none, no beat), and with a new one, when it was read. */
  set written(at: number) {
    if (at !== this.#written) this.#read = Date.now();
    this.#written = at;
  }

  /** How much the great star lifts its light on the sun's beat, a frame `seconds` on the worlds' clock (7d3). */
  lift(seconds: number): number {
    return this.#beat?.lift(this.#written, this.#read, seconds) ?? 0;
  }

  /** Turns `camera` from `eye` to what it looks at; the scene's own turn stands until the view has come. */
  aim(camera: PerspectiveCamera, eye: Point): void {
    this.#eye?.aim(camera, eye);
  }

  /** What is drawn from `sight`: the view at rest's, or the arrival's, where the eye rests at it, the ladder's `drawn` anywhere else. */
  drawn(systems: readonly StarSystem[], sight: { eye: Point; focal: number; resting: Point }, drawn: Drawn) {
    const shown = this.#landing ?? { view: this.#view, postcards: this.#postcards, index: 0 };
    return this.#searched?.drawnFrom(systems, { shown, drawn }, sight) ?? WAITING;
  }
}
