// The worlds drawn in full: the approved render, each from its look, at its size, around its star. A frame moves them and lights them from
// where their star stands on screen, always at the Earth's angle from the eye: a world is never a flat disc nor a black one.
import {
  CENTRE,
  EARTH_RADIUS,
  clearOf,
  leanFor,
  orbitTime,
  orbitPlace,
  planetSeed,
  toScene,
  worldLook,
  worldPath,
  type ClearBox,
  type Orbiter,
  type Point,
  type ScreenSpot,
  type StarSystem,
} from "@gnoworld/core";
import { Euler, Group, Quaternion, SphereGeometry, Vector3 } from "three";
import { Disposer } from "../disposer.ts";
import type { EarthDevice } from "../earth/device.ts";
import { fromEyeOf } from "../planet/light.ts";
import { createPlanet, type Planet } from "../planet/planet.ts";
import { angleAt, fadeAt, limbAt, sideOf } from "./far.ts";
import type { BodyMaps } from "./maps.ts";

interface Body {
  readonly id: string;
  // As the look that wants it has it: a postcard's plane and orbit at rest, its own anywhere else.
  system: StarSystem;
  world: Orbiter;
  readonly planet: Planet;
  readonly at: Vector3;
  readonly star: Vector3;
  readonly sun: Vector3;
  readonly fromEye: number;
  /** Its programs are compiled: until then it waits off the screen. */
  ready: boolean;
  /** It holds its place at rest: the close world, whose turn would sweep it across the view. */
  still: boolean;
}

interface BodyView {
  readonly width: number;
  readonly height: number;
  readonly focal: number;
  readonly box: ClearBox | undefined;
}

/** The worlds a look wants, by id. */
export type Wanted = ReadonlyMap<string, readonly [StarSystem, Orbiter]>;

const SPHERE_WIDTH = 64;
const SPHERE_HEIGHT = 48;

export class Bodies {
  readonly #maps: BodyMaps;
  readonly #held = new Map<string, Body>();
  readonly #shown: Body[] = [];
  readonly #sphere: SphereGeometry;
  readonly #place = { x: 0, y: 0, z: 0 };
  readonly #onStage = { x: 0, y: 0, z: 0 };
  readonly #toEye = new Vector3();
  readonly #device: EarthDevice;
  readonly #screen = new Vector3();
  readonly #ahead = new Vector3();
  readonly #spot = { x: 0, y: 0, radius: 0, depth: 0 };
  readonly #back = new Quaternion();
  readonly #seen = new Vector3();
  readonly #lean = new Euler(); // no pole towards the eye, a ring open 30 degrees at most, whatever the camera's turn
  readonly group = new Group();
  #last: Point | undefined;
  #seconds = 0;
  /** The screen, in the page's pixels, its lens, and the box of the page's text: the cosmos sets it, the labels read it. */
  sight: BodyView = { width: 1, height: 1, focal: 1, box: undefined };

  constructor(maps: BodyMaps, owner: Disposer, device: EarthDevice) {
    this.#maps = maps;
    this.#device = device;
    this.#sphere = owner.add(new SphereGeometry(1, SPHERE_WIDTH, SPHERE_HEIGHT));
  }

  get size(): number {
    return this.#held.size;
  }

  has(id: string): boolean {
    return this.#held.has(id);
  }

