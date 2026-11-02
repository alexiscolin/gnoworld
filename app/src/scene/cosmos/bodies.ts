// The worlds drawn in full: the approved render, each from its look, at its size, around its star. A frame moves them and lights them from
// where their star stands on screen, always at the Earth's angle from the eye: a world is never a flat disc nor a black one.
import {
  asciiBytes,
  clearOf,
  orbitPlace,
  planetSeed,
  spreadAt,
  toScene,
  worldLook,
  type ClearBox,
  type Orbiter,
  type Point,
  type ScreenSpot,
  type StarSystem,
} from "@gnoworld/core";
import { Group, SphereGeometry, Vector3, type Camera } from "three";
import { Disposer } from "../disposer.ts";
import { angleAt, fromEyeOf, sideOf } from "../planet/light.ts";
import { createPlanet, LIMB_LIGHT, type Planet } from "../planet/planet.ts";
import type { BodyMaps } from "./maps.ts";

interface Body {
  readonly id: string;
  readonly system: StarSystem;
  readonly world: Orbiter;
  readonly planet: Planet;
  readonly at: Vector3;
  readonly star: Vector3;
  readonly sun: Vector3;
  readonly fromEye: number;
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
  readonly #camera: Camera;
  readonly #screen = new Vector3();
  readonly #ahead = new Vector3();
  readonly #spot = { x: 0, y: 0, radius: 0 };
  readonly group = new Group();
  #view: BodyView = { width: 1, height: 1, focal: 1, box: undefined };

  constructor(maps: BodyMaps, owner: Disposer, camera: Camera) {
    this.#maps = maps;
    this.#camera = camera;
    this.#sphere = owner.add(new SphereGeometry(1, SPHERE_WIDTH, SPHERE_HEIGHT));
  }

  get size(): number {
    return this.#held.size;
  }

  /** The screen, in the page's pixels, its lens, and the box of the page's text. */
  view(sight: BodyView): void {
    this.#view = sight;
  }

  has(id: string): boolean {
    return this.#held.has(id);
  }

  /** Keeps what `wanted` keeps, frees what it left, and stands what is new if its maps are here. */
  stand(wanted: Wanted): void {
    for (const [id, { planet }] of this.#held)
      if (!wanted.has(id)) {
        this.#held.delete(id);
        planet.group.removeFromParent();
        planet.dispose();
      }
    for (const [id, [system, world]] of wanted) if (!this.#held.has(id)) this.#add(id, system, world);
    this.#shown.length = 0;
    this.#shown.push(...this.#held.values());
  }

  #add(id: string, system: StarSystem, world: Orbiter): void {
    const look = worldLook(id);
    const set = this.#maps.setFor(look);
    if (set === undefined) return;
    const planet = createPlanet(look, set, this.#sphere);
    if (look.rim !== null) planet.setLimb(LIMB_LIGHT);
    this.group.add(planet.group);
    const fromEye = fromEyeOf(planetSeed(asciiBytes(`gno.land/r/${id}`)));
    this.#held.set(id, {
      id,
      system,
      world,
      planet,
      at: new Vector3(),
      star: new Vector3(),
      sun: new Vector3(),
      fromEye,
    });
  }

  /** One frame on: each where its orbit has it, from `eye`, in doubles. */
  tick(eye: Point, seconds: number): void {
    for (let at = 0; at < this.#shown.length; at += 1) {
      const body = this.#shown[at];
      if (body !== undefined) this.#pose(body, eye, seconds);
    }
  }

  #pose(body: Body, eye: Point, seconds: number): void {
    const { system, world, planet, at, star, sun, fromEye } = body;
    toScene(system.place, this.#onStage);
    star.set(this.#onStage.x - eye.x, this.#onStage.y - eye.y, this.#onStage.z - eye.z);
    const away = star.length();
    const spread = spreadAt(away);
    const { place } = system;
    orbitPlace(body, seconds, this.#place);
    this.#place.x = place.x + (this.#place.x - place.x) * spread;
    this.#place.z = place.z + (this.#place.z - place.z) * spread;
    toScene(this.#place, this.#onStage);
    at.set(this.#onStage.x - eye.x, this.#onStage.y - eye.y, this.#onStage.z - eye.z);
    planet.group.position.copy(at);
    this.#toEye.copy(at).negate().normalize();
    sun.subVectors(star, at).normalize();
    planet.setSun(sideOf(sun, this.#toEye, angleAt(fromEye, away)));
    planet.setTime(seconds);
    const room = this.#room(at, world.radius);
    planet.group.scale.setScalar(world.radius * room);
    planet.group.visible = room > 0;
  }

  #spotOf(at: Vector3, radius: number): ScreenSpot {
    const { width, height, focal } = this.#view;
    this.#screen.copy(at).project(this.#camera);
    this.#spot.x = ((this.#screen.x + 1) * width) / 2;
    this.#spot.y = ((1 - this.#screen.y) * height) / 2;
    this.#spot.radius = (radius * focal) / Math.max(-at.z, radius);
    return this.#spot;
  }

  // What the box of the page's text leaves of a body at `at`.
  #room(at: Vector3, radius: number): number {
    const { box } = this.#view;
    return box === undefined ? 1 : clearOf(this.#spotOf(at, radius), box);
  }

  /** How much of what stands at `place` on the map, from `eye`, the box of the page's text leaves. */
  shows(place: Point, eye: Point): number {
    const { box } = this.#view;
    if (box === undefined) return 1;
    toScene(place, this.#onStage);
    this.#ahead.set(this.#onStage.x - eye.x, this.#onStage.y - eye.y, this.#onStage.z - eye.z);
    return clearOf(this.#spotOf(this.#ahead, 0), box);
  }

  /** Where `at` stands on screen, for the journeys. */
  spotOf(at: Vector3, radius: number): ScreenSpot {
    const { x, y, radius: drawn } = this.#spotOf(at, radius);
    return { x, y, radius: drawn };
  }

  /** Frees them all: the maps stay, with their owner. */
  drop(): void {
    for (const { planet } of this.#held.values()) {
      planet.group.removeFromParent();
      planet.dispose();
    }
    this.#held.clear();
    this.#shown.length = 0;
  }

  /** What stands, for the journeys. */
  list() {
    return [...this.#held.values()].map(({ id, planet, at, star, sun }) => ({
      id,
      planet,
      anchor: planet.look.anchor,
      at,
      star,
      sun,
    }));
  }
}
