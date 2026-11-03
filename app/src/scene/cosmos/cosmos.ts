// The cosmos on the stage (ADR-0002 §3 and §10; frames 1 to 8, 16, 17): gno.land's great star and the Earth, a star a namespace, the view at
// rest's bodies (7d6). The camera stays at the origin and looks at the Earth, so the disc and each body come to it, and a frame writes only
// that. A look runs off the frame, past a step of the eye: it stands the bodies and writes the disc.
import { distanceOf, Drawn, EARTH_PLACE, Ladder, systemsOf, toMap, type ClearBox, type Point } from "@gnoworld/core";
import { Disposer } from "../disposer.ts";
import { focalOf } from "../lens.ts";
import type { EarthDevice } from "../earth/device.ts";
import { Ahead } from "./ahead.ts";
import { Bodies } from "./bodies.ts";
import { Disc } from "./disc.ts";
import { Home } from "./home.ts";
import { BodyMaps } from "./maps.ts";
import { AtRest } from "./atRest.ts";
import { callersOf, heldOf, type CosmosWorld, type LabelSignals } from "./cosmosWorld.ts";
import type { CosmosLabels, Seen } from "./labelled.ts";
import { LazyNebulae } from "./lazyNebulae.ts";
import { Whole } from "./whole.ts";

const RELEASE_MS = 5 * 60_000;

export class Cosmos {
  readonly #device: EarthDevice;
  readonly #owner = new Disposer();
  readonly #disc: Disc;
  readonly #maps: BodyMaps;
  readonly #bodies: Bodies;
  readonly #home: Home;
  readonly #ahead: Ahead;
  readonly #nebulae: LazyNebulae;
  readonly #whole: Whole;
  /** Its labels, once the scene's door stood them (parts.ts): this chunk carries only their calls, and theirs imports nothing of it. */
  labels: Pick<CosmosLabels, "list" | "look" | "tick"> | undefined;
  /** What its labels read of it. */
  readonly seen: Seen;
  readonly #drawn = new Drawn();
  readonly #looked = { x: NaN, y: NaN, z: NaN };
  readonly #mapEye = { x: 0, y: 0, z: 0 };
  readonly #atRest: AtRest;
  #box: ClearBox | undefined;
  #systems: ReturnType<typeof systemsOf> = [];
  #ladder: Ladder | undefined;
  #list: readonly CosmosWorld[] | undefined;
  #wanted = false;
  // How much of it the dive lets show, as the last frame found it: a compile that ends between frames shows no more.
  #shown = 1;
  #looks = 0;
  #focal = 1;
  #height = 1;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #release: ReturnType<typeof setTimeout> | undefined;

