// The layers of the home's first screen (D549, D551): the big, the mid and the small world, each at its own spot of the free room and its own
// size, none touching another disc or name, and the worlds the first screen favours.
import type { Circle } from "./goals.ts";
import type { Planet } from "./layout.ts";

// The worlds the first screen would favour beside the rest, which Alexis asked for: the DAO's and wugnot.
const SHOWN = new Set(["gov/dao", "gnoland/wugnot"]);
// raw: where the big world stands, in shares of the screen, and its spread. "upper": between the hero's column and the Earth's limb, above
// mid height; "lower": lower, nearer the hero's column. VARIANT picks the one in use (D542).
const MIDDLES = { upper: { x: 0.4, y: 0.4, spread: 0.16 }, lower: { x: 0.37, y: 0.58, spread: 0.16 } } as const;
const VARIANT: keyof typeof MIDDLES = "lower";
const MIDDLE = MIDDLES[VARIANT];
/** A world featured: how large its disc is drawn, as a share of the screen's height (its radius), its own size by its layer (D549). */
export interface Featured {
  readonly planet: Planet;
  readonly share: number;
}

// The layers, the nearest first: the radius each is drawn at as a share of the screen's height (a big world, a mid one, a small far one),
// and what each counts for.
const LAYERS = [0.135, 0.055, 0.025] as const;
// raw: where each layer stands, in shares of the screen, and its spread: the big world in the middle, the mid one upper left, the small one
// high between the hero's column and the Earth
const SPOTS = [MIDDLE, { x: 0.2, y: 0.36, spread: 0.3 }, { x: 0.52, y: 0.22, spread: 0.3 }] as const;
const WEIGHTS = [3, 1.5, 1] as const;

export interface Candidate {
  readonly world: Planet;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How many pixels across its radius it stands as its size says, and where it stands HORIZON seconds on: a layer must be there still. */
  readonly natural: number;
  readonly later: { readonly x: number; readonly y: number };
}

/** How many seconds on a featured world must still stand in the free room: the orbits are quick, and a world frozen as a layer would leave it. */
export const HORIZON = 15;
/** The most a world may be drawn larger than its size says (a boost) to be a layer. */
const MOST_BOOST = 8;

// How near its own spot of the free room a layer's world stands (the big one's the middle, the mid one's upper left, the small one's high in
// the middle, D551): 1 there, a gentle fall (a bell) toward the edges.
function centred(
  x: number,
  y: number,
  { circle: { width, height }, layer }: { circle: Circle; layer: number },
): number {
  const spot = SPOTS[layer] ?? MIDDLE;
  const [dx, dy] = [(x - spot.x * width) / width, (y - spot.y * height) / width];
  return Math.exp(-(dx * dx + dy * dy) / (2 * spot.spread * spot.spread));
}

// Whether `c`, drawn `px` across its radius, stands in the free room: off the hero's words and the dock, and clear of the Earth's glow by half
// its radius (D543, D549).
function fits(
  c: { readonly x: number; readonly y: number },
  px: number,
  { width, height, x: ex, y: ey, radius }: Circle,
): boolean {
  const room = c.x - px > width * 0.02 && c.x + px < width - 170 && c.y - px > height * 0.1 && c.y + px < height * 0.96;
  const hero = c.x - px < 790 && c.y + px > height * 0.66;
  return room && !hero && Math.hypot(c.x - ex, c.y - ey) >= radius * 1.18 + px * 1.5;
}

// Whether the name under either disc (a box 160 by 44 px, 2 px under it) touches the other disc or the other's name (D549).
function tagsHit(a: Disc, b: Disc): boolean {
  const box = (d: Disc) => ({ left: d.x - 80, right: d.x + 80, top: d.y + d.px + 2, bottom: d.y + d.px + 46 });
  const onDisc = (r: ReturnType<typeof box>, d: Disc) =>
    Math.hypot(d.x - Math.max(r.left, Math.min(d.x, r.right)), d.y - Math.max(r.top, Math.min(d.y, r.bottom))) < d.px;
  const [r, q] = [box(a), box(b)];
  const boxes = r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom;
  return onDisc(r, b) || onDisc(q, a) || boxes;
}

// How well `c` stands as a layer: none where it does not fit or touches a world already chosen; else the more for standing near the middle.
function valueOf(
  c: Candidate,
  px: number,
  { circle, chosen, layer, held }: { circle: Circle; chosen: readonly Disc[]; layer: number; held: boolean },
): number {
  const mine = { x: c.x, y: c.y, px };
  const apart = chosen.every(
    (o) => Math.hypot(c.x - o.x, c.y - o.y) - px - o.px >= 1.5 * Math.max(px, o.px) && !tagsHit(mine, o),
  );
  const near = centred(c.x, c.y, { circle, layer });
  // A world to be chosen must stand in the room now and HORIZON on, near its layer's spot; one already held need only stand in it now.
  const stays =
    held ||
    (fits({ ...c, ...c.later }, px, circle) && c.natural * MOST_BOOST >= px && near >= (layer === 0 ? 0 : 0.08));
  if (!apart || !stays || !fits(c, px, circle)) return 0;
  return (SHOWN.has(c.world.id) ? 1.4 : 1) * (layer === 0 ? 0.25 + 0.75 * near : near);
}

interface Disc {
  readonly x: number;
  readonly y: number;
  readonly px: number;
}

// The layers filled from `candidates`, each by the best world farther than the one before, none touching another; and what they are worth.
export function layersOf(
  candidates: readonly Candidate[],
  circle: Circle,
  fixed: readonly Featured[] | undefined,
): { score: number; featured: Featured[] } {
  const [chosen, featured, used] = [[] as Disc[], [] as Featured[], new Set<Planet>()];
  let score = 0;
  for (const [layer, share] of LAYERS.entries()) {
    const px = share * circle.height;
    const pool = fixed === undefined ? candidates : candidates.filter((c) => c.world === fixed[layer]?.planet);
    let [best, bestValue] = [undefined as Candidate | undefined, 0];
    for (const c of pool) {
      const value = used.has(c.world) ? 0 : valueOf(c, px, { circle, chosen, layer, held: fixed !== undefined });
      if (value > bestValue) [best, bestValue] = [c, value];
    }
    if (best === undefined) continue;
    score += (WEIGHTS[layer] ?? 1) * bestValue;
    used.add(best.world);
    chosen.push({ x: best.x, y: best.y, px });
    featured.push({ planet: best.world, share });
  }
  return { score, featured };
}
