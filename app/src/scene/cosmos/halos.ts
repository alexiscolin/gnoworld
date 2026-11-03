// Which suns keep a halo, and how wide each stands (7d6, after f0004): the great star is the main light, every other sun half its size on
// screen at most; seven halos at most, the ones the view needs and then the nearest whose heart shows, each dimming and shrinking from 40 to
// 120 units into a point of a few pixels; no halo wider than the great star's at the approved arrival, 36 units off (305 pixels).
import { smoothstep, type Drawn, type Point, type StarSystem } from "@gnoworld/core";

const HALOS = 7;
const HALO_NEAR = 40;
const HALO_FAR = 120;
const POINT_PIXELS = 10;
const HALO_PIXELS = 320;
const OTHER_SUN = 0.5;
// A star's reach, from its size.
const REACH = 7.5;
const LEAST_REACH = 2;

/** What the halos are chosen from: a look's stars, the eye on the map, the lens, and what the view says. */
export interface HaloSight {
  readonly systems: readonly StarSystem[];
  readonly drawn: Drawn;
  readonly eye: Point;
  readonly focal: number;
  readonly needsHalo: (system: number) => boolean;
  readonly inView: (place: Point, radius: number) => boolean;
}

const away = ({ x, y, z }: Point, eye: Point): number => Math.hypot(x - eye.x, y - eye.y, z - eye.z);
// Under the ceiling, a sun's own size eased so it nears it and never reaches it: two suns at different distances never draw one size, the
// nearer the larger (the chief, 2026-11-03, after Alexis's not-a-planetarium rule).
const under = (size: number, most: number): number => size / (1 + (size / most) ** 4) ** 0.25;
const reachOf = ({ star }: StarSystem): number => REACH * Math.sqrt(star) + LEAST_REACH;
// The great star's size on screen, as its reach over its distance, the widest halo kept.
const greatSize = (great: StarSystem | undefined, eye: Point, focal: number): number =>
  great === undefined
    ? Infinity
    : Math.min(reachOf(great) / Math.max(away(great.place, eye), 1e-9), HALO_PIXELS / focal);

export class Halos {
  // Each drawn star's halo and distance to the eye, and the stars in view by distance: written on a look, kept from one to the next.
  readonly #halos: number[] = [];
  readonly #aways: number[] = [];
  readonly #order: number[] = [];
  #great = Infinity;
  #focal = 1;

  /** Chooses which of `sight`'s drawn stars keep a halo. */
  choose({ systems, drawn, eye, focal, needsHalo, inView }: HaloSight): void {
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
    this.#focal = focal;
    this.#great = greatSize(systems[0], eye, focal);
  }

  /** Drawn star `at`'s quad reach, in world units, and its halo, for `system`, of index `index` among the systems. */
  sunOf(at: number, index: number, system: StarSystem): { reach: number; halo: number } {
    const [distance, halo] = [this.#aways[at] ?? 0, this.#halos[at] ?? 0];
    const full =
      index === 0
        ? Math.min(reachOf(system), (HALO_PIXELS * distance) / this.#focal)
        : under(reachOf(system), OTHER_SUN * this.#great * distance);
    const point = Math.min(full, (POINT_PIXELS * distance) / this.#focal);
    return { reach: point + (full - point) * halo, halo };
  }
}