  constructor(device: EarthDevice) {
    this.#device = device;
    this.#atRest = new AtRest(device, this.#owner, this.#mapCame);
    this.#disc = new Disc(this.#owner);
    this.#maps = new BodyMaps(device, this.#mapCame);
    this.#bodies = new Bodies(this.#maps, this.#owner, device);
    this.#home = new Home(device, this.#bodies.group);
    this.#nebulae = new LazyNebulae(device, this.#owner);
    this.#ahead = new Ahead(device, this.#disc.group, () => {
      this.#setShown(this.#wanted);
      this.#device.moved();
    });
    this.#whole = new Whole(device, this.#owner, this.#mapCame);
    this.seen = { projector: this.#bodies, earth: () => this.#home.at, earthRadius: this.#home.radius, callersOf };
    this.#setShown(false);
    device.stage.add(this.#nebulae.group, this.#disc.group, this.#bodies.group);
  }

  #setShown(shown: boolean): void {
    this.#wanted = shown;
    this.#disc.group.visible = shown && this.#ahead.done && this.#shown > 0;
    this.#bodies.show(shown && this.#shown === 1);
    this.#nebulae.show(shown);
    if (!shown) this.#whole.hide();
  }

  readonly #mapCame = (): void => {
    this.#looked.x = NaN;
    this.#askLook();
  };

  /** Stands `worlds` and the fixed places, or takes it all off the stage; `written`, the file's time, ages its calls; `signals`, what is
   * known of the worlds now, names them. Asked again with the same list, it only comes back. */
  show(worlds: readonly CosmosWorld[] | undefined, written?: string, signals?: LabelSignals): void {
    this.labels?.list(worlds, signals);
    this.#setShown(worlds !== undefined);
    clearTimeout(this.#release);
    if (worlds === undefined) {
      this.#atRest.land();
      this.#release = setTimeout(this.#releaseMaps, RELEASE_MS);
      return;
    }
    if (worlds !== this.#list) {
      this.#list = worlds;
      this.#systems = systemsOf(heldOf(worlds));
      this.#ladder = new Ladder(this.#systems);
      this.#atRest.search(this.#systems);
    }
    this.#whole.stand({ systems: this.#systems, worlds, written });
    this.#looked.x = NaN;
    this.#ahead.ask();
    this.#home.stand();
    this.#device.moved();
  }

  /** The home opens with the dive (7d7), from the whole cosmos down to the view at rest; `still`, a dissolve, no camera moving. */
  dive(still: boolean): void {
    this.#atRest.dive(still);
    this.#whole.open();
  }

  /** The canvas's height in its CSS pixels, and the pixels to one of them. */
  resize(height: number, ratio: number): void {
    this.#height = height;
    this.#whole.resize(ratio);
    this.#focal = focalOf(this.#device.camera, height);
    this.#disc.resize(this.#focal, ratio);
    this.#frame();
  }

  /** The box of the page's text, in its pixels: nothing stands under it. */
  keepClear(box: ClearBox | undefined): void {
    this.#box = box;
    this.#frame();
  }

  #frame(): void {
    const { aspect } = this.#device.camera;
    this.#bodies.sight = { width: this.#height * aspect, height: this.#height, focal: this.#focal, box: this.#box };
    this.#looked.x = NaN;
  }

  /** One frame on: the eye, in doubles, the clock everything orbits by, and the scene's own, which runs under reduced motion too. The eye
   * sways about the view at rest's, or dives down to it, and the camera keeps the Earth at the centre. */
  tick(eye: Point, seconds: number, clock = seconds): void {
    if (!this.#wanted) return;
    this.#shown = this.#atRest.advance(clock, this.#whole.ready);
    const placed = this.#atRest.stand(eye, seconds, this.#device.camera);
    this.#disc.advance(placed, seconds);
    this.#bodies.tick(placed, seconds);
    this.#home.tick(placed, seconds, this.#device.camera.quaternion);
    // What the eye looks at is the Earth: its distance says how much of the nebulae shows, and how much of the view is the whole cosmos's.
    const looking = distanceOf(this.#atRest.earth, placed);
    this.#nebulae.group.visible = this.#shown > 0;
    this.#nebulae.follow(eye, seconds, looking);
    // Past a cluster's distance the worlds' points take the view at one distance: the disc gives up faster than they come, and the
    // bodies, which cannot fade, go as they start.
    this.#whole.most = this.#shown;
    const whole = this.#whole.advance(placed, seconds, looking);
    this.#disc.fade((1 - whole) ** 2 * this.#shown, this.#ahead.done);
    this.#bodies.group.visible = whole === 0 && this.#shown === 1;
    this.labels?.tick(placed, this.#bodies.group.visible);
    if (!(distanceOf(placed, this.#looked) < this.#whole.step)) this.#askLook();
  }

  #askLook(): void {
    if (this.#timer === undefined) this.#timer = setTimeout(this.#look);
  }

  readonly #look = (): void => {
    this.#timer = undefined;
    const ladder = this.#ladder;
    const placed = this.#atRest.eye;
    if (!this.#wanted || ladder === undefined || Number.isNaN(placed.x)) return;
    Object.assign(this.#looked, placed);
    this.#looks += 1;
    toMap(placed, this.#mapEye);
    ladder.look({ eye: this.#mapEye, focal: this.#focal, focus: EARTH_PLACE }, this.#drawn);
    this.#whole.look(this.#mapEye, this.#focal);
    const sight = { eye: this.#mapEye, focal: this.#focal };
    const { bodies, close, ...worlds } = this.#atRest.drawn(this.#systems, sight, this.#drawn);
    this.#bodies.stand(bodies, close);
    this.labels?.look(this.#systems, this.#drawn, bodies.keys());
    this.#disc.paint({
      ...sight,
      ...worlds,
      systems: this.#systems,
      ladder,
      drawn: this.#drawn,
      isBody: (id) => this.#bodies.has(id),
      inView: (place, radius) => this.#bodies.inView(place, radius, placed),
      shows: (place, radius) => this.#bodies.shows(place, radius, placed),
    });
    this.#device.moved();
  };

  // Five minutes covered: bodies, their maps and the cosmos's own Earth go; the way back stands them again.
  readonly #releaseMaps = (): void => {
    this.#bodies.drop();
    this.#maps.free();
    this.#nebulae.free();
    this.#home.drop();
  };

  /** A context came back: a closed bitmap cannot be uploaded twice, so bodies, maps and the Earth come again. */
  restored(): void {
    this.#releaseMaps();
    this.#looked.x = NaN;
    if (this.#wanted) this.#home.stand();
  }

  dispose(): void {
    this.#setShown(false);
    clearTimeout(this.#timer);
    clearTimeout(this.#release);
    this.#releaseMaps();
    this.#disc.group.removeFromParent();
    this.#bodies.group.removeFromParent();
    this.#owner.dispose();
  }

  /** What stands, for the journeys. */
  stats() {
    const shown = this.#wanted;
    return {
      shown,
      ...this.#bodies.stats(shown, this.#atRest.eye, this.#home.at),
      stars: shown ? this.#drawn.starCount : 0,
      glows: shown ? this.#drawn.glowCount : 0,
      ...this.#disc.stats(shown),
      maps: this.#maps.size,
      looks: this.#looks,
      earth: this.#home.stood,
      nebulae: shown ? this.#nebulae.stats().sheets : 0,
      // Counted from the systems it holds, apart from the hero's count of the file (7d6's review).
      worlds: this.#systems.reduce((sum, { worlds }) => sum + worlds.length, 1),
      // Where the eye stands on the stage: the scene's, moved to the view at rest's and swayed.
      eye: { ...this.#atRest.eye },
      web: this.#whole.stats(),
      sky: this.#nebulae.follows(),
      dive: this.#atRest.landing,
    };
  }
}
