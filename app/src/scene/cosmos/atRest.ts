// The view at rest in the cosmos (slice 7d6): its search, its eye and what it draws come in a chunk of their own once a file does. Until
// then the eye rests where the scene's does, which looks at the Earth straight ahead, and no world stands, as a body or as a point.
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
import type { PerspectiveCamera, Scene as Stage } from "three";
import type { Disposer } from "../disposer.ts";
import type { Wanted } from "./bodies.ts";

const loadSearch = () => import("./restSearch.ts");
type Searched = Awaited<ReturnType<typeof loadSearch>>;
type Still = ReturnType<Searched["closeSystemOf"]>;
// The close world's system as its worlds turn, held still, by its index; any other as it is.
const heldBy = (still: Still) => (system: number) => (system === still?.index ? still.system : undefined);
const NONE: Wanted = new Map();
const NO_POINT = () => 0;
const WHOLE = () => 1;
// Until the view has come, and away from it, the great star's halo alone is needed: it is the first of the systems.
const GREAT_STAR = (system: number) => system === 0;
// The eye stands at the view at rest within a mouse's lean (3 units each way, eye.ts) and its sway; away from it, the cosmos draws as
// anywhere (Alexis, 2026-11-02: depth everywhere).
const REST_REACH = 5;

// Anywhere but at rest: the worlds the ladder stands as bodies, each large enough on screen to tell from a point, its others whole points;
// the close world's system held still.
function everywhere(systems: readonly StarSystem[], drawn: Drawn, still: Still): Wanted {
  const wanted = new Map<string, readonly [StarSystem, StarSystem["worlds"][number]]>();
  for (let at = 0; at < drawn.bodyCount; at += 1) {
    const index = drawn.bodySystems[at] ?? -1;
    const system = index === still?.index ? still.system : systems[index];
    const world = system?.worlds[drawn.bodyWorlds[at] ?? -1];
    if (system !== undefined && world !== undefined) wanted.set(world.id, [system, world]);
  }
  return wanted;
}

function plainRest(): RestView {
  const eye = { x: NaN, y: NaN, z: NaN };
  toMap(HOME, eye);
  return { eye, postcards: [], close: undefined };
}

export class AtRest {
  /** Where the Earth stands on the stage. */
  readonly earth = { x: NaN, y: NaN, z: NaN };
  /** Where the eye stands on the stage this frame: the scene's, moved to the view at rest's and swayed, or on its way down to it. */
  readonly eye = { x: NaN, y: NaN, z: NaN };
  // Where it rests, neither swayed nor diving, on the stage and on the map: what says the view at rest's bodies stand.
  readonly #resting = { x: NaN, y: NaN, z: NaN };
  readonly #restingMap = { x: NaN, y: NaN, z: NaN };
  readonly #found: () => void;
  readonly #device: { readonly stage: Stage; readonly moved: () => void };
  readonly #owner: Disposer;
  // The page's seconds when the worlds arrived: the dive's start, or its giving up (the review of 7d9: they turn from it).
  #arrival = 0;
  /** The worlds' clock this frame: the seconds since they arrived, which their orbits, the sway and the Earth's turn run by. */
  since = 0;
  #view = plainRest();
  #postcards: ReadonlyMap<number, Postcard> = new Map();
  #closeSystem: Still;
  #searched: Searched | undefined;
  #eye: InstanceType<Searched["RestEye"]> | undefined;
  #asked = 0;
  // The home's dive (7d7): asked, still or not, until it lands or is given up. Its code comes with the view at rest's, asked with it.
  #still: boolean | undefined;
  #dive: InstanceType<Searched["Dive"]> | undefined;

  /** On the device's stage, owned by `owner`; `found` is told once a file's view has come, and a frame asked. */
  constructor(device: { readonly stage: Stage; readonly moved: () => void }, owner: Disposer, found: () => void) {
    this.#device = device;
    this.#owner = owner;
    this.#found = found;
    toScene(EARTH_PLACE, this.earth);
  }

