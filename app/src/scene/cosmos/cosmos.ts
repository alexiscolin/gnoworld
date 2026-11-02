// The cosmos on the stage (ADR-0002 §3 and §10; frames 1 to 8, 16, 17): gno.land's great star and the Earth, a star a namespace, worlds as
// the ladder says. The camera stays at the origin, so the disc and each body come to it, and a frame writes only that. A look runs off the
// frame, past a step of the eye: it stands the bodies and writes the disc.
import {
  CENTRE,
  Drawn,
  EARTH_RADIUS,
  focusOf,
  Ladder,
  systemsOf,
  toMap,
  type ClearBox,
  type Orbiter,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import { Vector3 } from "three";
import { Disposer } from "../disposer.ts";
import type { EarthDevice } from "../earth/device.ts";
import { Bodies } from "./bodies.ts";
import { Disc } from "./disc.ts";
import { Home } from "./home.ts";
import { BodyMaps } from "./maps.ts";

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
  readonly #drawn = new Drawn();
  readonly #eye = { x: NaN, y: NaN, z: NaN };
  readonly #looked = { x: NaN, y: NaN, z: NaN };
  readonly #mapEye = { x: 0, y: 0, z: 0 };
  readonly #focus = { x: 0, y: 0, z: 0 };
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
    this.#bodies = new Bodies(this.#maps, this.#owner, device.camera);
    this.#home = new Home(device, this.#bodies.group);
    this.#setShown(false);
    device.stage.add(this.#disc.group, this.#bodies.group);
  }

  #setShown(shown: boolean): void {
    this.#wanted = shown;
    this.#disc.group.visible = shown;
    this.#bodies.group.visible = shown;
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
      this.#systems = systemsOf(
        worlds.map((world) => ({ id: world.id, namespace: world.namespace, use: usageOf(world) })),
      );
      this.#ladder = new Ladder(this.#systems);
    }
    this.#looked.x = NaN;
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

  /** One frame on: the eye, in doubles, and the clock everything orbits by. */
  tick(eye: Point, seconds: number): void {
    if (!this.#wanted) return;
    this.#eye.x = eye.x;
    this.#eye.y = eye.y;
    this.#eye.z = eye.z;
    this.#disc.advance(eye, seconds);
    this.#bodies.tick(eye, seconds);
    this.#home.tick(eye, seconds);
    if (!(Math.hypot(eye.x - this.#looked.x, eye.y - this.#looked.y, eye.z - this.#looked.z) < STEP)) this.#askLook();
  }

  #askLook(): void {
    if (this.#timer === undefined) this.#timer = setTimeout(this.#look);
  }

  readonly #look = (): void => {
    this.#timer = undefined;
    const ladder = this.#ladder;
    if (!this.#wanted || ladder === undefined || Number.isNaN(this.#eye.x)) return;
    this.#looked.x = this.#eye.x;
    this.#looked.y = this.#eye.y;
    this.#looked.z = this.#eye.z;
    this.#looks += 1;
    toMap(this.#eye, this.#mapEye);
    focusOf(this.#mapEye, this.#focus);
    ladder.look({ eye: this.#mapEye, focal: this.#focal, focus: this.#focus }, this.#drawn);
    this.#bodies.stand(this.#wantedBodies());
    this.#disc.paint({
      systems: this.#systems,
      ladder,
      drawn: this.#drawn,
      eye: this.#mapEye,
      focal: this.#focal,
      isBody: (id) => this.#bodies.has(id),
      shows: (place, radius) => this.#bodies.shows(place, radius, this.#eye),
    });
    this.#device.moved();
  };

  #wantedBodies(): Map<string, readonly [StarSystem, Orbiter]> {
    const wanted = new Map<string, readonly [StarSystem, Orbiter]>();
    for (let at = 0; at < this.#drawn.bodyCount; at += 1) {
      const system = this.#systems[this.#drawn.bodySystems[at] ?? -1];
      const world = system?.worlds[this.#drawn.bodyWorlds[at] ?? -1];
      if (system !== undefined && world !== undefined) wanted.set(world.id, [system, world]);
    }
    return wanted;
  }

  readonly #releaseMaps = (): void => {
    this.#bodies.drop();
    this.#maps.free();
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
    const { x, y, z } = this.#eye;
    const earth = this.#home.at;
    const list = this.#bodies.list();
    const spot = (at: Vector3, radius: number) => this.#bodies.spotOf(at, radius);
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
      screen: {
        sun: spot(new Vector3(CENTRE.x - x, CENTRE.y - y, CENTRE.z - z), 0),
        earth: earth === undefined ? undefined : spot(earth, EARTH_RADIUS),
        bodies: list.flatMap(({ at, planet }) => (planet.group.visible ? [spot(at, planet.group.scale.x)] : [])),
      },
    };
  }
}
