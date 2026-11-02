// What a look writes on the tilted disc: suns and region glows, worlds as points, far belts. Each is one draw whatever the universe, written
// off the frame; a frame only brings the disc to the eye, in doubles, and moves the points' clock.
import {
  BODY_PIXELS,
  BOUNDS,
  CENTRE,
  DISC_TILT,
  dotLight,
  GRAIN,
  onScreen,
  ORBIT_PACE,
  smoothstep,
  textHash,
  unitOf,
  worldLook,
  type Drawn,
  type Ladder,
  type Orbiter,
  type PlanetLook,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import { Group } from "three";
import type { Disposer } from "../disposer.ts";
import { Belt, ROCKS } from "./belt.ts";
import { Dots } from "./dots.ts";
import { Suns } from "./suns.ts";

/** What a look saw. */
export interface Sight {
  readonly systems: readonly StarSystem[];
  readonly ladder: Ladder;
  readonly drawn: Drawn;
  /** The eye, on the map. */
  readonly eye: Point;
  readonly focal: number;
  readonly isBody: (id: string) => boolean;
  /** How large a system's worlds stand as points, by its index: whole for the view at rest's postcards, none for its close world's
   * system, whose rest is off the screen, and a glint for every other, a distant star. */
  readonly pointShare: (system: number) => number;
  /** The plane a postcard's points turn in, by its system's index, as its bodies' at rest: opened towards the eye if need be. */
  readonly planeOf: (system: number) => StarSystem | undefined;
  /** Whether the view needs a system's halo, by its index, whatever its distance: the great star's and the postcards' stars'. */
  readonly needsHalo: (system: number) => boolean;
  /** Whether a round thing at a place on the map, of a radius in world units, shows on the screen. */
  readonly inView: (place: Point, radius: number) => boolean;
  /** How much of what stands at a place on the map, of a radius in pixels, the page's text leaves on screen. */
  readonly shows: (place: Point, radius: number) => number;
}

interface Held {
  readonly system: StarSystem;
  readonly world: Orbiter;
  /** How large its world stands, as a share of its own size. */
  readonly share: number;
}

// A star's reach, from its size; a region's glow, from the systems it holds.
const REACH = 7.5;
const LEAST_REACH = 2;
const GLOW_REACH = 26;
const GLOW_MOST = 90;
const GLOW_WARMTH = 0.5;
const LINEAR = 2.2;
// Frame 4 shows about seven halos, its other stars points: a halo dims and shrinks from the first distance to a point of so many pixels
// by the second, in world units, and seven at most stand in view.
const HALOS = 7;
const HALO_NEAR = 40;
const HALO_FAR = 120;
const POINT_PIXELS = 10;
// The approved arrival's widest halo was 769 pixels: no star by the eye spreads its amber over the whole screen.
const HALO_PIXELS = 800;
// A star under the page's text keeps this little of its halo and no core, its heart this many pixels wide: the words stand on black.
const UNDER_TEXT = 0.1;
const HEART_PIXELS = 60;
// A world seen as a point is a glint a little off its look; grain is warm and dim.
const DOT_LIFT = 0.45;
const DOT_WARM: readonly [number, number, number] = [1, 0.86, 0.68];

// A point is a speck, half the least body's size at most: a postcard's worlds past its four bodies never read as discs beside them.
const SPECK = BODY_PIXELS / 2;
const GRAIN_TINT: readonly [number, number, number] = [0.2, 0.11, 0.05];

// A point takes its world's look, in the working space: between the ramp's middle and its top, for a dark world's middle is near black.
const colourOf = ({ ramp }: PlanetLook): [number, number, number] => {
  const [red, green, blue] = [0, 1, 2].map((at) => (((ramp[1][at] ?? 0) + (ramp[2][at] ?? 0)) / 2) ** LINEAR);
  return [red ?? 0, green ?? 0, blue ?? 0];
};

const lifted = ([red, green, blue]: readonly [number, number, number]): [number, number, number] => [
  red + (DOT_WARM[0] - red) * DOT_LIFT,
  green + (DOT_WARM[1] - green) * DOT_LIFT,
  blue + (DOT_WARM[2] - blue) * DOT_LIFT,
];

const away = ({ x, y, z }: Point, eye: Point): number => Math.hypot(x - eye.x, y - eye.y, z - eye.z);
const reachOf = ({ star }: StarSystem): number => REACH * Math.sqrt(star) + LEAST_REACH;

export class Disc {
  readonly #suns: Suns;
  readonly #dots: Dots;
  readonly #belt: Belt;
  readonly #colours = new Map<string, [number, number, number]>();
  // Each drawn star's halo, its distance to the eye, and the stars in view by distance: written on a look, kept from one to the next.
  readonly #halos: number[] = [];
  readonly #aways: number[] = [];
  readonly #order: number[] = [];
  readonly group = new Group();
  /** The points' mean size, worlds and not grain, in the journeys' reading. */
  dotPixels = 0;
  #sizes = 0;
  #sized = 0;
  dotCount = 0;

  constructor(owner: Disposer) {
    this.group.rotation.x = DISC_TILT;
    this.#suns = new Suns(this.group, owner, BOUNDS.stars + BOUNDS.glows);
    this.#dots = new Dots(this.group, owner, BOUNDS.dots);
    this.#belt = new Belt(this.group, owner, BOUNDS.rocks);
  }

  get rocks(): number {
    return this.#belt.count;
  }

  /** The lens, in pixels, and the pixels to one of the page's. */
  resize(focal: number, ratio: number): void {
    this.#suns.resize(focal);
    this.#dots.resize(ratio);
    this.#belt.resize(ratio);
  }

  /** One frame on. */
  advance(eye: Point, seconds: number): void {
    this.group.position.set(CENTRE.x - eye.x, CENTRE.y - eye.y, CENTRE.z - eye.z);
    this.#dots.advance(seconds);
  }

  /** Writes what a look saw. */
  paint(sight: Sight): void {
    this.#paintSuns(sight);
    this.#paintDots(sight);
    this.#paintBelts(sight);
  }

  // Which drawn stars keep a halo: those the view needs, then the nearest in view, seven at most, each as its distance leaves it.
  #haloes({ systems, drawn, eye, focal, needsHalo, inView }: Sight): void {
    const order = this.#order;
    order.length = 0;
    let kept = 0;
    for (let at = 0; at < drawn.starCount; at += 1) {
      const index = drawn.stars[at] ?? -1;
      const system = systems[index];
      this.#halos[at] = 0;
      this.#aways[at] = system === undefined ? Infinity : away(system.place, eye);
      if (system === undefined) continue;
      if (needsHalo(index)) {
        this.#halos[at] = 1;
        kept += 1;
      } else if (inView(system.place, (POINT_PIXELS * (this.#aways[at] ?? 0)) / focal)) order.push(at);
    }
    order.sort((a, b) => (this.#aways[a] ?? 0) - (this.#aways[b] ?? 0));
    for (const at of order.slice(0, Math.max(HALOS - kept, 0)))
      this.#halos[at] = 1 - smoothstep(HALO_NEAR, HALO_FAR, this.#aways[at] ?? Infinity);
  }

  #paintSuns(sight: Sight): void {
    const { systems, ladder, drawn, shows, focal } = sight;
    this.#haloes(sight);
    for (let at = 0; at < drawn.starCount; at += 1) {
      const system = systems[drawn.stars[at] ?? -1];
      if (system === undefined) continue;
      const [distance, halo] = [this.#aways[at] ?? 0, this.#halos[at] ?? 0];
      const full = Math.min(reachOf(system), (HALO_PIXELS * distance) / focal);
      const point = Math.min(full, (POINT_PIXELS * distance) / focal);
      const light = UNDER_TEXT + (1 - UNDER_TEXT) * shows(system.place, HEART_PIXELS);
      const reach = point + (full - point) * halo;
      this.#suns.set(at, system.place, { reach, warmth: system.warmth, glow: false, shows: light, halo });
    }
    for (let at = 0; at < drawn.glowCount; at += 1) {
      const region = ladder.region(drawn.glows[at] ?? -1);
      const reach = GLOW_REACH * Math.sqrt(Math.min(region.systems, GLOW_MOST));
      this.#suns.set(drawn.starCount + at, region, { reach, warmth: GLOW_WARMTH, glow: true, shows: 1, halo: 1 });
    }
    this.#suns.commit(drawn.starCount + drawn.glowCount);
  }

  #colourFor(id: string): [number, number, number] {
    const known = this.#colours.get(id) ?? colourOf(worldLook(id));
    this.#colours.set(id, known);
    return known;
  }

  #paintDot(index: number, { system, world, share: shown }: Held, sight: Sight): void {
    const distance = away(system.place, sight.eye);
    const grain = world.radius < GRAIN;
    const share = unitOf(textHash(world.id));
    const size =
      Math.min(onScreen(world.radius * shown, distance, sight.focal), SPECK) * (grain ? 0.5 + 0.9 * share : 1);
    if (!grain) {
      this.#sizes += size;
      this.#sized += 1;
    }
    this.#dots.set(index, system.place, {
      orbit: [world.orbit, world.phase, system.spin * ORBIT_PACE],
      plane: [system.node, system.tilt],
      tint: grain ? GRAIN_TINT : lifted(this.#colourFor(world.id)),
      size: [size, dotLight(distance) * sight.shows(system.place, 0) * (grain ? 0.45 + 0.55 * share : 1)],
    });
  }

  // A world the ladder made a body whose maps are not here yet stands as a point, as any other.
  #paintDots(sight: Sight): void {
    const { drawn, systems } = sight;
    let count = 0;
    this.#sizes = 0;
    this.#sized = 0;
    const paint = (at: number, world: number) => {
      const system = systems[at];
      const held = system?.worlds[world];
      const share = sight.pointShare(at);
      if (system === undefined || held === undefined || count === BOUNDS.dots || sight.isBody(held.id) || share === 0)
        return;
      // A postcard's points turn in the plane its bodies do.
      this.#paintDot(count, { system: sight.planeOf(at) ?? system, world: held, share }, sight);
      count += 1;
    };
    for (let at = 0; at < drawn.bodyCount; at += 1) paint(drawn.bodySystems[at] ?? -1, drawn.bodyWorlds[at] ?? -1);
    for (let at = 0; at < drawn.dotCount; at += 1) paint(drawn.dotSystems[at] ?? -1, drawn.dotWorlds[at] ?? -1);
    this.dotCount = count;
    this.dotPixels = this.#sized === 0 ? 0 : this.#sizes / this.#sized;
    this.#dots.commit(count);
  }

  #paintBelts({ drawn, systems, planeOf }: Sight): void {
    let rocks = 0;
    for (let at = 0; at < drawn.nearCount && rocks + ROCKS <= BOUNDS.rocks; at += 1) {
      const index = drawn.near[at] ?? -1;
      const system = systems[index];
      if (system?.belt === true) rocks = this.#belt.lay(planeOf(index) ?? system, rocks);
    }
    this.#belt.commit(rocks);
  }
}
