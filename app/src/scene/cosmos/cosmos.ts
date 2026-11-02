// The cosmos on the stage (ADR-0002 §3 and §10; frames 1 to 8, 16, 17): gno.land's great star and the Earth, a star a namespace, the view at
// rest's bodies (7d6). The camera stays at the origin and looks at the Earth, so the disc and each body come to it, and a frame writes only
// that. A look runs off the frame, past a step of the eye: it stands the bodies and writes the disc.
import {
  distanceOf,
  Drawn,
  Ladder,
  systemsOf,
  toMap,
  type ClearBox,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import { Disposer } from "../disposer.ts";
import { focalOf } from "../lens.ts";
import type { EarthDevice } from "../earth/device.ts";
import { Ahead } from "./ahead.ts";
import { Bodies } from "./bodies.ts";
import { Disc } from "./disc.ts";
import { Home } from "./home.ts";
import { BodyMaps } from "./maps.ts";
import { AtRest } from "./atRest.ts";
import { heldOf, type CosmosWorld } from "./cosmosWorld.ts";
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
  readonly #drawn = new Drawn();
  readonly #eye = { x: NaN, y: NaN, z: NaN };
  readonly #looked = { x: NaN, y: NaN, z: NaN };
  readonly #mapEye = { x: 0, y: 0, z: 0 };
  // Where the eye rests, the view at rest's way off the scene's, less the arrival's glide and the sway: what says it is at rest.
  readonly #resting = { x: NaN, y: NaN, z: NaN };
  readonly #restingMap = { x: NaN, y: NaN, z: NaN };
  readonly #atRest = new AtRest(() => {
    this.#mapCame();
    this.#device.moved();
  });
  #box: ClearBox | undefined;
  #systems: readonly StarSystem[] = [];
  #ladder: Ladder | undefined;
  #list: readonly CosmosWorld[] | undefined;
  #wanted = false;
  #looks = 0;
  #focal = 1;
  #height = 1;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #release: ReturnType<typeof setTimeout> | undefined;

  constructor(device: EarthDevice) {
    this.#device = device;
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
    this.#setShown(false);
    device.stage.add(this.#nebulae.group, this.#disc.group, this.#bodies.group);
  }

  #setShown(shown: boolean): void {
    this.#wanted = shown;
    this.#disc.group.visible = shown && this.#ahead.done;
    this.#bodies.show(shown);
    this.#nebulae.show(shown);
    if (!shown) this.#whole.hide();
  }

  readonly #mapCame = (): void => {
    this.#looked.x = NaN;
    this.#askLook();
  };

  /** Stands `worlds` and the fixed places, or takes it all off the stage; `written`, the file's time, ages its calls. Asked again with the
   * same list, it only comes back. */
  show(worlds: readonly CosmosWorld[] | undefined, written?: string): void {
    this.#setShown(worlds !== undefined);
    clearTimeout(this.#release);
    if (worlds === undefined) {
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

  /** Comes to system `id` (7d3), or back to the view at rest: `go` is told the scene's eye that stands the eye at its arrival. */
  arrive(id: string | undefined, go: (eye: Point) => void): void {
    this.#atRest.arrive(id, go);
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
    this.#bodies.view({ width: this.#height * aspect, height: this.#height, focal: this.#focal, box: this.#box });
    this.#looked.x = NaN;
  }

  /** One frame on: the eye, in doubles, and the clock everything orbits by. The eye sways about the view at rest's, and the camera keeps
   * the Earth at the centre. */
  tick(eye: Point, seconds: number, resting: Point = eye): void {
    if (!this.#wanted) return;
    this.#atRest.place(eye, seconds, this.#eye);
    this.#atRest.place(resting, 0, this.#resting);
    this.#atRest.aim(this.#device.camera, this.#eye);
    this.#disc.advance(this.#eye, seconds);
    this.#bodies.tick(this.#eye, seconds);
    this.#home.tick(this.#eye, seconds, this.#device.camera.quaternion);
    // What the eye looks at, the Earth or a system it came to: its distance says how much of the nebulae and of the whole cosmos shows.
    const looking = distanceOf(this.#atRest.looked, this.#eye);
    this.#nebulae.follow(eye, seconds, looking);
    // Past a cluster's distance the worlds' points take the view at one distance: the disc gives up faster than they come, and the
    // bodies, which cannot fade, go as they start.
    const whole = this.#whole.advance(this.#eye, seconds, looking);
    this.#disc.fade((1 - whole) ** 2, this.#ahead.done);
    this.#bodies.group.visible = whole === 0;
    if (!(distanceOf(this.#eye, this.#looked) < this.#whole.step)) this.#askLook();
  }

  #askLook(): void {
    if (this.#timer === undefined) this.#timer = setTimeout(this.#look);
  }

  readonly #look = (): void => {
    this.#timer = undefined;
    const ladder = this.#ladder;
    if (!this.#wanted || ladder === undefined || Number.isNaN(this.#eye.x)) return;
    Object.assign(this.#looked, this.#eye);
    this.#looks += 1;
    toMap(this.#eye, this.#mapEye);
    ladder.look({ eye: this.#mapEye, focal: this.#focal, focus: this.#atRest.focus }, this.#drawn);
    this.#whole.look(this.#mapEye, this.#focal);
    toMap(this.#resting, this.#restingMap);
    const sight = { eye: this.#mapEye, focal: this.#focal, resting: this.#restingMap };
    const { bodies, close, ...worlds } = this.#atRest.drawn(this.#systems, sight, this.#drawn);
    this.#bodies.stand(bodies, close);
    this.#disc.paint({
      ...sight,
      ...worlds,
      systems: this.#systems,
      ladder,
      drawn: this.#drawn,
      isBody: (id) => this.#bodies.has(id),
      inView: (place, radius) => this.#bodies.inView(place, radius, this.#eye),
      shows: (place, radius) => this.#bodies.shows(place, radius, this.#eye),
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
    this.#atRest.stop();
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
      ...this.#bodies.stats(shown, this.#eye, this.#home.at),
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
      eye: { ...this.#eye },
      web: this.#whole.stats(),
    };
  }
}
