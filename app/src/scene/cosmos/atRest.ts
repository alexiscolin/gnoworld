// The view at rest in the cosmos (slice 7d6): its search, its eye and what it draws come in a chunk of their own once a file does, with a
// system's arrival and the sun's beat (7d3, `Resting`); this holds what is asked before they come, and the home's dive (7d7), whose code
// comes with them. Until a view has come the eye rests where the scene's does, which looks at the Earth straight ahead, and no world
// stands, as a body or as a point.
import { EARTH_PLACE, HOME, toMap, toScene, type Drawn, type Point, type StarSystem } from "@gnoworld/core";
import type { PerspectiveCamera, Scene as Stage } from "three";
import type { Disposer } from "../disposer.ts";
import type { EarthDevice } from "../earth/device.ts";
import type { Asking } from "./restArrival.ts";

const loadSearch = () => import("./restSearch.ts");
type Searched = Awaited<ReturnType<typeof loadSearch>>;
type Resting = InstanceType<Searched["Resting"]>;
// Until the view has come, no world stands, and the great star's halo alone is needed: it is the first of the systems.
const WAITING: ReturnType<Resting["drawn"]> = {
  bodies: new Map(),
  pointShare: () => 0,
  needsHalo: (system: number) => system === 0,
  planeOf: () => undefined,
  still: undefined,
  limb: () => 1,
  main: 0,
  hidden: new Set(),
  near: false,
};

// The stage it draws on, a frame owed, the scene's eye as a flight leaves it, the dissolve the flights lend the dive (7g), and the canvas,
// which tells the page the dive landed.
type AtRestDevice = { readonly stage: Stage; readonly moved: () => void } & Pick<EarthDevice, "eye" | "veil"> & {
    readonly renderer?: Pick<EarthDevice["renderer"], "domElement">;
  };

export class AtRest {
  /** Where the eye stands on the stage this frame: the scene's, moved to the view at rest's and swayed, or on its way down to it. */
  readonly eye = { x: NaN, y: NaN, z: NaN };
  /** The worlds' file's time, which sets the sun's beat (none, no beat). */
  written: string | undefined;
  readonly #earth = { x: NaN, y: NaN, z: NaN };
  // Where the scene's eye rests, on the map: the dive comes down to it till a view has come.
  readonly #home = { x: NaN, y: NaN, z: NaN };
  readonly #found: () => void;
  readonly #device: AtRestDevice;
  readonly #owner: Disposer;
  // The page's seconds when the worlds arrived: the dive's start, or its giving up (the review of 7d9: they turn from it).
  #arrival = 0;
  /** The worlds' clock this frame: the seconds since they arrived, which their orbits, the sway and the Earth's turn run by. */
  since = 0;
  #rest: Resting | undefined;
  #asked = 0;
  #asking: Asking | undefined;
  // The home's dive (7d7): asked, still or not, until it lands or is given up. Its code comes with the view at rest's, asked with it.
  #still: boolean | undefined;
  #dive: InstanceType<Searched["Dive"]> | undefined;

