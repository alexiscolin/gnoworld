// Which suns keep a halo, and how wide each stands (7d6, after f0004): the great star is the main light, or a system's own at its arrival
// (7d3), every other sun half its size on screen at most; seven halos at most, the ones the view needs and then the nearest whose heart
// shows, each dimming and shrinking from 40 to 120 units into a point of a few pixels; no halo wider than the great star's at the approved
// arrival, 36 units off (305 pixels).
import {
  distanceOf as away,
  haloAt,
  mainSizeOf,
  OTHER_SUN,
  pointReach,
  sunReach,
  type Drawn,
  type Point,
  type StarSystem,
} from "@gnoworld/core";

const HALOS = 7;
// At a system's arrival its own star is the one light: the others a quarter of its size at most (7d3's design review).
const ARRIVAL_SUN = 0.25;

/** What the halos are chosen from: a look's stars, the eye on the map, the lens, and what the view says, its main light among them. */
export interface HaloSight {
  readonly systems: readonly StarSystem[];
  readonly drawn: Drawn;
  readonly eye: Point;
  readonly focal: number;
  readonly needsHalo: (system: number) => boolean;
  readonly inView: (place: Point, radius: number) => boolean;
  /** The main light's system, by its index: the great star (0) unless said, a system's own at its arrival (7d3). */
  readonly main?: number;
  /** A Plan, a chart: every star but its own is its point (the design review's second pass, F4470). */
  readonly chart?: boolean;
}

export class Halos {
  // Each drawn star's halo and distance to the eye, and the stars in view by distance: written on a look, kept from one to the next.
  readonly #halos: number[] = [];
  readonly #aways: number[] = [];
  readonly #order: number[] = [];
  #mainSize = Infinity;
  #main = 0;
  #lit = true;
  #chart = false;
  #focal = 1;

  /** Chooses which of `sight`'s drawn stars keep a halo. */
  choose(sight: HaloSight): void {
    const { systems, drawn, eye, focal, needsHalo, inView } = sight;
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
      } else if (inView(system.place, pointReach(this.#aways[at] ?? 0, focal))) order.push(at);
    }
    order.sort((a, b) => (this.#aways[a] ?? 0) - (this.#aways[b] ?? 0));
    for (const at of order.slice(0, Math.max(HALOS - kept, 0))) this.#halos[at] = haloAt(this.#aways[at] ?? Infinity);
    this.#lead(sight);
  }

  // The main light, the great star unless the view says: its size on screen, the widest halo kept; none for a view with no light of its
  // own, the Earth's Plan, a chart the great star blinded (7v's design review, F4469): there every star is its point.
  #lead({ systems, eye, focal, main = 0, chart = false }: HaloSight): void {
    this.#focal = focal;
    this.#main = main;
    this.#chart = chart;
    this.#lit = systems[main] !== undefined;
    this.#mainSize = mainSizeOf(systems[main], eye, focal);
  }

  /** Drawn star `at`'s quad reach, in world units, and its halo, for `system`, of index `index` among the systems. */
  sunOf(at: number, index: number, system: StarSystem): { reach: number; halo: number } {
    const [distance, halo] = [this.#aways[at] ?? 0, this.#halos[at] ?? 0];
    if (!this.#lit || (this.#chart && index !== this.#main))
      return { reach: pointReach(distance, this.#focal), halo: 0 };
    const most = index === this.#main ? undefined : (this.#main === 0 ? OTHER_SUN : ARRIVAL_SUN) * this.#mainSize;
    return { reach: sunReach(system, { distance, focal: this.#focal, halo, most }), halo };
  }
}
