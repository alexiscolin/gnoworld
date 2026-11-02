// The cosmos on the stage (ADR-0002 §3 and §10; frames 1 to 8, 16, 17): gno.land's great star and the Earth, a star a namespace, the view at
// rest's bodies (7d6). The camera stays at the origin and looks at the Earth, so the disc and each body come to it, and a frame writes only
// that. A look runs off the frame, past a step of the eye: it stands the bodies and writes the disc.
import {
  Drawn,
  EARTH_PLACE,
  Ladder,
  systemsOf,
  toMap,
  worldsDrawn,
  type ClearBox,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import { Disposer } from "../disposer.ts";
import type { EarthDevice } from "../earth/device.ts";
import { Ahead } from "./ahead.ts";
import { Bodies } from "./bodies.ts";
import { Disc } from "./disc.ts";
import { Home } from "./home.ts";
import { BodyMaps } from "./maps.ts";
import { AtRest } from "./atRest.ts";
import { LazyNebulae } from "./lazyNebulae.ts";

/** A world of the file: what the scene reads of it. */
export interface CosmosWorld {
  readonly id: string;
  readonly namespace: string;
  readonly realms: readonly { readonly callers: number | null }[];
}

// How far the eye moves before a look: a point's size is out by a few percent at most.
const STEP = 4;
const RELEASE_MS = 5 * 60_000;

const usageOf = ({ realms }: CosmosWorld): number =>
  realms.reduce((sum, { callers }) => sum + (callers ?? 0), realms.length);

export class Cosmos {
  readonly #device: EarthDevice;
  readonly #owner = new Disposer();
  readonly #disc: Disc;
  readonly #maps: BodyMaps;
  readonly #bodies: Bodies;
  readonly #home: Home;
  readonly #ahead: Ahead;
  readonly #nebulae: LazyNebulae;
  readonly #drawn = new Drawn();
  readonly #eye = { x: NaN, y: NaN, z: NaN };
  readonly #looked = { x: NaN, y: NaN, z: NaN };
  readonly #mapEye = { x: 0, y: 0, z: 0 };
  readonly #atRest = new AtRest(() => {
    this.#looked.x = NaN;
    this.#askLook();
    this.#device.moved();
  });
  #box: ClearBox | undefined;
  #systems: readonly StarSystem[] = [];
  #worlds = 1;
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
    this.#setShown(false);
    device.stage.add(this.#nebulae.group, this.#disc.group, this.#bodies.group);
  }

  #setShown(shown: boolean): void {
    this.#wanted = shown;
    this.#disc.group.visible = shown && this.#ahead.done;
    this.#bodies.group.visible = shown;
    this.#nebulae.show(shown);
  }

  readonly #mapCame = (): void => {
    this.#looked.x = NaN;
    this.#askLook();
  };

  /** Stands `worlds` and the fixed places, or takes it all off the stage. Asked again with the same list, it only comes back. */
  show(worlds: readonly CosmosWorld[] | undefined): void {
    this.#setShown(worlds !== undefined);
    clearTimeout(this.#release);
    if (worlds === undefined) {
      this.#release = setTimeout(this.#releaseMaps, RELEASE_MS);
      return;
    }
    if (worlds !== this.#list) {
      this.#list = worlds;
      const held = worlds.map((world) => ({ id: world.id, namespace: world.namespace, use: usageOf(world) }));
      this.#systems = systemsOf(held);
      this.#worlds = worldsDrawn(held);
      this.#ladder = new Ladder(this.#systems);
      this.#atRest.search(this.#systems);
    }
    this.#looked.x = NaN;
    this.#ahead.ask();
    this.#home.stand();
    this.#device.moved();
  }

  /** The canvas's height in its CSS pixels, and the pixels to one of them. */
  resize(height: number, ratio: number): void {
    this.#height = height;
    this.#focal = height / 2 / Math.tan((this.#device.camera.fov * Math.PI) / 360);
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
  tick(eye: Point, seconds: number): void {
    if (!this.#wanted) return;
    const { earth } = this.#atRest;
    this.#atRest.place(eye, seconds, this.#eye);
    this.#atRest.aim(this.#device.camera, this.#eye);
    this.#disc.advance(this.#eye, seconds);
    this.#bodies.tick(this.#eye, seconds);
    this.#home.tick(this.#eye, seconds, this.#device.camera.quaternion);
    // What the eye looks at is the Earth: its distance says how much of the nebulae shows.
    this.#nebulae.follow(eye, seconds, Math.hypot(earth.x - this.#eye.x, earth.y - this.#eye.y, earth.z - this.#eye.z));
    if (!(Math.hypot(this.#eye.x - this.#looked.x, this.#eye.y - this.#looked.y, this.#eye.z - this.#looked.z) < STEP))
      this.#askLook();
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
    ladder.look({ eye: this.#mapEye, focal: this.#focal, focus: EARTH_PLACE }, this.#drawn);
    const sight = { eye: this.#mapEye, focal: this.#focal };
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
    this.#home.drop();
    this.#looked.x = NaN;
    if (this.#wanted) this.#home.stand();
  }

  dispose(): void {
    this.#setShown(false);
    clearTimeout(this.#timer);
    clearTimeout(this.#release);
    this.#releaseMaps();
    this.#home.drop();
    this.#disc.group.removeFromParent();
    this.#bodies.group.removeFromParent();
    this.#owner.dispose();
  }

  /** What stands, for the journeys. */
  stats() {
    const shown = this.#wanted;
    const list = this.#bodies.list();
    return {
      shown,
      bodies: shown ? this.#bodies.size : 0,
      stars: shown ? this.#drawn.starCount : 0,
      glows: shown ? this.#drawn.glowCount : 0,
      dots: shown ? this.#disc.dotCount : 0,
      rocks: shown ? this.#disc.rocks : 0,
      maps: this.#maps.size,
      looks: this.#looks,
      dotPixels: shown ? this.#disc.dotPixels : 0,
      earth: this.#home.stood,
      list,
      screen: this.#bodies.screen(this.#eye, this.#home.at),
      nebulae: shown ? this.#nebulae.stats().sheets : 0,
      worlds: this.#worlds,
      // Where the eye stands on the stage: the scene's, moved to the view at rest's and swayed.
      eye: { ...this.#eye },
    };
  }
}
