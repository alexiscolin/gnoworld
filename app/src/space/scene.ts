// The universe's engine (D401, docs/plans/dive.md): the dive's demo in the product, on the worlds' file. One renderer, one loop
// (stopped while hidden or covered), one rig that alone moves the camera; a page asks a place and hands its circle, and hears when
// the flight nears and lands; a click or a wheel asks a place back, which the page's address then asks of it.
import { PerspectiveCamera, Vector3, type WebGLRenderer } from "three";
import { usesOf, type CosmosWorld } from "./cosmosWorld.ts";
import { draw } from "./frame.ts";
import { arrivalOf, firstArrival, holdCircle, scans, slideFor } from "./framing.ts";
import { homeGoal, middleOf, planetGoal, screenOf, systemGoal, universeGoal, type Circle } from "./goals.ts";
import { enterHit, wireHands } from "./hands.ts";
import { labelOf, Labels } from "./labels.ts";
import { layoutOf, type Planet, type System, type Universe } from "./layout.ts";
import { hitOf } from "./pick.ts";
import { planetAt, sameAs, systemAt, type Place } from "./place.ts";
import { createRenderer } from "./renderer.ts";
import { REACH, Rig, type Goal } from "./rig/rig.ts";
import { chatHides } from "./motion.ts";
import { Stage } from "./stage.ts";
import { ratioOf } from "./view.ts";
import { Upkeep, type Plated } from "./upkeep.ts";
import { See } from "./see.ts";
import type { SpaceOptions } from "./spaceOptions.ts";

export type { SpaceEvents, SpaceOptions } from "./spaceOptions.ts";

