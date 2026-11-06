// A world's rooms as moons (ADR-0002 §1 and §3), drawn: each on an orbit of its own from its room's name, slow, beside the world. A moon is
// shown where it stands clear of the plate's words and in front of the world, and its link with it; behind the world or over the plate, both
// go. What a frame runs writes into what is kept here: the spots and the casters are made when the moons change, never on a frame.
import { asciiBytes, planetSeed, seedShare } from "@gnoworld/core";
import { Group, Vector3, Vector4, type BufferGeometry, type Object3D } from "three";
import type { Kit } from "../cosmos/maps.ts";
import type { World } from "../planet/generated.ts";
import type { MapSet, Planet } from "../planet/planet.ts";

/** A room's moon as the page hands it: its size a share, and where the scene places its link. */
export interface MoonMark {
  readonly room: string;
  readonly size: number;
  place(x: number, y: number, shown: boolean): void;
}

export interface MoonSpot {
  readonly room: string;
  x: number;
  y: number;
  shown: boolean;
}

/** Where the page is: its screen through `project`, the plate's words' right edge, the world's centre and its radius on screen. */
export interface MoonSight {
  readonly project: (at: Vector3, into: Vector3) => Vector3;
  readonly words: number;
  readonly world: Object3D;
  readonly disc: number;
}

interface Moon {
  readonly mark: MoonMark;
  readonly planet: Planet;
  readonly reach: number;
  readonly lean: number;
  /** How steep its orbit stands, about the eye's axis: steep enough to pass over and under the world, clear of the plate and the dock. */
  readonly roll: number;
  readonly phase: number;
}

const FIRST_REACH = 1.35;
const STEP_REACH = 0.14;
const ROLL = [1.0, 1.3] as const;
const SPEED = 0.07;
const SMALLEST = 0.07;
const GROWTH = 0.11;
const CLEAR = 8;

const bytesOf = (room: string) => asciiBytes(encodeURIComponent(room));

/** A room's moon, as the generated worlds' `kit` draws it: rocky or icy, from its name. A name is ASCII once encoded. */
export function moonOf(kit: Kit, room: string): World {
  const bytes = bytesOf(room);
  return kit.bodyOf(bytes, seedShare(planetSeed(bytes), 0) < 0.5 ? "rocky" : "ice");
}

// A moon's orbit by its place among the moons, so two never share one, and by its room, so it is its own: the place a list gives, again when
// the list changes.
function orbitOf(room: string, index: number): Omit<Moon, "mark" | "planet"> {
  const seed = planetSeed(bytesOf(room));
  return {
    reach: FIRST_REACH + STEP_REACH * index,
    lean: (seedShare(seed, 1) - 0.5) * 0.7,
    roll: (index % 2 === 0 ? 1 : -1) * (ROLL[0] + (ROLL[1] - ROLL[0]) * seedShare(seed, 3)),
    phase: seedShare(seed, 2) * Math.PI * 2,
  };
}

export class OrbitingMoons {
  readonly group = new Group();
  readonly #sphere: BufferGeometry;
  readonly #kit: Kit;
  readonly #mapsOf: (world: World) => MapSet | undefined;
  readonly #at = new Vector3();
  readonly #screen = new Vector3();
  readonly #centre = new Vector3();
  readonly #scale = new Vector3();
  #marks: readonly MoonMark[] = [];
  #moons: Moon[] = [];
  spots: MoonSpot[] = [];
  casters: Vector4[] = [];

  constructor(sphere: BufferGeometry, kit: Kit, mapsOf: (world: World) => MapSet | undefined) {
    this.#sphere = sphere;
    this.#kit = kit;
    this.#mapsOf = mapsOf;
  }

  /** The moons to draw, in place of the last; one whose maps are not here yet waits for `retry`. */
  set(marks: readonly MoonMark[]): void {
    this.#marks = marks;
    const kept = new Map(this.#moons.map((moon) => [moon.mark.room, moon]));
    this.#moons = [];
    marks.forEach((mark, index) => {
      const held = kept.get(mark.room);
      kept.delete(mark.room);
      const moon = held === undefined ? this.#made(mark, index) : { ...held, ...orbitOf(mark.room, index), mark };
      if (moon !== undefined) this.#moons.push(moon);
    });
    for (const { planet } of kept.values()) this.#drop(planet);
    this.spots = this.#moons.map(({ mark }) => ({ room: mark.room, x: 0, y: 0, shown: false }));
    this.casters = this.#moons.map(() => new Vector4());
  }

  /** Asks the moons whose maps were missing again. */
  retry(): void {
    if (this.#moons.length < this.#marks.length) this.set(this.#marks);
  }

  #made(mark: MoonMark, index: number): Moon | undefined {
    const world = moonOf(this.#kit, mark.room);
    const maps = this.#mapsOf(world);
    if (maps === undefined) return undefined;
    const planet = this.#kit.createWorld(world, maps, this.#sphere);
    this.group.add(planet.group);
    return { mark, planet, ...orbitOf(mark.room, index) };
  }

  #drop(planet: Planet): void {
    planet.group.removeFromParent();
    planet.dispose();
  }

  /** Each moon where its orbit has it at `seconds`, lit by `sun`. */
  tick(seconds: number, sun: Vector3): void {
    for (let at = 0; at < this.#moons.length; at += 1) {
      const moon = this.#moons[at];
      if (moon === undefined) continue;
      const turn = moon.phase + (SPEED / moon.reach ** 1.5) * seconds;
      const { group } = moon.planet;
      const across = Math.cos(turn) * moon.reach;
      const deep = Math.sin(turn) * moon.reach;
      const up = -deep * Math.sin(moon.lean);
      const cos = Math.cos(moon.roll);
      const sin = Math.sin(moon.roll);
      group.position.set(across * cos - up * sin, across * sin + up * cos, deep * Math.cos(moon.lean));
      group.scale.setScalar(SMALLEST + GROWTH * moon.mark.size);
      moon.planet.setSun(sun);
      moon.planet.setTime(seconds);
    }
  }

  /** Where each moon falls on the page and whether it shows there, its link told; and each as a body that casts, in the stage's frame. */
  pose(sight: MoonSight): void {
    sight.world.getWorldPosition(this.#centre);
    const { x: centreX, y: centreY } = sight.project(this.#centre, this.#screen);
    for (let at = 0; at < this.#moons.length; at += 1) {
      const moon = this.#moons[at];
      const spot = this.spots[at];
      if (moon === undefined || spot === undefined) continue;
      const { group } = moon.planet;
      group.getWorldPosition(this.#at);
      this.casters[at]?.set(this.#at.x, this.#at.y, this.#at.z, group.getWorldScale(this.#scale).x);
      const behind = this.#at.z < this.#centre.z;
      const { x, y } = sight.project(this.#at, this.#screen);
      spot.x = x;
      spot.y = y;
      spot.shown = !(behind && Math.hypot(x - centreX, y - centreY) < sight.disc) && x > sight.words + CLEAR;
      group.visible = spot.shown;
      // Its link stands under its disc, whatever the moon's size.
      moon.mark.place(x, y + sight.disc * group.scale.x, spot.shown);
    }
  }

  dispose(): void {
    for (const { planet } of this.#moons) this.#drop(planet);
    this.#moons = [];
    this.group.removeFromParent();
  }
}