  /** The home opens with the dive, from the whole cosmos down to the view at rest; `still`, under reduced motion, a dissolve instead. */
  dive(still: boolean): void {
    this.#still = still;
    loadSearch().then(
      ({ Dive }) => {
        if (this.#still !== undefined) this.#dive ??= this.#owner.add(new Dive(this.#device.stage, still));
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
    dive.advance(clock, ready && this.#searched !== undefined);
    if (dive.along === 1 && dive.veil === 0) this.#still = undefined;
    return dive.shown;
  }

  /** How far the dive is, 1 at rest, and how much of its dissolve still shows. */
  get landing() {
    return { along: this.#still === undefined ? 1 : (this.#dive?.along ?? 0), veil: this.#dive?.veil ?? 0 };
  }

  /** Looks for `systems`' view; a later search wins. The eye stays where it rests till the view has come, so it moves once (7d6's
   * review: it went back to the plain view first); a list with no world is no view. A chunk that does not come leaves no body. */
  search(systems: readonly StarSystem[]): void {
    this.#view = { ...this.#view, postcards: [], close: undefined };
    this.#postcards = new Map();
    this.#closeSystem = undefined;
    this.#asked += 1;
    const asked = this.#asked;
    if (!systems.some(({ worlds }) => worlds.length > 0)) return;
    loadSearch().then(
      (searched) => {
        if (asked !== this.#asked) return;
        const view = searched.restView(systems);
        this.#searched = searched;
        this.#eye ??= new searched.RestEye();
        this.#view = view;
        this.#postcards = searched.postcardsOf(systems, view);
        this.#closeSystem = searched.closeSystemOf(systems, view);
        this.#eye.rest(view);
        this.#found();
        this.#device.moved();
      },
      () => undefined,
    );
  }

  /** Stands the eye `seconds` on from the scene's `eye`, and turns `camera` to the Earth from it; the scene's own turn stands until the
   * view has come. Gives the eye it stood. */
  stand(eye: Point, seconds: number, camera: PerspectiveCamera): Point {
    this.since = seconds - this.#arrival;
    this.#place(eye, this.since, this.eye);
    this.#place(eye, 0, this.#resting);
    if (this.#still !== undefined) this.#dive?.dived(this.#view.eye, this.eye);
    this.#eye?.aim(camera, this.eye);
    return this.eye;
  }

  #place(eye: Point, seconds: number, out: { x: number; y: number; z: number }): void {
    if (this.#eye !== undefined) this.#eye.place(eye, seconds, out);
    else {
      out.x = eye.x;
      out.y = eye.y;
      out.z = eye.z;
    }
  }

  /** The worlds that stand as bodies from `sight`, how large each system's worlds stand as points, whose halos the view needs, a system
   * as its points turn (a postcard's plane opened, the close world's system held still) and the close world's system's index: the view at
   * rest's where the eye rests, neither swayed nor diving, the ladder's `drawn` anywhere else. */
  drawn(systems: readonly StarSystem[], sight: { eye: Point; focal: number }, drawn: Drawn) {
    const [searched, still] = [this.#searched, this.#closeSystem];
    const [held, index] = [heldBy(still), still?.index];
    if (this.#offRest())
      return {
        bodies: everywhere(systems, drawn, still),
        pointShare: WHOLE,
        needsHalo: GREAT_STAR,
        planeOf: held,
        still: index,
      };
    const postcards = this.#postcards;
    return {
      bodies: searched?.restBodies({ postcards, still }, sight) ?? NONE,
      pointShare: searched?.pointShares(this.#view) ?? NO_POINT,
      needsHalo: searched?.haloNeeds(this.#view) ?? GREAT_STAR,
      planeOf: (system: number) => postcards.get(system)?.system ?? held(system),
      still: index,
    };
  }

  // Whether the eye rests past a mouse's lean and the sway off the view at rest's, once it came: there the cosmos draws as anywhere.
  #offRest(): boolean {
    const [{ eye }, resting] = [this.#view, this.#restingMap];
    toMap(this.#resting, resting);
    const off = Math.hypot(resting.x - eye.x, resting.y - eye.y, resting.z - eye.z) > REST_REACH;
    return this.#searched !== undefined && off;
  }
}
