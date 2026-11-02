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
import type { PerspectiveCamera } from "three";
import type { Wanted } from "./bodies.ts";

const loadSearch = () => import("./restSearch.ts");
type Searched = Awaited<ReturnType<typeof loadSearch>>;
const NONE: Wanted = new Map();
const NO_POINT = () => 0;
const NO_PLANE = () => undefined;
const WHOLE = () => 1;
// Until the view has come, and away from it, the great star's halo alone is needed: it is the first of the systems.
const GREAT_STAR = (system: number) => system === 0;
// The eye stands at the view at rest within a mouse's lean (3 units each way, eye.ts) and its sway; away from it, the cosmos draws as
// anywhere (Alexis, 2026-11-02: depth everywhere).
const REST_REACH = 5;

// Anywhere but at rest: the worlds the ladder stands as bodies, each large enough on screen to tell from a point, its others whole points.
function everywhere(systems: readonly StarSystem[], drawn: Drawn): Wanted {
  const wanted = new Map<string, readonly [StarSystem, StarSystem["worlds"][number]]>();
  for (let at = 0; at < drawn.bodyCount; at += 1) {
    const system = systems[drawn.bodySystems[at] ?? -1];
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
  readonly #found: () => void;
  #view = plainRest();
  #postcards: ReadonlyMap<number, Postcard> = new Map();
  #searched: Searched | undefined;
  #eye: InstanceType<Searched["RestEye"]> | undefined;
  #asked = 0;

  /** `found` is told once a file's view has come. */
  constructor(found: () => void) {
    this.#found = found;
    toScene(EARTH_PLACE, this.earth);
  }

  /** Looks for `systems`' view; a later search wins. The eye stays where it rests till the view has come, so it moves once (7d6's
   * review: it went back to the plain view first); a list with no world is no view. A chunk that does not come leaves no body. */
  search(systems: readonly StarSystem[]): void {
    this.#view = { ...this.#view, postcards: [], close: undefined };
    this.#postcards = new Map();
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
        this.#eye.rest(view);
        this.#found();
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

  /** Turns `camera` to the Earth from `eye`; the scene's own turn stands until the view has come. */
  aim(camera: PerspectiveCamera, eye: Point): void {
    this.#eye?.aim(camera, eye);
  }

  /** The worlds that stand as bodies from `sight`, the close world's id, how large each system's worlds stand as points, whose halos the
   * view needs and the plane a postcard's points turn in: the view at rest's where the eye rests (`resting`, on the map, the eye less the
   * arrival's glide and the sway), the ladder's `drawn` anywhere else. */
  drawn(systems: readonly StarSystem[], sight: { eye: Point; focal: number; resting: Point }, drawn: Drawn) {
    const searched = this.#searched;
    const [{ eye }, { resting }] = [this.#view, sight];
    if (searched !== undefined && Math.hypot(resting.x - eye.x, resting.y - eye.y, resting.z - eye.z) > REST_REACH)
      return {
        bodies: everywhere(systems, drawn),
        close: undefined,
        pointShare: WHOLE,
        needsHalo: GREAT_STAR,
        planeOf: NO_PLANE,
      };
    const postcards = this.#postcards;
    return {
      bodies: searched?.restBodies(systems, { view: this.#view, postcards }, sight) ?? NONE,
      close: searched?.closeId(systems, this.#view),
      pointShare: searched?.pointShares(this.#view) ?? NO_POINT,
      needsHalo: searched?.haloNeeds(this.#view) ?? GREAT_STAR,
      planeOf: (system: number) => postcards.get(system)?.system,
    };
  }
}