  /** On the device's stage, owned by `owner`; `found` is told once a file's view has come, or a system's arrival, and a frame asked. */
  constructor(device: AtRestDevice, owner: Disposer, found: () => void) {
    this.#device = device;
    this.#owner = owner;
    this.#found = found;
    owner.add(this);
    toScene(EARTH_PLACE, this.#earth);
    toMap(HOME, this.#home);
  }

  /** The home opens with the dive, from the whole cosmos down to the view at rest; `still`, under reduced motion, a dissolve instead. */
  dive(still: boolean): void {
    this.#still = still;
    loadSearch().then(
      ({ Dive }) => {
        if (this.#still !== undefined) this.#dive ??= this.#owner.add(new Dive(this.#device, still));
        this.#device.moved();
      },
      // A chunk that does not come leaves no view to dive to.
      () => {
        this.#still = undefined;
      },
    );
  }

  /** The home went (the review of 7d7): the dive lands at once, and nothing of it stays on the stage the other pages draw on. */
  land(): void {
    this.#still = undefined;
    this.#dive?.dispose();
  }

  /** A frame at `clock`, the page at `seconds`, the whole cosmos `ready` to take the view or not: how much of the cosmos shows, none while
   * the dive waits. Once its code came, each frame asks the next, its last among them, which takes away what it drew; a chunk on its way
   * asks none. */
  advance(clock: number, ready: boolean, seconds: number): number {
    if (this.#still === undefined) return 1;
    // Till the dive starts or gives up, its frame is the worlds' arrival.
    if (this.#dive?.waiting ?? true) this.#arrival = seconds;
    const dive = this.#dive;
    if (dive === undefined) return 0;
    this.#device.moved();
    dive.advance(clock, ready && this.#rest !== undefined);
    if (dive.along === 1) this.#landed(dive.veil);
    return dive.shown;
  }

  // The camera at rest, or under reduced motion the dissolve begun: the page's opening gives way (ADR-0003 §1), told by the canvas; the dive
  // ends once its dissolve's picture went.
  #landed(veil: number): void {
    this.#device.renderer?.domElement?.setAttribute("data-dive", "landed");
    if (veil === 0) this.#still = undefined;
  }

  /** Whether the dive runs: the bodies pass behind the page's text on the way down at their own size, as frame 1's do behind the hero's
   * number (the chief, 2026-11-03); at rest the text keeps its room. */
  get diving(): boolean {
    return this.#still !== undefined;
  }

  /** How far the dive is, 1 at rest, and how much of its dissolve still shows. */
  get landing() {
    return { along: this.#still === undefined ? 1 : (this.#dive?.along ?? 0), veil: this.#dive?.veil ?? 0 };
  }

  /** Comes to system `id`, or back to the view at rest with none or one the file does not hold: once its view is known, `go` is told the
   * scene's eye that stands the eye there, and again only if a new file moves it. A later ask wins. */
  readonly arrive = (id: string | undefined, go: (eye: Point) => void): void => {
    this.#asking = { id, go };
    this.#rest?.arrive(this.#asking);
  };

  /** Gone with its owner: nothing on its way moves the eye. */
  dispose(): void {
    this.#asked += 1;
    this.#asking = undefined;
    this.#rest?.arrive(undefined);
  }

  /** Looks for `systems`' view; a later search wins. The eye stays where it rests till the view has come, so it moves once (7d6's
   * review: it went back to the plain view first); a list with no world is no view, though a flight still reads its stars (7g). A chunk
   * that does not come leaves no body. */
  search(systems: readonly StarSystem[]): void {
    this.#rest?.clear(systems);
    this.#asked += 1;
    const asked = this.#asked;
    loadSearch().then(
      (searched) => {
        if (asked !== this.#asked) return;
        searched.handSight(this.#device, systems, this);
        if (!systems.some((system) => system.worlds.length > 0)) return;
        (this.#rest ??= new searched.Resting(this.#found, this.#device)).rest(systems, this.#asking);
        this.#device.moved();
      },
      () => undefined,
    );
  }

  /** Stands the eye `seconds` on from the scene's `eye`, and turns `camera` from it to what it looks at; the scene's own turn stands until
   * the view has come. Gives the eye it stood. */
  stand(eye: Point, seconds: number, camera: PerspectiveCamera): Point {
    const rest = this.#rest;
    this.since = seconds - this.#arrival;
    if (rest !== undefined) rest.place(eye, this.since, this.eye);
    else {
      this.eye.x = eye.x;
      this.eye.y = eye.y;
      this.eye.z = eye.z;
    }
    if (this.#still !== undefined) this.#dive?.dived(rest?.view.eye ?? this.#home, this.eye);
    rest?.aim(camera, this.eye);
    return this.eye;
  }

  /** How much the great star lifts its light on the sun's beat, a frame `seconds` on the worlds' clock (7d3). */
  lift(seconds: number): number {
    return this.#rest?.lift(this.written, seconds) ?? 0;
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
  drawn(systems: readonly StarSystem[], sight: { eye: Point; focal: number }, drawn: Drawn) {
    return this.#rest?.drawn(systems, sight, drawn) ?? WAITING;
  }
}