export class Space {
  readonly renderer: WebGLRenderer;
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 100000);
  readonly rig = new Rig();
  readonly stage: Stage;
  readonly labels: Labels;
  readonly see = new See(this.camera);
  readonly options: SpaceOptions;
  universe: Universe | undefined;
  /** Where the camera is, or goes. */
  place: Place | undefined;
  /** The page's circle, while a page shows a planet. */
  circle: Circle | undefined;
  /** The loop's upkeep: what it keeps between frames, and what the page's calls tell it. */
  readonly keep = new Upkeep();
  /** Gone for good: its loop stops. */
  disposed = false;
  seconds = 0;
  #asked: Place | undefined;
  #file: readonly CosmosWorld[] = [];
  readonly #added: CosmosWorld[] = [];
  readonly #trip = { dived: false, from: new Vector3() };
  /** Whether the flight to the page's planet passed its 68 %. */
  neared = false;
  /** Whether space is seen from above (the Map, D433), at every level, or as it turns. */
  plan = false;
  /** The worlds a lens lights, by their ids (D425); none, every world. */
  lens: ReadonlySet<string> | undefined;
  readonly #leaving = new AbortController();
  #covered = false;

  constructor(options: SpaceOptions) {
    this.options = options;
    // Where the canvas draws two pixels to the page's one, its edges need no smoothing: the loop's cost and memory are the pixels'.
    this.renderer = createRenderer(options.canvas, ratioOf() < 2, options.inChat);
    this.renderer.setClearColor(0x010101, options.inChat === true ? 0 : 1);
    this.stage = new Stage({ base: options.base, still: options.still, bare: options.inChat });
    this.labels = new Labels(options.labels, {
      ...options,
      enter: (item) => {
        enterHit(options.events, hitOf(item));
      },
      name: (item) => labelOf(item, options.name),
    });
    wireHands(this, this.#leaving.signal);
    draw(this, this.#leaving.signal);
  }

  /** The worlds' file: the universe is laid out anew, and what was asked comes. */
  worlds(worlds: readonly CosmosWorld[]): void {
    this.touch();
    this.#file = worlds;
    this.#lay();
    if (this.#asked !== undefined) this.go(this.#asked);
  }

  // The universe of the file and of the worlds asked that it lacks, laid out and stood; the farthest a wheel takes the eye, all in view.
  #lay(): Universe {
    const universe = layoutOf(this.#file, this.#added);
    this.universe = universe;
    this.rig.reach = { near: REACH.near, far: REACH.far * universe.scale };
    this.stage.stand(universe, this);
    this.stage.links.stand(universe, usesOf(this.#file));
    this.labels.universe(universe);
    this.light(this.lens);
    return universe;
  }

  /** Lights the worlds `only` names, the rest dimming as the frame eases it (D425); none, every world. */
  light(only: ReadonlySet<string> | undefined): void {
    this.touch();
    this.lens = only;
    this.labels.light(only);
    if (this.universe !== undefined) this.stage.light(this.universe, only);
  }

  /** Whether a page covers space: it draws nothing then, and its loop sleeps till this goes. */
  get covered(): boolean {
    return this.#covered;
  }

  set covered(on: boolean) {
    this.#covered = on;
    if (!on) this.touch();
  }

  /** Space drawn under nothing: no page covers it, nor the full chat (features/chat/full.ts marks the root), unless the view is the chat's own. */
  get seen(): boolean {
    return !this.covered && (this.options.inChat === true || !chatHides());
  }

  /** Goes to `place`: flies there, the first time from far out to the home; stands there at once where the camera never stood or
   * space was out of sight (the full chat: a place changed under it is never flown to). True while a flight runs to it. */
  go(place: Place): boolean {
    this.touch();
    this.#asked = place;
    const universe = this.universe;
    if (universe === undefined || this.#there(place)) return this.rig.flying;
    this.place = place;
    this.neared = false;
    this.stage.effects.scan.play(undefined);
    const goal = this.#goalOf(place, universe);
    if (goal === undefined) return false;
    // The first place, the home's, is dived to from far out.
    if (!this.rig.placed && place.kind === "home" && !this.options.still() && !this.#trip.dived) {
      this.#trip.dived = true;
      this.rig.jump(universeGoal(universe.scale));
    }
    this.#trip.from.copy(this.rig.eye);
    // Flown where space is in sight, set there at once where it is not.
    this.rig[this.seen ? "fly" : "jump"](goal);
    slideFor(this, place);
    return this.rig.flying;
  }

  // A world a page shows that the file lacks (a realm too new for it, a system's realm): laid out as a planet of its own.
  #add(id: string) {
    this.#added.push({ id, namespace: id.split("/")[0] ?? id, realms: [] });
    return this.#lay().byId.get(id);
  }

  /** Whether the home shows its first screen (D459): the Earth close, in the circle its page lays out, not its system. */
  get arrival(): boolean {
    return arrivalOf(this);
  }

  // Whether the camera is at `place`, or flies there.
  #there(place: Place): boolean {
    return this.place !== undefined && sameAs(this.place, place) && (this.rig.flying || this.neared);
  }

  // The goal at `place` in the Map's view: on a page, from above, its circle holds the planet's system; `said` none, no arrival.
  #goalOf(
    place: Place,
    universe: Universe,
    said: Pick<Goal, "near" | "landed"> = { near: this.#near, landed: this.options.events.landed },
  ) {
    const { plan } = this;
    if (place.kind === "universe") return universeGoal(universe.scale, said, plan);
    const circle = () => this.circle ?? middleOf(this.see.screen);
    if (place.kind === "world") {
      const planet = universe.byId.get(place.id) ?? this.#add(place.id);
      if (planet === undefined) return undefined;
      if (plan) return systemGoal(planet.system, this.rig.pose.way, { plan, circle, screen: this.#screen, ...said });
      return planetGoal(planet, { circle, seconds: () => this.seconds, ...said });
    }
    const system = place.kind === "home" ? universe.home : universe.bySystem.get(place.id);
    if (system === undefined) return undefined;
    const seen = systemGoal(system, this.rig.pose.way, { plan, screen: this.#screen, ...said });
    return place.kind === "home" ? homeGoal(universe.earth, seen, this) : seen;
  }

  readonly #near = (): void => {
    this.neared = true;
    // The scan comes with the page: as the flight nears its end, never later; none for a hop, nor for the first arrival of a page opened from its
    // URL, whose scene comes in from black (features/universe/firstLook.ts).
    const { planet } = this;
    if (!firstArrival(this.options.canvas) && planet !== undefined && scans(planet, this.#trip.from, this.rig.eye))
      this.stage.effects.scan.play(planet.radius);
    this.options.events.near();
  };

  readonly #screen = () => screenOf(this.see.screen, this.circle);
  /** Views space from above (`plan`, the Map) or as it turns: the camera flies to the view asked, at every level; a world's page, already
   * shown, is not arrived at again; one hidden meanwhile (the full chat closed) is told the flight landed. A flight cut before it neared
   * (a world reached from the Map, which leaves it) still nears: the plate's fill and the page come with it. */
  view(plan: boolean): void {
    if (plan === this.plan) return;
    this.touch();
    this.plan = plan;
    const { place, universe, options, neared } = this;
    if (place === undefined || universe === undefined) return;
    const said = neared ? { landed: options.events.landed } : undefined;
    const goal = place.kind === "world" ? this.#goalOf(place, universe, said) : undefined;
    if (goal !== undefined) this.rig.fly(goal);
    else if (place.kind !== "world") {
      this.place = undefined;
      this.go(place);
    }
  }

  /** The page's plate, in the page's pixels, and where its words end: its fill is drawn behind the planet. */
  plate(box: Plated["box"], words: number): void {
    this.keep.plated = { box, words };
    this.touch();
    this.stage.plate.place(box, words, {
      width: this.see.screen.width,
      height: this.see.screen.height,
      ratio: this.renderer.getPixelRatio(),
    });
  }

  /** The plate again, where the buffer's pixel ratio changed under it. */
  replate(): void {
    const { plated } = this.keep;
    if (plated !== undefined) this.plate(plated.box, plated.words);
  }

  /** Tells the loop something changed that its numbers do not show: the next frame is drawn. */
  touch(): void {
    this.keep.touch();
  }

  /** The page's circle where its planet stands; none, no page planet. */
  hold(circle: Circle | undefined): void {
    this.touch();
    holdCircle(this, circle, (place, universe) => this.#goalOf(place, universe, {}));
  }

  /** The page's planet the camera is at, or goes to. */
  get planet(): Planet | undefined {
    return planetAt(this.universe, this.place);
  }

  /** The page's planet, while the camera keeps to it: none from above, where the Map's view of its system stands still. */
  get kept(): Planet | undefined {
    return this.plan ? undefined : this.planet;
  }

  /** The system the camera is in, or goes to. */
  get system(): System | undefined {
    return systemAt(this.universe, this.place);
  }

  dispose(): void {
    this.disposed = true;
    this.#leaving.abort();
    this.stage.dispose();
    this.labels.dispose();
    this.renderer.forceContextLoss();
    this.renderer.dispose();
  }
}