  /** Keeps what `wanted` keeps, frees what it left, and stands what is new if its maps are here; `still` holds its place. */
  stand(wanted: Wanted, still?: string): void {
    for (const [id, body] of this.#held)
      if (!wanted.has(id)) {
        this.#held.delete(id);
        this.#free(body);
      }
    for (const [id, [system, world]] of wanted) {
      const held = this.#held.get(id);
      if (held === undefined) this.#add(id, system, world);
      else Object.assign(held, { system, world });
    }
    for (const body of this.#held.values()) body.still = body.id === still;
    this.#shown.length = 0;
    this.#shown.push(...this.#held.values());
    if (this.#last !== undefined) this.tick(this.#last, this.#seconds);
  }

  #add(id: string, system: StarSystem, world: Orbiter): void {
    const look = worldLook(id);
    const set = this.#maps.setFor(look);
    if (set === undefined) return;
    const planet = createPlanet(look, set, this.#sphere);
    this.group.add(planet.group);
    const fromEye = fromEyeOf(planetSeed(worldPath(id)));
    const [at, star, sun] = [new Vector3(), new Vector3(), new Vector3()];
    const body: Body = { id, system, world, planet, at, star, sun, fromEye, ready: false, still: false };
    this.#held.set(id, body);
    // Compiled before it shows: a first-time compile on a frame stalls the arrival (three's guide, mistake 10).
    const { renderer, camera, stage, moved } = this.#device;
    const ready = () => {
      body.ready = true;
      moved();
    };
    renderer.compileAsync(planet.group, camera, stage).then(ready, ready);
  }

  /** One frame on: each where its orbit has it, from `eye`, in doubles, leant as the camera sees it. */
  tick(eye: Point, seconds: number): void {
    this.#last = eye;
    this.#seconds = seconds;
    this.#back.copy(this.#device.camera.quaternion).invert();
    for (let at = 0; at < this.#shown.length; at += 1) {
      const body = this.#shown[at];
      if (body !== undefined) this.#pose(body, eye, seconds);
    }
  }

  #pose(body: Body, eye: Point, seconds: number): void {
    const { system, world, planet, at, star, sun, fromEye } = body;
    const away = this.fromEye(system.place, eye, star).length();
    orbitPlace(body, body.still ? 0 : orbitTime(seconds), this.#place);
    planet.group.position.copy(this.fromEye(this.#place, eye, at));
    this.#toEye.copy(at).negate().normalize();
    sun.subVectors(star, at).normalize();
    planet.setSun(sideOf(sun, this.#toEye, angleAt(fromEye, away)));
    planet.setTime(seconds);
    if (planet.look.rim !== null) planet.setLimb(limbAt(away));
    planet.setFar(fadeAt(at.length()));
    const room = this.#room(at, world.radius);
    planet.group.scale.setScalar(world.radius * room);
    planet.group.visible = body.ready && room > 0;
    const seen = this.#seen.copy(at).applyQuaternion(this.#back); // as the camera, turned to the Earth, sees it
    this.#lean.set(leanFor(planet.look.lean, Math.atan2(seen.y, -seen.z)), 0, planet.look.tilt);
    planet.group.quaternion.setFromEuler(this.#lean).premultiply(this.#device.camera.quaternion);
  }

  /** Where a round thing at `at` from the eye, `radius` units across, stands on screen, and its depth along the view: in a record kept
   * here, read at once (the labels' projector, 7h). */
  seen(at: Vector3, radius: number): ScreenSpot & { readonly depth: number } {
    const { width, height, focal } = this.sight;
    const { camera } = this.#device;
    this.#screen.copy(at).project(camera);
    this.#spot.x = ((this.#screen.x + 1) * width) / 2;
    this.#spot.y = ((1 - this.#screen.y) * height) / 2;
    // Its depth along the view, the camera turned to the Earth.
    const depth = -this.#ahead.copy(at).applyQuaternion(this.#back.copy(camera.quaternion).invert()).z;
    this.#spot.depth = depth;
    this.#spot.radius = (radius * focal) / Math.max(depth, radius);
    return this.#spot;
  }

  // What the box of the page's text leaves of a body at `at`.
  #room(at: Vector3, radius: number): number {
    const { box } = this.sight;
    return box === undefined ? 1 : clearOf(this.seen(at, radius), box);
  }

  /** `place` on the map, from `eye` on the stage, into `out` (the labels' stars too, 7h). */
  fromEye(place: Point, eye: Point, out: Vector3): Vector3 {
    toScene(place, this.#onStage);
    return out.set(this.#onStage.x - eye.x, this.#onStage.y - eye.y, this.#onStage.z - eye.z);
  }

  /** How much of what stands at `place` on the map, `radius` pixels wide, from `eye`, the box of the page's text leaves. */
  shows(place: Point, radius: number, eye: Point): number {
    const { box } = this.sight;
    return box === undefined ? 1 : clearOf({ ...this.seen(this.fromEye(place, eye, this.#ahead), 0), radius }, box);
  }

  /** Whether a round thing at `place` on the map, `radius` units across, shows on the screen from `eye`. */
  inView(place: Point, radius: number, eye: Point): boolean {
    const { x, y, radius: size, depth } = this.seen(this.fromEye(place, eye, this.#ahead), radius);
    const { width, height } = this.sight;
    return depth > 0 && x + size > 0 && x - size < width && y + size > 0 && y - size < height;
  }

  /** Where `at` stands on screen, for the journeys. */
  spotOf(at: Vector3, radius: number): ScreenSpot {
    const { x, y, radius: drawn } = this.seen(at, radius);
    return { x, y, radius: drawn };
  }

  /** A body's object on the stage, by its world's id: where it stands and how large, for its label. */
  anchorOf(id: string): Group | undefined {
    return this.#held.get(id)?.planet.group;
  }

  // Hidden as it goes: whatever still points at its object (a label) sees it gone.
  #free({ planet }: Body): void {
    planet.group.visible = false;
    planet.group.removeFromParent();
    planet.dispose();
  }

  /** Frees them all: the maps stay, with their owner. */
  drop(): void {
    for (const body of this.#held.values()) this.#free(body);
    this.#held.clear();
    this.#shown.length = 0;
  }

  /** Where the great star, the Earth at `earth` and each body shown stand on screen, from `eye`, for the journeys. */
  screen({ x, y, z }: Point, earth: Vector3 | undefined) {
    return {
      sun: this.spotOf(new Vector3(CENTRE.x - x, CENTRE.y - y, CENTRE.z - z), 0),
      earth: earth === undefined ? undefined : this.spotOf(earth, EARTH_RADIUS),
      bodies: [...this.#held.values()].flatMap(({ id, at, planet }) =>
        planet.group.visible ? [{ ...this.spotOf(at, planet.group.scale.x), id, away: at.length() }] : [],
      ),
    };
  }

  /** What stands, for the journeys. */
  list() {
    return [...this.#held.values()].map((body) => ({ ...body, anchor: body.planet.look.anchor }));
  }
}
